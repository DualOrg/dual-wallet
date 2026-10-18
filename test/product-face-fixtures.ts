// Shared fixtures for product-face tests. Values are illustrative only.
import type {
  ProductFaceApplication,
  TransferRequestRules,
} from "@/app/_domain/product-face";

export const ARTIFACT_HEX = "a".repeat(64);

/** Marks a path for removal in `edit`. */
export const REMOVE = Symbol("remove");
/** Rewrites (or, with REMOVE, deletes) one dotted path of JSON test data in place. */
export function edit(
  value: Record<string, unknown>,
  path: string,
  next: unknown,
) {
  const parts = path.split(".");
  let node = value;
  for (const part of parts.slice(0, -1)) {
    node = node[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (next === REMOVE) delete node[last];
  else node[last] = next;
}
export const TEMPLATE_A = "65f0a1b2c3d4e5f6a7b8c9d0";
export const TEMPLATE_B = "65f0a1b2c3d4e5f6a7b8c9d1";
export const HOLDER = "0x1234567890abcdef1234567890abcdef12345678";
/** A Dual account address as Dual returns it: EIP-55 mixed case (the EIP-55 test vector). */
export const CHECKSUM_HOLDER = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

export function bindingInput(overrides: Record<string, unknown> = {}) {
  return {
    slug: "morrow-home",
    applicationId: "tig.passport.morrow-home",
    version: "1.0.0",
    publisher: "morrow-home",
    programmeId: "morrow-home-arc",
    programmeName: "Morrow Home Arc",
    origin: "https://faces.example",
    path: `/face/tig.passport.morrow-home/1.0.0/${ARTIFACT_HEX}/`,
    artifactHash: `sha256:${ARTIFACT_HEX}`,
    templateIds: [TEMPLATE_A],
    projectionFields: ["serialNumber", "model", "state"],
    canonicalRegistration: {
      stateField: "state",
      lifecycleTargetField: "lifecycle.target_state",
      settledStates: ["Registered", "Authenticity verified", "In service"],
      unconfirmedStates: ["Transfer pending"],
      endedStates: ["Recalled", "Stolen", "Retired"],
    },
    settle: {
      action: "update",
      // r7: the template lists every key of the unit's custom map (the test
      // units carry recordId and state).
      inputTemplate: {
        custom: {
          recordId: { unchanged: true },
          state: { enum: ["Authenticity verified"] },
          lifecycle: { target_state: { enum: ["Authenticity verified"] } },
        },
      },
      fromStates: ["Transfer pending"],
      targetStates: ["Authenticity verified"],
      preserveUnlisted: true,
    },
    ...overrides,
  };
}

// binding.transferRequest (G8 request step), as the runtime's template
// inspection answers it: governed leaves only, contract r17 preserveUnlisted.
export const transferRequestRules: TransferRequestRules = {
  action: "update",
  leaves: {
    "data.custom.state": { enum: ["Transfer pending"] },
    "data.custom.lifecycle.target_state": { enum: ["Transfer pending"] },
    "data.custom.serialNumber": { unchanged: true },
    "data.custom.proof_event.public_fields": { runtimeIssued: "public_fields" },
  },
  fromStates: ["Authenticity verified", "In service"],
  targetStates: ["Transfer pending"],
  preserveUnlisted: true,
};

export const application: ProductFaceApplication = {
  slug: "morrow-home",
  id: "tig.passport.morrow-home",
  version: "1.0.0",
  publisher: "morrow-home",
  programme: { id: "morrow-home-arc", name: "Morrow Home Arc" },
  origin: "https://faces.example",
  path: `/face/tig.passport.morrow-home/1.0.0/${ARTIFACT_HEX}/`,
  artifact: `sha256:${ARTIFACT_HEX}`,
  contract: "dual-product-face-v1",
  templateIds: [TEMPLATE_A, TEMPLATE_B],
  projectionFields: ["serialNumber", "model", "state"],
  canonicalRegistration: {
    stateField: "state",
    lifecycleTargetField: "lifecycle.target_state",
    settledStates: ["Registered", "Authenticity verified", "In service"],
    unconfirmedStates: ["Transfer pending"],
    endedStates: ["Recalled", "Stolen", "Retired"],
  },
  settle: {
    action: "update",
    leaves: {
      "data.custom.state": { enum: ["Authenticity verified"] },
      "data.custom.lifecycle.target_state": { enum: ["Authenticity verified"] },
      "data.custom.serialNumber": { unchanged: true },
      "data.custom.action_hash": { runtimeIssued: "sha256_hex" },
    },
    fromStates: ["Transfer pending"],
    targetStates: ["Authenticity verified"],
    preserveUnlisted: true,
  },
  transferRequest: transferRequestRules,
};
