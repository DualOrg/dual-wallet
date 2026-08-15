export const viewerLanguages = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
] as const;
export type ViewerLanguage = (typeof viewerLanguages)[number];

export interface ViewerExecutionAccount {
  address: string;
  type: "SMART_WALLET";
}

export interface ViewerAccountController {
  address: string;
  type: "SECP256K1" | "WEBAUTHN";
  custody: "custodial" | "self-custodial" | "mpc";
  publicKey?: string;
}

export interface ViewerSmartAccount {
  chainId: number;
  factory: string;
  implementation: string;
  index: number;
  validator: string;
  validatorType: "ECDSA" | "WEBAUTHN";
  version: string;
}

export interface ViewerWallet {
  id: string;
  nickname?: string;
  email?: string;
  phoneNumber?: string;
  language: ViewerLanguage;
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

export function isViewerLanguage(value: string): value is ViewerLanguage {
  return viewerLanguages.some((language) => language === value);
}

export function shortAccountAddress(address: string) {
  if (address.length <= 11) return address;
  return `${address.slice(0, 4)}....${address.slice(-3)}`;
}
