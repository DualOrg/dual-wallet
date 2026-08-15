import { decodeP256Signature } from "@/app/_adapters/webauthn.client";

describe("decodeP256Signature", () => {
  it("decodes DER integers into fixed-width P-256 scalars", () => {
    const signature = Uint8Array.from([
      0x30, 0x08, 0x02, 0x02, 0x00, 0x80, 0x02, 0x02, 0x00, 0xff,
    ]).buffer;

    expect(decodeP256Signature(signature)).toEqual({
      signatureR: `0x${"0".repeat(62)}80`,
      signatureS: `0x${"0".repeat(62)}ff`,
    });
  });

  it("rejects non-DER passkey signatures", () => {
    expect(() =>
      decodeP256Signature(Uint8Array.from([0x01, 0x02]).buffer),
    ).toThrow("Invalid passkey signature.");
  });
});
