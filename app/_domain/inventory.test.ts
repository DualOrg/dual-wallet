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

function actionLog(overrides: Partial<ActionLog> = {}): ActionLog {
  return {
    id: "log-1",
    name: "mint",
    params: {},
    messageHash: "0xmessage",
    account: "0xkernel",
    controller: "0xcontroller",
    hash: "0x1234567890abcdef",
    affectedObjects: [],
    status: "completed",
    baseFee: "0.001",
    baseFeeWei: "1000",
    dynamicFee: "0.002",
    dynamicFeeWei: "2000",
    tokenPrice: "1",
    totalFee: "0.003",
    totalFeeWei: "3000",
    nonce: 1,
    auth: { type: "eoa", signature: "raw-signature" },
    version: 2,
    whenCreated: new Date("2026-01-01T00:00:00Z"),
    whenModified: new Date("2026-01-01T00:01:00Z"),
    ...overrides,
  };
}

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
    const value = actionLog({ status: "unexpected" as ActionLog["status"] });
    const entry = toActivityEntry(value);

    expect(entry.status).toBe("completed");
    expect(entry).toMatchObject({
      account: "0xkernel",
      controller: "0xcontroller",
      version: 2,
    });
    expect(entry.detail).toMatchObject({
      account: "0xkernel",
      controller: "0xcontroller",
      authenticationType: "eoa",
      version: 2,
      hash: value.hash,
    });
    expect(entry.detail).not.toHaveProperty("signature");
    expect(entry.detail).not.toHaveProperty("auth");
    expect(shortId(value.hash, 4)).toBe("0x12…cdef");
  });

  it("adapts historical V1 logs through the same account/controller shape", () => {
    const entry = toActivityEntry(
      actionLog({
        account: "0xhistorical-eoa",
        controller: "0xmigrated-controller",
        auth: { type: "personal_sign", signature: "legacy-proof" },
        version: 1,
      }),
    );

    expect(entry.detail).toMatchObject({
      account: "0xhistorical-eoa",
      controller: "0xmigrated-controller",
      authenticationType: "personal_sign",
      version: 1,
    });
    expect(entry.detail).not.toHaveProperty("auth");
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

  it("accepts an HTTPS HTML face URL as an external document", () => {
    const value = {
      id: "object-123",
      metadata: { name: "Remote passport" },
      owner: "0x123",
      templateId: "template-1",
      version: 1,
      stateHash: "state",
      contentHash: "content",
      whenCreated: new Date("2026-01-01T00:00:00Z"),
      whenModified: new Date("2026-02-01T00:00:00Z"),
    } as SmartObject;
    const display = {
      faceId: "face-1",
      variant: "card",
      mediaType: "text/html",
      href: "https://passport.example/viewer?object_id=object-123&theme=dark&variant=card",
      revision: "one",
      interactive: true,
      config: { metadata: { name: "dpp" }, settings: { screen: "home" } },
    } as ObjectDisplay;

    expect(toInventoryObject(value, display).display).toEqual({
      kind: "external-document",
      url: "https://passport.example/viewer?object_id=object-123&theme=dark&variant=card",
      mediaType: "text/html",
      aspectRatio: undefined,
      interactive: true,
      revision: "one",
      config: {
        metadata: { name: "dpp" },
        settings: { screen: "home" },
      },
    });
    expect(
      toInventoryObject(value, {
        ...display,
        href: "javascript:alert(1)",
      }).display,
    ).toBeUndefined();
    expect(
      toInventoryObject(value, {
        ...display,
        href: "http://localhost:4100/bridge/test-host/",
      }).display,
    ).toMatchObject({
      kind: "external-document",
      url: "http://localhost:4100/bridge/test-host/",
    });
  });
});
