import type { ObjectDisplay } from "@/api/web-sdk/models/ObjectDisplay";
import type { SmartObject } from "@/api/web-sdk/models/SmartObject";
import { toInventoryObject } from "@/app/_adapters/inventory";

function object(overrides: Partial<SmartObject> = {}) {
  return {
    id: "object-1",
    metadata: { name: "Test object" },
    owner: "0xowner",
    templateId: "template-1",
    version: 3,
    stateHash: "state",
    contentHash: "content",
    whenCreated: new Date("2026-01-01T00:00:00Z"),
    whenModified: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  } as SmartObject;
}

function display(overrides: Partial<ObjectDisplay> = {}) {
  return {
    variant: "card",
    href: "https://faces.dual.network/dpp-base/v1/",
    mediaType: "text/html",
    interactive: true,
    revision: "rev-1",
    ...overrides,
  } as ObjectDisplay;
}

// The adapter is the trust boundary for publisher-authored face configuration:
// a value that reaches a style property must already be a literal colour.
describe("face surface colour", () => {
  it("takes the face's surface colour from its public configuration", () => {
    const result = toInventoryObject(
      object(),
      display({ config: { theme: { colors: { surface: "#f6f3ec" } } } }),
    );
    expect(result.display?.surface).toBe("#f6f3ec");
  });

  it("refuses a surface colour that is not a literal hex value", () => {
    for (const surface of [
      "red",
      "var(--brand)",
      "#f6f3ec; position:fixed",
      "url(https://evil.test/x)",
      "",
    ]) {
      const result = toInventoryObject(
        object(),
        display({ config: { theme: { colors: { surface } } } }),
      );
      expect(result.display?.surface).toBeUndefined();
    }
  });

  it("ignores a configuration whose theme is not shaped as expected", () => {
    for (const config of [
      { theme: "dark" },
      { theme: { colors: [] } },
      { theme: { colors: { surface: 16 } } },
      {},
    ]) {
      const result = toInventoryObject(object(), display({ config }));
      expect(result.display?.config).toEqual(config);
      expect(result.display?.surface).toBeUndefined();
    }
  });

  it("leaves the surface unset when the display carries no configuration", () => {
    expect(
      toInventoryObject(object(), display()).display?.surface,
    ).toBeUndefined();
  });
});
