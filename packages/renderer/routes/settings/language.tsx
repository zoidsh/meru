import { Button } from "@meru/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@meru/ui/components/field";
import { ChevronDownIcon } from "lucide-react";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";

const SPELLCHECKER_LANGUAGES = [
  { code: "af", label: "Afrikaans" },
  { code: "sq", label: "Albanian" },
  { code: "bg", label: "Bulgarian" },
  { code: "ca", label: "Catalan" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-CA", label: "English (Canada)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-US", label: "English (US)" },
  { code: "et", label: "Estonian" },
  { code: "fo", label: "Faroese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ko", label: "Korean" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "nb", label: "Norwegian Bokmål" },
  { code: "fa", label: "Persian" },
  { code: "pl", label: "Polish" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-PT", label: "Portuguese (Portugal)" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sh", label: "Serbo-Croatian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "es", label: "Spanish" },
  { code: "es-AR", label: "Spanish (Argentina)" },
  { code: "es-419", label: "Spanish (Latin America)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "sr", label: "Serbian" },
  { code: "sv", label: "Swedish" },
  { code: "tg", label: "Tajik" },
  { code: "ta", label: "Tamil" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" },
  { code: "cy", label: "Welsh" },
];

function getTriggerLabel(selected: string[]) {
  if (selected.length === 0) {
    return "No additional languages";
  }

  if (selected.length <= 2) {
    return selected
      .map((code) => SPELLCHECKER_LANGUAGES.find((l) => l.code === code)?.label ?? code)
      .join(", ");
  }

  return `${selected.length} additional languages`;
}

export function LanguageSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

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
                {SPELLCHECKER_LANGUAGES.map(({ code, label }) => (
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
