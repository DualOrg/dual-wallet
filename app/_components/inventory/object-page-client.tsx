"use client";

import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import {
  ObjectDetail,
  useObjectActionSlot,
} from "@/app/_components/inventory/object-detail";
import { ObjectActions } from "@/app/_components/inventory/object-actions";
import { ShareObjectButton } from "@/app/_components/inventory/share-object-button";
import type { InventoryObject } from "@/app/_domain/inventory";
import { useInventoryObject } from "@/app/_hooks/data";
import { useErrorMessage } from "@/app/_hooks/use-error-message";
import { useSession } from "@/app/_providers/session-provider";

function ObjectActionsSlot({ item }: { item: InventoryObject }) {
  return <ObjectActions item={item} {...useObjectActionSlot()} />;
}

export function ObjectPageClient({ objectId }: { objectId: string }) {
  const t = useTranslations("object");
  const errorMessage = useErrorMessage();
  const session = useSession();
  const query = useInventoryObject(objectId);
  const item = query.data;

  return (
    <>
      <Link href="/inventory" className="detail-back">
        <ArrowLeft size={17} aria-hidden />
        {t("back")}
      </Link>
      <p className="sr-only" role="status">
        {query.isPending
          ? t("loadingObject")
          : query.isError
            ? t("notFound")
            : (item?.name ?? "")}
      </p>
      {query.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("notFound")}
          description={errorMessage(query.error)}
        />
      ) : !item ? (
        <div
          className="card skeleton wallet-object-loading"
          aria-busy
          aria-hidden
        />
      ) : (
        <ObjectDetail
          item={item}
          action={<ShareObjectButton objectId={item.id} />}
          actions={
            item.actions.length ? <ObjectActionsSlot item={item} /> : undefined
          }
          bridgeEnabled={session.isAuthenticated}
          bridgeActions={item.actions}
        />
      )}
    </>
  );
}
