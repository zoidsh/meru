import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { useId, useState } from "react";

import type { ShellState } from "#contract/shell.ts";
import { useLicenseStatus } from "#shared/license-status.ts";
import { Button } from "#ui/button.tsx";

import { shellCalls } from "./sync.ts";
import { TitledOverlay } from "./titled-overlay.tsx";

/**
 * The card main opens once, at a launch whose license or trial could not be
 * confirmed, before anything else is open: Settings' own words for it, with
 * Try again, and Continue with free version, which closes it as Escape does.
 */
export const LicenseNotice = ({ pro }: { pro: ShellState["pro"] }) => {
  const { t } = useLingui();
  const titleId = useId();
  const [retrying, setRetrying] = useState(false);
  const { title, description } = useLicenseStatus(pro.standing);
  const calls = shellCalls();

  return (
    <TitledOverlay
      kind="license"
      title={title}
      titleId={titleId}
      description={description}
    >
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            calls.closeOverlay({});
          }}
        >
          {t({
            message: "Continue with free version",
            comment:
              "Button of the main window's notice at launch that the license or trial could not be confirmed; it closes the notice and Meru goes on as the free version",
          })}
        </Button>
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
              "Button of the main window's notice at launch that the license or trial could not be confirmed; it asks Meru's license server again now",
          })}
        </Button>
      </div>
    </TitledOverlay>
  );
};
