"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/app/_components/design-system/copy-button";
import { Truncated } from "@/app/_components/design-system/truncated";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { shortAccountAddress } from "@/app/_domain/wallet";

export function UserProfileMenu({ wallet }: { wallet: ViewerWallet }) {
  const t = useTranslations("profileMenu");
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const name = wallet.nickname || wallet.email || t("account");
  const initials = name.slice(0, 2).toUpperCase();
  const accountAddress = shortAccountAddress(wallet.account.address);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="account-profile-wrap" ref={container}>
      <button
        ref={trigger}
        className="account-chip"
        type="button"
        aria-label={t(open ? "close" : "open")}
        aria-expanded={open}
        aria-controls="user-profile-popover"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar">{initials}</span>
        <span className="account-copy">
          <strong>{name}</strong>
          <Truncated value={wallet.account.address} short={accountAddress} />
        </span>
      </button>

      {open ? (
        <section
          id="user-profile-popover"
          className="account-profile-popover"
          aria-label={t("title")}
        >
          <header className="account-profile-header">
            <span className="avatar account-profile-avatar">{initials}</span>
            <span>
              <strong>{name}</strong>
              <small>{wallet.email || t("noEmail")}</small>
            </span>
          </header>
          <dl className="account-profile-details">
            <div>
              <dt>{t("smartAccount")}</dt>
              <dd>
                <CopyButton value={wallet.account.address}>
                  <Truncated
                    value={wallet.account.address}
                    short={accountAddress}
                  />
                </CopyButton>
              </dd>
            </div>
            <div>
              <dt>{t("controller")}</dt>
              <dd>{wallet.controller.type}</dd>
            </div>
          </dl>
          <Link
            href="/settings"
            className="account-profile-link"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} aria-hidden />
            {t("manage")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
