// LOCAL INTEGRATION CHECK against the real Studio product-face harness
// (scripts/product-face-harness.mjs in the Studio repository). It drives the
// wallet BFF exactly as the browser host does for one G6 holder settle of the
// harness's pre-set Transfer pending unit: sign in, verify the pinned artifact
// (context), select, read the proposal server to server, journal, execute the
// exact proposal through the allow-listed backend proxy as the holder, mint
// the registration.settle.verify assertion, call the real runtime, and read
// the wallet's own canonical status. Local fakes only; nothing live.
//
//   node e2e/product-face-integrated-check.mjs
//
// Expects the wallet on 127.0.0.1:3000 (tenant host demo.localhost:3000),
// the fake api-v3 with MOCK_PROGRAMME_DUAL_URL, and the harness on 4180/4011.
import { createHash } from "node:crypto";
import http from "node:http";

const SLUG = process.env.CHECK_SLUG || "morrow-home";
const APPLICATION = process.env.CHECK_APPLICATION || "studio.morrow-home";
const OBJECT = process.env.CHECK_OBJECT || "6ab000000000000000000003";
const REGISTRATION = process.env.CHECK_OPERATION || "reg-harness-morr-0001";
const SETTLE = `settle-check-${Date.now().toString(36)}`;
const RUNTIME = process.env.CHECK_RUNTIME || "http://localhost:4180";
const TENANT = "demo.localhost:3000";
// One face launch (frame): the BFF keeps this launch's own journal.
const LAUNCH = createHash("sha256")
  .update(`launch-${Date.now()}`)
  .digest("base64url")
  .slice(0, 32);

const jar = new Map();
const cookie = () =>
  [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

// node:http so the Host header names the tenant; fetch forbids setting it.
function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const request = http.request(
      {
        host: "127.0.0.1",
        port: 3000,
        method,
        path,
        headers: {
          host: TENANT,
          origin: `http://${TENANT}`,
          "x-dual-face-launch": LAUNCH,
          "content-type": "application/json",
          cookie: cookie(),
          ...(data ? { "content-length": Buffer.byteLength(data) } : {}),
        },
      },
      (response) => {
        for (const line of response.headers["set-cookie"] ?? []) {
          const [pair] = line.split(";");
          const [key, value] = pair.split("=");
          if (value) jar.set(key, value);
          else jar.delete(key);
        }
        let raw = "";
        response.on("data", (chunk) => (raw += chunk));
        response.on("end", () => {
          let parsed = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            // Non-JSON body: reported as an empty object.
          }
          resolve({ status: response.statusCode, body: parsed });
        });
      },
    );
    request.on("error", reject);
    if (data) request.write(data);
    request.end();
  });
}

const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .filter((key) => value[key] !== undefined)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
const sha256 = (text) =>
  `sha256:${createHash("sha256").update(text).digest("hex")}`;

function step(name, result, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${result}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const faces = `/api/faces/${SLUG}`;
const login = await call("POST", "/api/session/login", {
  email: "face-e2e@example.com",
  password: "correct horse battery staple",
});
step("sign in", login.status, login.status === 200);
const context = await call("GET", `${faces}/context`);
step("artifact verified (context)", context.status, context.status === 200);
const selection = await call("POST", `${faces}/selection`, {
  object_id: OBJECT,
});
const contextId = selection.body.context_id;
step("select pending unit", selection.status, Boolean(contextId));
const proposal = await call("POST", `${faces}/settle-proposal`, {
  context_id: contextId,
  operation_id: REGISTRATION,
  object_id: OBJECT,
});
const p = proposal.body.proposal;
step(
  "trusted proposal read + template check",
  `${proposal.status} ${proposal.body.code ?? p?.proposal_id}`,
  proposal.status === 200,
);
if (!p) process.exit(1);
let reservation = null;
for (const transition of ["begin", "confirm", "submit"]) {
  const result = await call(
    "POST",
    `${faces}/operations`,
    transition === "begin"
      ? {
          transition,
          kind: "settle",
          operation: "update",
          operation_id: SETTLE,
          object_id: OBJECT,
          context_id: contextId,
          proposal_id: p.proposal_id,
        }
      : { transition, operation_id: SETTLE, context_id: contextId },
  );
  step(
    `journal ${transition}`,
    `${result.body.operation?.phase ?? result.body.code}`,
    result.status === 200,
  );
  if (transition === "submit") reservation = result.body.reservation ?? null;
}
// contract r8/r11: the holder executes ONLY on a reserve answer that the BFF
// itself received with dispatch:"won".
if (
  !step(
    "runtime settle reservation won",
    String(reservation),
    reservation === "won",
  )
) {
  process.exit(1);
}
// The existing executor's email path, through the allow-listed proxy.
const executed = await call("POST", "/api/backend/ebus/execute", {
  action: { update: { id: OBJECT, data: { custom: p.input.data.custom } } },
  nonce: 0,
});
step(
  "holder executes the exact proposal",
  executed.body.action_id,
  executed.status === 200,
);
await call("POST", `${faces}/operations`, {
  transition: "record_action",
  operation_id: SETTLE,
  action_id: executed.body.action_id,
});
const verifyRequest = {
  operation: "registration.settle.verify",
  operationId: REGISTRATION,
  target: { object_id: OBJECT },
  input: { action_id: executed.body.action_id, settle_operation_id: SETTLE },
};
const minted = await call("POST", `${faces}/assertions`, {
  operation: verifyRequest.operation,
  operation_id: REGISTRATION,
  target: verifyRequest.target,
  request_hash: sha256(canonical(verifyRequest)),
  context_id: contextId,
});
step("mint settle.verify assertion", minted.status, minted.status === 200);
const verified = await fetch(`${RUNTIME}/api/product-face/v1/operations`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-tig-product-face-application": APPLICATION,
  },
  body: JSON.stringify({ ...verifyRequest, assertion: minted.body.assertion }),
});
const runtime = await verified.json();
step(
  "runtime settle.verify",
  `${verified.status} ${runtime.status}`,
  runtime.status === "registered",
);
const status = await call("GET", `${faces}/operations/${SETTLE}`);
step(
  "wallet canonical status",
  `${status.body.status} ${JSON.stringify(status.body.readback)}`,
  status.body.status === "registered",
);
