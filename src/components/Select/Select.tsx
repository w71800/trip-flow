import { useEffect, useId, useRef, useState } from "react";
import "./Select.css";

export type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  "aria-labelledby"?: string;
  className?: string;
  placeholder?: string;
};

function ChevronIcon() {
  return (
    <svg
      className="selectChevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function Select({
  id,
  value,
  options,
  onChange,
  "aria-labelledby": ariaLabelledby,
  className,
  placeholder,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((option) => option.value === value);
  const selectedIndex = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || highlightIndex < 0) return;
    listRef.current?.children[highlightIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [open, highlightIndex]);

  function selectOption(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
  }

  function openList() {
    setOpen(true);
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          openList();
        } else {
          setHighlightIndex((index) => Math.min(index + 1, options.length - 1));
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          openList();
        } else {
          setHighlightIndex((index) => Math.max(index - 1, 0));
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open && highlightIndex >= 0) {
          selectOption(options[highlightIndex].value);
        } else {
          openList();
        }
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div
      className={`select${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        id={id}
        className="selectTrigger"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-labelledby={ariaLabelledby}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="selectValue">
          {selectedOption?.label ?? placeholder ?? ""}
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          className="selectList"
          role="listbox"
          aria-activedescendant={
            highlightIndex >= 0 && id
              ? `${id}-option-${highlightIndex}`
              : undefined
          }
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={id ? `${id}-option-${index}` : undefined}
              role="option"
              aria-selected={option.value === value}
              className={`selectOption${
                option.value === value ? " isSelected" : ""
              }${index === highlightIndex ? " isHighlighted" : ""}`}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => selectOption(option.value)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
