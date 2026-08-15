import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { cn } from "@/app/_utils/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
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
  const inputId = id ?? props.name ?? generatedId;
  const descriptionId = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input
        id={inputId}
        className={cn("input", className)}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        {...props}
      />
      {hint && !error ? (
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
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const descriptionId = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <select
        id={inputId}
        className="input"
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        {...props}
      >
        {children}
      </select>
      {hint && !error ? (
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
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const descriptionId = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <textarea
        id={inputId}
        className={cn("input textarea", className)}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        {...props}
      />
      {hint && !error ? (
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
