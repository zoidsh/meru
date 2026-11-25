import { useLingui } from "@lingui/react/macro";
import { RotateCcwIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import { FieldDescription } from "#ui/field.tsx";

import { ProfileDot } from "./scope-tabs.tsx";
import { differsText, splitDiffering } from "./scope.ts";
import type { ListedProfile } from "./scope.ts";

/** What a row adds for the scope it is shown in. */
export interface RowScope {
  /** The last of its descriptions: who differs, or whose value it shows. */
  line?: ReactNode;
  /** Reset, while the profile holds its own value. */
  reset?: ReactNode;
  /** The overriding profile's colour, for the bar at the card's edge. */
  bar?: string;
}

/** All profiles' line under a row some profile overrides, a badge per profile. */
export const DiffersLine = ({
  differing,
  onShow,
}: {
  differing: readonly ListedProfile[];
  onShow: (profileId: string) => void;
}) => {
  const { t } = useLingui();
  const { shown, more } = splitDiffering(differing);

  return (
    <FieldDescription className="flex flex-wrap items-center gap-1.5">
      <span>{differsText(differing.length)}</span>
      {shown.map((profile) => {
        const { name } = profile;

        return (
          <Badge
            key={profile.id}
            variant="outline"
            // The Badge gives the button its name and text, which the rule does not read.
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label
            render={<button type="button" />}
            aria-label={t({
              message: `Show ${name}`,
              comment:
                "Accessible name of the badge under a Settings row that switches to the profile's scope; {name} is the profile's name",
            })}
            onClick={() => {
              onShow(profile.id);
            }}
            className="hover:bg-muted"
          >
            <ProfileDot color={profile.color} className="size-1.5" />
            {name}
          </Badge>
        );
      })}
      {more > 0 && (
        <span>
          {t({
            message: `and ${more} more`,
            comment:
              "After the badges naming the first three profiles that set their own value of a setting in Settings; {more} is how many others do",
          })}
        </span>
      )}
    </FieldDescription>
  );
};

/** A profile's caption under a row: whose value it shows, and the app's. */
export const OverrideCaption = ({
  name,
  appValue,
}: {
  name: string;
  /** The app value as words, or nothing while the row follows it. */
  appValue: string | undefined;
}) => {
  const { t } = useLingui();

  return (
    <FieldDescription>
      {appValue === undefined
        ? t({
            message: "Same as All profiles.",
            comment:
              "Caption under a Settings row in a profile's scope while the profile has no value of its own",
          })
        : t({
            message: `Set for ${name} only. For all profiles, it's ${appValue}.`,
            comment:
              "Caption under a Settings row in a profile's scope while the profile sets its own value; {name} is the profile, {appValue} the value set under All profiles, such as On, Chime or 22:00–07:00 every day",
          })}
    </FieldDescription>
  );
};

/** Deletes the profile's own value of the row's setting. */
export const ResetButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  const { t } = useLingui();

  return (
    <Button
      variant="ghost"
      size="xs"
      aria-label={t({
        message: `Reset ${label} to All profiles`,
        comment:
          "Accessible name of the button under a Settings row in a profile's scope that drops the profile's own value; {label} is the row's label",
      })}
      onClick={onClick}
    >
      <RotateCcwIcon data-icon="inline-start" />
      {t({
        message: "Reset",
        comment:
          "Button under a Settings row in a profile's scope that drops the profile's own value so it follows All profiles again",
      })}
    </Button>
  );
};

/** The overriding profile's colour at the card's left edge, the row's height. */
export const OverrideBar = ({ color }: { color: string }) => (
  <span
    aria-hidden
    className="absolute inset-y-0 -left-4 rounded-r-[3px]"
    style={{ background: color, width: 3 }}
  />
);
