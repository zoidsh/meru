import { Checkbox } from "@meru/ui/components/checkbox";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@meru/ui/components/field";
import { Label } from "@meru/ui/components/label";
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

export function LanguageSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const selectedLanguages = config["spellchecker.languages"];

  function toggleLanguage(code: string, checked: boolean) {
    const updated = checked
      ? [...selectedLanguages, code]
      : selectedLanguages.filter((l) => l !== code);

    if (updated.length === 0) {
      return;
    }

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
              Select one or more languages to use for spellchecking in email compose.
            </FieldDescription>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {SPELLCHECKER_LANGUAGES.map(({ code, label }) => (
                <Label key={code} className="flex items-center gap-2 font-normal cursor-pointer">
                  <Checkbox
                    checked={selectedLanguages.includes(code)}
                    onCheckedChange={(checked) => toggleLanguage(code, checked)}
                  />
                  {label}
                </Label>
              ))}
            </div>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
