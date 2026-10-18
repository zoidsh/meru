import { Trans, useLingui } from "@lingui/react/macro";
import { CATALOG_NAMES, SHIPPED_CATALOG_TAGS } from "@meru/shared/i18n";
import { ConfigSelectField } from "@/components/config-select-field";

export function LanguageField() {
  const { t } = useLingui();

  return (
    <ConfigSelectField
      configKey="app.language"
      label={t`Language`}
      description={<Trans>Gmail and Google apps follow your Google account's language.</Trans>}
      items={[
        { value: "system", label: t`System` },
        ...SHIPPED_CATALOG_TAGS.map((tag) => ({ value: tag, label: CATALOG_NAMES[tag] })),
      ]}
    />
  );
}
