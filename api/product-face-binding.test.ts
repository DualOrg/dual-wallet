/**
 * @jest-environment node
 */
import {
  parseProductFaceApplications,
  productFaceFrameOrigins,
} from "@/api/product-face-binding";
import { toProductFaceApplication } from "@/api/product-face-registry";
import { ARTIFACT_HEX, bindingInput } from "@/test/product-face-fixtures";

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
  ])("drops a binding with %s", (_label, override) => {
    expect(parse([bindingInput(override)])).toEqual([]);
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
