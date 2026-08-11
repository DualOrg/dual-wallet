"use client";

import { useState } from "react";
import { Fingerprint, LoaderCircle, WalletCards } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { useAuthActions } from "@/app/_hooks/use-auth-actions";

type Method = "email" | "wallet" | "passkey";

export function AuthMethods({
  mode,
  emailPanel,
}: {
  mode: "login" | "register";
  emailPanel: (auth: ReturnType<typeof useAuthActions>) => React.ReactNode;
}) {
  const [method, setMethod] = useState<Method>("email");
  const t = useTranslations("auth");
  const auth = useAuthActions();
  const methods: { id: Method; label: string }[] = [
    { id: "email", label: t("emailMethod") },
    { id: "wallet", label: t("walletMethod") },
    { id: "passkey", label: t("passkeyMethod") },
  ];

  return (
    <>
      <div
        className="auth-methods"
        role="tablist"
        aria-label="Authentication method"
      >
        {methods.map((item) => (
          <button
            key={item.id}
            className="auth-method"
            type="button"
            role="tab"
            aria-selected={method === item.id}
            onClick={() => {
              setMethod(item.id);
              auth.clearError();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {auth.error ? <Alert>{auth.error}</Alert> : null}
      {method === "email" ? emailPanel(auth) : null}
      {method === "wallet" ? (
        <div className="method-panel">
          <span className="method-icon">
            <WalletCards size={27} />
          </span>
          <h2>{t("walletMethod")}</h2>
          <p>{t("connectWalletDescription")}</p>
          <Button block disabled={Boolean(auth.pending)} onClick={auth.eoa}>
            {auth.pending === "wallet" ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <WalletCards size={18} />
            )}
            {t("connectWallet")}
          </Button>
        </div>
      ) : null}
      {method === "passkey" ? (
        <div className="method-panel">
          <span className="method-icon">
            <Fingerprint size={29} />
          </span>
          <h2>{t("passkeyMethod")}</h2>
          <p>{t("passkeyDescription")}</p>
          <Button
            block
            disabled={Boolean(auth.pending)}
            onClick={
              mode === "login" ? auth.passkeyLogin : auth.passkeyRegister
            }
          >
            {auth.pending === "passkey" ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <Fingerprint size={18} />
            )}
            {t(mode === "login" ? "usePasskey" : "createPasskey")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
