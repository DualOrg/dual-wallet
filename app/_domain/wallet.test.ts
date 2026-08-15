import type { Wallet } from "@/api/web-sdk/models/Wallet";
import { toViewerWallet } from "@/app/_adapters/wallet";
import { shortAccountAddress } from "@/app/_domain/wallet";

describe("wallet adapter", () => {
  it("shortens account addresses for compact profile displays", () => {
    expect(
      shortAccountAddress("0x1234567890abcdef1234567890abcdef12345f45"),
    ).toBe("0x12....f45");
    expect(shortAccountAddress("0x1234")).toBe("0x1234");
  });

  it("keeps the Kernel execution account separate from its controller", () => {
    const wallet = {
      id: "wallet-1",
      language: "en",
      fqdn: "demo.localhost",
      activated: true,
      disabled: false,
      account: {
        address: "0xkernel",
        type: "SMART_WALLET",
        controller: {
          address: "0xcontroller",
          type: "SECP256K1",
          custody: "self-custodial",
          publicKey: "controller-public-key",
        },
        smartAccount: {
          chainId: 1,
          factory: "0xfactory",
          implementation: "0ximplementation",
          index: 7,
          validator: "0xvalidator",
          validatorType: "ECDSA",
          version: "0.3.1",
        },
      },
      whenCreated: new Date("2026-01-01T00:00:00Z"),
      whenModified: new Date("2026-02-01T00:00:00Z"),
    } satisfies Wallet;

    expect(toViewerWallet(wallet)).toMatchObject({
      account: { address: "0xkernel", type: "SMART_WALLET" },
      controller: {
        address: "0xcontroller",
        type: "SECP256K1",
        custody: "self-custodial",
        publicKey: "controller-public-key",
      },
      smartAccount: {
        chainId: 1,
        factory: "0xfactory",
        implementation: "0ximplementation",
        index: 7,
        validator: "0xvalidator",
        validatorType: "ECDSA",
        version: "0.3.1",
      },
    });
    expect(toViewerWallet(wallet)).not.toHaveProperty("address");
    expect(toViewerWallet(wallet)).not.toHaveProperty("custody");
  });
});
