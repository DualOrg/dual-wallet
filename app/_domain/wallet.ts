import type { Account } from "@/api/web-sdk/models/Account";
import type { AccountController } from "@/api/web-sdk/models/AccountController";
import type { SmartAccount } from "@/api/web-sdk/models/SmartAccount";
import type { Wallet } from "@/api/web-sdk/models/Wallet";

export interface ViewerExecutionAccount {
  address: Account["address"];
  type: Account["type"];
}

export interface ViewerAccountController {
  address: AccountController["address"];
  type: AccountController["type"];
  custody: AccountController["custody"];
  publicKey?: AccountController["publicKey"];
}

export interface ViewerSmartAccount {
  chainId: SmartAccount["chainId"];
  factory: SmartAccount["factory"];
  implementation: SmartAccount["implementation"];
  index: SmartAccount["index"];
  validator: SmartAccount["validator"];
  validatorType: SmartAccount["validatorType"];
  version: SmartAccount["version"];
}

export interface ViewerWallet {
  id: string;
  nickname?: string;
  email?: string;
  phoneNumber?: string;
  language: string;
  fqdn: string;
  activated: boolean;
  disabled: boolean;
  account: ViewerExecutionAccount;
  controller: ViewerAccountController;
  smartAccount: ViewerSmartAccount;
  hasPasskey: boolean;
  createdAt: string;
  modifiedAt: string;
}

export function shortAccountAddress(address: string) {
  if (address.length <= 11) return address;
  return `${address.slice(0, 4)}....${address.slice(-3)}`;
}

export function toViewerWallet(wallet: Wallet): ViewerWallet {
  return {
    id: wallet.id,
    nickname: wallet.nickname,
    email: wallet.email,
    phoneNumber: wallet.phoneNumber,
    language: wallet.language,
    fqdn: wallet.fqdn,
    activated: wallet.activated,
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
