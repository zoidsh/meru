import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon } from "lucide-react";
import { useId } from "react";

import type { SettingChange, SettingsState } from "#contract/settings.ts";
import { Button } from "#ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#ui/dropdown-menu.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";

import { SettingGroup } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";

/** How many languages the Spelling button names before counting the rest. */
const NAMED = 3;

/** Meru's language, and on Windows and Linux the spell checker's. */
export const LanguageGroup = ({
  language,
  spellcheckLanguages,
  general,
  write,
  setSpellcheckLanguage,
}: {
  language: string;
  spellcheckLanguages: readonly string[];
  general: Pick<SettingsState["general"], "language" | "spelling">;
  write: (change: SettingChange) => void;
  setSpellcheckLanguage: (code: string, on: boolean) => void;
}) => {
  const { t, i18n } = useLingui();
  const summaryId = useId();
  const { language: offered, spelling } = general;
  const systemLanguage = offered.system;

  const choices = [
    {
      value: "system",
      label: t({
        message: `System (${systemLanguage})`,
        comment:
          "Choice of the Language menu in Settings: Meru shows the language the system prefers; {systemLanguage} names it in its own language, as Deutsch or Français",
      }),
    },
    ...offered.choices.map((choice) => ({
      value: choice.language,
      label: choice.name,
    })),
  ];
  const shown = choices.some((choice) => choice.value === language)
    ? language
    : "system";

  const rows = [
    <SettingRow
      key="language"
      label={t({
        message: "Language",
        comment:
          "Label of the menu in Settings choosing the language of Meru's own menus, windows and settings",
      })}
      description={t({
        message:
          "Changes the language Meru uses. Gmail uses the one set in your Google account.",
        comment:
          "Description of the Language menu in Settings; Gmail's language is set in the person's Google account, not in Meru",
      })}
    >
      {(ids) => (
        <Select
          items={choices}
          value={shown}
          onValueChange={(next) => {
            if (next !== null) {
              write({ key: "language", value: next });
            }
          }}
        >
          <SelectTrigger
            aria-labelledby={ids.label}
            aria-describedby={ids.description || undefined}
            className="min-w-28"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </SettingRow>,
  ];

  if (spelling) {
    // Named in the language Meru shows, by the system's own names for them.
    const names = new Intl.DisplayNames([i18n.locale], { type: "language" });
    const nameOf = (code: string) => names.of(code) ?? code;
    const others = spelling.available
      .map((code) => ({ code, name: nameOf(code) }))
      .toSorted((a, b) => a.name.localeCompare(b.name, i18n.locale));
    const checked = [
      ...(spelling.system
        ? [
            t({
              message: "System language",
              comment:
                "First of the languages the Spelling menu's button in Settings names: the system's, which is always checked",
            }),
          ]
        : spelling.always.map(nameOf)),
      ...others
        .filter(({ code }) => spellcheckLanguages.includes(code))
        .map(({ name }) => name),
    ];
    const shownNames = new Intl.ListFormat(i18n.locale, {
      type: "unit",
      style: "short",
    }).format(checked.slice(0, NAMED));
    const more = checked.length - NAMED;
    let summary = shownNames;

    if (checked.length === 0) {
      summary = t({
        message: "None",
        comment:
          "What the Spelling menu's button in Settings reads while spelling is checked in no language",
      });
    } else if (more > 0) {
      summary = t({
        message: plural(more, {
          one: `${shownNames} and # more`,
          other: `${shownNames} and # more`,
        }),
        comment:
          "What the Spelling menu's button in Settings reads with more languages checked than it names; {shownNames} lists the first three, as System language, German, French, and # counts the rest",
      });
    }

    rows.push(
      <SettingRow
        key="spelling"
        label={t({
          message: "Spelling",
          comment:
            "Label of the menu in Settings choosing the languages spelling is checked in as you type",
        })}
        description={t({
          message: "Choose more languages to check as you type.",
          comment:
            "Description of the Spelling menu in Settings; the system's language is always checked",
        })}
      >
        {(ids) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  aria-labelledby={`${ids.label} ${summaryId}`}
                  aria-describedby={ids.description || undefined}
                />
              }
            >
              <span id={summaryId}>{summary}</span>
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {spelling.always.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {t({
                      message: "Your system's language can't be checked",
                      comment:
                        "Unavailable first item of the Spelling menu in Settings when there is no dictionary for the system's language and none was chosen in its place",
                    })}
                  </DropdownMenuItem>
                ) : (
                  spelling.always.map((code) => (
                    <DropdownMenuCheckboxItem key={code} checked disabled>
                      {nameOf(code)}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {others.map(({ code, name }) => (
                  <DropdownMenuCheckboxItem
                    key={code}
                    checked={spellcheckLanguages.includes(code)}
                    closeOnClick={false}
                    onCheckedChange={(on) => {
                      setSpellcheckLanguage(code, on);
                    }}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SettingRow>
    );
  }

  return (
    <SettingGroup
      title={t({
        message: "Language",
        comment:
          "Heading of the group of Settings about Meru's language and the languages spelling is checked in",
      })}
    >
      <Rows>{rows}</Rows>
    </SettingGroup>
  );
};
