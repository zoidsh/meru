import { useId } from "react";
import type { ReactNode } from "react";

import {
  emptySettings,
  resolve,
  storedValue,
} from "../../../core/engines/settings.ts";
import { settings as channels } from "../../../shared/channels/settings.ts";
import { msg } from "../../../shared/msg.ts";
import type { Registry } from "../../../shared/settings/registry.ts";
import { settingSet } from "../../../shared/settings/schema.ts";
import { Badge } from "../../ui/badge.tsx";
import { refusalOf } from "../entitlement/refusal.ts";
import { useSelectedProfile } from "../profiles/use-profiles.ts";
import {
  BooleanControl,
  ChoiceControl,
  MultiChoiceControl,
  NumberControl,
  TextControl,
} from "./controls.tsx";
import type { ControlProps } from "./controls.tsx";
import { fieldKindOf } from "./field-kind.ts";
import {
  useLocked,
  useSettingSpecs,
  useSettingsLayers,
} from "./use-setting.ts";
import { useSettingsClient } from "./use-settings-client.ts";

type SettingEntry = Registry[number];

/** The field component for the setting's schema kind; none for a kind only a page of its own edits. */
const Control = ({
  setting,
  ...props
}: ControlProps & { readonly setting: SettingEntry }) => {
  const kind = fieldKindOf(setting.schema);
  if (kind.kind === "boolean") {
    return <BooleanControl {...props} />;
  }
  if (kind.kind === "choice") {
    return (
      <ChoiceControl
        {...props}
        names={new Map(Object.entries(setting.options ?? {}))}
        values={kind.values}
      />
    );
  }
  if (kind.kind === "number") {
    return (
      <NumberControl
        {...props}
        max={kind.max}
        min={kind.min}
        step={kind.step}
      />
    );
  }
  if (kind.kind === "text") {
    return <TextControl {...props} />;
  }
  if (kind.kind === "multiChoice") {
    return (
      <MultiChoiceControl
        {...props}
        names={new Map(Object.entries(setting.options ?? {}))}
        values={kind.values}
      />
    );
  }
  return null;
};

const Row = ({
  control,
  wide,
  children,
}: {
  readonly control: ReactNode;
  readonly wide: boolean;
  readonly children: ReactNode;
}) =>
  wide ? (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">{children}</div>
      {control}
    </div>
  ) : (
    <div className="flex items-start justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
      {control}
    </div>
  );

/** The selected profile's own value for a setting a profile may override, under the global one: off follows the global value, on keeps one of its own. */
const ProfileOverride = ({
  setting,
  locked,
  write,
}: {
  readonly setting: SettingEntry;
  readonly locked: boolean;
  readonly write: (value: unknown, profileId?: string) => void;
}) => {
  const id = useId();
  const layers = useSettingsLayers();
  const specs = useSettingSpecs();
  const selected = useSelectedProfile();
  if (selected === undefined) {
    return null;
  }
  const own =
    storedValue(layers, { key: setting.key, profileId: selected.id }) !==
    undefined;
  const label = msg`${setting.label} for ${selected.label}`;
  return (
    <div className="border-muted ml-1 flex flex-col gap-3 border-l-2 pl-4">
      <div className="flex items-center justify-between gap-6">
        <label className="text-sm" htmlFor={id}>
          {msg`Use a different value for ${selected.label}`}
        </label>
        <BooleanControl
          disabled={locked}
          id={id}
          label={msg`Use a different value for ${selected.label}`}
          onChange={(on) => {
            write(
              on === true
                ? resolve(specs, layers, setting.key, selected.id)
                : undefined,
              selected.id
            );
          }}
          schema={setting.schema}
          value={own}
        />
      </div>
      {own ? (
        <Control
          disabled={locked}
          id={`${id}-value`}
          label={label}
          onChange={(value) => {
            write(value, selected.id);
          }}
          schema={setting.schema}
          setting={setting}
          value={resolve(specs, layers, setting.key, selected.id)}
        />
      ) : undefined}
    </div>
  );
};

/** One setting as the registry declares it: its label, description and field, locked with the gate's reason while a Pro setting is refused, noting a restart, and with the selected profile's override when a profile may have one. */
export const SettingField = ({
  setting,
}: {
  readonly setting: SettingEntry;
}) => {
  const id = useId();
  const client = useSettingsClient();
  const layers = useSettingsLayers();
  const specs = useSettingSpecs();
  const refusal = useLocked(setting.key);
  const locked = refusal !== undefined;
  const write = (value: unknown, profileId?: string) => {
    const payload = settingSet(setting.key, value, profileId);
    if (payload !== undefined) {
      void client.invoke(channels.set, payload);
    }
  };
  const { kind } = fieldKindOf(setting.schema);
  return (
    <div className="flex flex-col gap-3 p-4" data-setting={setting.key}>
      <Row
        control={
          <Control
            disabled={locked}
            id={id}
            label={setting.label}
            onChange={(value) => {
              write(value);
            }}
            schema={setting.schema}
            setting={setting}
            value={resolve(
              specs,
              locked ? emptySettings() : layers,
              setting.key
            )}
          />
        }
        wide={kind === "multiChoice"}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium" htmlFor={id}>
            {setting.label}
          </label>
          {setting.tier === "pro" ? (
            <Badge variant={locked ? "outline" : "secondary"}>{msg`Pro`}</Badge>
          ) : undefined}
        </div>
        {setting.description === undefined ? undefined : (
          <p className="text-muted-foreground text-sm">{setting.description}</p>
        )}
        {refusal === undefined ? undefined : (
          <p className="text-sm" data-locked="">
            {refusalOf(refusal)}
          </p>
        )}
        {setting.restart ? (
          <p className="text-muted-foreground text-xs">
            {msg`Restart Meru to apply the changes.`}
          </p>
        ) : undefined}
      </Row>
      {setting.scope === "profile" ? (
        <ProfileOverride locked={locked} setting={setting} write={write} />
      ) : undefined}
    </div>
  );
};
