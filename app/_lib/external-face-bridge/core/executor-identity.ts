import type { AuthenticationMethod } from "@/app/_domain/session";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { ProductFaceError } from "@/app/_domain/product-face";

/**
 * Who may sign a holder action for a face operation: the wallet session as it
 * was when the operation began. A holder-signed step (settle, transfer) is
 * executed only by exactly this identity; an account change, logout or expiry
 * in between makes it refuse before anything is signed.
 */
export interface ExecutorIdentity {
  walletId: string;
  /** The holder's account address, lowercase. */
  holder: string;
  authenticationMethod: AuthenticationMethod;
  /** The controller that signs for an EOA session (lowercase), if any. */
  controller: string | null;
}

export function executorIdentityOf(session: {
  wallet: ViewerWallet | null;
  authenticationMethod: AuthenticationMethod | null;
}): ExecutorIdentity | null {
  const { wallet, authenticationMethod } = session;
  if (!wallet?.id || !wallet.account?.address || !authenticationMethod) {
    return null;
  }
  return {
    walletId: wallet.id,
    holder: wallet.account.address.toLowerCase(),
    authenticationMethod,
    controller: wallet.controller?.address
      ? wallet.controller.address.toLowerCase()
      : null,
  };
}

export function sameExecutor(
  left: ExecutorIdentity | null,
  right: ExecutorIdentity | null,
) {
  return Boolean(
    left &&
    right &&
    left.walletId === right.walletId &&
    left.holder === right.holder &&
    left.authenticationMethod === right.authenticationMethod &&
    left.controller === right.controller,
  );
}

/**
 * The executor's own guard (defence in depth): it runs only while the host is
 * live and the CURRENT wallet session is exactly the identity the operation
 * began with. Otherwise it refuses before any preparation or signature.
 */
export async function executeAs<T>(
  expected: ExecutorIdentity,
  current: ExecutorIdentity | null,
  live: boolean,
  run: (identity: ExecutorIdentity) => Promise<T>,
): Promise<T> {
  if (!live || !current || !sameExecutor(expected, current)) {
    throw new ProductFaceError("session_ended");
  }
  return run(current);
}
