import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Brand } from "@/app/_components/design-system/brand";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("auth");
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand inverse />
        <div className="auth-copy">
          <p className="auth-kicker">{t("eyebrow")}</p>
          <p className="auth-headline">{t("headline")}</p>
          <p className="auth-supporting">{t("supporting")}</p>
          <div className="auth-points">
            <span className="auth-point">{t("secure")}</span>
            <span className="auth-point">{t("verified")}</span>
            <span className="auth-point">{t("portable")}</span>
          </div>
        </div>
        <ShieldCheck size={30} className="auth-shield" aria-hidden />
      </section>
      <section className="auth-panel">
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}
