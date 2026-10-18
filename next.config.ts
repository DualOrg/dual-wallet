import { createHash } from "node:crypto";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { engineBuildCommit } from "./api/engine-build-commit";
import { productFaceFrameOrigins } from "./api/product-face-binding";

const isDevelopment = process.env.NODE_ENV === "development";

// Product applications are framed from the exact origins the server-only
// registry binds. The registry is read at build time here, so a new product
// origin needs a rebuild; an origin missing from the CSP fails closed.
const productFaceOrigins = productFaceFrameOrigins(
  process.env.PRODUCT_FACE_APPLICATIONS,
  { production: process.env.NODE_ENV === "production" },
);

// A branded host's static pages render its identity at build time, so the
// build records the sha256 of the WALLET_HOST_CONFIGURATION it rendered ("" for
// the generic wallet) and, for a brand, of the PRODUCT_FACE_APPLICATIONS it
// validated that configuration against. The server refuses to serve under any
// other configuration or registry (api/host-configuration.ts build_mismatch):
// a generic build never serves a brand, and a brand build never serves
// another. NEXT_PUBLIC_APP_URL needs no record: Next.js inlines it at build.
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const hostConfiguration = process.env.WALLET_HOST_CONFIGURATION;
const hostBuildSha256 = hostConfiguration ? sha256(hostConfiguration) : "";
const hostBuildFaceApplicationsSha256 = hostConfiguration
  ? sha256(process.env.PRODUCT_FACE_APPLICATIONS ?? "")
  : "";

// The engine commit this build is made from, read back as engine.commit
// (api/engine-build-commit.ts): recorded here because a CLI or prebuilt
// deployment of a project not linked to the repository has no runtime
// VERCEL_GIT_COMMIT_SHA. "" when the source is not a clean, exact checkout.
const engineCommit = engineBuildCommit();

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    WALLET_HOST_BUILD_CONFIGURATION_SHA256: hostBuildSha256,
    WALLET_HOST_BUILD_FACE_APPLICATIONS_SHA256: hostBuildFaceApplicationsSha256,
    WALLET_ENGINE_BUILD_COMMIT: engineCommit,
  },
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss:",
              [
                "frame-src 'self' https:",
                ...(isDevelopment
                  ? ["http://localhost:4100", "http://127.0.0.1:4100"]
                  : []),
                ...productFaceOrigins,
              ].join(" "),
              "worker-src 'self' blob:",
              ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
