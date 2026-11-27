import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { noop } from "es-toolkit";
import { RotateCcwIcon } from "lucide-react";
import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

import type { SettingsState } from "#contract/settings.ts";
import { recordKey } from "#core/accelerator.ts";
import { Button } from "#ui/button.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldTitle,
} from "#ui/field.tsx";
import { Kbd, KbdGroup } from "#ui/kbd.tsx";

import { ProBadge, useNeedsPro } from "./pro-badge.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

type Row = SettingsState["shortcuts"]["cards"][number]["rows"][number];
type Keys = NonNullable<Row["keys"]>;

/** Why the key last typed for a command was not taken. */
interface RowError {
  id: string;
  text: string;
}

const isMacOS = () => document.documentElement.dataset.platform === "darwin";

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

const NoKeys = () => (
  <Trans
    context="keyboard shortcut"
    comment="On the Shortcuts page of Settings, in place of the keys of a command that has none on this platform"
  >
    None
  </Trans>
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
          (first ?? <NoKeys />)
        )}
      </div>
    </Field>
  );
};

/**
 * A command whose key a person changes: the key in a button that records
 * the next keys typed, and Reset once it is changed. Main holds whether it
 * records, and answers each change.
 */
const ChangeableRow = ({
  id,
  row,
  recording,
  error,
  setError,
}: {
  id: string;
  row: Row;
  recording: boolean;
  error: string | undefined;
  setError: (error: RowError | null) => void;
}) => {
  const { t } = useLingui();
  const { title } = row;
  const titleId = useId();
  const buttonId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const googleId = useId();
  const calls = settingsCalls();

  const answer = async (refused: Promise<string | null>) => {
    const text = await refused.catch(noop);

    setError(typeof text === "string" ? { id, text } : null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!recording) {
      return;
    }

    const pressed = {
      key: event.key,
      code: event.code,
      control: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    };
    const recorded = recordKey(pressed, isMacOS());

    // Tab moves focus on, which ends the recording as the button blurs.
    if (recorded.kind === "leave") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    switch (recorded.kind) {
      case "cancel": {
        calls.recordShortcut({ id: null }).catch(noop);
        break;
      }
      case "clear": {
        void answer(calls.setShortcut({ id, accelerator: "" }));
        break;
      }
      case "needsModifier": {
        calls.recordShortcut({ id: null }).catch(noop);
        setError({
          id,
          text: isMacOS()
            ? t({
                message: "Shortcuts need ⌘, ⌃ or ⌥.",
                comment:
                  "Error on the Shortcuts page of Settings on a Mac when the keys typed have no Command, Control or Option",
              })
            : t({
                message: "Shortcuts need Ctrl or Alt.",
                comment:
                  "Error on the Shortcuts page of Settings on Windows and Linux when the keys typed have no Ctrl or Alt",
              }),
        });
        break;
      }
      case "key": {
        void answer(
          calls.setShortcut({ id, accelerator: recorded.accelerator, pressed })
        );
        break;
      }
      // A modifier alone, or a key no shortcut can name: still recording.
      default:
    }
  };

  // The hint while recording outranks an error, which outranks the default.
  const shownError = recording ? undefined : error;
  let description: string | null = row.note;

  if (recording) {
    description = t({
      message:
        "Type the new shortcut. Press Escape to cancel or Delete to clear it.",
      comment:
        "Under a command on the Shortcuts page of Settings while its key is being recorded",
    });
  } else if (shownError !== undefined) {
    description = null;
  }

  const keys = row.keys ? <KeyGroup keys={row.keys} /> : <NoKeys />;
  const describedBy = [
    description !== null && descriptionId,
    shownError !== undefined && errorId,
    row.google !== null && googleId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Field
      orientation="horizontal"
      aria-labelledby={titleId}
      data-invalid={shownError === undefined ? undefined : true}
    >
      {/* A title alone is the field's own child, which Field centers on the
          buttons; lines under it align the row to its top. */}
      {describedBy === "" ? (
        <FieldTitle id={titleId}>{title}</FieldTitle>
      ) : (
        <FieldContent>
          <FieldTitle id={titleId}>{title}</FieldTitle>
          {description !== null && (
            <FieldDescription id={descriptionId}>
              {description}
            </FieldDescription>
          )}
          {shownError !== undefined && (
            <FieldError id={errorId}>{shownError}</FieldError>
          )}
          {row.google !== null && (
            <FieldDescription id={googleId}>{row.google}</FieldDescription>
          )}
        </FieldContent>
      )}
      <div className="flex items-center gap-2">
        {row.changed && (
          <Button
            variant="ghost"
            size="xs"
            aria-label={t({
              message: `Reset ${title} to its default`,
              comment:
                "Accessible name of the Reset button beside a changed key on the Shortcuts page of Settings; {title} is the command's name",
            })}
            onClick={() => {
              void answer(calls.resetShortcut({ id }));
            }}
          >
            <RotateCcwIcon data-icon="inline-start" />
            {t({
              message: "Reset",
              comment:
                "Button beside a changed key on the Shortcuts page of Settings, which gives the command its default key again",
            })}
          </Button>
        )}
        <Button
          id={buttonId}
          variant="outline"
          size="sm"
          // The focus ring while it records, as a click alone shows none.
          className={cn(recording && "border-ring ring-3 ring-ring/50")}
          aria-labelledby={`${titleId} ${buttonId}`}
          aria-describedby={describedBy || undefined}
          aria-invalid={shownError === undefined ? undefined : true}
          onClick={() => {
            setError(null);
            calls.recordShortcut({ id }).catch(noop);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (recording) {
              calls.recordShortcut({ id: null }).catch(noop);
            }
          }}
        >
          {recording
            ? t({
                message: "Type shortcut…",
                comment:
                  "In the button of a command's key on the Shortcuts page of Settings while the new key is being typed",
              })
            : keys}
        </Button>
      </div>
    </Field>
  );
};

/**
 * Every keyboard shortcut of this platform, a card per menu of the
 * application menu and the keys bound outside the registry last, as main
 * sends them. With Meru Pro each command's key is a button that records a
 * new one; on the free version the page lists them.
 */
export const ShortcutsPage = () => {
  const { t } = useLingui();
  const shortcuts = useSettingsState("shortcuts");
  const needsPro = useNeedsPro().capability("shortcutCustomization");
  const noteId = useId();
  const [error, setError] = useState<RowError | null>(null);

  if (!shortcuts) {
    return null;
  }

  return (
    <SettingGroups>
      <div className="flex items-center gap-2">
        <p id={noteId} className="text-sm text-muted-foreground">
          {t({
            message: "Click a shortcut and type the keys you want to use.",
            comment: "Line atop the Shortcuts page of Settings",
          })}
        </p>
        {needsPro && <ProBadge labelledBy={noteId} />}
      </div>
      {shortcuts.cards.map((card) => (
        <SettingGroup key={card.title} title={card.title}>
          <Rows>
            {card.rows.map((row) =>
              row.id === null ? (
                <ShortcutRow
                  key={row.title}
                  title={row.title}
                  keys={row.keys}
                  to={row.to}
                />
              ) : (
                <ChangeableRow
                  key={row.id}
                  id={row.id}
                  row={row}
                  recording={shortcuts.recording === row.id}
                  error={error?.id === row.id ? error.text : undefined}
                  setError={setError}
                />
              )
            )}
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
