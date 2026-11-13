import { omit } from "es-toolkit";
import { useState } from "react";

import {
  acceleratorOf,
  conflicts,
  glyphs,
  resolveBindings,
} from "../../../core/engines/shortcuts.ts";
import { settings as channels } from "../../../shared/channels/settings.ts";
import { commands } from "../../../shared/commands/registry.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { msg } from "../../../shared/msg.ts";
import type { Message } from "../../../shared/msg.ts";
import { Button } from "../../ui/button.tsx";
import type { PageContent } from "../settings/page-content.ts";
import { useSetting } from "../settings/use-setting.ts";
import { useSettingsClient } from "../settings/use-settings-client.ts";

type Feature = CommandId extends `${infer F}.${string}` ? F : never;

const FEATURES: Readonly<Record<Feature, Message>> = {
  launcher: msg`Tabs`,
  profiles: msg`Profiles`,
  settings: msg`Settings`,
  sidebar: msg`Sidebar`,
  stage: msg`Panes`,
  updater: msg`Updates`,
};

// The order the page lists features in, as a user reaches for them.
const ORDER = [
  "launcher",
  "stage",
  "sidebar",
  "profiles",
  "settings",
  "updater",
] as const satisfies readonly Feature[];

const labelOf = new Map(
  commands.map((command): [CommandId, Message] => [command.id, command.label])
);

type Bindings = Readonly<Partial<Record<CommandId, string | null>>>;

/** A command's shortcut as a button that records the next key pressed on it: Escape stops, Backspace or Delete alone takes the shortcut away. */
const Recorder = ({
  id,
  accelerator,
  platform,
  onRecord,
}: {
  readonly id: CommandId;
  readonly accelerator: string | null;
  readonly platform: string;
  readonly onRecord: (accelerator: string | null) => void;
}) => {
  const [recording, setRecording] = useState(false);
  const shown =
    accelerator === null ? undefined : glyphs(accelerator, platform);
  let text: Message = shown ?? msg`None`;
  if (recording) {
    text = msg`Press a shortcut…`;
  }
  return (
    <Button
      aria-label={msg`Shortcut for ${labelOf.get(id) ?? id}`}
      className="min-w-32 font-mono"
      data-recording={recording ? "" : undefined}
      onBlur={() => {
        setRecording(false);
      }}
      onClick={() => {
        setRecording(true);
      }}
      onKeyDown={(event) => {
        if (!recording) {
          return;
        }
        event.preventDefault();
        const plain =
          !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
        if (plain && event.key === "Escape") {
          setRecording(false);
          return;
        }
        if (plain && (event.key === "Backspace" || event.key === "Delete")) {
          setRecording(false);
          onRecord(null);
          return;
        }
        const recorded = acceleratorOf(
          {
            alt: event.altKey,
            code: event.code,
            control: event.ctrlKey,
            key: event.key,
            meta: event.metaKey,
            shift: event.shiftKey,
            type: "keyDown",
          },
          platform
        );
        if (recorded !== undefined) {
          setRecording(false);
          onRecord(recorded);
        }
      }}
      variant={recording ? "secondary" : "outline"}
    >
      {text}
    </Button>
  );
};

/** Every command by feature with its shortcut, which the user records, resets to its default or takes away, and the commands that would answer the same keys marked. */
export const ShortcutsPage = () => {
  const client = useSettingsClient();
  const { platform } = client;
  const bindings: Bindings = useSetting("shortcuts.bindings");
  const resolved = resolveBindings(commands, bindings, platform);
  const clashes = conflicts(resolved, platform);
  const write = (next: Bindings) => {
    void client.invoke(channels.set, {
      key: "shortcuts.bindings",
      value: next,
    });
  };
  const sections = ORDER.map((feature) => ({
    feature,
    members: commands.filter((command) => command.id.startsWith(`${feature}.`)),
  }));
  return (
    <div className="flex flex-col gap-8">
      {sections.map(({ feature, members }) => (
        <section
          aria-label={FEATURES[feature]}
          className="flex flex-col"
          key={feature}
        >
          <h2 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
            {FEATURES[feature]}
          </h2>
          <div className="divide-y">
            {members.map((command) => {
              const clash = clashes.find((found) =>
                found.ids.includes(command.id)
              );
              const others =
                clash?.ids.filter((other) => other !== command.id) ?? [];
              const own = Object.hasOwn(bindings, command.id);
              return (
                <div
                  className="flex items-center justify-between gap-6 py-2"
                  data-command={command.id}
                  key={command.id}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm">{command.label}</span>
                    {others.length > 0 ? (
                      <span
                        className="text-destructive text-xs"
                        data-conflict=""
                      >
                        {msg`Also the shortcut of ${others.map((other) => labelOf.get(other) ?? other).join(", ")}`}
                      </span>
                    ) : undefined}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {own ? (
                      <Button
                        onClick={() => {
                          write(omit(bindings, [command.id]));
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        {msg`Reset`}
                      </Button>
                    ) : undefined}
                    <Recorder
                      accelerator={resolved.get(command.id) ?? null}
                      id={command.id}
                      onRecord={(accelerator) => {
                        write({ ...bindings, [command.id]: accelerator });
                      }}
                      platform={platform}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export const shortcutsContent: PageContent = {
  Content: ShortcutsPage,
  page: "shortcuts",
};
