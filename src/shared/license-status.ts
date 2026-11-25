import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

import type { LicenseStanding } from "#contract/entitlement.ts";

/** What the status offers: Upgrade, Try again, or nothing to do but say so. */
export type LicenseAction = "upgrade" | "retry" | "licensed";

/**
 * What the install has of Meru Pro, in a line and a sentence, and what to do,
 * as Settings' Meru Pro page says it, and the main window's card at a launch
 * whose license could not be confirmed.
 */
export const useLicenseStatus = (
  standing: LicenseStanding
): { title: string; description: string; action: LicenseAction } => {
  const { t } = useLingui();
  const { status, downgradePending, trialDaysLeft, hasLicenseKey } = standing;
  const endsAtQuit = t({
    message: "Pro features turn off when you quit Meru.",
    comment:
      "First sentence about Meru Pro (in Settings) when the trial or license ended while Meru was running; what Pro unlocked stays on until Meru is quit",
  });

  switch (status) {
    case "trial": {
      const days = trialDaysLeft ?? 0;
      let ends: string;

      if (days >= 2) {
        ends = t({
          message: plural(days, {
            one: "Your trial ends in # day.",
            other: "Your trial ends in # days.",
          }),
          comment:
            "About Meru Pro (in Settings) during the trial; # counts the calendar days left, two or more",
        });
      } else if (days === 1) {
        ends = t({
          message: "Your trial ends tomorrow.",
          comment:
            "About Meru Pro (in Settings) on the trial's last day but one",
        });
      } else {
        ends = t({
          message: "Your trial ends today.",
          comment: "About Meru Pro (in Settings) on the trial's last day",
        });
      }

      return {
        title: t({
          message: "Meru Pro trial",
          comment: "Status about Meru Pro (in Settings) during the trial",
        }),
        description: `${ends} ${t({
          message: "Upgrade to keep every feature.",
          comment:
            "Second sentence about Meru Pro (in Settings) during the trial, beside the Upgrade button",
        })}`,
        action: "upgrade",
      };
    }
    case "licensed": {
      return {
        title: t({
          message: "Meru Pro",
          comment:
            "Status about Meru Pro (in Settings) with a license; Meru Pro is the product's name",
        }),
        description: t({
          message:
            "You have every feature, and you can use Meru for work. Thanks for your support.",
          comment: "About Meru Pro (in Settings) with a license",
        }),
        action: "licensed",
      };
    }
    case "provisional": {
      return {
        title: t({
          message: "Meru Pro",
          comment:
            "Status about Meru Pro (in Settings) while a license key carried over from an earlier Meru is not yet confirmed; Meru Pro is the product's name",
        }),
        description: t({
          message: "Meru is checking your license.",
          comment:
            "About Meru Pro (in Settings) while a license key carried over from an earlier Meru is not yet confirmed, beside the Try again button",
        }),
        action: "retry",
      };
    }
    case "trialEnded": {
      return {
        title: t({
          message: "Your trial has ended",
          comment:
            "Status about Meru Pro (in Settings, and alone as a short notice in the main window) after the trial",
        }),
        description: downgradePending
          ? `${endsAtQuit} ${t({
              message: "Upgrade to keep them.",
              comment:
                "Second sentence about Meru Pro (in Settings) when the trial ended while Meru was running; them are Pro's features",
            })}`
          : t({
              message:
                "You're using the free version. Upgrade to get every feature back.",
              comment:
                "About Meru Pro (in Settings) after the trial, on the free version",
            }),
        action: "upgrade",
      };
    }
    case "refused": {
      const support = t({
        message: "Contact support if you think this is a mistake.",
        comment:
          "Second sentence about Meru Pro (in Settings) when the license server no longer accepts the license, after a refund or the device's removal",
      });

      return {
        title: t({
          message: "Your license can't be used",
          comment:
            "Status about Meru Pro (in Settings, and alone as a short notice in the main window) when the license server no longer accepts the license, after a refund or the device's removal",
        }),
        description: `${
          downgradePending
            ? endsAtQuit
            : t({
                message: "You're using the free version.",
                comment:
                  "First sentence about Meru Pro (in Settings) when the license can't be used, on the free version",
              })
        } ${support}`,
        action: "upgrade",
      };
    }
    case "unconfirmed": {
      if (standing.unconfirmedReason === "clock") {
        return {
          title: t({
            message: "Your computer's date looks wrong",
            comment:
              "Status about Meru Pro (in Settings and in the main window's card at a launch it could not confirm) when the computer's clock reads well before the license or trial was last confirmed",
          }),
          description: `${
            downgradePending
              ? endsAtQuit
              : t({
                  message: "Meru can't confirm Meru Pro until it's right.",
                  comment:
                    "First sentence about Meru Pro (in Settings and in the main window's card at a launch it could not confirm) when the computer's date looks wrong; it is the date",
                })
          } ${t({
            message: "Set the correct date and time, then try again.",
            comment:
              "Second sentence about Meru Pro (in Settings and in the main window's card at a launch it could not confirm) when the computer's date looks wrong, beside the Try again button",
          })}`,
          action: "retry",
        };
      }

      return {
        title: hasLicenseKey
          ? t({
              message: "Meru couldn't confirm your license",
              comment:
                "Status about Meru Pro (in Settings and in the main window's card at a launch it could not confirm) when the license could not be confirmed for 14 days, as Meru could not reach its server",
            })
          : t({
              message: "Meru couldn't confirm your trial",
              comment:
                "Status about Meru Pro (in Settings and in the main window's card at a launch it could not confirm) when the trial could not be confirmed for 14 days, as Meru could not reach its server",
            }),
        description: `${
          downgradePending
            ? endsAtQuit
            : t({
                message: "You're using the free version until it's confirmed.",
                comment:
                  "First sentence about Meru Pro (in Settings and in the main window's card at a launch it could not confirm) when the license or trial could not be confirmed",
              })
        } ${t({
          message: "Go online and try again.",
          comment:
            "Second sentence about Meru Pro (in Settings and in the main window's card at a launch it could not confirm) when the license or trial could not be confirmed, beside the Try again button",
        })}`,
        action: "retry",
      };
    }
    case "none": {
      return {
        title: t({
          message: "Meru Pro",
          comment:
            "Status about Meru Pro (in Settings) on the free version with no trial; Meru Pro is the product's name",
        }),
        description: t({
          message:
            "You're using the free version. Upgrade to get every feature.",
          comment:
            "About Meru Pro (in Settings) on the free version with no trial",
        }),
        action: "upgrade",
      };
    }
    default: {
      return status satisfies never;
    }
  }
};
