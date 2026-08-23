import "client-only";

import { getWalletsApi } from "@/api/web-sdk-client";
import type { ViewerLanguage } from "@/app/_domain/wallet";
import { toViewerError } from "@/app/_services/errors.client";

export interface WalletProfileUpdate {
  nickname?: string;
  phoneNumber?: string;
  language: ViewerLanguage;
}

export async function updateWalletProfile(input: WalletProfileUpdate) {
  try {
    await getWalletsApi().updateWallet({ walletUpdate: input });
  } catch (error) {
    throw await toViewerError(error, "Your profile could not be updated.");
  }
}

export interface WalletPasswordChange {
  currentPassword: string;
  password: string;
}

// changeWalletPassword goes through the same patch as the profile. The API
// requires the password in force now — an access token alone is not proof of
// ownership — and revokes every session on the wallet once the new one is
// stored, this one included.
export async function changeWalletPassword(input: WalletPasswordChange) {
  try {
    await getWalletsApi().updateWallet({ walletUpdate: input });
  } catch (error) {
    throw await toViewerError(error, "Your password could not be changed.");
  }
}

export async function deleteWalletAccount() {
  try {
    await getWalletsApi().deleteWalletRaw();
  } catch (error) {
    throw await toViewerError(error, "Your account could not be deleted.");
  }
}
