import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Self-contained cross-origin product-face suite: the actual wallet (next dev)
// at http://demo.localhost:3000, the local fake api-v3 at 127.0.0.1:4010, and
// the pinned emitted Studio artifact plus a labelled fake runtime at
// http://localhost:4101. No sibling repository is needed.

const FIXTURES = path.join(__dirname, "e2e", "fixtures", "product-face");
// An explicit, ephemeral session key for this run (no fallback key exists).
const sessionSecret = randomBytes(32).toString("base64");

function pinnedArtifact() {
  if (!existsSync(FIXTURES)) return undefined;
  for (const applicationId of readdirSync(FIXTURES)) {
    for (const version of readdirSync(path.join(FIXTURES, applicationId))) {
      for (const hash of readdirSync(
        path.join(FIXTURES, applicationId, version),
      )) {
        const manifest = JSON.parse(
          readFileSync(
            path.join(FIXTURES, applicationId, version, hash, "manifest.json"),
            "utf8",
          ),
        );
        return { applicationId, version, hash, manifest };
      }
    }
  }
  return undefined;
}

const artifact = pinnedArtifact();

// Ephemeral signing keys, generated per run and never written to disk.
const keys = generateKeyPairSync("ed25519");
const signingKey = keys.privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString();
const publicKey = keys.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
const keyId = "wallet-face-e2e";

export const MORROW_TEMPLATE = "6a0000000000000000000001";
// The fake api-v3's Morrow specification fields (e2e/mock-api.mjs).
const SPEC_FIELDS = Array.from(
  { length: 27 },
  (_, index) => `spec_${String(index + 1).padStart(2, "0")}`,
);

const registry = artifact
  ? [
      {
        slug: "morrow-home",
        applicationId: artifact.manifest.applicationId,
        version: artifact.manifest.version,
        publisher: artifact.manifest.publisher,
        programmeId: artifact.manifest.programmeId,
        programmeName: artifact.manifest.programmeName,
        origin: "http://localhost:4101",
        path: `/face/${artifact.applicationId}/${artifact.version}/${artifact.hash}/`,
        artifactHash: artifact.manifest.artifactHash,
        templateIds: [MORROW_TEMPLATE],
        projectionFields: [
          "title",
          "serialNumber",
          "model",
          "manufacturer",
          "state",
        ],
        canonicalRegistration: {
          stateField: "state",
          lifecycleTargetField: "lifecycle.target_state",
          settledStates: [
            "Registered",
            "Authenticity verified",
            "In service",
            "Transferred",
          ],
          unconfirmedStates: ["Transfer pending"],
          endedStates: ["Recalled", "Stolen", "Retired"],
        },
        // The shape Studio's productFaceSettleInputTemplate() exports. With
        // the local fake runtime the proposal carries the unit's COMPLETE
        // custom map (35 leaves); integrated mode keeps the Studio harness
        // unit's template.
        settle: {
          action: "update",
          inputPath: "data.custom",
          leaves: {
            state: { enum: ["Authenticity verified"] },
            "lifecycle.target_state": { enum: ["Authenticity verified"] },
            action_hash: { runtimeIssued: "sha256_hex" },
            ...Object.fromEntries(
              (process.env.MOCK_PROGRAMME_DUAL_URL
                ? ["serialNumber"]
                : [
                    "recordId",
                    "title",
                    "serialNumber",
                    "model",
                    "manufacturer",
                    ...SPEC_FIELDS,
                  ]
              ).map((field) => [field, { unchanged: true }]),
            ),
          },
          fromStates: ["Transfer pending"],
          targetStates: ["Authenticity verified"],
        },
        // contract r14: face-enabled handover links may enter this face.
        handover: { enabled: true },
      },
    ]
  : [];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "product-face.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/product-face",
  use: {
    baseURL: "http://demo.localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: "http://127.0.0.1:4010/health",
      reuseExistingServer: false,
      env: {
        ...process.env,
        DEFAULT_ORGANIZATION_ID: "000000000000000000000001",
        MOCK_PROGRAMME_DUAL_URL: process.env.MOCK_PROGRAMME_DUAL_URL ?? "",
        PRODUCT_FACE_APPLICATIONS: JSON.stringify(registry),
      },
    },
    {
      command: "node e2e/product-face-fixture.mjs",
      url: "http://127.0.0.1:4101/health",
      reuseExistingServer: false,
      env: {
        ...process.env,
        PRODUCT_FACE_ASSERTION_PUBLIC_KEY: publicKey,
        PRODUCT_FACE_ASSERTION_KEY_ID: keyId,
        PRODUCT_FACE_WALLET_ORIGIN: "http://demo.localhost:3000",
        // contract r14: the wallet host entry the runtime publishes.
        PRODUCT_FACE_WALLET_ENTRY:
          "http://demo.localhost:3000/products/morrow-home/handover",
      },
    },
    {
      command: "npm run dev",
      // Node cannot resolve *.localhost here; Chromium can. The readiness
      // probe uses the loopback address, the tests the tenant host.
      url: "http://127.0.0.1:3000/login",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        API_URL: "http://127.0.0.1:4010",
        // An explicit, ephemeral session key for this run; there is no fallback.
        SESSION_SECRET: process.env.SESSION_SECRET ?? sessionSecret,
        VIEWER_BASE_DOMAIN: "wallet.dual.network",
        DEFAULT_ORGANIZATION_ID: "000000000000000000000001",
        NEXT_PUBLIC_APP_URL: "http://demo.localhost:3000",
        PRODUCT_FACE_APPLICATIONS: JSON.stringify(registry),
        FACE_ASSERTION_SIGNING_KEY: signingKey,
        FACE_ASSERTION_KEY_ID: keyId,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
        },
      },
    },
  ],
});
