import { useId, useRef, type KeyboardEvent } from "react";

import { cn } from "../lib/utils";

export type PillTab<T extends string> = {
  id: T;
  label: string;
  badge?: number;
};

/**
 * Accessible tab strip in the app's pill style: real `tablist`/`tab` roles,
 * `aria-selected`, roving focus with the arrow keys, and wrapping on small
 * screens. Panels should carry `role="tabpanel"` and `id={panelId(tab)}`.
 */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: ReadonlyArray<PillTab<T>>;
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  const baseId = useId();
  const refs = useRef<Map<T, HTMLButtonElement>>(new Map());

  function focusTab(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    onChange(tab.id);
    refs.current.get(tab.id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex flex-wrap gap-2 border-b border-border pb-1",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            role="tab"
            type="button"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "relative min-h-9 rounded-full px-4 py-1.5 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 ? (
              <span
                className={cn(
                  "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                  selected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-accent text-accent-foreground",
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Props for the panel that belongs to `tab`. Spread onto the panel element. */
export function tabPanelProps<T extends string>(baseId: string, tab: T) {
  return {
    role: "tabpanel" as const,
    id: `${baseId}-panel-${tab}`,
    "aria-labelledby": `${baseId}-tab-${tab}`,
  };
}
