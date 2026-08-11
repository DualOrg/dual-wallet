import type { ActionLog } from "@/api/web-sdk/models/ActionLog";
import type { ObjectDisplay } from "@/api/web-sdk/models/ObjectDisplay";
import type { PublicSmartObject } from "@/api/web-sdk/models/PublicSmartObject";
import type { SmartObject } from "@/api/web-sdk/models/SmartObject";
import {
  shortId,
  toActivityEntry,
  toInventoryObject,
  toPublicObject,
} from "@/app/_domain/inventory";

describe("inventory adapters", () => {
  it("keeps only safe image URLs", () => {
    const value = {
      id: "object-123",
      metadata: { name: "Membership", image: { url: "javascript:alert(1)" } },
      owner: "0x123",
      templateId: "template-1",
      version: 2,
      stateHash: "state",
      contentHash: "content",
      whenCreated: new Date("2026-01-01T00:00:00Z"),
      whenModified: new Date("2026-02-01T00:00:00Z"),
    } as SmartObject;

    expect(toInventoryObject(value)).toMatchObject({
      name: "Membership",
      imageUrl: undefined,
      owner: "0x123",
    });
  });

  it("adapts only the image included in the public object projection", () => {
    const value = {
      id: "object-public",
      metadata: {
        name: "Public membership",
        image: { id: "image-1", url: "https://assets.example/object.png" },
      },
      owner: "0x123",
      templateId: "template-1",
      version: 2,
      stateHash: "state",
      contentHash: "content",
      whenCreated: new Date("2026-01-01T00:00:00Z"),
      whenModified: new Date("2026-02-01T00:00:00Z"),
    } as PublicSmartObject;

    expect(toPublicObject(value)).toMatchObject({
      name: "Public membership",
      imageUrl: "https://assets.example/object.png",
      owner: "0x123",
    });
  });

  it("normalizes activity status and identifiers", () => {
    const value = {
      id: "log-1",
      name: "mint",
      status: "unexpected",
      hash: "0x1234567890abcdef",
      signer: "0xabc",
      affectedObjects: [{ id: "object-1" }],
      totalFee: "0.01",
      whenCreated: new Date("2026-01-01T00:00:00Z"),
    } as unknown as ActionLog;

    expect(toActivityEntry(value).status).toBe("completed");
    expect(toActivityEntry(value).detail).not.toHaveProperty("signature");
    expect(toActivityEntry(value).detail).not.toHaveProperty("auth");
    expect(shortId(value.hash, 4)).toBe("0x12…cdef");
  });

  it("accepts only the object's fixed display route", () => {
    const value = {
      id: "object-123",
      metadata: { name: "Membership" },
      owner: "0x123",
      templateId: "template-1",
      version: 2,
      stateHash: "state",
      contentHash: "content",
      whenCreated: new Date("2026-01-01T00:00:00Z"),
      whenModified: new Date("2026-02-01T00:00:00Z"),
    } as SmartObject;
    const display = {
      faceId: "face-1",
      variant: "card",
      mediaType: "text/html",
      href: "/public/objects/object-123/display/card",
      revision: "one",
      interactive: false,
    } as ObjectDisplay;

    expect(toInventoryObject(value, display).display).toMatchObject({
      kind: "document",
      url: "/api/public/objects/object-123/display/card?revision=one&content=content",
    });
    expect(
      toInventoryObject(value, {
        ...display,
        href: "/public/objects/another-object/display/card",
      }).display,
    ).toBeUndefined();
  });

  it("changes the display URL when object content changes", () => {
    const value = {
      id: "object-123",
      metadata: { name: "Membership" },
      owner: "0x123",
      templateId: "template-1",
      version: 2,
      stateHash: "state",
      contentHash: "content-one",
      whenCreated: new Date("2026-01-01T00:00:00Z"),
      whenModified: new Date("2026-02-01T00:00:00Z"),
    } as SmartObject;
    const display = {
      faceId: "face-1",
      variant: "card",
      mediaType: "image/svg+xml",
      href: "/public/objects/object-123/display/card",
      revision: "face-one",
      interactive: false,
    } as ObjectDisplay;

    const before = toInventoryObject(value, display).display?.url;
    const after = toInventoryObject(
      { ...value, contentHash: "content-two" },
      display,
    ).display?.url;

    expect(after).not.toBe(before);
    expect(after).toContain("content=content-two");
  });
});
