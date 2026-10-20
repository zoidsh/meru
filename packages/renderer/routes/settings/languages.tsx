import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@meru/ui/components/field";
import { cn } from "@meru/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { useMemo } from "react";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

export function LanguagesSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  // The spellchecker's languages are named in the interface language.
  const { i18n, t } = useLingui();

  const displayNames = useMemo(
    () => new Intl.DisplayNames([i18n.locale], { type: "language" }),
    [i18n.locale],
  );

  // A unit list joins with a bare comma in English, where a conjunction would
  // put "and" between the two.
  const listFormat = useMemo(
    () => new Intl.ListFormat(i18n.locale, { type: "unit", style: "short" }),
    [i18n.locale],
  );

  const getLanguageLabel = (code: string) => displayNames.of(code) ?? code;

  const { data: availableLanguages = [] } = useQuery({
    queryKey: ["spellchecker.availableLanguages"],
    queryFn: () => ipc.main.invoke("spellchecker.getAvailableLanguages"),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: osLocale = "" } = useQuery({
    queryKey: ["spellchecker.osLocale"],
    queryFn: () => ipc.main.invoke("spellchecker.getOsLocale"),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!config) {
    return;
  }

  const selected = config["spellchecker.languages"];

  const languages = availableLanguages
    .filter((code) => code !== osLocale)
    .map((code) => ({ code, label: getLanguageLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  function getTriggerLabel() {
    if (selected.length === 0) {
      return t`No additional languages selected`;
    }

    if (selected.length <= 2) {
      return listFormat.format(selected.map(getLanguageLabel));
    }

    const selectedCount = selected.length;

    return t({
      message: plural(selectedCount, {
        one: "# additional language",
        other: "# additional languages",
      }),
      comment:
        "Spellchecker languages chosen beyond the system language, counted once there are more than two to name",
    });
  }

  function toggleLanguage(code: string, checked: boolean) {
    const updated = checked ? [...selected, code] : selected.filter((l) => l !== code);

    configMutation.mutate({ "spellchecker.languages": updated });
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.languages)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label" className="flex items-center gap-2">
              <Trans comment="Setting that picks the languages the spellchecker checks">
                Spellchecker
              </Trans>
              <LicenseKeyRequiredFieldBadge />
            </FieldLegend>
            <FieldDescription>
              <Trans>
                Select additional languages for spellchecking alongside the system language.
              </Trans>
            </FieldDescription>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    disabled={!isLicenseKeyValid}
                    className={cn(
                      "w-full justify-between font-normal",
                      selected.length === 0 && "text-muted-foreground",
                    )}
                  >
                    <span className="truncate">{getTriggerLabel()}</span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start">
                {osLocale && (
                  <>
                    <DropdownMenuCheckboxItem checked disabled>
                      {getLanguageLabel(osLocale)}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                  </>
                )}
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
