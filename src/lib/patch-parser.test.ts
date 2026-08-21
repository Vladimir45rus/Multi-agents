import { describe, expect, it } from "vitest";
import { normalizePatchInstruction, parsePatchInstruction } from "@/lib/patch-parser";

describe("parsePatchInstruction", () => {
  it("parses a plain JSON patch instruction", () => {
    const instruction = parsePatchInstruction(
      JSON.stringify({
        decision: "Fix the type error",
        patches: [{ path: "src/foo.ts", operation: "modify", content: "export const x = 1;" }],
      }),
    );

    expect(instruction.decision).toBe("Fix the type error");
    expect(instruction.patches).toEqual([
      { path: "src/foo.ts", operation: "modify", content: "export const x = 1;" },
    ]);
  });

  it("parses a fenced JSON code block", () => {
    const instruction = parsePatchInstruction(
      '```json\n{"decision":"d","patches":[{"path":"a.ts","operation":"create","content":"x"}]}\n```',
    );

    expect(instruction.decision).toBe("d");
    expect(instruction.patches).toHaveLength(1);
    expect(instruction.patches[0].operation).toBe("create");
  });

  it("extracts JSON embedded in prose", () => {
    const instruction = parsePatchInstruction('Here is the plan: {"decision":"go","patches":[]}');

    expect(instruction.decision).toBe("go");
    expect(instruction.patches).toEqual([]);
  });

  it("accepts a delete operation without content", () => {
    const instruction = parsePatchInstruction(
      JSON.stringify({ decision: "remove", patches: [{ path: "dead.ts", operation: "delete" }] }),
    );

    expect(instruction.patches).toEqual([{ path: "dead.ts", operation: "delete", content: undefined }]);
  });

  it("falls back to the raw text when there is no JSON", () => {
    const instruction = parsePatchInstruction("just plain reasoning, no JSON at all");

    expect(instruction.decision).toBe("just plain reasoning, no JSON at all");
    expect(instruction.patches).toEqual([]);
  });
});

describe("normalizePatchInstruction", () => {
  it("trims the decision string", () => {
    expect(normalizePatchInstruction({ decision: "  final call  ", patches: [] }).decision).toBe("final call");
  });

  it("drops malformed patch entries", () => {
    const instruction = normalizePatchInstruction({
      decision: "d",
      patches: [
        { path: "ok.ts", operation: "modify", content: "x" },
        { path: "no-op.ts", operation: "rename", content: "x" },
        { path: "", operation: "modify", content: "x" },
        { path: "missing-content.ts", operation: "modify" },
        "not an object",
      ],
    });

    expect(instruction.patches).toEqual([{ path: "ok.ts", operation: "modify", content: "x" }]);
  });

  it("returns an empty instruction for null input", () => {
    expect(normalizePatchInstruction(null)).toEqual({ decision: "", patches: [] });
    expect(normalizePatchInstruction(undefined)).toEqual({ decision: "", patches: [] });
    expect(normalizePatchInstruction("nope")).toEqual({ decision: "", patches: [] });
  });
});
