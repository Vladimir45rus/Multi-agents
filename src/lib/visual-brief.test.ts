import { describe, expect, it } from "vitest";
import { buildVisualBrief, describeOffset, describeStyles, normalizeVisualEdit, parseStyleHints, styleSuggestion, type VisualEdit } from "@/lib/visual-brief";

const baseEdit: VisualEdit = {
  id: 1,
  selector: "button.cta",
  label: '<button.cta> «Купить»',
  action: "move",
  offsetX: 40,
  offsetY: -12,
  note: "",
  pageUrl: "http://127.0.0.1:4173/",
  domPath: "html:0/body:1/button:2",
  styles: "",
  createdAt: "2026-11-15T00:00:00.000Z",
};

describe("normalizeVisualEdit", () => {
  it("requires a selector", () => {
    expect(() => normalizeVisualEdit({ selector: "   " })).toThrow("selector is required");
  });

  it("clamps offsets and rounds to one decimal", () => {
    const edit = normalizeVisualEdit({ selector: "div", offsetX: 99_999, offsetY: -12.345 });
    expect(edit.offsetX).toBe(5_000);
    expect(edit.offsetY).toBe(-12.3);
  });

  it("falls back to move for an unknown action", () => {
    expect(normalizeVisualEdit({ selector: "div", action: "explode" }).action).toBe("move");
  });

  it("strips control characters from free text", () => {
    const edit = normalizeVisualEdit({ selector: "div", note: "ближе\u0000 к краю" });
    expect(edit.note).toBe("ближе  к краю");
  });

  it("caps very long selectors", () => {
    const edit = normalizeVisualEdit({ selector: "div".repeat(500) });
    expect(edit.selector.length).toBe(500);
  });
});

describe("describeOffset", () => {
  it("describes both axes in Russian", () => {
    expect(describeOffset(40, -12)).toBe("сдвинуть на 40 px вправо и 12 px вверх");
  });

  it("describes both axes in English", () => {
    expect(describeOffset(-8, 4, "en")).toBe("move by 8 px left and 4 px down");
  });

  it("handles a zero offset", () => {
    expect(describeOffset(0, 0)).toBe("без смещения");
  });
});

describe("buildVisualBrief", () => {
  it("returns an empty string when there is nothing to send", () => {
    expect(buildVisualBrief([])).toBe("");
  });

  it("lists every edit with its selector and movement", () => {
    const brief = buildVisualBrief([baseEdit, { ...baseEdit, id: 2, selector: "h1.title", label: "h1.title", offsetX: 0, offsetY: 30 }]);
    expect(brief).toContain("[ВИЗУАЛЬНЫЕ ПРАВКИ ИЗ КОНСТРУКТОРА ПРЕВЬЮ]");
    expect(brief).toContain("Страница: http://127.0.0.1:4173/");
    expect(brief).toContain("Изменения (2):");
    expect(brief).toContain("1. <button.cta> «Купить» — сдвинуть на 40 px вправо и 12 px вверх.");
    expect(brief).toContain("Селектор: button.cta");
    expect(brief).toContain("2. h1.title — сдвинуть на 30 px вниз.");
    expect(brief).toContain("[/ВИЗУАЛЬНЫЕ ПРАВКИ]");
  });

  it("includes notes and style hints", () => {
    const brief = buildVisualBrief([{ ...baseEdit, note: "ближе к правому краю", styles: "opacity: 0.8" }]);
    expect(brief).toContain("комментарий: ближе к правому краю");
    expect(brief).toContain("стили: opacity: 0.8");
  });

  it("switches to English output", () => {
    const brief = buildVisualBrief([baseEdit], "en");
    expect(brief).toContain("[VISUAL EDITS FROM THE PREVIEW BUILDER]");
    expect(brief).toContain("move by 40 px right and 12 px up");
    expect(brief).toContain("[/VISUAL EDITS]");
  });

  it("describes size, colors and emits a CSS suggestion", () => {
    const styled: VisualEdit = {
      ...baseEdit,
      styles: JSON.stringify({ widthPct: 60, fontPct: 120, color: "#ffffff", background: "#0e639c", radius: 8, opacity: 0.9 }),
    };
    const brief = buildVisualBrief([styled]);
    expect(brief).toContain("ширина 60% родителя");
    expect(brief).toContain("шрифт 120%");
    expect(brief).toContain("фон #0e639c");
    expect(brief).toContain("CSS: width: 60%; font-size: 120%; color: #ffffff; background-color: #0e639c; border-radius: 8px; opacity: 0.9;");
  });
});

describe("style hints", () => {
  it("parses only known keys", () => {
    expect(parseStyleHints('{"widthPct":60,"evil":true}')).toEqual({ widthPct: 60 });
    expect(parseStyleHints("not json")).toEqual({});
    expect(parseStyleHints(undefined)).toEqual({});
  });

  it("describes styles in both languages", () => {
    const styles = JSON.stringify({ widthPct: 50, radius: 4, opacity: 0.5 });
    expect(describeStyles(styles)).toEqual(["ширина 50% родителя", "радиус 4px", "прозрачность 0.5"]);
    expect(describeStyles(styles, "en")).toEqual(["width 50% of the parent", "radius 4px", "opacity 0.5"]);
  });

  it("builds a paste-ready CSS string", () => {
    expect(styleSuggestion(JSON.stringify({ paddingPx: 12, fontPct: 90 }))).toBe("font-size: 90%; padding: 12px;");
    expect(styleSuggestion("")).toBe("");
  });

  it("supports em-based height so vertical resizing survives auto-height parents", () => {
    const styles = JSON.stringify({ heightEm: 8.5, widthPct: 40 });
    expect(describeStyles(styles)).toEqual(["ширина 40% родителя", "высота 8.5em"]);
    expect(styleSuggestion(styles)).toBe("width: 40%; height: 8.5em;");
  });
});
