import { useEffect, useRef, useState } from "react";

import type { PaneAction, PaneActionId } from "../lib/pane-actions";

interface PaneActionMenuProps {
  actions: PaneAction[];
  onSelect: (actionId: PaneActionId) => void;
  triggerClassName?: string;
}

export function PaneActionMenu({ actions, onSelect, triggerClassName }: PaneActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const close = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };
    const closeOnBlur = () => {
      setIsOpen(false);
    };

    window.addEventListener("pointerdown", close, true);
    window.addEventListener("blur", closeOnBlur);

    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className={`pane-action-menu${isOpen ? " pane-action-menu--open" : ""}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className={triggerClassName ? `pane-action-menu__trigger ${triggerClassName}` : "pane-action-menu__trigger"}
        type="button"
        aria-label="Pane actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        ...
      </button>
      {isOpen ? (
        <div className="pane-action-menu__popover" role="menu">
          {actions.map((action) => (
            <button
              key={action.id}
              className="pane-action-menu__item"
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setIsOpen(false);
                onSelect(action.id);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
