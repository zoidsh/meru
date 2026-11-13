import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";

export interface Choice {
  readonly value: string;
  /** What the choice shows; a choice drawn without words names itself through `title`. */
  readonly children: ReactNode;
  readonly title?: string;
  readonly style?: CSSProperties;
}

/** One of several values as native radios inside their labels, so the browser gives the arrow keys and the one tab stop; `variant` draws them as a segmented control or as a row of swatches. */
export const ChoiceGroup = ({
  id,
  name,
  legend,
  value,
  choices,
  disabled = false,
  variant = "segmented",
  onChange,
}: {
  readonly id?: string;
  readonly name: string;
  readonly legend: string;
  readonly value: string | undefined;
  readonly choices: readonly Choice[];
  readonly disabled?: boolean;
  readonly variant?: "segmented" | "swatches";
  readonly onChange: (value: string) => void;
}) => (
  <fieldset
    className={cn(
      variant === "segmented"
        ? "bg-muted inline-flex shrink-0 gap-0.5 rounded-lg p-0.5"
        : "flex flex-wrap gap-1.5"
    )}
    disabled={disabled}
    id={id}
  >
    <legend className="sr-only">{legend}</legend>
    {choices.map((choice) => (
      <label
        className={cn(
          "has-focus-visible:ring-ring/50 cursor-pointer has-focus-visible:ring-3 has-disabled:cursor-not-allowed has-disabled:opacity-50",
          variant === "segmented"
            ? "has-checked:bg-background inline-flex h-7 items-center rounded-md px-2.5 text-[0.8rem] font-medium select-none has-checked:shadow-sm"
            : "has-checked:ring-foreground size-5 rounded-full ring-offset-2 ring-offset-[var(--card)] has-checked:ring-2"
        )}
        key={choice.value}
        style={choice.style}
        title={choice.title}
      >
        <input
          checked={value === choice.value}
          className="sr-only"
          name={name}
          onChange={() => {
            onChange(choice.value);
          }}
          type="radio"
          value={choice.value}
        />
        {choice.children}
      </label>
    ))}
  </fieldset>
);
