import { Trans, useLingui } from "@lingui/react/macro";
import { CATALOG_NAMES, SHIPPED_CATALOG_TAGS } from "@meru/shared/i18n";
import { ConfigSelectField } from "@/components/config-select-field";

export function LanguageField() {
  const { t } = useLingui();

  return (
    <ConfigSelectField
      configKey="app.language"
      label={t({
        message: "Language",
        comment: "Label of the setting that chooses the language of Meru's own menus and settings",
      })}
      description={<Trans>Gmail and Google apps follow your Google account's language.</Trans>}
      items={[
        {
          value: "system",
          label: t({
            message: "System",
            comment: "Language picker option: follow the operating system's language",
          }),
        },
        ...SHIPPED_CATALOG_TAGS.map((tag) => ({ value: tag, label: CATALOG_NAMES[tag] })),
      ]}
    />
  );
}
