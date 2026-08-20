"use client";

import { useEffect, useRef, useState } from "react";
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
import { UserProfileMenu } from "@/app/_components/user-profile-menu";
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
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const t = useTranslations("nav");
  const common = useTranslations("common");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      menuTrigger.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const signOut = async () => {
    await logout();
    router.replace("/login");
    router.refresh();
  };

  const themeButton = (
    <button className="nav-link" type="button" onClick={toggleTheme}>
      {theme === "dark" ? (
        <Sun size={19} aria-hidden />
      ) : (
        <Moon size={19} aria-hidden />
      )}
      {common("theme")}
    </button>
  );
  const signOutButton = (
    <button className="nav-link" type="button" onClick={signOut}>
      <LogOut size={19} aria-hidden />
      {t("logout")}
    </button>
  );

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        {common("skipToContent")}
      </a>
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar-nav" aria-label={t("mainNavigation")}>
          <Nav />
        </nav>
        <div className="sidebar-footer">
          {themeButton}
          {signOutButton}
          {wallet ? <UserProfileMenu wallet={wallet} /> : null}
        </div>
      </aside>
      <div className="main">
        <header className="mobile-topbar">
          <Brand />
          <button
            ref={menuTrigger}
            className="icon-button"
            type="button"
            aria-label={common(mobileOpen ? "closeMenu" : "openMenu")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? (
              <X size={20} aria-hidden />
            ) : (
              <Menu size={20} aria-hidden />
            )}
          </button>
        </header>
        {mobileOpen ? (
          <nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label={t("mainNavigation")}
          >
            <Nav close={() => setMobileOpen(false)} />
            {themeButton}
            {signOutButton}
          </nav>
        ) : null}
        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
