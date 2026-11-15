// Visual builder agent injected into every proxied preview page.
// It lives inside the previewed document and talks to the IDE via postMessage.
const INSPECTOR_SOURCE = `(function () {
  if (window.__maVisualPicker) { return; }
  window.__maVisualPicker = true;

  var state = { enabled: false, selected: null, drag: null, offsets: {} };

  var halo = document.createElement('div');
  halo.setAttribute('data-ma-visual', 'halo');
  halo.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:1px solid #4fc1ff;background:rgba(79,193,255,0.10);border-radius:3px;display:none;';

  var frame = document.createElement('div');
  frame.setAttribute('data-ma-visual', 'frame');
  frame.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #ec4899;border-radius:3px;display:none;';

  var badge = document.createElement('div');
  badge.setAttribute('data-ma-visual', 'badge');
  badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:6px;background:#0e639c;color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);display:none;max-width:70%;';
  badge.textContent = 'Конструктор: кликните элемент, перетащите мышью, стрелки — подстройка, Esc — выход';

  function ensureMounted() {
    if (!document.body) { return; }
    if (!halo.isConnected) { document.body.appendChild(halo); }
    if (!frame.isConnected) { document.body.appendChild(frame); }
    if (!badge.isConnected) { document.body.appendChild(badge); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMounted);
  } else {
    ensureMounted();
  }

  function post(message) {
    message.source = 'multi-agent-preview';
    try { window.parent.postMessage(message, '*'); } catch (error) { /* ignore */ }
  }

  function cleanText(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim();
  }

  function cssPath(element) {
    var parts = [];
    var node = element;
    while (node && node.nodeType === 1 && node !== document.body) {
      var part = node.tagName.toLowerCase();
      if (node.id) { part += '#' + node.id; parts.unshift(part); break; }
      var className = typeof node.className === 'string' ? node.className : '';
      var classes = className.trim().split(/\\s+/).filter(Boolean).slice(0, 3);
      for (var i = 0; i < classes.length; i += 1) { part += '.' + classes[i]; }
      var parent = node.parentElement;
      if (parent) {
        var sameTag = 0;
        var index = 0;
        for (var j = 0; j < parent.children.length; j += 1) {
          var child = parent.children[j];
          if (child.tagName === node.tagName) { sameTag += 1; if (child === node) { index = sameTag; } }
        }
        if (sameTag > 1) { part += ':nth-of-type(' + index + ')'; }
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  function domPathOf(element) {
    var path = [];
    var node = element;
    while (node && node.nodeType === 1) {
      var index = 0;
      var sibling = node;
      while (sibling.previousElementSibling) { sibling = sibling.previousElementSibling; index += 1; }
      path.unshift(node.tagName.toLowerCase() + ':' + index);
      node = node.parentElement;
    }
    return path.join('/');
  }

  function labelOf(element) {
    var tag = element.tagName.toLowerCase();
    var text = cleanText(element.textContent).slice(0, 60);
    var className = typeof element.className === 'string' ? cleanText(element.className) : '';
    var classes = className ? '.' + className.split(' ').slice(0, 2).join('.') : '';
    return '<' + tag + (element.id ? '#' + element.id : '') + classes + '>' + (text ? ' «' + text + '»' : '');
  }

  function describe(element) {
    var rect = element.getBoundingClientRect();
    return {
      selector: cssPath(element),
      domPath: domPathOf(element),
      label: labelOf(element),
      tag: element.tagName.toLowerCase(),
      pageUrl: location.href,
      rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
  }

  function paint() {
    if (!state.selected || !state.selected.isConnected) { frame.style.display = 'none'; return; }
    var rect = state.selected.getBoundingClientRect();
    frame.style.display = 'block';
    frame.style.left = rect.left + 'px';
    frame.style.top = rect.top + 'px';
    frame.style.width = rect.width + 'px';
    frame.style.height = rect.height + 'px';
  }

  function paintHalo(element) {
    if (!state.enabled || !element || element === state.selected) { halo.style.display = 'none'; return; }
    var rect = element.getBoundingClientRect();
    halo.style.display = 'block';
    halo.style.left = rect.left + 'px';
    halo.style.top = rect.top + 'px';
    halo.style.width = rect.width + 'px';
    halo.style.height = rect.height + 'px';
  }

  function applyOffset(element, x, y) {
    var key = cssPath(element);
    state.offsets[key] = { x: x, y: y };
    element.style.translate = x + 'px ' + y + 'px';
  }

  function select(element) {
    if (!element || element === document.body || element === document.documentElement) { return; }
    state.selected = element;
    ensureMounted();
    paint();
    post({ type: 'select', element: describe(element), offset: state.offsets[cssPath(element)] || { x: 0, y: 0 } });
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    ensureMounted();
    badge.style.display = state.enabled ? 'block' : 'none';
    halo.style.display = 'none';
    if (!state.enabled) { frame.style.display = 'none'; state.selected = null; }
    document.documentElement.style.cursor = state.enabled ? 'crosshair' : '';
  }

  function resetAll() {
    var nodes = document.querySelectorAll('[data-ma-visual]');
    for (var i = 0; i < nodes.length; i += 1) { nodes[i].remove(); }
    var translated = document.querySelectorAll('[style*="translate"]');
    for (var j = 0; j < translated.length; j += 1) { translated[j].style.translate = ''; }
    state.offsets = {};
    state.selected = null;
    state.drag = null;
    badge.style.display = state.enabled ? 'block' : 'none';
    frame.style.display = 'none';
    halo.style.display = 'none';
    post({ type: 'clear' });
  }

  function targetFromEvent(event) {
    var element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element) { return null; }
    if (element.hasAttribute && element.hasAttribute('data-ma-visual')) { return null; }
    return element;
  }

  document.addEventListener('pointermove', function (event) {
    if (!state.enabled) { return; }
    ensureMounted();
    if (state.drag) {
      var dx = event.clientX - state.drag.startX;
      var dy = event.clientY - state.drag.startY;
      var nextX = Math.round((state.drag.baseX + dx) * 10) / 10;
      var nextY = Math.round((state.drag.baseY + dy) * 10) / 10;
      state.drag.lastX = nextX;
      state.drag.lastY = nextY;
      applyOffset(state.drag.element, nextX, nextY);
      paint();
      return;
    }
    paintHalo(targetFromEvent(event));
  }, true);

  document.addEventListener('pointerdown', function (event) {
    if (!state.enabled) { return; }
    var element = targetFromEvent(event);
    if (!element) { return; }
    event.preventDefault();
    event.stopPropagation();
    select(element);
    var key = cssPath(element);
    var base = state.offsets[key] || { x: 0, y: 0 };
    state.drag = { element: element, startX: event.clientX, startY: event.clientY, baseX: base.x, baseY: base.y, lastX: base.x, lastY: base.y, moved: false };
  }, true);

  document.addEventListener('pointerup', function () {
    if (!state.drag) { return; }
    var drag = state.drag;
    state.drag = null;
    if (Math.abs(drag.lastX - drag.baseX) < 0.5 && Math.abs(drag.lastY - drag.baseY) < 0.5) { return; }
    post({ type: 'edit', element: describe(drag.element), offset: { x: drag.lastX, y: drag.lastY }, action: 'move' });
  }, true);

  document.addEventListener('click', function (event) {
    if (!state.enabled) { return; }
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!state.enabled || !state.selected) { return; }
    if (event.key === 'Escape') { setEnabled(false); post({ type: 'mode', enabled: false }); return; }
    var step = event.shiftKey ? 10 : 1;
    var current = state.offsets[cssPath(state.selected)] || { x: 0, y: 0 };
    var nextX = current.x;
    var nextY = current.y;
    if (event.key === 'ArrowLeft') { nextX -= step; }
    else if (event.key === 'ArrowRight') { nextX += step; }
    else if (event.key === 'ArrowUp') { nextY -= step; }
    else if (event.key === 'ArrowDown') { nextY += step; }
    else { return; }
    event.preventDefault();
    applyOffset(state.selected, nextX, nextY);
    paint();
    post({ type: 'edit', element: describe(state.selected), offset: { x: nextX, y: nextY }, action: 'move' });
  }, true);

  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.source !== 'multi-agent-ide') { return; }
    if (data.type === 'visual-mode') { setEnabled(data.enabled); }
    if (data.type === 'visual-reset') { resetAll(); }
  });

  window.addEventListener('scroll', paint, true);
  window.addEventListener('resize', paint, true);

  window.__maVisualPickerApi = { setEnabled: setEnabled, select: select, reset: resetAll, describe: describe, state: state };
  post({ type: 'ready' });
})();`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(INSPECTOR_SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
