export type VisualAction = "move" | "hide" | "resize" | "style";

export type VisualEditInput = {
  selector?: unknown;
  label?: unknown;
  action?: unknown;
  offsetX?: unknown;
  offsetY?: unknown;
  note?: unknown;
  pageUrl?: unknown;
  domPath?: unknown;
  styles?: unknown;
};

export type VisualEdit = {
  id: number;
  selector: string;
  label: string;
  action: VisualAction;
  offsetX: number;
  offsetY: number;
  note: string;
  pageUrl: string;
  domPath: string;
  styles: string;
  createdAt: string;
};

const MAX_SELECTOR_LENGTH = 500;
const MAX_TEXT_LENGTH = 400;
const MAX_OFFSET = 5_000;
const ACTIONS: VisualAction[] = ["move", "hide", "resize", "style"];

function clampOffset(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, numeric));
  return Math.round(clamped * 10) / 10;
}

function cleanText(value: unknown, limit = MAX_TEXT_LENGTH) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

/** Validates one element edit coming from the preview picker. */
export function normalizeVisualEdit(input: VisualEditInput) {
  const selector = cleanText(input.selector, MAX_SELECTOR_LENGTH).replace(/\s+/g, " ");
  if (!selector) throw new Error("selector is required");
  const action = ACTIONS.includes(input.action as VisualAction) ? (input.action as VisualAction) : "move";
  return {
    selector,
    label: cleanText(input.label, 200),
    action,
    offsetX: clampOffset(input.offsetX),
    offsetY: clampOffset(input.offsetY),
    note: cleanText(input.note),
    pageUrl: cleanText(input.pageUrl, 500),
    domPath: cleanText(input.domPath, 500),
    styles: cleanText(input.styles, 1_000),
  };
}

/** Human-readable movement, e.g. "сдвинуть на 40 px вправо и 12 px вверх". */
export function describeOffset(offsetX: number, offsetY: number, locale: "ru" | "en" = "ru") {
  const parts: string[] = [];
  if (offsetX !== 0) {
    parts.push(locale === "ru"
      ? `${Math.abs(offsetX)} px ${offsetX > 0 ? "вправо" : "влево"}`
      : `${Math.abs(offsetX)} px ${offsetX > 0 ? "right" : "left"}`);
  }
  if (offsetY !== 0) {
    parts.push(locale === "ru"
      ? `${Math.abs(offsetY)} px ${offsetY > 0 ? "вниз" : "вверх"}`
      : `${Math.abs(offsetY)} px ${offsetY > 0 ? "down" : "up"}`);
  }
  if (parts.length === 0) return locale === "ru" ? "без смещения" : "no offset";
  return (locale === "ru" ? "сдвинуть на " : "move by ") + parts.join(locale === "ru" ? " и " : " and ");
}

/**
 * The brief is what the Lead agent actually reads. It must be explicit enough
 * to be turned into CSS/layout changes without seeing the preview.
 */
export function buildVisualBrief(edits: VisualEdit[], locale: "ru" | "en" = "ru"): string {
  if (edits.length === 0) return "";
  const pageUrl = edits.find((edit) => edit.pageUrl)?.pageUrl ?? "";
  const header = locale === "ru"
    ? "[ВИЗУАЛЬНЫЕ ПРАВКИ ИЗ КОНСТРУКТОРА ПРЕВЬЮ]"
    : "[VISUAL EDITS FROM THE PREVIEW BUILDER]";
  const footer = locale === "ru"
    ? "Требование: перенеси эти правки в исходный код проекта (CSS/layout/разметка), сохранив логику и адаптивность. Если селектор неоднозначен — найди компонент по тексту и классам."
    : "Requirement: port these edits into the project source (CSS/layout/markup), keeping the logic and responsiveness intact. If the selector is ambiguous, find the component by its text and classes.";

  const lines = edits.map((edit, index) => {
    const title = edit.label || edit.selector;
    const details: string[] = [];
    if (edit.action === "move") details.push(describeOffset(edit.offsetX, edit.offsetY, locale));
    else if (edit.action === "hide") details.push(locale === "ru" ? "скрыть элемент" : "hide the element");
    else if (edit.action === "resize") details.push(locale === "ru" ? "изменить размер" : "resize the element");
    else details.push(locale === "ru" ? "изменить стили" : "change styles");
    if (edit.note) details.push(locale === "ru" ? `комментарий: ${edit.note}` : `note: ${edit.note}`);
    if (edit.styles) details.push(locale === "ru" ? `стили: ${edit.styles}` : `styles: ${edit.styles}`);
    return [
      `${index + 1}. ${title} — ${details.join("; ")}.`,
      `   ${locale === "ru" ? "Селектор" : "Selector"}: ${edit.selector}`,
      edit.domPath ? `   ${locale === "ru" ? "Путь в DOM" : "DOM path"}: ${edit.domPath}` : "",
    ].filter(Boolean).join("\n");
  });

  return [
    header,
    pageUrl ? `${locale === "ru" ? "Страница" : "Page"}: ${pageUrl}` : "",
    `${locale === "ru" ? "Изменения" : "Changes"} (${edits.length}):`,
    lines.join("\n"),
    footer,
    locale === "ru" ? "[/ВИЗУАЛЬНЫЕ ПРАВКИ]" : "[/VISUAL EDITS]",
  ].filter(Boolean).join("\n");
}
