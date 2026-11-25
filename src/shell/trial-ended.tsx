import { Trans, useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { BadgeCheckIcon } from "lucide-react";
import { useId, useState } from "react";

import type { ShellState } from "#contract/shell.ts";
import { TITLEBAR_HEIGHT } from "#core/layout.ts";
import { LicenseDialog } from "#shared/license-dialog.tsx";
import { Button } from "#ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#ui/empty.tsx";

import { shellCalls } from "./sync.ts";

/**
 * The whole window while the launch waits for the person's choice after the
 * trial ended: the title bar's room to drag the window, and the message with
 * Upgrade, Enter License Key… and Continue with Free Version. Main goes on
 * with the launch once a key is accepted or the free version chosen.
 */
export const TrialEnded = ({ pro }: { pro: ShellState["pro"] }) => {
  const { t } = useLingui();
  const headingId = useId();
  const [activating, setActivating] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string>();
  const calls = shellCalls();
  const name = pro.firstProfile;

  return (
    <div className="flex h-full flex-col bg-shell">
      <div
        aria-hidden
        style={{ height: TITLEBAR_HEIGHT }}
        className="shrink-0 [app-region:drag]"
      />
      <main aria-labelledby={headingId} className="flex min-h-0 flex-1 pb-12">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BadgeCheckIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              <h1 id={headingId}>
                <Trans comment="Heading of the main window at the launch after the Meru Pro trial ended, before any profile starts">
                  Your Meru Pro trial has ended
                </Trans>
              </h1>
            </EmptyTitle>
            <EmptyDescription>
              <Trans comment="Description under Your Meru Pro trial has ended, at the launch after the trial">
                Meru is free to use with one profile. Everything from your trial
                is kept, and it comes back when you upgrade.
              </Trans>
            </EmptyDescription>
            {name !== null && (
              <EmptyDescription className="wrap-anywhere">
                {t({
                  message: `On the free version, Meru uses your first profile, ${name}.`,
                  comment:
                    "Second description under Your Meru Pro trial has ended when there are several profiles; {name} is the first profile's name",
                })}
              </EmptyDescription>
            )}
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  calls.openMeruPro(undefined).catch(noop);
                }}
              >
                {t({
                  message: "Upgrade",
                  comment:
                    "Button of the trial-ended screen at launch that opens Meru Pro's page in the default browser",
                })}
              </Button>
              <LicenseDialog
                changing={false}
                disabled={continuing || (pro.licenseRequest && !activating)}
                trigger={<Button variant="outline" size="sm" />}
                label={t({
                  message: "Enter License Key…",
                  comment:
                    "Button of the trial-ended screen at launch that opens the license key dialog; in Title Case as the screen's buttons are",
                })}
                onActivate={async (licenseKey) => {
                  setActivating(true);

                  // Main refuses one sent beside another request.
                  const result = await calls
                    .activateLicense({ licenseKey })
                    .catch(noop);

                  setActivating(false);

                  return result ?? undefined;
                }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={continuing || pro.licenseRequest}
              onClick={async () => {
                setContinuing(true);
                setError(undefined);

                const result = await calls.continueFree(undefined).catch(noop);

                // On success main goes on and this screen gives way.
                setContinuing(false);

                if (result && !result.ok) {
                  setError(result.message);
                }
              }}
            >
              {t({
                message: "Continue with Free Version",
                comment:
                  "Button of the trial-ended screen at launch that goes on with the free version, which is never asked again; in Title Case as the screen's buttons are",
              })}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </EmptyContent>
        </Empty>
      </main>
    </div>
  );
};
