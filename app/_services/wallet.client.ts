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

export async function deleteWalletAccount() {
  try {
    await getWalletsApi().deleteWalletRaw();
  } catch (error) {
    throw await toViewerError(error, "Your account could not be deleted.");
  }
}
