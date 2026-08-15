"use client";

import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ModalDialog({
  labelledBy,
  onClose,
  initialFocusRef,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const inerted: Array<{ element: HTMLElement; wasInert: boolean }> = [];
    let branch = dialog.current?.parentElement;
    while (branch?.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        inerted.push({ element: sibling, wasInert: sibling.inert });
        sibling.inert = true;
      }
      branch = branch.parentElement;
    }
    document.body.style.overflow = "hidden";
    const focusable = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    (initialFocusRef?.current ?? focusable[0] ?? dialog.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const candidates = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
      const first = candidates[0];
      const last = candidates.at(-1);
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const { element, wasInert } of inerted) element.inert = wasInert;
      previousFocus?.focus();
    };
  }, [initialFocusRef, onClose]);

  return (
    <div
      className="object-pass-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className="card object-pass-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
