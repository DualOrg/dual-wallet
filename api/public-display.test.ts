import {
  publicDisplayUpstreamPath,
  validPublicDisplayRequest,
} from "@/api/public-display";

describe("public object display boundary", () => {
  it("allows only object display variants", () => {
    expect(validPublicDisplayRequest("object-123", "card")).toBe(true);
    expect(validPublicDisplayRequest("object-123", "detail")).toBe(true);
    expect(validPublicDisplayRequest("../wallets", "card")).toBe(false);
    expect(validPublicDisplayRequest("object-123", "source")).toBe(false);
  });

  it("builds a fixed upstream path", () => {
    expect(publicDisplayUpstreamPath("object_123", "share")).toBe(
      "/public/objects/object_123/display/share",
    );
    expect(publicDisplayUpstreamPath("object", "../detail")).toBeUndefined();
  });
});
