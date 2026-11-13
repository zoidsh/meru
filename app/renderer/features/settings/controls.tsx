import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { cn } from "cn";
import { GripVerticalIcon } from "lucide-react";
import type { z } from "zod";

import { moveItem } from "../../../core/engines/ordering.ts";
import { msg } from "../../../shared/msg.ts";
import type { Message } from "../../../shared/msg.ts";
import { Button } from "../../ui/button.tsx";
import { ChoiceGroup } from "../../ui/choice-group.tsx";
import { Input } from "../../ui/input.tsx";
import { Switch } from "../../ui/switch.tsx";
import { useDraft } from "./use-draft.ts";

/** What every field component is given: the value in force, whether it may change, and where a valid change goes. */
export interface ControlProps {
  readonly id: string;
  readonly label: Message;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly schema: z.ZodType;
  readonly onChange: (value: unknown) => void;
}

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
  <ChoiceGroup
    choices={values.map((option) => ({
      children: names.get(option) ?? option,
      value: option,
    }))}
    disabled={disabled}
    id={id}
    legend={label}
    name={id}
    onChange={onChange}
    value={typeof value === "string" ? value : undefined}
  />
);

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

const Picked = ({
  value,
  index,
  name,
  disabled,
  onUncheck,
}: {
  readonly value: string;
  readonly index: number;
  readonly name: Message;
  readonly disabled: boolean;
  readonly onUncheck: () => void;
}) => {
  const { ref, handleRef, isDragging } = useSortable({
    disabled,
    id: value,
    index,
  });
  return (
    <li
      className={cn(
        "flex items-center gap-2 py-1 pr-3 pl-1",
        isDragging && "opacity-50"
      )}
      data-value={value}
      ref={ref}
    >
      <Button
        aria-label={msg`Drag ${name} to reorder`}
        className="cursor-grab touch-none"
        disabled={disabled}
        ref={handleRef}
        size="icon-sm"
        variant="ghost"
      >
        <GripVerticalIcon />
      </Button>
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <input
          checked
          disabled={disabled}
          onChange={onUncheck}
          type="checkbox"
        />
        <span className="truncate">{name}</span>
      </label>
    </li>
  );
};

/** Several of a choice's values as 3.x's checkboxes over every value: the checked ones first, in the order they are kept, which dragging changes, and a newly checked one at the end. */
export const MultiChoiceControl = ({
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
}) => {
  const picked = itemsOf(value);
  const rest = values.filter((option) => !picked.includes(option));
  const nameOf = (option: string) => names.get(option) ?? option;
  return (
    <ul aria-label={label} className="divide-y rounded-lg border" id={id}>
      <DragDropProvider
        onDragEnd={(event) => {
          const { source } = event.operation;
          if (!event.canceled && isSortable(source)) {
            onChange(moveItem(picked, source.initialIndex, source.index));
          }
        }}
      >
        {picked.map((option, index) => (
          <Picked
            disabled={disabled}
            index={index}
            key={option}
            name={nameOf(option)}
            onUncheck={() => {
              onChange(picked.filter((found) => found !== option));
            }}
            value={option}
          />
        ))}
      </DragDropProvider>
      {rest.map((option) => (
        <li
          className="flex items-center py-1 pr-3 pl-10"
          data-value={option}
          key={option}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <input
              checked={false}
              disabled={disabled}
              onChange={() => {
                onChange([...picked, option]);
              }}
              type="checkbox"
            />
            <span className="truncate">{nameOf(option)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
};
