import type { ComponentPropsWithRef } from "react";
import { useId } from "react";
import { cn } from "@/app/_utils/cn";

interface FieldProps extends ComponentPropsWithRef<"input"> {
  label: string;
  error?: string;
  hint?: string;
}

export function Field({
  label,
  error,
  hint,
  className,
  id,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [hint && `${inputId}-hint`, error && `${inputId}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input
        id={inputId}
        className={cn("input", className)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      />
      {hint ? (
        <span id={`${inputId}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function SelectField({
  label,
  error,
  hint,
  id,
  children,
  ...props
}: ComponentPropsWithRef<"select"> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [hint && `${inputId}-hint`, error && `${inputId}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <select
        id={inputId}
        className="input"
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      >
        {children}
      </select>
      {hint ? (
        <span id={`${inputId}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  className,
  id,
  ...props
}: ComponentPropsWithRef<"textarea"> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [hint && `${inputId}-hint`, error && `${inputId}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <textarea
        id={inputId}
        className={cn("input textarea", className)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      />
      {hint ? (
        <span id={`${inputId}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
