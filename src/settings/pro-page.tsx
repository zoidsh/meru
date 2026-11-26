import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { BadgeCheckIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import type { EntitlementState } from "#contract/entitlement.ts";
import { LicenseDialog } from "#shared/license-dialog.tsx";
import type { ActivationResult } from "#shared/license-dialog.tsx";
import { useLicenseStatus } from "#shared/license-status.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import { Input } from "#ui/input.tsx";

import { CopyButton } from "./copy-button.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

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
  const { title, description, action } = useLicenseStatus({
    ...entitlement,
    hasLicenseKey: entitlement.licenseKey !== null,
  });
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
      control = action satisfies never;
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
                  {key !== null && (
                    <CopyButton
                      name={t({
                        message: "Copy license key",
                        comment:
                          "Accessible name of the button beside the license key on the Meru Pro page of Settings that copies the whole key",
                      })}
                      copy={() =>
                        calls
                          .copyLicenseKey(undefined)
                          .then((result) => result.ok)
                      }
                    />
                  )}
                  <LicenseDialog
                    changing={key !== null}
                    disabled={busy && pending !== "activate"}
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        aria-describedby={ids.description || undefined}
                      />
                    }
                    accessibleName={
                      key === null
                        ? undefined
                        : t({
                            message: "Change license key",
                            comment:
                              "Accessible name of the Change… button beside the license key on the Meru Pro page of Settings",
                          })
                    }
                    label={
                      key === null
                        ? t({
                            message: "Enter license key…",
                            comment:
                              "Button on the Meru Pro page of Settings that opens a dialog to enter a license key",
                          })
                        : t({
                            message: "Change…",
                            comment:
                              "Button beside the license key on the Meru Pro page of Settings that opens a dialog to enter another key",
                          })
                    }
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
