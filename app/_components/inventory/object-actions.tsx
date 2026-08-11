"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import {
  Field,
  TextareaField,
} from "@/app/_components/design-system/field";
import type { InventoryObject } from "@/app/_domain/inventory";
import { shortId } from "@/app/_domain/inventory";
import { executeInventoryAction } from "@/app/_lib/action-executor";
import {
  ActionInputError,
  actionFields,
  buildInventoryAction,
  isInventoryActionName,
  type ActionInput,
  type InventoryActionName,
} from "@/app/_lib/inventory-actions";
import { useSession } from "@/app/_providers/session-provider";

export function ObjectActions({ item }: { item: InventoryObject }) {
  const t = useTranslations("actions");
  const session = useSession();
  const queryClient = useQueryClient();
  const actions = useMemo(
    () =>
      Array.from(new Set(item.actions)).filter(isInventoryActionName),
    [item.actions],
  );
  const [selected, setSelected] = useState<InventoryActionName | null>(
    actions[0] ?? null,
  );
  const [input, setInput] = useState<ActionInput>({});
  const [pending, setPending] = useState(false);
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
    if (!session.authenticationMethod) {
      setError(t("sessionExpired"));
      return;
    }
    try {
      const action = buildInventoryAction(selected, item.id, input);
      setPending(true);
      const result = await executeInventoryAction(
        action,
        session.authenticationMethod,
        session.wallet?.address,
      );
      setCompletedId(result.actionId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-object"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
    } catch (caught) {
      if (caught instanceof ActionInputError) {
        setError(
          t(`validation.${caught.code}`, {
            field: fieldLabel(caught.field),
          }),
        );
      } else {
        setError(
          caught instanceof Error ? caught.message : t("executionFailed"),
        );
      }
    } finally {
      setPending(false);
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
            onClick={() => choose(name)}
          >
            {t(`names.${name}`)}
          </Button>
        ))}
      </div>
      <form className="object-action-form" onSubmit={execute}>
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
                  placeholder={t(`placeholders.${field.name}`)}
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
                    field.kind === "datetime"
                      ? "datetime-local"
                      : field.kind
                  }
                  step={field.kind === "number" ? "any" : undefined}
                  label={fieldLabel(field.name)}
                  required={field.required}
                  value={input[field.name] ?? ""}
                  placeholder={t(`placeholders.${field.name}`)}
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
            disabled={pending}
          >
            <Play size={16} aria-hidden />
            {t(pending ? "executing" : "execute", {
              action: t(`names.${selected}`),
            })}
          </Button>
        </div>
      </form>
    </section>
  );
}
