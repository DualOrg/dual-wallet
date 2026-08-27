"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// ponytail: shape checks only; checksum validation needs keccak and a dependency.
const evmAddress = /^0x[0-9a-fA-F]{40}$/;
const objectId = /^[0-9a-fA-F]{24}$/;
const zeroAddress = `0x${"0".repeat(40)}`;

/**
 * A destination that is the zero address or has an unknown shape gets a
 * confirmation step, not an error: the server remains the authority. Transfer
 * expects an Ethereum address; connect also accepts an object ID. The empty
 * case belongs to the required check.
 */
function destinationWarning(name: InventoryActionName, to: string | undefined) {
  if (name !== "transfer" && name !== "connect") return null;
  const value = to?.trim();
  if (!value) return null;
  if (value.toLowerCase() === zeroAddress)
    return "confirmTransferZero" as const;
  if (evmAddress.test(value)) return null;
  if (name === "connect") {
    return objectId.test(value) ? null : ("confirmConnectUnknown" as const);
  }
  return "confirmTransferUnknown" as const;
}

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
  const cancelConfirm = useRef<HTMLButtonElement>(null);

  // A destructive confirmation opens focused on the safe choice, so a repeated
  // Enter or a stray second click cannot carry through to the irreversible one.
  useEffect(() => {
    if (confirming) cancelConfirm.current?.focus();
  }, [confirming]);

  if (!actions.length || !selected) return null;
  const fields = actionFields(selected);
  const fieldLabel = (name: string) => t(`fields.${name}`);
  const suspectDestination = destinationWarning(selected, input.to);
  const needsConfirmation = destructive(selected);

  const reset = () => {
    setError(null);
    setFieldError(null);
    setCompletedId(null);
  };

  const choose = (name: InventoryActionName) => {
    setSelected(name);
    setInput({});
    setConfirming(false);
    reset();
  };

  const edit = (name: string, value: string) => {
    setInput((current) => ({ ...current, [name]: value }));
    setConfirming(false);
    reset();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (needsConfirmation || suspectDestination) {
      setConfirming(true);
      return;
    }
    void execute();
  };

  const execute = async () => {
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
      <form className="object-action-form" onSubmit={submit}>
        {requestedAction ? (
          <Alert tone="info">{t("externalRequest")}</Alert>
        ) : null}
        <div className="object-action-params">
          {fields.length ? (
            <div className="form-grid">
              {fields.map((field) => {
                const shared = {
                  name: field.name,
                  label: fieldLabel(field.name),
                  required: field.required,
                  value: input[field.name] ?? "",
                  placeholder: String(
                    t.raw(`placeholders.${field.placeholder ?? field.name}`),
                  ),
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
        {error ? <Alert>{error}</Alert> : null}
        {completedId ? (
          <Alert tone="success">
            {t("completed", { id: shortId(completedId) })}
          </Alert>
        ) : null}
        {confirming ? (
          <>
            <Alert>
              {needsConfirmation
                ? t("confirmDestructive", { action: t(`names.${selected}`) })
                : suspectDestination
                  ? t(suspectDestination)
                  : null}
            </Alert>
            <div className="form-actions">
              {/*
               * Cancel leaves in one click, like the button it replaces. A
               * second identical Cancel underneath it reads as a click that
               * did nothing. Editing a field already withdraws the
               * confirmation, so stepping back has its own way out.
               */}
              <Button
                ref={cancelConfirm}
                variant="secondary"
                disabled={execution.isPending}
                onClick={onCancel ?? (() => setConfirming(false))}
              >
                {t(requestedAction && onCancel ? "deny" : "cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={execution.isPending}
                onClick={(event) => {
                  // The second click of a double-click must not confirm.
                  if (event.detail > 1) return;
                  setConfirming(false);
                  void execute();
                }}
              >
                <Play size={16} aria-hidden />
                {t(execution.isPending ? "executing" : "confirm", {
                  action: t(`names.${selected}`),
                })}
              </Button>
            </div>
          </>
        ) : (
          <div className="form-actions">
            {onCancel ? (
              <Button
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
              {t(execution.isPending ? "executing" : "execute", {
                action: t(`names.${selected}`),
              })}
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
