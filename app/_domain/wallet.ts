import type { Wallet } from "@/api/web-sdk/models/Wallet";

export interface ViewerWallet {
  id: string;
  nickname?: string;
  email?: string;
  phoneNumber?: string;
  language: string;
  fqdn: string;
  activated: boolean;
  disabled: boolean;
  address: string;
  accountType: string;
  custody?: string;
  hasPasskey: boolean;
  createdAt: string;
  modifiedAt: string;
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
    address: wallet.account.address,
    accountType: wallet.account.type,
    custody: wallet.account.custody,
    hasPasskey: Boolean(wallet.passkey),
    createdAt: wallet.whenCreated.toISOString(),
    modifiedAt: wallet.whenModified.toISOString(),
  };
}
