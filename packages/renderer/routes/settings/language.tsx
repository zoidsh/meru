import { useQuery } from "@tanstack/react-query";
import { Button } from "@meru/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@meru/ui/components/field";
import { ChevronDownIcon } from "lucide-react";
import { ipc } from "@meru/renderer-lib/ipc";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

function getLanguageLabel(code: string) {
  return displayNames.of(code) ?? code;
}

function getTriggerLabel(selected: string[]) {
  if (selected.length === 0) {
    return "No additional languages";
  }

  if (selected.length <= 2) {
    return selected.map(getLanguageLabel).join(", ");
  }

  return `${selected.length} additional languages`;
}

export function LanguageSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const { data: availableLanguages = [] } = useQuery({
    queryKey: ["spellchecker.availableLanguages"],
    queryFn: () => ipc.main.invoke("spellchecker.getAvailableLanguages"),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const languages = availableLanguages
    .map((code) => ({ code, label: getLanguageLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (!config) {
    return;
  }

  const selected = config["spellchecker.languages"];

  function toggleLanguage(code: string, checked: boolean) {
    const updated = checked ? [...selected, code] : selected.filter((l) => l !== code);

    configMutation.mutate({ "spellchecker.languages": updated });
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Language</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Spellchecker</FieldLegend>
            <FieldDescription>
              Select additional languages for spellchecking alongside the system language.
            </FieldDescription>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className="truncate">{getTriggerLabel(selected)}</span>
                    <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start">
                {languages.map(({ code, label }) => (
                  <DropdownMenuCheckboxItem
                    key={code}
                    checked={selected.includes(code)}
                    onCheckedChange={(checked) => toggleLanguage(code, checked)}
                    closeOnClick={false}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
