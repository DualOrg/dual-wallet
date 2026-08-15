"use client";

import { useState } from "react";
import { Fingerprint, LoaderCircle, WalletCards } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Tabs } from "@/app/_components/design-system/tabs";
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
      <Tabs
        label={t("methodLabel")}
        options={methods}
        value={method}
        onChange={(value) => {
          setMethod(value);
          auth.clearError();
        }}
      >
        {auth.error ? <Alert>{auth.error}</Alert> : null}
        {method === "email" ? emailPanel(auth) : null}
        {method === "wallet" ? (
          <div className="method-panel">
            <span className="method-icon">
              <WalletCards size={27} aria-hidden />
            </span>
            <h2>{t("walletMethod")}</h2>
            <p>{t("connectWalletDescription")}</p>
            <Button block disabled={Boolean(auth.pending)} onClick={auth.eoa}>
              {auth.pending === "wallet" ? (
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
              ) : (
                <WalletCards size={18} aria-hidden />
              )}
              {t("connectWallet")}
            </Button>
          </div>
        ) : null}
        {method === "passkey" ? (
          <div className="method-panel">
            <span className="method-icon">
              <Fingerprint size={29} aria-hidden />
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
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
              ) : (
                <Fingerprint size={18} aria-hidden />
              )}
              {t(mode === "login" ? "usePasskey" : "createPasskey")}
            </Button>
          </div>
        ) : null}
      </Tabs>
    </>
  );
}
