"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Language } from "@/api/web-sdk/models/Language";
import { getWalletsApi, normalizeApiError } from "@/api/web-sdk-client";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field, SelectField } from "@/app/_components/design-system/field";
import { PageHeader } from "@/app/_components/design-system/page-header";
import { shortId } from "@/app/_domain/inventory";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { useSession } from "@/app/_providers/session-provider";

function SettingsContent({ wallet }: { wallet: ViewerWallet }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const { refresh, logout } = useSession();
  const router = useRouter();
  const initialLanguage = Object.values(Language).includes(
    wallet.language as Language,
  )
    ? (wallet.language as Language)
    : Language.En;
  const [nickname, setNickname] = useState(wallet.nickname || "");
  const [phoneNumber, setPhoneNumber] = useState(wallet.phoneNumber || "");
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const controllerType =
    wallet.controller.type === "WEBAUTHN"
      ? t("controllerTypeWebauthn")
      : t("controllerTypeSecp256k1");
  const controllerCustody =
    wallet.controller.custody === "custodial"
      ? t("custodyCustodial")
      : wallet.controller.custody === "mpc"
        ? t("custodyMpc")
        : t("custodySelfCustodial");
  const validatorType =
    wallet.smartAccount.validatorType === "WEBAUTHN"
      ? t("validatorTypeWebauthn")
      : t("validatorTypeEcdsa");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await getWalletsApi().updateWallet({
        walletUpdate: {
          nickname: nickname.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
          language,
        },
      });
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(
        (await normalizeApiError(caught, "Your profile could not be updated."))
          .message,
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (confirmation !== "DELETE") return;
    setDeleting(true);
    setError(null);
    try {
      await getWalletsApi().deleteWalletRaw();
      await logout();
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      setError(
        (await normalizeApiError(caught, "Your account could not be deleted."))
          .message,
      );
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      {error ? <Alert>{error}</Alert> : null}
      {saved ? <Alert tone="success">{t("updated")}</Alert> : null}
      <div className="settings-stack">
        <section className="card settings-card">
          <header className="settings-card-header">
            <h2>{t("profile")}</h2>
            <p>{t("profileDescription")}</p>
          </header>
          <form onSubmit={save}>
            <div className="form-grid">
              <Field
                name="nickname"
                label={t("nickname")}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
              <Field
                name="phone"
                type="tel"
                label={t("phone")}
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+41 79 000 00 00"
              />
              <SelectField
                name="language"
                label={t("language")}
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as Language)
                }
              >
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="it">Italiano</option>
                <option value="es">Español</option>
                <option value="pt">Português</option>
              </SelectField>
            </div>
            <div className="form-actions">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : null}
                {common(saving ? "saving" : "save")}
              </Button>
            </div>
          </form>
        </section>
        <section className="card settings-card">
          <header className="settings-card-header">
            <h2>{t("security")}</h2>
            <p>{t("securityDescription")}</p>
          </header>
          <div className="security-grid">
            <div className="security-item">
              <span>{t("smartAccountAddress")}</span>
              <strong title={wallet.account.address}>
                {shortId(wallet.account.address, 10)}
              </strong>
            </div>
            <div className="security-item">
              <span>{t("accountType")}</span>
              <strong>{t("accountTypeSmartWallet")}</strong>
            </div>
            <div className="security-item">
              <span>{t("controllerAddress")}</span>
              <strong title={wallet.controller.address}>
                {shortId(wallet.controller.address, 10)}
              </strong>
            </div>
            <div className="security-item">
              <span>{t("controllerType")}</span>
              <strong>{controllerType}</strong>
            </div>
            <div className="security-item">
              <span>{t("controllerCustody")}</span>
              <strong>{controllerCustody}</strong>
            </div>
            {wallet.controller.publicKey ? (
              <div className="security-item">
                <span>{t("controllerPublicKey")}</span>
                <strong title={wallet.controller.publicKey}>
                  {shortId(wallet.controller.publicKey, 10)}
                </strong>
              </div>
            ) : null}
            <div className="security-item">
              <span>{t("kernelVersion")}</span>
              <strong>{wallet.smartAccount.version}</strong>
            </div>
            <div className="security-item">
              <span>{t("chainId")}</span>
              <strong>{wallet.smartAccount.chainId}</strong>
            </div>
            <div className="security-item">
              <span>{t("validatorType")}</span>
              <strong>{validatorType}</strong>
            </div>
            <div className="security-item">
              <span>{t("passkey")}</span>
              <strong>
                {wallet.hasPasskey ? t("enabled") : t("notEnabled")}
              </strong>
            </div>
            <div className="security-item">
              <span>{t("email")}</span>
              <strong>{wallet.email || "—"}</strong>
            </div>
            <div className="security-item">
              <span>{t("status")}</span>
              <strong>
                {wallet.activated ? t("verified") : t("unverified")}
              </strong>
            </div>
          </div>
        </section>
        <section className="card settings-card danger-card">
          <header className="settings-card-header">
            <h2>{t("danger")}</h2>
            <p>{t("dangerDescription")}</p>
          </header>
          <div className="form-grid">
            <Field
              name="confirmation"
              label={t("deleteConfirm")}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-actions">
            <Button
              type="button"
              variant="danger"
              disabled={confirmation !== "DELETE" || deleting}
              onClick={remove}
            >
              {deleting ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <Trash2 size={17} />
              )}
              {t("deleteAction")}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

export default function SettingsPage() {
  const { wallet } = useSession();
  if (!wallet) return <div className="card skeleton" />;
  return <SettingsContent key={wallet.modifiedAt} wallet={wallet} />;
}
