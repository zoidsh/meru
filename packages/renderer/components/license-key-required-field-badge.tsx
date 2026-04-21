import { useTranslation } from "@meru/i18n/provider";
import { Badge } from "@meru/ui/components/badge";
import { useIsLicenseKeyValid } from "@/lib/hooks";

export function LicenseKeyRequiredFieldBadge() {
  const { t } = useTranslation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  return (
    !isLicenseKeyValid && <Badge variant="secondary">{t("settings.common.meruProRequired")}</Badge>
  );
}
