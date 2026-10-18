process.env.DEFAULT_ORGANIZATION_ID ??= "000000000000000000000001";
// An explicit, ephemeral session key for this test run (the wallet has no
// fallback key; see api/session-key.ts).
process.env.SESSION_SECRET ??= require("node:crypto")
  .randomBytes(32)
  .toString("base64");

import "@testing-library/jest-dom";
