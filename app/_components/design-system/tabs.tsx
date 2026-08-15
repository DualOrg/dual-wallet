"use client";

import { useId, useRef } from "react";

export interface TabOption<Id extends string> {
  id: Id;
  label: string;
}

export function Tabs<Id extends string>({
  label,
  options,
  value,
  onChange,
  children,
}: {
  label: string;
  options: Array<TabOption<Id>>;
  value: Id;
  onChange: (value: Id) => void;
  children: React.ReactNode;
}) {
  const instanceId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectAt = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    tabRefs.current[index]?.focus();
  };

  return (
    <>
      <div className="auth-methods" role="tablist" aria-label={label}>
        {options.map((option, index) => (
          <button
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            id={`${instanceId}-${option.id}-tab`}
            key={option.id}
            className="auth-method"
            type="button"
            role="tab"
            tabIndex={value === option.id ? 0 : -1}
            aria-selected={value === option.id}
            aria-controls={`${instanceId}-${option.id}-panel`}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                selectAt((index + 1) % options.length);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                selectAt((index - 1 + options.length) % options.length);
              } else if (event.key === "Home") {
                event.preventDefault();
                selectAt(0);
              } else if (event.key === "End") {
                event.preventDefault();
                selectAt(options.length - 1);
              }
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        id={`${instanceId}-${value}-panel`}
        role="tabpanel"
        aria-labelledby={`${instanceId}-${value}-tab`}
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}
