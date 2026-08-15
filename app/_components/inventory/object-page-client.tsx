"use client";

import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { ObjectDetail } from "@/app/_components/inventory/object-detail";
import { ObjectActions } from "@/app/_components/inventory/object-actions";
import { ShareObjectButton } from "@/app/_components/inventory/share-object-button";
import { useInventoryObject } from "@/app/_hooks/data";
import { useSession } from "@/app/_providers/session-provider";

export function ObjectPageClient({ objectId }: { objectId: string }) {
  const t = useTranslations("object");
  const session = useSession();
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
        action={<ShareObjectButton objectId={item.id} />}
        actions={
          item.actions.length ? <ObjectActions item={item} /> : undefined
        }
        bridgeEnabled={session.isAuthenticated}
        bridgeActions={item.actions}
      />
    </>
  );
}
