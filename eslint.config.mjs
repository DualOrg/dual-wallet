import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import queryPlugin from "@tanstack/eslint-plugin-query";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  ...queryPlugin.configs["flat/recommended-strict"],
  {
    files: ["app/_domain/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/api/**", "react", "react/*", "next", "next/*"],
              message:
                "Domain modules are framework-independent and cannot import transport, React, or Next.js modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "app/(authorized)/**/*.{ts,tsx}",
      "app/(unauthorized)/**/*.{ts,tsx}",
      "app/_components/**/*.{ts,tsx}",
      "app/_hooks/**/*.{ts,tsx}",
      "app/_providers/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/api/web-sdk", "@/api/web-sdk/**", "@/api/web-sdk-client"],
              message:
                "Generated transport types and clients belong in adapters or services, not UI, hooks, providers, or pages.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "api/web-sdk/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
