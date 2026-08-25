import { Badge } from "@meru/ui/components/badge";
import { useIsLicenseKeyValid } from "@/lib/hooks";

/**
 * The "Meru Pro required" badge, and the marker that a field is Pro-gated.
 *
 * The marker is rendered in both states rather than only the locked one, so the
 * set of gated fields can be read off the page whatever the current entitlement.
 * That is what lets the end-to-end tests assert the locked side and the unlocked
 * side from the same walk, instead of keeping a list here that the very change
 * introducing a gap would also have updated.
 */
export function LicenseKeyRequiredFieldBadge() {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (isLicenseKeyValid) {
    return <span data-meru-pro="" hidden />;
  }

  return (
    <Badge data-meru-pro="" variant="secondary">
      Meru Pro required
    </Badge>
  );
}
