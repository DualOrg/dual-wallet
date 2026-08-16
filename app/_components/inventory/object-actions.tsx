"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";
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

// ponytail: `burn` is the only irreversible action today. If more appear, move
// this to a `destructive` flag on the action definitions.
const destructive = (name: InventoryActionName) => name === "burn";

export function ObjectActions({
  item,
  requestedAction,
  onRequestedActionCompleted,
  onCancel,
}: {
  item: InventoryObject;
  requestedAction?: ExternalFaceActionRequest;
  onRequestedActionCompleted?: (actionId: string) => void;
  onCancel?: () => void;
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
  const [fieldError, setFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!actions.length || !selected) return null;
  const fields = actionFields(selected);
  const fieldLabel = (name: string) => t(`fields.${name}`);
  const needsConfirmation = destructive(selected);

  const reset = () => {
    setError(null);
    setFieldError(null);
    setCompletedId(null);
    setConfirming(false);
  };

  const choose = (name: InventoryActionName) => {
    setSelected(name);
    setInput({});
    reset();
  };

  const edit = (name: string, value: string) => {
    setInput((current) => ({ ...current, [name]: value }));
    reset();
  };

  const execute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (needsConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    reset();
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
        const message = t(`validation.${caught.code}`, {
          field: fieldLabel(caught.field),
        });
        // Anchor the message to its own field when we render that field.
        if (fields.some((field) => field.name === caught.field)) {
          setFieldError({ field: caught.field, message });
        } else {
          setError(message);
        }
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
      <div className="object-action-tabs" role="group" aria-label={t("title")}>
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
        <div className="object-action-params">
          {fields.length ? (
            <div className="form-grid">
              {fields.map((field) => {
                const shared = {
                  name: field.name,
                  label: fieldLabel(field.name),
                  required: field.required,
                  value: input[field.name] ?? "",
                  placeholder: String(t.raw(`placeholders.${field.name}`)),
                  error:
                    fieldError?.field === field.name
                      ? fieldError.message
                      : undefined,
                  hint: field.required ? undefined : t("optional"),
                  onChange: (
                    event: React.ChangeEvent<
                      HTMLInputElement | HTMLTextAreaElement
                    >,
                  ) => edit(field.name, event.target.value),
                };
                return field.kind === "json" ? (
                  <TextareaField key={field.name} rows={5} {...shared} />
                ) : (
                  <Field
                    key={field.name}
                    type={
                      field.kind === "datetime" ? "datetime-local" : field.kind
                    }
                    step={field.kind === "number" ? "any" : undefined}
                    {...shared}
                  />
                );
              })}
            </div>
          ) : (
            <p className="object-action-confirmation">
              {t("confirmation", { action: t(`names.${selected}`) })}
            </p>
          )}
        </div>
        {confirming ? (
          <Alert>
            {t("confirmDestructive", { action: t(`names.${selected}`) })}
          </Alert>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        {completedId ? (
          <Alert tone="success">
            {t("completed", { id: shortId(completedId) })}
          </Alert>
        ) : null}
        <div className="form-actions">
          {onCancel ? (
            <Button
              type="button"
              variant="secondary"
              disabled={execution.isPending}
              onClick={onCancel}
            >
              {t(requestedAction ? "deny" : "cancel")}
            </Button>
          ) : null}
          <Button
            type="submit"
            variant={needsConfirmation ? "danger" : "primary"}
            disabled={execution.isPending}
          >
            <Play size={16} aria-hidden />
            {t(
              execution.isPending
                ? "executing"
                : confirming
                  ? "confirm"
                  : "execute",
              { action: t(`names.${selected}`) },
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
