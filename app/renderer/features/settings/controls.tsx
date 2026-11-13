import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";

import { appById } from "../../../shared/apps.ts";
import { msg } from "../../../shared/msg.ts";
import type { Message } from "../../../shared/msg.ts";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Switch } from "../../ui/switch.tsx";
import { useDebounced } from "../../use-debounced.ts";

/** What every field component is given: the value in force, whether it may change, and where a valid change goes. */
export interface ControlProps {
  readonly id: string;
  readonly label: Message;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly schema: z.ZodType;
  readonly onChange: (value: unknown) => void;
}

// Typing writes once it pauses rather than on every key, so a half-typed number never reaches main.
const TYPING = 400;

export const BooleanControl = ({
  id,
  label,
  value,
  disabled,
  onChange,
}: ControlProps) => (
  <Switch
    aria-label={label}
    checked={value === true}
    disabled={disabled}
    id={id}
    onCheckedChange={(checked) => {
      onChange(checked);
    }}
  />
);

/** A string union as a segmented control, each value named by the setting's options. */
export const ChoiceControl = ({
  id,
  label,
  value,
  disabled,
  onChange,
  values,
  names,
}: ControlProps & {
  readonly values: readonly string[];
  readonly names: ReadonlyMap<string, Message>;
}) => (
  <fieldset
    className="bg-muted inline-flex shrink-0 gap-0.5 rounded-lg p-0.5"
    disabled={disabled}
    id={id}
  >
    <legend className="sr-only">{label}</legend>
    {values.map((option) => (
      <label
        className="has-checked:bg-background has-focus-visible:ring-ring/50 inline-flex h-7 cursor-pointer items-center rounded-md px-2.5 text-[0.8rem] font-medium select-none has-checked:shadow-sm has-focus-visible:ring-3 has-disabled:cursor-not-allowed has-disabled:opacity-50"
        key={option}
      >
        <input
          checked={value === option}
          className="sr-only"
          name={id}
          onChange={() => {
            onChange(option);
          }}
          type="radio"
          value={option}
        />
        {names.get(option) ?? option}
      </label>
    ))}
  </fieldset>
);

/** Text typed into an input, written once typing pauses while the schema takes it, and put back to the value in force when the input loses focus. */
const useDraft = (
  value: string,
  parse: (text: string) => unknown,
  schema: z.ZodType,
  onChange: (value: unknown) => void
) => {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const write = useDebounced(onChange, TYPING);
  const shown = draft ?? value;
  const valid = schema.safeParse(parse(shown)).success;
  return {
    handleBlur: () => {
      setDraft(undefined);
    },
    handleChange: (text: string) => {
      setDraft(text);
      const parsed = schema.safeParse(parse(text));
      if (parsed.success) {
        write(parsed.data);
      }
    },
    shown,
    valid,
  };
};

export const NumberControl = ({
  id,
  label,
  value,
  disabled,
  schema,
  onChange,
  min,
  max,
  step,
}: ControlProps & {
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly step: number;
}) => {
  const draft = useDraft(
    typeof value === "number" ? String(value) : "",
    (text) => (text.trim() === "" ? Number.NaN : Number(text)),
    schema,
    onChange
  );
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Input
        aria-invalid={!draft.valid}
        aria-label={label}
        className="w-24"
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onBlur={draft.handleBlur}
        onChange={(event) => {
          draft.handleChange(event.target.value);
        }}
        step={step}
        type="number"
        value={draft.shown}
      />
      {draft.valid ? undefined : (
        <p className="text-destructive text-xs">
          {min === undefined || max === undefined
            ? msg`Enter a number`
            : msg`Enter a number from ${min} to ${max}`}
        </p>
      )}
    </div>
  );
};

export const TextControl = ({
  id,
  label,
  value,
  disabled,
  schema,
  onChange,
}: ControlProps) => {
  const draft = useDraft(
    typeof value === "string" ? value : "",
    (text) => text,
    schema,
    onChange
  );
  return (
    <Input
      aria-invalid={!draft.valid}
      aria-label={label}
      className="w-56"
      disabled={disabled}
      id={id}
      onBlur={draft.handleBlur}
      onChange={(event) => {
        draft.handleChange(event.target.value);
      }}
      value={draft.shown}
    />
  );
};

const itemsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const moved = (items: readonly string[], from: number, to: number) => {
  const next = items.filter((_item, index) => index !== from);
  next.splice(to, 0, items[from] ?? "");
  return next;
};

/** A list of strings in order: each can move or go, and one is added at the end while the schema takes the list with it. */
export const ListControl = ({
  id,
  label,
  value,
  disabled,
  schema,
  onChange,
}: ControlProps) => {
  const items = itemsOf(value);
  const [adding, setAdding] = useState("");
  const added = [...items, adding.trim()];
  const addable = adding.trim() !== "" && schema.safeParse(added).success;
  const add = () => {
    if (addable) {
      onChange(added);
      setAdding("");
    }
  };
  return (
    <div className="flex flex-col gap-2" id={id}>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{msg`None`}</p>
      ) : (
        <ul aria-label={label} className="divide-y rounded-lg border">
          {items.map((item, index) => (
            <li className="flex items-center gap-1 py-1 pr-1 pl-3" key={item}>
              <span className="min-w-0 flex-1 truncate text-sm">
                {appById(item)?.name ?? item}
              </span>
              <Button
                disabled={disabled || index === 0}
                onClick={() => {
                  onChange(moved(items, index, index - 1));
                }}
                size="icon-sm"
                title={msg`Move up`}
                variant="ghost"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                disabled={disabled || index === items.length - 1}
                onClick={() => {
                  onChange(moved(items, index, index + 1));
                }}
                size="icon-sm"
                title={msg`Move down`}
                variant="ghost"
              >
                <ArrowDownIcon />
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  onChange(items.filter((_item, at) => at !== index));
                }}
                size="icon-sm"
                title={msg`Remove`}
                variant="ghost"
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label={msg`Add to ${label}`}
          disabled={disabled}
          onChange={(event) => {
            setAdding(event.target.value);
          }}
          value={adding}
        />
        <Button disabled={disabled || !addable} type="submit" variant="outline">
          {msg`Add`}
        </Button>
      </form>
    </div>
  );
};
