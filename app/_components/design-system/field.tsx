import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/app/_utils/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Field({ label, error, className, id, ...props }: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input
        id={inputId}
        className={cn("input", className)}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="field" htmlFor={props.id ?? props.name}>
      <span className="field-label">{label}</span>
      <select className="input" {...props}>
        {children}
      </select>
    </label>
  );
}
