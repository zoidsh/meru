import { Badge } from "@meru/ui/components/badge";
import { useIsLicenseKeyValid } from "@/lib/hooks";

export function LicenseKeyRequiredFieldBadge() {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  return !isLicenseKeyValid && <Badge variant="secondary">Meru Pro Required</Badge>;
}
