import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { useId, useState } from "react";

import type { ShellState } from "#contract/shell.ts";
import { useLicenseStatus } from "#shared/license-status.ts";
import { Button } from "#ui/button.tsx";

import { shellCalls } from "./sync.ts";
import { TitledOverlay } from "./titled-overlay.tsx";

/**
 * The notice main opens once per launch when the license or trial could not
 * be confirmed, or Meru Pro ends at the next launch: Settings' own words for
 * it, with Upgrade or Try again. Escape and its buttons close it.
 */
export const LicenseNotice = ({ pro }: { pro: ShellState["pro"] }) => {
  const { t } = useLingui();
  const titleId = useId();
  const [retrying, setRetrying] = useState(false);
  const { title, description, action } = useLicenseStatus(pro.standing);
  const calls = shellCalls();
  const close = () => {
    calls.closeOverlay({});
  };
  // Pro still holds until Meru quits, so there is no free version to go on with yet.
  const freeNow =
    pro.standing.status === "unconfirmed" && !pro.standing.downgradePending;

  return (
    <TitledOverlay
      kind="license"
      title={title}
      titleId={titleId}
      description={description}
    >
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={close}>
          {action === "retry" && freeNow
            ? t({
                message: "Continue with free version",
                comment:
                  "Button of the main window's notice that the license or trial could not be confirmed; it closes the notice and Meru goes on as the free version",
              })
            : t({
                message: "Not now",
                comment:
                  "Button of the main window's notice about Meru Pro that closes it, changing nothing",
              })}
        </Button>
        {action === "retry" ? (
          <Button
            size="sm"
            autoFocus
            disabled={retrying || pro.licenseRequest}
            onClick={async () => {
              setRetrying(true);
              // Main closes the notice once the license is confirmed.
              await calls.retryEntitlement(undefined).catch(noop);
              setRetrying(false);
            }}
          >
            {t({
              message: "Try again",
              comment:
                "Button of the main window's notice that the license or trial could not be confirmed; it asks Meru's license server again now",
            })}
          </Button>
        ) : (
          <Button
            size="sm"
            autoFocus
            onClick={() => {
              calls.openMeruPro(undefined).catch(noop);
              close();
            }}
          >
            {t({
              message: "Upgrade",
              comment:
                "Button of the main window's notice that Meru Pro ends when Meru quits; it opens Meru Pro's page in the default browser",
            })}
          </Button>
        )}
      </div>
    </TitledOverlay>
  );
};
