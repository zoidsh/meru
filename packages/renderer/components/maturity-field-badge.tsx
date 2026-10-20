import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Badge } from "@meru/ui/components/badge";

/**
 * The maturity badge on a feature that isn't stable yet.
 *
 * The two labels rank, and a feature takes the one it has earned: Experimental
 * means it may still change shape or be withdrawn, Beta that it is
 * feature-complete and still finding bugs. The set is closed so those stay the
 * whole vocabulary — Beta doubling as the prerelease update channel's name,
 * which is the same split Apple runs: Beta names a build you opt into,
 * Experimental a single feature that might not survive.
 */
export type FieldMaturity = "Experimental" | "Beta";

// lingui-set comment="Badge beside a setting whose feature isn't stable yet"
const maturityLabels: Record<FieldMaturity, MessageDescriptor> = {
  Experimental: msg`Experimental`,
  Beta: msg`Beta`,
};
// lingui-reset

export function MaturityFieldBadge({ maturity }: { maturity: FieldMaturity }) {
  const { t } = useLingui();

  return <Badge variant="outline">{t(maturityLabels[maturity])}</Badge>;
}
