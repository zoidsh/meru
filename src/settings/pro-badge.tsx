import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { useId } from "react";

import { settingCapability } from "#core/entitled-settings.ts";
import type { Capability } from "#core/entitlement.ts";
import type { SettingKey } from "#core/settings.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "#ui/popover.tsx";

import { settingsCalls, useSettingsState } from "./sync.ts";

/**
 * Whether a row is a Pro row now: one whose capability main's `can()`
 * refuses, so never during a trial or with a license. A row asks by the
 * capability it shows or by the setting it changes, never by a name that
 * could be either, as `verificationCodes` is.
 */
export const useNeedsPro = () => {
  const required = useSettingsState("proRequired");
  const capability = (name: Capability) => required?.includes(name) ?? false;

  return {
    capability,
    setting: (key: SettingKey) => {
      const gated = settingCapability(key);

      return gated !== undefined && capability(gated);
    },
  };
};

/**
 * The Meru Pro badge beside a Pro row's label on the free version: a button
 * named by itself and the row's label, opening a popover that says the row
 * needs Meru Pro, without repeating the row, and offers Upgrade. Escape or a
 * click outside closes it and puts focus back on the badge.
 */
export const ProBadge = ({
  labelledBy,
  description,
}: {
  /** The id of the row's label, read after the badge's own name. */
  labelledBy: string;
  /** What upgrading gives here; the sentence most rows share when absent. */
  description?: string;
}) => {
  const { t } = useLingui();
  const id = useId();

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        aria-labelledby={`${id} ${labelledBy}`}
        render={
          <Badge
            variant="outline"
            // Named by the trigger's own `aria-labelledby`.
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label
            render={<button type="button" />}
            className="cursor-pointer hover:bg-muted aria-expanded:bg-muted"
          />
        }
      >
        {t({
          message: "Meru Pro",
          comment:
            "Badge beside a setting in Settings on the free version, which opens a popover saying the setting needs Meru Pro",
        })}
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>
            {t({
              message: "Requires Meru Pro",
              comment:
                "Title of the popover a Meru Pro badge opens in Settings on the free version",
            })}
          </PopoverTitle>
          <PopoverDescription>
            {description ??
              t({
                message:
                  "This setting isn't available in the free version. Upgrade to Meru Pro to use it, along with everything else Meru Pro adds.",
                comment:
                  "Sentence in the popover a Meru Pro badge opens beside a setting in Settings on the free version",
              })}
          </PopoverDescription>
        </PopoverHeader>
        <div>
          <Button
            size="sm"
            onClick={() => {
              settingsCalls().openMeruPro(undefined).catch(noop);
            }}
          >
            {t({
              message: "Upgrade",
              comment:
                "Button in the popover a Meru Pro badge opens in Settings, which opens Meru Pro's page in the default browser",
            })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
