import { useState } from "react";

import {
  labelColorSchema,
  labelTextColorSchema,
} from "../../../core/records/label-color.ts";
import type {
  LabelColor,
  LabelTextColor,
} from "../../../core/records/label-color.ts";
import { commands } from "../../../shared/channels/commands.ts";
import { settings as channels } from "../../../shared/channels/settings.ts";
import { msg } from "../../../shared/msg.ts";
import type { Message } from "../../../shared/msg.ts";
import { settingSet } from "../../../shared/settings/schema.ts";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select.tsx";
import { refusalOf } from "../entitlement/refusal.ts";
import type { PageContent } from "../settings/page-content.ts";
import { SettingsSection } from "../settings/settings-section.tsx";
import { useDraft } from "../settings/use-draft.ts";
import { useLocked, useSetting } from "../settings/use-setting.ts";
import { useSettingsClient } from "../settings/use-settings-client.ts";

const KEY = "gmail.labelColors";

const DEFAULT_COLOR = "#1a73e8";

// Chromium's colour input takes a six-digit hex and nothing else, so a colour held as `rgb()` shows as black there until one is picked.
const HEX6 = /^#[\da-f]{6}$/iu;

const TEXT_COLOR_NAMES: Readonly<Record<LabelTextColor, Message>> = {
  auto: msg`Auto`,
  black: msg`Black`,
  white: msg`White`,
};

const ColorInput = ({
  label,
  color,
  disabled,
  onPick,
}: {
  readonly label: Message;
  readonly color: string;
  readonly disabled: boolean;
  readonly onPick: (color: string) => void;
}) => (
  <input
    aria-label={label}
    className="border-input h-8 w-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
    disabled={disabled}
    onChange={(event) => {
      onPick(event.target.value);
    }}
    type="color"
    value={HEX6.test(color) ? color : "#000000"}
  />
);

const TextColorSelect = ({
  textColor,
  disabled,
  onPick,
}: {
  readonly textColor: LabelTextColor;
  readonly disabled: boolean;
  readonly onPick: (textColor: LabelTextColor) => void;
}) => (
  <Select
    disabled={disabled}
    items={labelTextColorSchema.options.map((option) => ({
      label: TEXT_COLOR_NAMES[option],
      value: option,
    }))}
    onValueChange={(picked) => {
      const parsed = labelTextColorSchema.safeParse(picked);
      if (parsed.success) {
        onPick(parsed.data);
      }
    }}
    value={textColor}
  >
    <SelectTrigger aria-label={msg`Text color`} className="w-28 shrink-0">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {labelTextColorSchema.options.map((option) => (
        <SelectItem key={option} value={option}>
          {TEXT_COLOR_NAMES[option]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** One label's colour, edited in place: its name once typing pauses, its colour and its text colour at once. */
const LabelColorRow = ({
  labelColor,
  disabled,
  onChange,
  onRemove,
}: {
  readonly labelColor: LabelColor;
  readonly disabled: boolean;
  readonly onChange: (labelColor: LabelColor) => void;
  readonly onRemove: () => void;
}) => {
  const label = useDraft(
    labelColor.label,
    (text) => ({ ...labelColor, label: text.trim() }),
    labelColorSchema,
    onChange
  );
  return (
    <li className="flex items-center gap-3" data-label-color={labelColor.label}>
      <Input
        aria-invalid={!label.valid}
        aria-label={msg`Label`}
        className="max-w-56"
        disabled={disabled}
        onBlur={label.handleBlur}
        onChange={(event) => {
          label.handleChange(event.target.value);
        }}
        value={label.shown}
      />
      <ColorInput
        color={labelColor.color}
        disabled={disabled}
        label={msg`Color`}
        onPick={(color) => {
          onChange({ ...labelColor, color });
        }}
      />
      <TextColorSelect
        disabled={disabled}
        onPick={(textColor) => {
          onChange({ ...labelColor, textColor });
        }}
        textColor={labelColor.textColor}
      />
      <Button
        className="ml-auto"
        disabled={disabled}
        onClick={onRemove}
        size="sm"
        variant="ghost"
      >
        {msg`Remove`}
      </Button>
    </li>
  );
};

/** Asks for a label's name and colour, and adds it once both are a colour the setting takes. */
const AddLabelColor = ({
  disabled,
  onAdd,
}: {
  readonly disabled: boolean;
  readonly onAdd: (labelColor: LabelColor) => void;
}) => {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const added = labelColorSchema.safeParse({
    color,
    label: label.trim(),
    textColor: "auto",
  });
  return (
    <div className="flex items-center gap-3">
      <Input
        aria-label={msg`Label`}
        className="max-w-56"
        disabled={disabled}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
        placeholder={msg`Work`}
        value={label}
      />
      <ColorInput
        color={color}
        disabled={disabled}
        label={msg`Color`}
        onPick={setColor}
      />
      <Button
        className="ml-auto"
        disabled={disabled || !added.success}
        onClick={() => {
          if (added.success) {
            onAdd(added.data);
            setLabel("");
            setColor(DEFAULT_COLOR);
          }
        }}
        variant="outline"
      >
        {msg`Add label color`}
      </Button>
    </div>
  );
};

/** Every label the user recoloured, each edited in place, and a way to add one; while the gate locks the setting it says why and nothing may change. */
const LabelColors = () => {
  const client = useSettingsClient();
  const refusal = useLocked(KEY);
  const labelColors = useSetting(KEY);
  const locked = refusal !== undefined;
  const write = (next: readonly LabelColor[]) => {
    const payload = settingSet(KEY, next);
    if (payload !== undefined) {
      void client.invoke(channels.set, payload);
    }
  };
  return (
    <SettingsSection heading={msg`Label colors`}>
      <div className="flex flex-col gap-4 p-4" data-setting={KEY}>
        <p className="text-muted-foreground text-sm">
          {msg`Recolor Gmail labels by their exact name. Auto draws a label's name in whichever of black and white reads on its color.`}
        </p>
        {refusal === undefined ? undefined : (
          <p className="text-sm" data-locked="">
            {refusalOf(refusal)}
          </p>
        )}
        {labelColors.length === 0 ? undefined : (
          <ul className="flex flex-col gap-3">
            {labelColors.map((labelColor, index) => (
              <LabelColorRow
                disabled={locked}
                key={index}
                labelColor={labelColor}
                onChange={(next) => {
                  write(
                    labelColors.map((found, at) =>
                      at === index ? next : found
                    )
                  );
                }}
                onRemove={() => {
                  write(labelColors.filter((_, at) => at !== index));
                }}
              />
            ))}
          </ul>
        )}
        <AddLabelColor
          disabled={locked}
          onAdd={(labelColor) => {
            write([...labelColors, labelColor]);
          }}
        />
      </div>
    </SettingsSection>
  );
};

/** The user's own CSS for Gmail, opened in the editor or shown in its folder; the same gate as the label colours holds it. */
const UserStyles = () => {
  const client = useSettingsClient();
  const locked = useLocked(KEY) !== undefined;
  const run = (id: "gmail.editUserStyles" | "gmail.revealUserStyles") => {
    void client.invoke(commands.run, { id });
  };
  return (
    <SettingsSection heading={msg`User styles`}>
      <div className="flex items-center justify-between gap-6 p-4">
        <p className="text-muted-foreground text-sm">
          {msg`Your own CSS applies to Gmail as soon as you save the file.`}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={locked}
            onClick={() => {
              run("gmail.editUserStyles");
            }}
            variant="outline"
          >
            {msg`Open in editor`}
          </Button>
          <Button
            disabled={locked}
            onClick={() => {
              run("gmail.revealUserStyles");
            }}
            variant="outline"
          >
            {msg`Show in folder`}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
};

/** What the Gmail page holds past the registry's fields: the label colours and the user styles. */
export const GmailPage = () => (
  <>
    <LabelColors />
    <UserStyles />
  </>
);

export const gmailContent: PageContent = {
  below: true,
  Content: GmailPage,
  page: "gmail",
};
