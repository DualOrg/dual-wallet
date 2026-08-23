"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field, SelectField } from "@/app/_components/design-system/field";
import { PageHeader } from "@/app/_components/design-system/page-header";
import { Truncated } from "@/app/_components/design-system/truncated";
import { shortId } from "@/app/_domain/inventory";
import {
  isViewerLanguage,
  type ViewerLanguage,
  type ViewerWallet,
  viewerLanguages,
} from "@/app/_domain/wallet";
import {
  useChangeWalletPassword,
  useDeleteWalletAccount,
  useUpdateWalletProfile,
} from "@/app/_hooks/use-wallet-mutations";
import { useErrorMessage } from "@/app/_hooks/use-error-message";
import { useSession } from "@/app/_providers/session-provider";

function SettingsContent({ wallet }: { wallet: ViewerWallet }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const auth = useTranslations("auth");
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const updateProfile = useUpdateWalletProfile();
  const changePassword = useChangeWalletPassword();
  const deleteAccount = useDeleteWalletAccount();
  const initialLanguage = isViewerLanguage(wallet.language)
    ? wallet.language
    : "en";
  const [nickname, setNickname] = useState(wallet.nickname || "");
  const [phoneNumber, setPhoneNumber] = useState(wallet.phoneNumber || "");
  const [language, setLanguage] = useState<ViewerLanguage>(initialLanguage);
  const [confirmation, setConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const confirmPasswordField = useRef<HTMLInputElement>(null);
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
    await updateProfile.mutateAsync({
      nickname: nickname.trim() || undefined,
      phoneNumber: phoneNumber.trim() || undefined,
      language,
    });
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const invalid = newPassword !== confirmPassword;
    setMismatch(invalid);
    if (invalid) {
      // Failed submission keeps the entered values and lands on the field.
      confirmPasswordField.current?.focus();
      return;
    }
    // A failure surfaces through changePassword.error above the form. On
    // success the session is gone, so there is nothing left to return to.
    const changed = await changePassword
      .mutateAsync({ currentPassword, password: newPassword })
      .then(
        () => true,
        () => false,
      );
    if (!changed) return;
    router.replace("/login");
    router.refresh();
  };

  const remove = async () => {
    if (confirmation !== t("deleteConfirmValue")) return;
    // A failure surfaces through deleteAccount.error above the form.
    const deleted = await deleteAccount.mutateAsync().then(
      () => true,
      () => false,
    );
    if (!deleted) return;
    router.replace("/login");
    router.refresh();
  };

  const error =
    updateProfile.error ?? changePassword.error ?? deleteAccount.error;

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      {error ? <Alert takeFocus>{errorMessage(error)}</Alert> : null}
      {updateProfile.isSuccess ? (
        <Alert tone="success">{t("updated")}</Alert>
      ) : null}
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
                autoComplete="nickname"
                label={t("nickname")}
                value={nickname}
                onChange={(event) => {
                  updateProfile.reset();
                  setNickname(event.target.value);
                }}
              />
              <Field
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                label={t("phone")}
                value={phoneNumber}
                onChange={(event) => {
                  updateProfile.reset();
                  setPhoneNumber(event.target.value);
                }}
                placeholder={t("phonePlaceholder")}
              />
              <SelectField
                name="language"
                label={t("language")}
                value={language}
                onChange={(event) => {
                  updateProfile.reset();
                  if (isViewerLanguage(event.target.value)) {
                    setLanguage(event.target.value);
                  }
                }}
              >
                {viewerLanguages.map((value) => (
                  <option key={value} value={value}>
                    {t(`languages.${value}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="form-actions">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? (
                  <LoaderCircle
                    size={17}
                    className="animate-spin"
                    aria-hidden
                  />
                ) : null}
                {common(updateProfile.isPending ? "saving" : "save")}
              </Button>
            </div>
          </form>
        </section>
        <section className="card settings-card">
          <header className="settings-card-header">
            <h2>{t("password")}</h2>
            <p>{t("passwordDescription")}</p>
          </header>
          <form onSubmit={savePassword}>
            <div className="form-grid">
              <Field
                type="password"
                name="current-password"
                label={t("currentPassword")}
                value={currentPassword}
                onChange={(event) => {
                  changePassword.reset();
                  setCurrentPassword(event.target.value);
                }}
                required
                autoComplete="current-password"
              />
              <Field
                type="password"
                name="new-password"
                label={t("newPassword")}
                value={newPassword}
                onChange={(event) => {
                  changePassword.reset();
                  setMismatch(false);
                  setNewPassword(event.target.value);
                }}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <Field
                ref={confirmPasswordField}
                type="password"
                name="confirm-password"
                label={t("confirmPassword")}
                value={confirmPassword}
                error={mismatch ? auth("passwordMismatch") : undefined}
                onChange={(event) => {
                  changePassword.reset();
                  setMismatch(false);
                  setConfirmPassword(event.target.value);
                }}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="form-actions">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? (
                  <LoaderCircle
                    size={17}
                    className="animate-spin"
                    aria-hidden
                  />
                ) : null}
                {t(
                  changePassword.isPending
                    ? "changingPassword"
                    : "changePassword",
                )}
              </Button>
            </div>
          </form>
        </section>
        <section className="card settings-card">
          <header className="settings-card-header">
            <h2>{t("security")}</h2>
            <p>{t("securityDescription")}</p>
          </header>
          <dl className="security-grid">
            <div className="security-item">
              <dt>{t("smartAccountAddress")}</dt>
              <dd>
                <Truncated
                  value={wallet.account.address}
                  short={shortId(wallet.account.address, 10)}
                />
              </dd>
            </div>
            <div className="security-item">
              <dt>{t("accountType")}</dt>
              <dd>{t("accountTypeSmartWallet")}</dd>
            </div>
            <div className="security-item">
              <dt>{t("controllerAddress")}</dt>
              <dd>
                <Truncated
                  value={wallet.controller.address}
                  short={shortId(wallet.controller.address, 10)}
                />
              </dd>
            </div>
            <div className="security-item">
              <dt>{t("controllerType")}</dt>
              <dd>{controllerType}</dd>
            </div>
            <div className="security-item">
              <dt>{t("controllerCustody")}</dt>
              <dd>{controllerCustody}</dd>
            </div>
            {wallet.controller.publicKey ? (
              <div className="security-item">
                <dt>{t("controllerPublicKey")}</dt>
                <dd>
                  <Truncated
                    value={wallet.controller.publicKey}
                    short={shortId(wallet.controller.publicKey, 10)}
                  />
                </dd>
              </div>
            ) : null}
            <div className="security-item">
              <dt>{t("kernelVersion")}</dt>
              <dd>{wallet.smartAccount.version}</dd>
            </div>
            <div className="security-item">
              <dt>{t("chainId")}</dt>
              <dd>{wallet.smartAccount.chainId}</dd>
            </div>
            <div className="security-item">
              <dt>{t("validatorType")}</dt>
              <dd>{validatorType}</dd>
            </div>
            <div className="security-item">
              <dt>{t("passkey")}</dt>
              <dd>{wallet.hasPasskey ? t("enabled") : t("notEnabled")}</dd>
            </div>
            <div className="security-item">
              <dt>{t("email")}</dt>
              <dd>{wallet.email || common("notAvailable")}</dd>
            </div>
            <div className="security-item">
              <dt>{t("status")}</dt>
              <dd>{wallet.activated ? t("verified") : t("unverified")}</dd>
            </div>
          </dl>
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
              onChange={(event) => {
                deleteAccount.reset();
                setConfirmation(event.target.value);
              }}
              autoComplete="off"
            />
          </div>
          <div className="form-actions">
            <Button
              type="button"
              variant="danger"
              disabled={
                confirmation !== t("deleteConfirmValue") ||
                deleteAccount.isPending
              }
              onClick={remove}
            >
              {deleteAccount.isPending ? (
                <LoaderCircle size={17} className="animate-spin" aria-hidden />
              ) : (
                <Trash2 size={17} aria-hidden />
              )}
              {t("deleteAction")}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

export function SettingsPageClient() {
  const { wallet } = useSession();
  if (!wallet) return <div className="card skeleton" aria-hidden />;
  return <SettingsContent wallet={wallet} />;
}
