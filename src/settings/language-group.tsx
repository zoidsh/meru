import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon } from "lucide-react";

import type { SettingChange, SettingsState } from "#contract/settings.ts";
import { Button } from "#ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
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

/** Meru's language, and on Windows and Linux the spell checker's. */
export const LanguageGroup = ({
  language,
  spellcheckLanguages,
  general,
  write,
}: {
  language: string;
  spellcheckLanguages: readonly string[];
  general: Pick<SettingsState["general"], "language" | "spelling">;
  write: (change: SettingChange) => void;
}) => {
  const { t, i18n } = useLingui();
  const { language: offered, spelling } = general;

  const choices = [
    {
      value: "system",
      label: t({
        message: `System (${offered.system})`,
        comment:
          "Choice of the Language menu in Settings: Meru shows the language the system prefers, named in brackets in its own language, as Deutsch or Français",
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
    const chosen = others.filter(({ code }) =>
      spellcheckLanguages.includes(code)
    );
    const shownNames = new Intl.ListFormat(i18n.locale, {
      type: "unit",
      style: "short",
    }).format(chosen.slice(0, 2).map(({ name }) => name));
    const more = chosen.length - 2;
    let summary: string;

    if (chosen.length === 0) {
      summary = t({
        message: "System language",
        comment:
          "What the Spelling menu's button in Settings reads when only the system's language is checked",
      });
    } else if (more <= 0) {
      summary = t({
        message: `System language, ${shownNames}`,
        comment:
          "What the Spelling menu's button in Settings reads with one or two languages checked beside the system's; {shownNames} names them",
      });
    } else {
      summary = t({
        message: plural(more, {
          one: `System language, ${shownNames} and # more`,
          other: `System language, ${shownNames} and # more`,
        }),
        comment:
          "What the Spelling menu's button in Settings reads with three or more languages checked beside the system's; {shownNames} names the first two, # counts the rest",
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
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description || undefined}
                />
              }
            >
              {summary}
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuCheckboxItem checked disabled>
                  {nameOf(spelling.system)}
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {others.map(({ code, name }) => (
                  <DropdownMenuCheckboxItem
                    key={code}
                    checked={spellcheckLanguages.includes(code)}
                    closeOnClick={false}
                    onCheckedChange={(on) => {
                      write({
                        key: "spellcheckLanguages",
                        value: on
                          ? [...spellcheckLanguages, code]
                          : spellcheckLanguages.filter((each) => each !== code),
                      });
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
