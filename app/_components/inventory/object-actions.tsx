"use client";

import { useMemo, useState } from "react";
import { Play, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field, TextareaField } from "@/app/_components/design-system/field";
import type { InventoryObject } from "@/app/_domain/inventory";
import { shortId } from "@/app/_domain/inventory";
import { ViewerError } from "@/app/_domain/errors";
import { useExecuteInventoryAction } from "@/app/_hooks/use-inventory-action";
import type { ExternalFaceActionRequest } from "@/app/_lib/external-face-bridge";
import {
  ActionInputError,
  actionFields,
  isInventoryActionName,
  type ActionInput,
  type InventoryActionName,
} from "@/app/_services/inventory-actions";

export function ObjectActions({
  item,
  requestedAction,
  onRequestedActionCompleted,
}: {
  item: InventoryObject;
  requestedAction?: ExternalFaceActionRequest;
  onRequestedActionCompleted?: (actionId: string) => void;
}) {
  const t = useTranslations("actions");
  const execution = useExecuteInventoryAction();
  const actions = useMemo(
    () => Array.from(new Set(item.actions)).filter(isInventoryActionName),
    [item.actions],
  );
  const initialRequest =
    requestedAction && actions.includes(requestedAction.name)
      ? requestedAction
      : undefined;
  const [selected, setSelected] = useState<InventoryActionName | null>(
    initialRequest?.name ?? actions[0] ?? null,
  );
  const [input, setInput] = useState<ActionInput>(initialRequest?.input ?? {});
  const [error, setError] = useState<string | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);

  if (!actions.length || !selected) return null;
  const fields = actionFields(selected);
  const fieldLabel = (name: string) => t(`fields.${name}`);

  const choose = (name: InventoryActionName) => {
    setSelected(name);
    setInput({});
    setError(null);
    setCompletedId(null);
  };

  const execute = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCompletedId(null);
    try {
      const result = await execution.mutateAsync({
        name: selected,
        objectId: item.id,
        input,
      });
      setCompletedId(result.actionId);
      onRequestedActionCompleted?.(result.actionId);
    } catch (caught) {
      if (caught instanceof ActionInputError) {
        setError(
          t(`validation.${caught.code}`, {
            field: fieldLabel(caught.field),
          }),
        );
      } else {
        setError(
          caught instanceof ViewerError && caught.category === "authentication"
            ? t("sessionExpired")
            : caught instanceof Error
              ? caught.message
              : t("executionFailed"),
        );
      }
    }
  };

  return (
    <section className="card object-actions-card">
      <div className="object-actions-heading">
        <div>
          <p className="page-eyebrow">{t("eyebrow")}</p>
          <h2>{t("title")}</h2>
          <p>{t("description")}</p>
        </div>
        <ShieldCheck size={24} aria-hidden />
      </div>
      <div className="object-action-tabs" aria-label={t("title")}>
        {actions.map((name) => (
          <Button
            key={name}
            type="button"
            variant={selected === name ? "primary" : "secondary"}
            aria-pressed={selected === name}
            disabled={
              execution.isPending ||
              Boolean(requestedAction && requestedAction.name !== name)
            }
            onClick={() => choose(name)}
          >
            {t(`names.${name}`)}
          </Button>
        ))}
      </div>
      <form className="object-action-form" onSubmit={execute}>
        {requestedAction ? <Alert>{t("externalRequest")}</Alert> : null}
        {fields.length ? (
          <div className="form-grid">
            {fields.map((field) =>
              field.kind === "json" ? (
                <TextareaField
                  key={field.name}
                  name={field.name}
                  label={fieldLabel(field.name)}
                  required={field.required}
                  rows={5}
                  value={input[field.name] ?? ""}
                  placeholder={String(t.raw(`placeholders.${field.name}`))}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              ) : (
                <Field
                  key={field.name}
                  name={field.name}
                  type={
                    field.kind === "datetime" ? "datetime-local" : field.kind
                  }
                  step={field.kind === "number" ? "any" : undefined}
                  label={fieldLabel(field.name)}
                  required={field.required}
                  value={input[field.name] ?? ""}
                  placeholder={String(t.raw(`placeholders.${field.name}`))}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              ),
            )}
          </div>
        ) : (
          <p className="object-action-confirmation">
            {t("confirmation", { action: t(`names.${selected}`) })}
          </p>
        )}
        {error ? <Alert>{error}</Alert> : null}
        {completedId ? (
          <Alert tone="success">
            {t("completed", { id: shortId(completedId) })}
          </Alert>
        ) : null}
        <div className="form-actions">
          <Button
            type="submit"
            variant={selected === "burn" ? "danger" : "primary"}
            disabled={execution.isPending}
          >
            <Play size={16} aria-hidden />
            {t(execution.isPending ? "executing" : "execute", {
              action: t(`names.${selected}`),
            })}
          </Button>
        </div>
      </form>
    </section>
  );
}
