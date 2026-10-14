// Shared fixtures for product-face tests. Values are illustrative only.
import type { ProductFaceApplication } from "@/app/_domain/product-face";

export const ARTIFACT_HEX = "a".repeat(64);
export const TEMPLATE_A = "65f0a1b2c3d4e5f6a7b8c9d0";
export const TEMPLATE_B = "65f0a1b2c3d4e5f6a7b8c9d1";
export const HOLDER = "0x1234567890abcdef1234567890abcdef12345678";

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
      inputTemplate: {
        custom: {
          state: { $oneOf: "targetStates" },
          lifecycle: { target_state: { $oneOf: "targetStates" } },
        },
      },
      fromStates: ["Transfer pending"],
      targetStates: ["Authenticity verified"],
    },
    ...overrides,
  };
}

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
    inputTemplate: {
      custom: {
        state: { $oneOf: "targetStates" },
        lifecycle: { target_state: { $oneOf: "targetStates" } },
      },
    },
    fromStates: ["Transfer pending"],
    targetStates: ["Authenticity verified"],
  },
};
