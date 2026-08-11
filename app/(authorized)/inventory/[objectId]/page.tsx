"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { ObjectDetail } from "@/app/_components/inventory/object-detail";
import { ObjectActions } from "@/app/_components/inventory/object-actions";
import { ShareObjectButton } from "@/app/_components/inventory/share-object-button";
import { useInventoryObject } from "@/app/_hooks/data";

export default function ObjectPage() {
  const t = useTranslations("object");
  const params = useParams<{ objectId: string }>();
  const objectId = decodeURIComponent(params.objectId);
  const query = useInventoryObject(objectId);
  if (query.isPending)
    return (
      <>
        <Link href="/inventory" className="detail-back">
          <ArrowLeft size={17} />
          {t("back")}
        </Link>
        <div className="card skeleton wallet-object-loading" />
      </>
    );
  if (query.isError)
    return (
      <>
        <Link href="/inventory" className="detail-back">
          <ArrowLeft size={17} />
          {t("back")}
        </Link>
        <EmptyState
          icon={AlertTriangle}
          title={t("notFound")}
          description={query.error.message}
        />
      </>
    );
  const item = query.data;
  return (
    <>
      <Link href="/inventory" className="detail-back">
        <ArrowLeft size={17} />
        {t("back")}
      </Link>
      <ObjectDetail
        item={item}
        action={<ShareObjectButton objectId={item.id} menuItem />}
        actions={
          item.actions.length ? <ObjectActions item={item} /> : undefined
        }
      />
    </>
  );
}
