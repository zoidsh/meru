import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { PlusIcon, XIcon } from "lucide-react";
import { useId } from "react";

import type { QuietWindow } from "#core/notification-gate.ts";
import { Button } from "#ui/button.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "#ui/field.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { ToggleGroup, ToggleGroupItem } from "#ui/toggle-group.tsx";

import {
  WEEK,
  addQuietWindow,
  dayName,
  quietDays,
  quietTimesWith,
  removeQuietWindow,
  setQuietDays,
  setQuietTime,
} from "./quiet-hours.ts";
import type { RowScope } from "./row-scope.tsx";
import { OverrideBar } from "./row-scope.tsx";

const TimeSelect = ({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (time: string) => void;
}) => (
  <Select
    value={value}
    onValueChange={(time) => {
      if (time !== null) {
        onChange(time);
      }
    }}
  >
    <SelectTrigger
      size="sm"
      aria-label={label}
      className="min-w-20 tabular-nums"
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent alignItemWithTrigger={false}>
      <SelectGroup>
        {quietTimesWith(value).map((time) => (
          <SelectItem key={time} value={time} className="tabular-nums">
            {time}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

/**
 * Quiet hours as a list of windows, each with its days, from and to, and a
 * remove button, with Add under them. Every edit writes the
 * whole list. Reset sits in the row's head.
 */
export const QuietHoursField = ({
  label,
  list,
  paused,
  scope,
  onChange,
}: {
  label: string;
  list: readonly QuietWindow[];
  /** The line saying Do Not Disturb outranks it, while it does. */
  paused: string | undefined;
  scope: RowScope;
  onChange: (list: readonly QuietWindow[]) => void;
}) => {
  const { t, i18n } = useLingui();
  const labelId = useId();
  const dims = paused !== undefined;

  return (
    <Field
      orientation="vertical"
      aria-labelledby={labelId}
      className="relative gap-3"
    >
      {scope.bar && <OverrideBar color={scope.bar} />}
      <div className="flex items-start gap-2">
        <FieldContent>
          <FieldLabel id={labelId} className={cn(dims && "opacity-50")}>
            {label}
          </FieldLabel>
          <FieldDescription className={cn(dims && "opacity-50")}>
            {t({
              message: "Meru holds notifications until quiet hours end.",
              comment: "Description of Quiet hours in Settings",
            })}
          </FieldDescription>
          {paused && <FieldDescription>{paused}</FieldDescription>}
          {scope.line}
        </FieldContent>
        {scope.reset}
      </div>
      <div
        className={cn("flex flex-col items-start gap-2", dims && "opacity-50")}
      >
        {list.map((window, index) => {
          const place = index + 1;

          return (
            <fieldset
              // The list has no ids; a window is where it stands.
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              aria-label={t({
                message: `Quiet hours ${place}`,
                comment:
                  "Accessible name of one window in the Settings list of quiet hours; {place} is its place in the list, from 1",
              })}
              className="flex items-center gap-2"
            >
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                spacing={0}
                aria-label={t({
                  message: "Days",
                  comment:
                    "Accessible name of the days a window of quiet hours holds on in Settings",
                })}
                value={quietDays(window).map(String)}
                onValueChange={(days) => {
                  const next = setQuietDays(list, index, days.map(Number));

                  if (next !== list) {
                    onChange(next);
                  }
                }}
              >
                {WEEK.map((day) => (
                  <ToggleGroupItem
                    key={day}
                    value={String(day)}
                    aria-label={dayName(i18n.locale, day, "long")}
                  >
                    {dayName(i18n.locale, day, "narrow")}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <TimeSelect
                value={window.start}
                label={t({
                  message: "From",
                  comment:
                    "Accessible name of the time a window of quiet hours starts, in Settings",
                })}
                onChange={(time) => {
                  onChange(setQuietTime(list, index, "start", time));
                }}
              />
              <span className="text-sm text-muted-foreground">
                {t({
                  message: "to",
                  comment:
                    "Between the start and end times of a window of quiet hours in Settings, as in 22:00 to 07:00",
                })}
              </span>
              <TimeSelect
                value={window.end}
                label={t({
                  message: "To",
                  comment:
                    "Accessible name of the time a window of quiet hours ends, in Settings",
                })}
                onChange={(time) => {
                  onChange(setQuietTime(list, index, "end", time));
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t({
                  message: `Remove quiet hours ${place}`,
                  comment:
                    "Accessible name of the button that removes one window of quiet hours in Settings; {place} is its place in the list, from 1",
                })}
                title={t({
                  message: "Remove",
                  comment:
                    "Tooltip of the button that removes one window of quiet hours in Settings",
                })}
                onClick={(event) => {
                  // The next window moves under the pointer, so a
                  // double-click would remove it too; a key press has a
                  // detail of 0.
                  if (event.detail <= 1) {
                    onChange(removeQuietWindow(list, index));
                  }
                }}
              >
                <XIcon />
              </Button>
            </fieldset>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onChange(addQuietWindow(list));
          }}
        >
          <PlusIcon data-icon="inline-start" />
          {t({
            message: "Add",
            comment:
              "Button under the Settings list of quiet hours that adds quiet hours, a window a window from 22:00 to 07:00 every day",
          })}
        </Button>
      </div>
    </Field>
  );
};
