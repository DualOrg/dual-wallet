/**
 * @jest-environment node
 */
import {
  parseProductFaceApplications,
  productFaceFrameOrigins,
} from "@/api/product-face-binding";
import { toProductFaceApplication } from "@/api/product-face-registry";
import { ARTIFACT_HEX, bindingInput } from "@/test/product-face-fixtures";

// binding.transferRequest in the inspection's flat export shape.
const TRANSFER_REQUEST = {
  action: "update",
  inputPath: "data.custom",
  leaves: {
    state: { enum: ["Transfer pending"] },
    "lifecycle.target_state": { enum: ["Transfer pending"] },
    serialNumber: { unchanged: true },
    "proof_event.public_fields": { runtimeIssued: "public_fields" },
  } as Record<string, unknown>,
  fromStates: ["Authenticity verified"],
  targetStates: ["Transfer pending"],
  preserveUnlisted: true,
};

const parse = (entries: unknown[], production = true) =>
  parseProductFaceApplications(JSON.stringify(entries), { production });

describe("product application registry", () => {
  it("parses a complete binding", () => {
    const [binding] = parse([bindingInput()]);
    expect(binding).toMatchObject({
      slug: "morrow-home",
      applicationId: "tig.passport.morrow-home",
      version: "1.0.0",
      origin: "https://faces.example",
      artifactHash: `sha256:${ARTIFACT_HEX}`,
      settle: { action: "update", fromStates: ["Transfer pending"] },
    });
  });

  it("fails closed on malformed configuration", () => {
    expect(
      parseProductFaceApplications(undefined, { production: true }),
    ).toEqual([]);
    expect(
      parseProductFaceApplications("{not json", { production: true }),
    ).toEqual([]);
    expect(parseProductFaceApplications("{}", { production: true })).toEqual(
      [],
    );
  });

  it.each([
    ["an unknown key", { extra: true }],
    ["a bad slug", { slug: "Morrow Home" }],
    ["a version range", { version: "^1.0.0" }],
    ["a major-only version", { version: "1" }],
    ["a wildcard origin", { origin: "https://*.example" }],
    ["an origin with a path", { origin: "https://faces.example/x" }],
    ["plain http in production", { origin: "http://faces.example" }],
    ["loopback http in production", { origin: "http://localhost:4101" }],
    [
      "a path that is not content-addressed",
      { path: "/face/tig.passport.morrow-home/1.0.0/" },
    ],
    [
      "a path for another artifact",
      { path: `/face/tig.passport.morrow-home/1.0.0/${"b".repeat(64)}/` },
    ],
    ["a malformed artifact hash", { artifactHash: "sha256:xyz" }],
    ["an uppercase template id", { templateIds: ["65F0A1B2C3D4E5F6A7B8C9D0"] }],
    ["no templates", { templateIds: [] }],
    ["an unknown projection field", { projectionFields: ["owner"] }],
    [
      "overlapping canonical states",
      {
        canonicalRegistration: {
          ...bindingInput().canonicalRegistration,
          endedStates: ["Registered"],
        },
      },
    ],
    [
      "a claim_ownership settle",
      { settle: { ...bindingInput().settle, action: "claim_ownership" } },
    ],
    [
      "a transfer settle",
      { settle: { ...bindingInput().settle, action: "transfer" } },
    ],
    [
      "a settle from a settled state",
      { settle: { ...bindingInput().settle, fromStates: ["Registered"] } },
    ],
    [
      "a settle to an unsettled state",
      {
        settle: {
          ...bindingInput().settle,
          targetStates: ["Transfer pending"],
        },
      },
    ],
    [
      "a settle template with an arbitrary leaf",
      {
        settle: {
          ...bindingInput().settle,
          inputTemplate: { custom: { state: "anything" } },
        },
      },
    ],
    ["markup in the programme name", { programmeName: "<b>Arc</b>" }],
    [
      "a non-boolean settle preserveUnlisted",
      { settle: { ...bindingInput().settle, preserveUnlisted: "yes" } },
    ],
    [
      "a transfer request that is not an update",
      { transferRequest: { ...TRANSFER_REQUEST, action: "transfer" } },
    ],
    [
      "a transfer request with an alias",
      { transferRequest: { ...TRANSFER_REQUEST, alias: "update" } },
    ],
    [
      "a transfer request from a pending state",
      {
        transferRequest: {
          ...TRANSFER_REQUEST,
          fromStates: ["Transfer pending"],
        },
      },
    ],
    [
      "a transfer request to a settled state",
      {
        transferRequest: {
          ...TRANSFER_REQUEST,
          targetStates: ["Authenticity verified"],
        },
      },
    ],
    [
      "a transfer request with an arbitrary leaf",
      {
        transferRequest: {
          ...TRANSFER_REQUEST,
          leaves: { ...TRANSFER_REQUEST.leaves, title: "anything" },
        },
      },
    ],
    [
      "a transfer request enum outside its target states",
      {
        transferRequest: {
          ...TRANSFER_REQUEST,
          leaves: {
            ...TRANSFER_REQUEST.leaves,
            state: { enum: ["Registered"] },
          },
        },
      },
    ],
    [
      "a transfer request with an unknown key",
      { transferRequest: { ...TRANSFER_REQUEST, extra: true } },
    ],
  ])("drops a binding with %s", (_label, override) => {
    expect(parse([bindingInput(override)])).toEqual([]);
  });

  it("parses binding.transferRequest and the complete-map flag (contract r17)", () => {
    const [binding] = parse([
      bindingInput({ transferRequest: TRANSFER_REQUEST }),
    ]);
    expect(binding.settle?.preserveUnlisted).toBe(true);
    expect(binding.transferRequest).toEqual({
      action: "update",
      leaves: {
        "data.custom.state": { enum: ["Transfer pending"] },
        "data.custom.lifecycle.target_state": { enum: ["Transfer pending"] },
        "data.custom.serialNumber": { unchanged: true },
        "data.custom.proof_event.public_fields": {
          runtimeIssued: "public_fields",
        },
      },
      fromStates: ["Authenticity verified"],
      targetStates: ["Transfer pending"],
      preserveUnlisted: true,
    });
    expect(toProductFaceApplication(binding).transferRequest).toEqual(
      binding.transferRequest,
    );
    // Absent or null: not granted. Without the flag: parsed, and refused by
    // the checkers (an older entry fails closed for that operation only).
    expect(parse([bindingInput()])[0].transferRequest).toBeNull();
    expect(
      parse([bindingInput({ transferRequest: null })])[0].transferRequest,
    ).toBeNull();
    const { preserveUnlisted: _flag, ...unflagged } = TRANSFER_REQUEST;
    void _flag;
    expect(
      parse([bindingInput({ transferRequest: unflagged })])[0].transferRequest
        ?.preserveUnlisted,
    ).toBe(false);
    const { preserveUnlisted: _settleFlag, ...olderSettle } =
      bindingInput().settle;
    void _settleFlag;
    expect(
      parse([bindingInput({ settle: olderSettle })])[0].settle
        ?.preserveUnlisted,
    ).toBe(false);
  });

  it("accepts Studio's productFaceSettleInputTemplate() export shape", () => {
    const [binding] = parse([
      bindingInput({
        settle: {
          action: "update",
          inputPath: "data.custom",
          leaves: {
            state: { enum: ["Authenticity verified"] },
            "lifecycle.target_state": { enum: ["Authenticity verified"] },
            app: { literal: "governed-workflow-studio" },
            recordId: { unchanged: true },
            action_hash: { runtimeIssued: "sha256_hex" },
            "proof_event.event_hash": { runtimeIssued: "sha256_prefixed" },
            "receipt.id": { runtimeIssued: "^rcpt-[0-9]+$" },
          },
          fromStates: ["Transfer pending"],
          targetStates: ["Authenticity verified"],
        },
      }),
    ]);
    expect(binding.settle?.leaves).toMatchObject({
      "data.custom.state": { enum: ["Authenticity verified"] },
      "data.custom.recordId": { unchanged: true },
      "data.custom.action_hash": { runtimeIssued: "sha256_hex" },
    });
  });

  it.each([
    [
      "an enum value outside the target states",
      { state: { enum: ["Registered"] } },
    ],
    ["an unanchored regex", { "receipt.id": { runtimeIssued: "rcpt-.*" } }],
    ["an unknown format name", { action_hash: { runtimeIssued: "anything" } }],
    ["an unknown leaf kind", { state: { oneOf: ["Authenticity verified"] } }],
    [
      "a leaf that is also a parent",
      { receipt: { unchanged: true }, "receipt.id": { unchanged: true } },
    ],
  ])("drops a Studio-shaped settle with %s", (_label, leaves) => {
    expect(
      parse([
        bindingInput({
          settle: {
            action: "update",
            inputPath: "data.custom",
            leaves,
            fromStates: ["Transfer pending"],
            targetStates: ["Authenticity verified"],
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("drops a settle that mixes both template spellings", () => {
    expect(
      parse([
        bindingInput({
          settle: {
            ...bindingInput().settle,
            inputPath: "data.custom",
            leaves: { state: { enum: ["Authenticity verified"] } },
          },
        }),
      ]),
    ).toEqual([]);
  });

  describe("linked runtimes (contract r10)", () => {
    const linked = {
      purpose: "claims-warranty",
      applicationId: "tig.claims.morrow-warranty",
      origin: "https://warranty.example",
      instanceId: "tig-app-warranty0001",
    };

    it("parses a linked Warranty runtime and defaults to none", () => {
      expect(parse([bindingInput()])[0].linkedRuntimes).toEqual([]);
      expect(
        parse([bindingInput({ linkedRuntimes: [linked] })])[0].linkedRuntimes,
      ).toEqual([linked]);
    });

    it.each([
      ["not an array", linked],
      ["an extra key", [{ ...linked, token: "x" }]],
      ["a missing key", [{ ...linked, instanceId: undefined }]],
      ["another purpose", [{ ...linked, purpose: "loyalty" }]],
      ["an invalid application id", [{ ...linked, applicationId: "Bad App" }]],
      [
        "a non-exact origin",
        [{ ...linked, origin: "https://warranty.example/" }],
      ],
      ["a wildcard origin", [{ ...linked, origin: "https://*.example" }]],
      ["plain http", [{ ...linked, origin: "http://warranty.example" }]],
      ["an invalid instance id", [{ ...linked, instanceId: "a b" }]],
      [
        "the same purpose twice",
        [linked, { ...linked, instanceId: "tig-app-2" }],
      ],
      [
        "the face itself",
        [{ ...linked, applicationId: "tig.passport.morrow-home" }],
      ],
    ])("drops the whole binding for %s", (_label, linkedRuntimes) => {
      expect(parse([bindingInput({ linkedRuntimes })])).toEqual([]);
    });

    it("allows a loopback linked origin only outside production", () => {
      const local = [
        bindingInput({
          origin: "http://localhost:4101",
          linkedRuntimes: [{ ...linked, origin: "http://localhost:4102" }],
        }),
      ];
      expect(parse(local, false)).toHaveLength(1);
      expect(parse(local, true)).toEqual([]);
    });

    it("stays server-only: never a frame origin or a browser field", () => {
      const raw = JSON.stringify([bindingInput({ linkedRuntimes: [linked] })]);
      expect(productFaceFrameOrigins(raw, { production: true })).toEqual([
        "https://faces.example",
      ]);
      const browserApplication = toProductFaceApplication(
        parse([bindingInput({ linkedRuntimes: [linked] })])[0],
      );
      expect(browserApplication).not.toHaveProperty("linkedRuntimes");
      expect(JSON.stringify(browserApplication)).not.toContain(
        "warranty.example",
      );
    });
  });

  describe("face handover (contract r14)", () => {
    it("is off unless the entry says {enabled: true}", () => {
      expect(parse([bindingInput()])[0].handover).toEqual({ enabled: false });
      expect(
        parse([bindingInput({ handover: { enabled: true } })])[0].handover,
      ).toEqual({ enabled: true });
      expect(
        parse([bindingInput({ handover: { enabled: false } })])[0].handover,
      ).toEqual({ enabled: false });
    });

    it.each([
      ["true", true],
      ["an empty object", {}],
      ["a string flag", { enabled: "true" }],
      ["an extra key", { enabled: true, walletOrigin: "https://x.example" }],
      ["an array", [{ enabled: true }]],
    ])("drops the whole binding for %s", (_label, handover) => {
      expect(parse([bindingInput({ handover })])).toEqual([]);
    });

    it("is not a browser field", () => {
      const application = toProductFaceApplication(
        parse([bindingInput({ handover: { enabled: true } })])[0],
      );
      expect(application).not.toHaveProperty("handover");
    });
  });

  it("allows loopback http only outside production", () => {
    const local = bindingInput({ origin: "http://localhost:4101" });
    expect(parse([local], false)).toHaveLength(1);
    expect(parse([local], true)).toHaveLength(0);
  });

  it("drops every binding of a duplicated slug", () => {
    expect(
      parse([bindingInput(), bindingInput({ programmeName: "Other" })]),
    ).toEqual([]);
  });

  it("derives exact frame origins, never a wildcard", () => {
    const raw = JSON.stringify([
      bindingInput(),
      bindingInput({ slug: "tidewell", origin: "https://tidewell.example" }),
      bindingInput({ slug: "broken", origin: "https://*.example" }),
    ]);
    expect(productFaceFrameOrigins(raw, { production: true })).toEqual([
      "https://faces.example",
      "https://tidewell.example",
    ]);
  });
});
