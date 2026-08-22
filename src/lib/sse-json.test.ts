import { describe, expect, it } from "vitest";
import { hasSseData, parseSseJson } from "@/lib/sse-json";

type StreamEvent = {
  type: string;
  text?: string;
};

describe("parseSseJson", () => {
  it("parses a valid SSE data event", () => {
    expect(parseSseJson<StreamEvent>('event: message\ndata: {"type":"delta","text":"hello"}')).toEqual({
      type: "delta",
      text: "hello",
    });
  });

  it("joins multiline data fields before parsing JSON", () => {
    const block = [
      "data: {",
      'data:   "type": "delta",',
      'data:   "text": "hello"',
      "data: }",
    ].join("\n");

    expect(parseSseJson<StreamEvent>(block)).toEqual({ type: "delta", text: "hello" });
  });

  it("ignores blocks without data fields", () => {
    expect(hasSseData(": keep-alive\nevent: message")).toBe(false);
    expect(parseSseJson<StreamEvent>(": keep-alive\nevent: message")).toBeNull();
  });

  it("returns null for an empty data field", () => {
    expect(hasSseData("data:   ")).toBe(true);
    expect(parseSseJson<StreamEvent>("data:   ")).toBeNull();
  });

  it("returns null for malformed JSON instead of throwing", () => {
    expect(() => parseSseJson<StreamEvent>('data: {"type":"delta",}')).not.toThrow();
    expect(parseSseJson<StreamEvent>('data: {"type":"delta",}')).toBeNull();
  });

  it("returns null when two JSON objects are accidentally concatenated", () => {
    const concatenated = 'data: {"type":"delta"}{"type":"done"}';

    expect(parseSseJson<StreamEvent>(concatenated)).toBeNull();
  });
});
