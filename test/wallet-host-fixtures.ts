// Two synthetic branded wallet hosts for tests. Every value is illustrative:
// the organisations, origins, faces and images are fixtures, not deployments.
import { createHash } from "node:crypto";
import { canonicalJson } from "@/app/_domain/product-face";
import {
  ARTIFACT_HEX,
  bindingInput,
  TEMPLATE_B,
} from "@/test/product-face-fixtures";

/** A 2x2 PNG and a 1x1 lossless WebP: different bytes, both under the cap. */
export const MORROW_LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGPgjvHijvFigFAAEm4CxUaOB1wAAAAASUVORK5CYII=";
export const TIDEWELL_LOGO_BASE64 =
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

export const MORROW_ORGANIZATION = "a1a1a1a1a1a1a1a1a1a1a1a1";
export const TIDEWELL_ORGANIZATION = "b2b2b2b2b2b2b2b2b2b2b2b2";
export const MORROW_ORIGIN = "https://wallet.morrow.example";
export const TIDEWELL_ORIGIN = "https://wallet.tidewell.example";

export const LINKED_WARRANTY = {
  purpose: "claims-warranty",
  applicationId: "tig.claims.morrow-warranty",
  origin: "https://warranty.example",
  instanceId: "tig-app-warranty0001",
};

export const TRANSFER_REQUEST = {
  action: "update",
  inputPath: "data.custom",
  leaves: {
    recordId: { unchanged: true },
    state: { enum: ["Transfer pending"] },
    "lifecycle.target_state": { enum: ["Transfer pending"] },
    "proof_event.public_fields": { runtimeIssued: "public_fields" },
  },
  fromStates: ["Authenticity verified"],
  targetStates: ["Transfer pending"],
  preserveUnlisted: true,
};

/** A face that backs every journey: linked Warranty runtime, transfer, handover. */
export const morrowBinding = () =>
  bindingInput({
    linkedRuntimes: [LINKED_WARRANTY],
    transferRequest: TRANSFER_REQUEST,
    handover: { enabled: true },
  });

/** A registration and My products face only. */
export const tidewellBinding = () =>
  bindingInput({
    slug: "tidewell-care",
    applicationId: "tig.passport.tidewell",
    publisher: "tidewell",
    programmeId: "tidewell-kettle",
    programmeName: "Tidewell Kettle",
    origin: "https://faces.tidewell.example",
    path: `/face/tig.passport.tidewell/1.0.0/${ARTIFACT_HEX}/`,
  });

/** One registry holding both faces, as a shared fixture deployment would. */
export const registryWithBothFaces = () =>
  JSON.stringify([morrowBinding(), tidewellBinding()]);

/** Tidewell's own linked Warranty runtime (never Morrow's). */
export const TIDEWELL_WARRANTY = {
  purpose: "claims-warranty",
  applicationId: "tig.claims.tidewell-warranty",
  origin: "https://warranty.tidewell.example",
  instanceId: "tig-app-warranty0002",
};

/**
 * Tidewell's face as a complete branded app: its own template, its own linked
 * Warranty runtime, transfer and handover (every journey backed).
 */
export const tidewellFullBinding = () => ({
  ...tidewellBinding(),
  templateIds: [TEMPLATE_B],
  linkedRuntimes: [TIDEWELL_WARRANTY],
  transferRequest: TRANSFER_REQUEST,
  handover: { enabled: true },
});

/** One registry holding both complete faces. */
export const registryWithBothFullFaces = () =>
  JSON.stringify([morrowBinding(), tidewellFullBinding()]);

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

export type HostDocument = Record<string, unknown> & {
  release: Record<string, unknown>;
};

export function morrowDocument(): HostDocument {
  return {
    schema: "dual-wallet-host-configuration-v1",
    brand: {
      id: "morrow-home",
      name: "Morrow Home",
      shortName: "Morrow",
      description: "Register, look after and pass on your Morrow Home tools.",
    },
    entrance: { origin: MORROW_ORIGIN, organizationId: MORROW_ORGANIZATION },
    identity: {
      logo: {
        mediaType: "image/png",
        sha256: sha256(Buffer.from(MORROW_LOGO_BASE64, "base64")),
        dataBase64: MORROW_LOGO_BASE64,
      },
      colours: {
        brand: "#2f7d5b",
        brandStrong: "#1d5c41",
        brandSoft: "#e6f4ec",
        ink: "#10261c",
        muted: "#4d6358",
        actionPrimary: "#1d5c41",
        actionPrimaryHover: "#154631",
        onActionPrimary: "#ffffff",
        surface: "#ffffff",
        surfaceSubtle: "#f4f7f5",
        border: "#d5e2da",
      },
      typography: { family: "satoshi" },
    },
    home: {
      headline: "Your Morrow Home tools, registered and cared for.",
      introduction:
        "Register a new tool, follow a service and pass it on when you sell it.",
      primaryJourney: "registration",
    },
    navigation: ["inventory", "products", "activity", "settings"],
    journeys: {
      registration: true,
      myProducts: true,
      serviceProgress: true,
      quoteDecisions: true,
      transfer: true,
    },
    faces: ["morrow-home"],
    release: {
      configVersion: "1.0.0",
      approvedContentHash: "",
      studioVersionRef: "studio@2026.10.1",
    },
  };
}

export function tidewellDocument(): HostDocument {
  return {
    schema: "dual-wallet-host-configuration-v1",
    brand: {
      id: "tidewell",
      name: "Tidewell",
      shortName: "Tidewell",
      description: "Your Tidewell kettles and their registrations.",
    },
    entrance: {
      origin: TIDEWELL_ORIGIN,
      organizationId: TIDEWELL_ORGANIZATION,
    },
    identity: {
      logo: {
        mediaType: "image/webp",
        sha256: sha256(Buffer.from(TIDEWELL_LOGO_BASE64, "base64")),
        dataBase64: TIDEWELL_LOGO_BASE64,
      },
      colours: {
        brand: "#3b5bdb",
        brandStrong: "#2c3fa8",
        brandSoft: "#eaeefc",
        ink: "#141a33",
        muted: "#535a75",
        actionPrimary: "#2c3fa8",
        actionPrimaryHover: "#1f2f85",
        onActionPrimary: "#ffffff",
        surface: "#fffdf8",
        surfaceSubtle: "#f5f3ee",
        border: "#dedbd2",
      },
      typography: { family: "system-serif" },
    },
    home: {
      headline: "Every Tidewell kettle you own, in one place.",
      introduction: "See your registered kettles and register a new one.",
      primaryJourney: "myProducts",
    },
    navigation: ["products", "settings"],
    journeys: {
      registration: true,
      myProducts: true,
      serviceProgress: false,
      quoteDecisions: false,
      transfer: false,
    },
    faces: ["tidewell-care"],
    release: {
      configVersion: "2.1.0",
      approvedContentHash: "",
      studioVersionRef: "studio@2026.10.1",
    },
  };
}

/**
 * Tidewell as a complete branded app (with `tidewellFullBinding` in the
 * registry): every journey, its own identity, entrance and face.
 */
export function tidewellFullDocument(): HostDocument {
  return {
    ...tidewellDocument(),
    home: {
      headline: "Every Tidewell kettle you own, in one place.",
      introduction:
        "Register a kettle, follow its service and pass it on when you sell it.",
      primaryJourney: "myProducts",
    },
    navigation: ["products", "activity", "settings"],
    journeys: {
      registration: true,
      myProducts: true,
      serviceProgress: true,
      quoteDecisions: true,
      transfer: true,
    },
  };
}

/**
 * The canonical document Studio emits and its pin. `release.
 * approvedContentHash` is recomputed unless `keepHash` (to test a stale one).
 */
export function sealHost(document: HostDocument, { keepHash = false } = {}) {
  const content = Object.fromEntries(
    Object.entries(document).filter(([key]) => key !== "release"),
  );
  const sealed = keepHash
    ? document
    : {
        ...document,
        release: {
          ...document.release,
          approvedContentHash: `sha256:${sha256(canonicalJson(content))}`,
        },
      };
  const raw = canonicalJson(sealed);
  return { raw, pin: sha256(raw), document: sealed };
}

export interface HostEnvironment {
  WALLET_HOST_CONFIGURATION?: string;
  WALLET_HOST_CONFIGURATION_SHA256?: string;
  NEXT_PUBLIC_APP_URL?: string;
  PRODUCT_FACE_APPLICATIONS?: string;
  WALLET_HOST_BUILD_CONFIGURATION_SHA256?: string;
  WALLET_HOST_BUILD_FACE_APPLICATIONS_SHA256?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
}

const HOST_KEYS: (keyof HostEnvironment)[] = [
  "WALLET_HOST_CONFIGURATION",
  "WALLET_HOST_CONFIGURATION_SHA256",
  "NEXT_PUBLIC_APP_URL",
  "PRODUCT_FACE_APPLICATIONS",
  "WALLET_HOST_BUILD_CONFIGURATION_SHA256",
  "WALLET_HOST_BUILD_FACE_APPLICATIONS_SHA256",
  "VERCEL_GIT_COMMIT_SHA",
];

/** The environment of one brand host deployment (the only per-brand input). */
export function hostEnvironment(
  document: HostDocument,
  extra: HostEnvironment = {},
): HostEnvironment {
  const { raw, pin } = sealHost(document);
  const entrance = document.entrance as { origin: string };
  return {
    WALLET_HOST_CONFIGURATION: raw,
    WALLET_HOST_CONFIGURATION_SHA256: pin,
    NEXT_PUBLIC_APP_URL: entrance.origin,
    PRODUCT_FACE_APPLICATIONS: registryWithBothFaces(),
    ...extra,
  };
}

/** Replaces every host variable in process.env with exactly these. */
export function applyHostEnvironment(environment: HostEnvironment) {
  for (const key of HOST_KEYS) {
    const value = environment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export function clearHostEnvironment() {
  applyHostEnvironment({});
}
