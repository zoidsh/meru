import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { BadgeCheckIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { EntitlementState } from "#contract/entitlement.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import { Input } from "#ui/input.tsx";

import { LicenseDialog } from "./license-dialog.tsx";
import type { ActivationResult } from "./license-dialog.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/** How long Copy shows that it copied. */
const COPIED_FOR = 2000;

type Action = "upgrade" | "retry" | "licensed" | undefined;

/** The status row: what the install has, in a line and a sentence, and what to do. */
const useStatus = (
  entitlement: EntitlementState
): { title: string; description: string; action: Action } => {
  const { t } = useLingui();
  const { status, downgradePending, trialDaysLeft, licenseKey } = entitlement;
  const endsAtQuit = t({
    message: "Pro features turn off when you quit Meru.",
    comment:
      "First sentence on the Meru Pro page of Settings when the trial or license ended while Meru was running; what Pro unlocked stays on until Meru is quit",
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
            "On the Meru Pro page of Settings during the trial; # counts the calendar days left, two or more",
        });
      } else if (days === 1) {
        ends = t({
          message: "Your trial ends tomorrow.",
          comment:
            "On the Meru Pro page of Settings on the trial's last day but one",
        });
      } else {
        ends = t({
          message: "Your trial ends today.",
          comment: "On the Meru Pro page of Settings on the trial's last day",
        });
      }

      return {
        title: t({
          message: "Meru Pro trial",
          comment: "Status on the Meru Pro page of Settings during the trial",
        }),
        description: `${ends} ${t({
          message: "Upgrade to keep every feature.",
          comment:
            "Second sentence on the Meru Pro page of Settings during the trial, beside the Upgrade button",
        })}`,
        action: "upgrade",
      };
    }
    case "licensed": {
      return {
        title: t({
          message: "Meru Pro",
          comment:
            "Status on the Meru Pro page of Settings with a license; Meru Pro is the product's name",
        }),
        description: t({
          message:
            "You have every feature, and you can use Meru for work. Thanks for your support.",
          comment: "On the Meru Pro page of Settings with a license",
        }),
        action: "licensed",
      };
    }
    case "provisional": {
      return {
        title: t({
          message: "Meru Pro",
          comment:
            "Status on the Meru Pro page of Settings while a license key carried over from an earlier Meru is not yet confirmed; Meru Pro is the product's name",
        }),
        description: t({
          message: "Meru is checking your license.",
          comment:
            "On the Meru Pro page of Settings while a license key carried over from an earlier Meru is not yet confirmed",
        }),
        action: undefined,
      };
    }
    case "trialEnded": {
      return {
        title: t({
          message: "Your trial has ended",
          comment: "Status on the Meru Pro page of Settings after the trial",
        }),
        description: downgradePending
          ? `${endsAtQuit} ${t({
              message: "Upgrade to keep them.",
              comment:
                "Second sentence on the Meru Pro page of Settings when the trial ended while Meru was running; them are Pro's features",
            })}`
          : t({
              message:
                "You're using the free version. Upgrade to get every feature back.",
              comment:
                "On the Meru Pro page of Settings after the trial, on the free version",
            }),
        action: "upgrade",
      };
    }
    case "refused": {
      const support = t({
        message: "Contact support if you think this is a mistake.",
        comment:
          "Second sentence on the Meru Pro page of Settings when the license server no longer accepts the license, after a refund or the device's removal",
      });

      return {
        title: t({
          message: "Your license can't be used",
          comment:
            "Status on the Meru Pro page of Settings when the license server no longer accepts the license, after a refund or the device's removal",
        }),
        description: `${
          downgradePending
            ? endsAtQuit
            : t({
                message: "You're using the free version.",
                comment:
                  "First sentence on the Meru Pro page of Settings when the license can't be used, on the free version",
              })
        } ${support}`,
        action: "upgrade",
      };
    }
    case "unconfirmed": {
      if (entitlement.unconfirmedReason === "clock") {
        return {
          title: t({
            message: "Your computer's date looks wrong",
            comment:
              "Status on the Meru Pro page of Settings when the computer's clock reads well before the license or trial was last confirmed",
          }),
          description: `${
            downgradePending
              ? endsAtQuit
              : t({
                  message: "Meru can't confirm Meru Pro until it's right.",
                  comment:
                    "First sentence on the Meru Pro page of Settings when the computer's date looks wrong; it is the date",
                })
          } ${t({
            message: "Set the correct date and time, then try again.",
            comment:
              "Second sentence on the Meru Pro page of Settings when the computer's date looks wrong, beside the Try again button",
          })}`,
          action: "retry",
        };
      }

      return {
        title:
          licenseKey === null
            ? t({
                message: "Meru couldn't confirm your trial",
                comment:
                  "Status on the Meru Pro page of Settings when the trial could not be confirmed for 14 days, as Meru could not reach its server",
              })
            : t({
                message: "Meru couldn't confirm your license",
                comment:
                  "Status on the Meru Pro page of Settings when the license could not be confirmed for 14 days, as Meru could not reach its server",
              }),
        description: `${
          downgradePending
            ? endsAtQuit
            : t({
                message: "You're using the free version until it's confirmed.",
                comment:
                  "First sentence on the Meru Pro page of Settings when the license or trial could not be confirmed",
              })
        } ${t({
          message: "Go online and try again.",
          comment:
            "Second sentence on the Meru Pro page of Settings when the license or trial could not be confirmed, beside the Try again button",
        })}`,
        action: "retry",
      };
    }
    case "none": {
      return {
        title: t({
          message: "Meru Pro",
          comment:
            "Status on the Meru Pro page of Settings on the free version with no trial; Meru Pro is the product's name",
        }),
        description: t({
          message:
            "You're using the free version. Upgrade to get every feature.",
          comment:
            "On the Meru Pro page of Settings on the free version with no trial",
        }),
        action: "upgrade",
      };
    }
    default: {
      return status satisfies never;
    }
  }
};

/** Copy beside the masked key, which has main put the whole key on the clipboard. */
const CopyKey = () => {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t({
          message: "Copy license key",
          comment:
            "Accessible name of the button beside the license key on the Meru Pro page of Settings that copies the whole key",
        })}
        title={t({
          message: "Copy",
          comment:
            "Tooltip of the button beside the license key on the Meru Pro page of Settings that copies the whole key",
        })}
        onClick={async () => {
          const result = await settingsCalls()
            .copyLicenseKey(undefined)
            .catch(noop);

          if (result?.ok) {
            clearTimeout(timer.current);
            setCopied(true);
            timer.current = setTimeout(() => {
              setCopied(false);
            }, COPIED_FOR);
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <output className="sr-only">
        {copied &&
          t({
            message: "Copied",
            comment:
              "Read out by screen readers once the license key is on the clipboard, from the Meru Pro page of Settings",
          })}
      </output>
    </>
  );
};

/** Device name and its Save, sent only once the person saves. */
const DeviceName = ({
  current,
  busy,
  onSave,
}: {
  current: string;
  busy: boolean;
  onSave: (name: string) => Promise<ActivationResult>;
}) => {
  const { t } = useLingui();
  // What the person typed, until it is saved; the license's name otherwise.
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const name = draft ?? current;
  const canSave = !busy && name.trim() !== current;

  const save = async () => {
    if (!canSave) {
      return;
    }

    setError(undefined);

    const result = await onSave(name);

    if (result?.ok) {
      setDraft(undefined);
    } else if (result) {
      setError(result.message);
    }

    requestAnimationFrame(() => {
      input.current?.focus();
    });
  };

  return (
    <SettingRow
      label={t({
        message: "Device name",
        comment:
          "Label of the field on the Meru Pro page of Settings that names this computer on the license",
      })}
      description={t({
        message: "This is how this computer shows up on your license.",
        comment: "Description of the Device name field in Settings",
      })}
      error={error}
    >
      {(ids) => (
        <>
          <Input
            ref={input}
            value={name}
            autoComplete="off"
            spellCheck={false}
            className="w-44"
            aria-labelledby={ids.label}
            aria-describedby={ids.description || undefined}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!canSave}
            aria-label={t({
              message: "Save device name",
              comment:
                "Accessible name of the Save button beside Device name on the Meru Pro page of Settings",
            })}
            onClick={() => {
              void save();
            }}
          >
            {t({
              message: "Save",
              comment:
                "Button beside Device name on the Meru Pro page of Settings that sends the name to the license",
            })}
          </Button>
        </>
      )}
    </SettingRow>
  );
};

type Request = "activate" | "rename" | "retry";

/**
 * Meru Pro: what the install has and what to do about it, and the license
 * key, entered in a dialog, shown masked with Copy, and this device's name.
 * One license request is out at a time, from this window or one before it.
 */
export const ProPage = () => {
  const entitlement = useSettingsState("entitlement");
  const requestOut = useSettingsState("licenseRequest");

  return (
    entitlement && (
      <Page entitlement={entitlement} requestOut={requestOut === true} />
    )
  );
};

const Page = ({
  entitlement,
  requestOut,
}: {
  entitlement: EntitlementState;
  requestOut: boolean;
}) => {
  const { t } = useLingui();
  const { title, description, action } = useStatus(entitlement);
  // Ours until main says one is out, so a quick second click sends nothing.
  const [pending, setPending] = useState<Request | null>(null);
  const busy = pending !== null || requestOut;
  const calls = settingsCalls();

  /** Sends one request unless one is out; nothing when it was not sent. */
  const send = async <Result,>(
    request: Request,
    call: () => Promise<Result>
  ): Promise<Result | undefined> => {
    if (busy) {
      return;
    }

    setPending(request);

    // Main refuses one sent beside another, as from a window opened since.
    const result = await call().catch(noop);

    setPending(null);

    return result ?? undefined;
  };

  let control: (ids: { description: string }) => ReactNode;

  switch (action) {
    case "upgrade": {
      control = (ids) => (
        <Button
          size="sm"
          aria-describedby={ids.description || undefined}
          onClick={() => {
            calls.openMeruPro(undefined).catch(noop);
          }}
        >
          {t({
            message: "Upgrade",
            comment:
              "Button on the Meru Pro page of Settings that opens Meru Pro's page in the default browser",
          })}
        </Button>
      );
      break;
    }
    case "retry": {
      control = (ids) => (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          aria-describedby={ids.description || undefined}
          onClick={() => {
            void send("retry", () => calls.retryEntitlement(undefined));
          }}
        >
          {t({
            message: "Try again",
            comment:
              "Button on the Meru Pro page of Settings that asks Meru's license server again now",
          })}
        </Button>
      );
      break;
    }
    case "licensed": {
      control = () => (
        <Badge variant="outline">
          <BadgeCheckIcon data-icon="inline-start" aria-hidden />
          {t({
            message: "Licensed",
            comment:
              "Badge on the Meru Pro page of Settings saying this computer has a license",
          })}
        </Badge>
      );
      break;
    }
    default: {
      control = () => null;
    }
  }

  const key = entitlement.licenseKey;

  return (
    <SettingGroups>
      <SettingGroup>
        <SettingRow label={title} description={description}>
          {control}
        </SettingRow>
      </SettingGroup>
      <SettingGroup
        title={t({
          message: "License",
          comment:
            "Title of the group on the Meru Pro page of Settings holding the license key and this computer's name",
        })}
      >
        <Rows>
          {[
            <SettingRow
              key="licenseKey"
              label={t({
                message: "License key",
                comment:
                  "Label of the row on the Meru Pro page of Settings that shows or enters the license key",
              })}
              description={
                key === null
                  ? t({
                      message:
                        "Already bought Meru Pro? Enter your key to unlock it.",
                      comment:
                        "Description of the License key row on the Meru Pro page of Settings with no key entered",
                    })
                  : undefined
              }
            >
              {(ids) => (
                <>
                  {key !== null && (
                    <span className="font-mono text-sm text-muted-foreground">
                      {key}
                    </span>
                  )}
                  {key !== null && <CopyKey />}
                  <LicenseDialog
                    changing={key !== null}
                    disabled={busy && pending !== "activate"}
                    describedBy={ids.description}
                    onActivate={(licenseKey) =>
                      send("activate", () =>
                        calls.activateLicense({ licenseKey })
                      )
                    }
                  />
                </>
              )}
            </SettingRow>,
            ...(entitlement.status === "licensed" &&
            entitlement.deviceName !== null
              ? [
                  <DeviceName
                    key="deviceName"
                    current={entitlement.deviceName}
                    busy={busy}
                    onSave={(name) =>
                      send("rename", () => calls.setDeviceName({ name }))
                    }
                  />,
                ]
              : []),
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
