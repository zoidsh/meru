import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import { TRIAL_FOOTER_HEIGHT } from "#core/layout.ts";
import { Button } from "#ui/button.tsx";

import { shellCalls } from "./sync.ts";

/**
 * The footer along the shell below the page while a Pro trial runs: the
 * days left, counted in the device's calendar, and Upgrade now.
 */
export const TrialFooter = ({ days }: { days: number }) => {
  const { t } = useLingui();
  let text: string;

  if (days >= 2) {
    text = t({
      message: plural(days, {
        one: "Pro trial ends in # day",
        other: "Pro trial ends in # days",
      }),
      comment:
        "In the footer of the main window during the Meru Pro trial; # counts the calendar days left, two or more",
    });
  } else if (days === 1) {
    text = t({
      message: "Pro trial ends tomorrow",
      comment:
        "In the footer of the main window on the Meru Pro trial's last day but one",
    });
  } else {
    text = t({
      message: "Pro trial ends today",
      comment:
        "In the footer of the main window on the Meru Pro trial's last day",
    });
  }

  return (
    <footer
      aria-label={t({
        message: "Meru Pro trial",
        comment:
          "Accessible name of the footer of the main window that counts the days left of the Meru Pro trial",
      })}
      // On the shell, so its muted text takes the shell's.
      data-tinted
      style={{ height: TRIAL_FOOTER_HEIGHT }}
      className="flex shrink-0 items-center justify-center gap-2"
    >
      <span className="text-xs font-medium text-muted-foreground">{text}</span>
      <Button
        variant="outline"
        size="xs"
        onClick={() => {
          shellCalls().openMeruPro(undefined).catch(noop);
        }}
      >
        {t({
          message: "Upgrade now",
          comment:
            "Button in the trial footer of the main window that opens Meru Pro's page in the default browser",
        })}
      </Button>
    </footer>
  );
};
