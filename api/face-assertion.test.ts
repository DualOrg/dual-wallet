/**
 * @jest-environment node
 */
import { generateKeyPairSync, verify } from "node:crypto";
import { NextRequest } from "next/server";
import {
  ASSERTION_LIFETIME_SECONDS,
  mintFaceAssertion,
  walletIssuerOrigin,
} from "@/api/face-assertion";
import { parseProductFaceApplications } from "@/api/product-face-binding";
import {
  bindingInput,
  CHECKSUM_HOLDER,
  HOLDER,
} from "@/test/product-face-fixtures";

const [binding] = parseProductFaceApplications(
  JSON.stringify([bindingInput()]),
  { production: true },
);
const keys = generateKeyPairSync("ed25519");
const pem = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();

function decode(token: string) {
  const [header, claims, signature] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
    claims: JSON.parse(Buffer.from(claims, "base64url").toString("utf8")),
    signed: verify(
      null,
      Buffer.from(`${header}.${claims}`),
      keys.publicKey,
      Buffer.from(signature, "base64url"),
    ),
  };
}

const input = {
  issuer: "https://demo.wallet.dual.network",
  binding,
  walletId: "wallet-1",
  holder: HOLDER,
  operation: "registration.submit" as const,
  operationId: "register-op-0001",
  target: { object_id: "aaaaaaaaaaaaaaaaaaaaaaaa" },
  requestHash: `sha256:${"e".repeat(64)}`,
  sidHash: "sid-hash",
  now: Date.parse("2026-10-14T10:00:00Z"),
};

afterEach(() => {
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
  delete process.env.FACE_ASSERTION_KEY_ID;
});

describe("wallet face assertions", () => {
  it("names the holder as the canonical lowercase address, whatever case Dual returns", () => {
    process.env.FACE_ASSERTION_KEY_ID = "wallet-face-1";
    process.env.FACE_ASSERTION_SIGNING_KEY = pem;
    // Dual returns the account address in EIP-55 mixed case; the runtimes
    // accept and compare only the lowercase form (a mixed-case holder is
    // refused there as face_assertion_claims_invalid, 401).
    const minted = mintFaceAssertion({ ...input, holder: CHECKSUM_HOLDER })!;
    const { claims, signed } = decode(minted.assertion);
    expect(signed).toBe(true);
    expect(claims.holder).toBe(CHECKSUM_HOLDER.toLowerCase());
    expect(claims.holder).toMatch(/^0x[a-f0-9]{40}$/);
    expect(
      decode(mintFaceAssertion({ ...input, holder: HOLDER })!.assertion).claims
        .holder,
    ).toBe(HOLDER);
  });

  it("fails closed when the signing key is absent or invalid", () => {
    expect(mintFaceAssertion(input)).toBeUndefined();
    process.env.FACE_ASSERTION_KEY_ID = "wallet-face-1";
    process.env.FACE_ASSERTION_SIGNING_KEY = "not a key";
    expect(mintFaceAssertion(input)).toBeUndefined();
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 });
    process.env.FACE_ASSERTION_SIGNING_KEY = rsa.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    expect(mintFaceAssertion(input)).toBeUndefined();
    process.env.FACE_ASSERTION_SIGNING_KEY = pem;
    process.env.FACE_ASSERTION_KEY_ID = "bad key id!";
    expect(mintFaceAssertion(input)).toBeUndefined();
  });

  it("signs exactly the contract claims with EdDSA", () => {
    process.env.FACE_ASSERTION_KEY_ID = "wallet-face-1";
    process.env.FACE_ASSERTION_SIGNING_KEY =
      Buffer.from(pem).toString("base64");
    const minted = mintFaceAssertion(input)!;
    const { header, claims, signed } = decode(minted.assertion);
    expect(signed).toBe(true);
    expect(header).toEqual({
      alg: "EdDSA",
      typ: "dual-face-assertion+jwt",
      kid: "wallet-face-1",
    });
    expect(Object.keys(claims).sort()).toEqual(
      [
        "iss",
        "aud",
        "app_id",
        "app_version",
        "artifact",
        "publisher",
        "programme",
        "origin",
        "sub",
        "holder",
        "operation",
        "op_id",
        "target",
        "request_hash",
        "sid_hash",
        "iat",
        "exp",
        "jti",
      ].sort(),
    );
    expect(claims).toMatchObject({
      iss: "https://demo.wallet.dual.network",
      aud: "tig.passport.morrow-home@https://faces.example",
      app_id: "tig.passport.morrow-home",
      app_version: "1.0.0",
      artifact: binding.artifactHash,
      publisher: "morrow-home",
      programme: "morrow-home-arc",
      origin: "https://faces.example",
      sub: "wallet-1",
      holder: HOLDER,
      operation: "registration.submit",
      op_id: "register-op-0001",
      target: { object_id: "aaaaaaaaaaaaaaaaaaaaaaaa" },
      sid_hash: "sid-hash",
      request_hash: `sha256:${"e".repeat(64)}`,
    });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(
      ASSERTION_LIFETIME_SECONDS,
    );
    expect(claims.exp - claims.iat).toBe(60);
    expect(minted.assertion).not.toContain(pem);
  });

  it("issues a fresh jti every time", () => {
    process.env.FACE_ASSERTION_KEY_ID = "wallet-face-1";
    process.env.FACE_ASSERTION_SIGNING_KEY = pem;
    const first = decode(mintFaceAssertion(input)!.assertion).claims.jti;
    const second = decode(mintFaceAssertion(input)!.assertion).claims.jti;
    expect(first).not.toBe(second);
  });

  it("derives the issuer from the exact tenant origin", () => {
    const request = (headers: Record<string, string>) =>
      new NextRequest("http://demo.localhost:3000/api/faces/x/assertions", {
        method: "POST",
        headers,
      });
    expect(walletIssuerOrigin(request({ host: "demo.localhost:3000" }))).toBe(
      "http://demo.localhost:3000",
    );
    expect(
      walletIssuerOrigin(
        request({
          host: "demo.localhost:3000",
          origin: "http://evil.localhost:3000",
        }),
      ),
    ).toBeUndefined();
  });
});
