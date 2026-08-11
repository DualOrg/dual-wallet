import {
  ActionInputError,
  buildInventoryAction,
  isInventoryActionName,
} from "@/app/_lib/inventory-actions";

describe("inventory actions", () => {
  it("builds an object action from an inventory action name", () => {
    expect(
      buildInventoryAction("transfer", "object-1", {
        to: "0x1234567890abcdef1234567890abcdef12345678",
      }),
    ).toEqual({
      transfer: {
        id: "object-1",
        to: "0x1234567890abcdef1234567890abcdef12345678",
      },
    });
  });

  it("wraps update input as custom object data", () => {
    const action = buildInventoryAction("update", "6a311a0666b5491bf3bb0a99", {
      custom: '{"status": "active"}',
    });

    expect(JSON.parse(JSON.stringify(action))).toEqual({
      update: {
        id: "6a311a0666b5491bf3bb0a99",
        data: { custom: { status: "active" } },
      },
    });
  });

  it("normalizes delete-attribute keys for the generated SDK", () => {
    expect(
      buildInventoryAction("delete_attributes", "object-1", {
        keys: '["profile.name"]',
        expectedObjectNonce: "7",
      }),
    ).toEqual({
      deleteAttributes: {
        id: "object-1",
        keys: new Set(["profile.name"]),
        expectedObjectNonce: 7,
      },
    });
  });

  it("rejects missing required parameters before execution", () => {
    expect(() => buildInventoryAction("transfer", "object-1")).toThrow(
      ActionInputError,
    );
  });

  it("filters action names that cannot be executed from an object", () => {
    expect(isInventoryActionName("pickup")).toBe(true);
    expect(isInventoryActionName("mint")).toBe(false);
    expect(isInventoryActionName("bridgeNFT")).toBe(false);
  });
});
