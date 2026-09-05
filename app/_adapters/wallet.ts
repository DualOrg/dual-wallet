import type { Wallet } from "@/api/web-sdk/models/Wallet";
import type { ViewerWallet } from "@/app/_domain/wallet";

export function toViewerWallet(wallet: Wallet): ViewerWallet {
  return {
    id: wallet.id,
    nickname: wallet.nickname,
    email: wallet.email,
    phoneNumber: wallet.phoneNumber,
    language: wallet.language,
    fqdn: wallet.fqdn,
    activated: wallet.activated,
    emailVerified: wallet.emailVerified,
    disabled: wallet.disabled,
    account: {
      address: wallet.account.address,
      type: wallet.account.type,
    },
    controller: {
      address: wallet.account.controller.address,
      type: wallet.account.controller.type,
      custody: wallet.account.controller.custody,
      publicKey: wallet.account.controller.publicKey,
    },
    smartAccount: {
      chainId: wallet.account.smartAccount.chainId,
      factory: wallet.account.smartAccount.factory,
      implementation: wallet.account.smartAccount.implementation,
      index: wallet.account.smartAccount.index,
      validator: wallet.account.smartAccount.validator,
      validatorType: wallet.account.smartAccount.validatorType,
      version: wallet.account.smartAccount.version,
    },
    hasPasskey: Boolean(wallet.passkey),
    createdAt: wallet.whenCreated.toISOString(),
    modifiedAt: wallet.whenModified.toISOString(),
  };
}
