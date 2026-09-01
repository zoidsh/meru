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

export function MaturityFieldBadge({ maturity }: { maturity: FieldMaturity }) {
  return <Badge variant="outline">{maturity}</Badge>;
}
