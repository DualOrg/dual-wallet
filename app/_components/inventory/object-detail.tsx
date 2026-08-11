import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ObjectVisual } from "@/app/_components/inventory/object-visual";
import type { ObjectDetail as ObjectDetailModel } from "@/app/_domain/inventory";
import { shortId } from "@/app/_domain/inventory";

export function ObjectDetail({
  item,
  action,
}: {
  item: ObjectDetailModel;
  action?: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("object");
  const common = useTranslations("common");
  const date = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  const facts = [
    [t("category"), item.category || common("notAvailable")],
    [t("edition"), item.edition ? `#${item.edition}` : common("notAvailable")],
    [t("owner"), shortId(item.owner)],
    [t("version"), String(item.version)],
    [t("created"), date(item.createdAt)],
    [t("modified"), date(item.modifiedAt)],
    [t("stateHash"), shortId(item.stateHash)],
    [t("contentHash"), shortId(item.contentHash)],
    [t("templateId"), shortId(item.templateId)],
  ];

  return (
    <>
      <section className="detail-hero">
        <div className="card detail-media">
          <ObjectVisual url={item.imageUrl} name={item.name} eager />
        </div>
        <div className="detail-copy">
          <div className="detail-heading-row">
            <p className="page-eyebrow">{t("details")}</p>
            {action}
          </div>
          <h1>{item.name}</h1>
          <p className="detail-description">
            {item.description || t("description")}
          </p>
          <dl className="detail-grid">
            {facts.map(([label, value]) => (
              <div className="detail-fact" key={label}>
                <dt>{label}</dt>
                <dd title={value}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      {item.custom || item.system ? (
        <section className="card json-card">
          <h2>{t("metadata")}</h2>
          <pre className="json-view">
            {JSON.stringify(
              { custom: item.custom, system: item.system },
              null,
              2,
            )}
          </pre>
        </section>
      ) : null}
    </>
  );
}
