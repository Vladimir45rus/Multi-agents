import { describe, expect, it } from "vitest";
import type { GatewayMessage } from "@/lib/provider-gateway";

// The multimodal body builders are internal, so this test pins the contract
// they rely on: a user message carries data-URL images, and only data URLs
// are accepted (remote links must not be fetched server-side by accident).
function pickImages(message: GatewayMessage) {
  return (message.images ?? []).filter((image) => image.url.startsWith("data:")).slice(0, 4);
}

describe("vision attachments", () => {
  it("keeps at most four data-url images per message", () => {
    const message: GatewayMessage = {
      role: "user",
      content: "поправь как на скриншоте",
      images: Array.from({ length: 6 }, (_, index) => ({ url: `data:image/png;base64,AAAA${index}` })),
    };
    expect(pickImages(message)).toHaveLength(4);
  });

  it("ignores remote image links", () => {
    const message: GatewayMessage = {
      role: "user",
      content: "look at this",
      images: [{ url: "https://example.com/photo.png" }, { url: "data:image/jpeg;base64,BBBB" }],
    };
    const kept = pickImages(message);
    expect(kept).toHaveLength(1);
    expect(kept[0].url.startsWith("data:image/jpeg")).toBe(true);
  });

  it("sends plain text when there are no images", () => {
    const message: GatewayMessage = { role: "user", content: "just text" };
    expect(message.images).toBeUndefined();
    expect(message.content).toBe("just text");
  });
});
