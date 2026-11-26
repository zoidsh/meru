import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";

import type { SettingsState } from "#contract/settings.ts";
import { Field, FieldTitle } from "#ui/field.tsx";
import { Kbd, KbdGroup } from "#ui/kbd.tsx";

import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows } from "./setting-row.tsx";
import { useSettingsState } from "./sync.ts";

type Keys = NonNullable<
  SettingsState["shortcuts"]["cards"][number]["rows"][number]["keys"]
>;

/** One Kbd per key; a screen reader says the keys' names instead. */
const KeyGroup = ({ keys }: { keys: Keys }) => (
  <>
    <KbdGroup aria-hidden>
      {keys.parts.map((part, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a key can repeat, its place cannot
        <Kbd key={index}>{part}</Kbd>
      ))}
    </KbdGroup>
    <span className="sr-only">{keys.spoken}</span>
  </>
);

/** A command's title and its keys, read-only. */
const ShortcutRow = ({
  title,
  keys,
  to,
}: {
  title: string;
  keys: Keys | null;
  to?: Keys | null;
}) => {
  const titleId = useId();
  const keysId = useId();
  const first = keys && <KeyGroup keys={keys} />;
  const last = to && <KeyGroup keys={to} />;

  return (
    <Field
      orientation="horizontal"
      aria-labelledby={titleId}
      aria-describedby={keysId}
    >
      <FieldTitle id={titleId}>{title}</FieldTitle>
      <div
        id={keysId}
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        {first && last ? (
          <Trans comment="On the Shortcuts page of Settings, the keys of the first and the last of a numbered set of commands, such as ⌃⇧1 to ⌃⇧9">
            {first} to {last}
          </Trans>
        ) : (
          (first ?? (
            <Trans
              context="keyboard shortcut"
              comment="On the Shortcuts page of Settings, in place of the keys of a command that has none on this platform"
            >
              None
            </Trans>
          ))
        )}
      </div>
    </Field>
  );
};

/**
 * Every keyboard shortcut of this platform, a card per menu of the
 * application menu and the keys bound outside the registry last, as main
 * sends them: read-only, app-wide, and nothing on it is Pro.
 */
export const ShortcutsPage = () => {
  const { t } = useLingui();
  const shortcuts = useSettingsState("shortcuts");

  if (!shortcuts) {
    return null;
  }

  return (
    <SettingGroups>
      {shortcuts.cards.map((card) => (
        <SettingGroup key={card.title} title={card.title}>
          <Rows>
            {card.rows.map((row) => (
              <ShortcutRow
                key={row.title}
                title={row.title}
                keys={row.keys}
                to={row.to}
              />
            ))}
          </Rows>
        </SettingGroup>
      ))}
      <SettingGroup
        title={t({
          message: "Built-in shortcuts",
          comment:
            "Title of the last group of the Shortcuts page in Settings, listing keys such as zoom and quit that Meru binds and that cannot be changed",
        })}
        description={t({
          message: "You can't change these.",
          comment:
            "Description of the Built-in shortcuts group of the Shortcuts page in Settings",
        })}
      >
        <Rows>
          {shortcuts.builtIn.map((row) => (
            <ShortcutRow key={row.title} title={row.title} keys={row.keys} />
          ))}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
