import {
  ActionInputError,
  buildInventoryAction,
  bridgeActionInput,
  isInventoryActionName,
} from "@/app/_services/inventory-actions";
import { ActionsRequestToJSON } from "@/api/web-sdk/models/ActionsRequest";

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

  it("serializes the public attribute flag using the API wire name", () => {
    const action = buildInventoryAction("set_attributes", "object-1", {
      attributes: JSON.stringify([
        {
          key: "serial_number",
          value: "CIR-001",
          category: "identity",
          content_type: "text",
          public: true,
        },
      ]),
    });

    expect(JSON.parse(JSON.stringify(ActionsRequestToJSON(action)))).toEqual({
      set_attributes: {
        id: "object-1",
        attributes: [
          {
            key: "serial_number",
            value: "CIR-001",
            category: "identity",
            content_type: "text",
            public: true,
          },
        ],
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

  it("normalizes untrusted bridge defaults for the Viewer action form", () => {
    expect(
      bridgeActionInput("set_attributes", {
        attributes: [{ key: "profile.name", value: "DUAL", public: true }],
        expectedObjectNonce: 7,
      }),
    ).toEqual({
      attributes: JSON.stringify([
        { key: "profile.name", value: "DUAL", public: true },
      ]),
      expectedObjectNonce: "7",
    });
    expect(() => bridgeActionInput("update", { id: "another-object" })).toThrow(
      "id:json",
    );
  });
});
