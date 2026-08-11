const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

module.exports = createJestConfig({
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testPathIgnorePatterns: ["<rootDir>/e2e/", "<rootDir>/api/web-sdk/"],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "api/**/*.ts",
    "!api/web-sdk/**",
    "!app/**/page.tsx",
    "!app/**/layout.tsx"
  ],
});
