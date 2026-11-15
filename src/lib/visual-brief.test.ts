import { describe, expect, it } from "vitest";
import { buildVisualBrief, describeOffset, normalizeVisualEdit, type VisualEdit } from "@/lib/visual-brief";

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
});
