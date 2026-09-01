import { Badge } from "@meru/ui/components/badge";

/**
 * The maturity badge on a feature that isn't stable yet.
 *
 * The two labels rank, and a feature takes the one it has earned: Experimental
 * means it may still change shape or be withdrawn, Beta that it is
 * feature-complete and still finding bugs. The set is closed so those stay the
 * whole vocabulary — Experimental deliberately reusing the prerelease update
 * channel's name, since to a user both say the same thing.
 */
export type FieldMaturity = "Experimental" | "Beta";

export function MaturityFieldBadge({ maturity }: { maturity: FieldMaturity }) {
  return <Badge variant="outline">{maturity}</Badge>;
}
