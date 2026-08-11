import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/app/_utils/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  block?: boolean;
}

export function Button({
  className,
  variant = "primary",
  block,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "button",
        `button-${variant}`,
        block && "button-block",
        className,
      )}
      {...props}
    />
  );
}
