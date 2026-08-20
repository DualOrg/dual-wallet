import type { ComponentPropsWithRef } from "react";
import { cn } from "@/app/_utils/cn";

interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: "primary" | "secondary" | "danger";
  block?: boolean;
}

/** For a link that is presented as a button; keeps the class names in one place. */
export function buttonClass(
  variant: ButtonProps["variant"] = "primary",
  block = false,
) {
  return cn("button", `button-${variant}`, block && "button-block");
}

export function Button({
  className,
  variant = "primary",
  block,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClass(variant, block), className)}
      {...props}
    />
  );
}
