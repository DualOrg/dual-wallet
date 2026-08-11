"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Boxes,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Brand } from "@/app/_components/design-system/brand";
import { useSession } from "@/app/_providers/session-provider";
import { useTheme } from "@/app/_providers/theme-provider";
import { cn } from "@/app/_utils/cn";

const links = [
  { href: "/inventory", key: "inventory", icon: Boxes },
  { href: "/activity", key: "activity", icon: Activity },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

function Nav({ close }: { close?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <>
      {links.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={close}
            className={cn("nav-link", active && "nav-link-active")}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} aria-hidden />
            {t(key)}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { wallet, isLoading, isAuthenticated, logout } = useSession();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const t = useTranslations("nav");
  const common = useTranslations("common");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  const signOut = async () => {
    await logout();
    router.replace("/login");
    router.refresh();
  };

  const name = wallet?.nickname || wallet?.email || t("account");
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar-nav" aria-label="Main navigation">
          <Nav />
        </nav>
        <div className="sidebar-footer">
          <button className="nav-link" type="button" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            {common("theme")}
          </button>
          <button className="nav-link" type="button" onClick={signOut}>
            <LogOut size={19} />
            {t("logout")}
          </button>
          <div className="account-chip">
            <span className="avatar">{initials}</span>
            <span className="account-copy">
              <strong>{name}</strong>
              <span>{wallet?.address}</span>
            </span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="mobile-topbar">
          <Brand />
          <button
            className="icon-button"
            type="button"
            aria-label={common("menu")}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
        {mobileOpen ? (
          <nav className="mobile-nav" aria-label="Main navigation">
            <Nav close={() => setMobileOpen(false)} />
            <button className="nav-link" type="button" onClick={toggleTheme}>
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
              {common("theme")}
            </button>
            <button className="nav-link" type="button" onClick={signOut}>
              <LogOut size={19} />
              {t("logout")}
            </button>
          </nav>
        ) : null}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
