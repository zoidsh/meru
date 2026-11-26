import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import type { SettingsState } from "#contract/settings.ts";
import { UPDATE_CHANNELS } from "#core/updates.ts";
import { Button } from "#ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { SettingGroup } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls } from "./sync.ts";

type Updates = SettingsState["updates"];

/** The status row's words and its one button, by where updating stands. */
const useStatusRow = ({ status, version: offered, lastChecked }: Updates) => {
  const { t, i18n } = useLingui();
  const checkNow = {
    label: t({
      message: "Check now",
      comment:
        "Button on the About page of Settings that checks for a new version of Meru at once",
    }),
    call: "checkForUpdates" as const,
  };
  const version = offered ?? "";

  switch (status) {
    case "checking": {
      return {
        title: t({
          message: "Checking for updates…",
          comment:
            "On the About page of Settings while Meru asks whether a new version is out",
        }),
        button: checkNow,
        busy: true,
      };
    }
    case "upToDate": {
      const when = new Intl.DateTimeFormat(i18n.locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(lastChecked ?? 0);

      return {
        title: t({
          message: "Meru is up to date",
          comment:
            "On the About page of Settings once a check found no newer version of Meru",
        }),
        description: t({
          message: `Last checked ${when}.`,
          comment:
            "Under Meru is up to date on the About page of Settings; {when} is the date and time of the last check, such as Nov 26, 2026, 9:41 AM",
        }),
        button: checkNow,
      };
    }
    case "downloading": {
      return {
        title: t({
          message: `Downloading Meru ${version}…`,
          comment:
            "On the About page of Settings while a new version downloads; {version} is its version number, such as 4.2.0",
        }),
        button: checkNow,
        busy: true,
      };
    }
    case "ready": {
      return {
        title: t({
          message: `Meru ${version} is ready to install`,
          comment:
            "On the About page of Settings once a new version has downloaded; {version} is its version number, such as 4.2.0",
        }),
        description: t({
          message: "Meru installs it when you quit.",
          comment:
            "Under Meru … is ready to install on the About page of Settings",
        }),
        button: {
          label: t({
            message: "Restart now",
            comment:
              "Button on the About page of Settings that quits Meru, installs the downloaded version and opens Meru again",
          }),
          call: "restartToUpdate" as const,
        },
      };
    }
    case "failed": {
      return {
        title: t({
          message: "Couldn't check for updates",
          comment:
            "On the About page of Settings when the last check for a new version, or its download, failed",
        }),
        description: t({
          message: "Try again later.",
          comment:
            "Under Couldn't check for updates on the About page of Settings",
        }),
        button: checkNow,
      };
    }
    case "unverified": {
      return {
        title: t({
          message: `Meru ${version} couldn't be verified, so it wasn't installed.`,
          comment:
            "On the About page of Settings when a downloaded version's signature did not match; {version} is its version number, such as 4.2.0",
        }),
        button: {
          label: t({
            message: "Download",
            comment:
              "Button on the About page of Settings that opens the release page of a version Meru could not verify, to download it by hand",
          }),
          call: "openUpdateRelease" as const,
        },
      };
    }
    default: {
      return {
        title: t({
          message: "Check for updates",
          comment:
            "On the About page of Settings before Meru has checked for a new version",
        }),
        button: checkNow,
      };
    }
  }
};

/**
 * The status row, its text a live region so each change is read out once,
 * with the one thing to do where updating stands.
 */
const StatusRow = ({ updates }: { updates: Updates }) => {
  const { title, description, button, busy } = useStatusRow(updates);

  return (
    <SettingRow live label={title} description={description}>
      {(ids) => (
        // Still focusable while it checks, so focus stays where it was;
        // shadcn's Button dims only a `:disabled` one, hence the class.
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          focusableWhenDisabled
          className="aria-disabled:opacity-50"
          aria-describedby={ids.description || undefined}
          onClick={() => {
            settingsCalls()[button.call]({}).catch(noop);
          }}
        >
          {button.label}
        </Button>
      )}
    </SettingRow>
  );
};

/** The About page's Updates group, or one line where the build cannot update itself. */
export const UpdatesGroup = ({
  settings,
  updates,
}: {
  settings: Pick<SettingsState["settings"], "autoUpdate" | "updateChannel">;
  updates: Updates;
}) => {
  const { t } = useLingui();

  if (updates.status === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        {t({
          message: "This build doesn't update itself.",
          comment:
            "On the About page of Settings in place of the Updates group, for a build of Meru that cannot install new versions",
        })}
      </p>
    );
  }

  const calls = settingsCalls();
  const channels = {
    stable: t({
      message: "Stable",
      comment:
        "Option of the Release channel menu on the About page of Settings: only finished releases of Meru",
    }),
    beta: t({
      message: "Beta",
      comment:
        "Option of the Release channel menu on the About page of Settings: test versions of Meru before they are released",
    }),
  };

  return (
    <SettingGroup
      title={t({
        message: "Updates",
        comment:
          "Title of the group on the About page of Settings for checking for and installing new versions of Meru",
      })}
    >
      <Rows>
        {[
          <SettingRow
            key="autoUpdate"
            label={t({
              message: "Check for updates automatically",
              comment:
                "Label of the switch on the About page of Settings that has Meru check for new versions by itself",
            })}
            description={t({
              message:
                "Meru downloads updates in the background and installs them when you quit.",
              comment:
                "Description of the Check for updates automatically switch on the About page of Settings",
            })}
          >
            {(ids) => (
              <Switch
                checked={settings.autoUpdate}
                aria-labelledby={ids.label}
                aria-describedby={ids.description || undefined}
                onCheckedChange={(checked) => {
                  calls
                    .update({ key: "autoUpdate", value: checked })
                    .catch(noop);
                }}
              />
            )}
          </SettingRow>,
          <SettingRow
            key="updateChannel"
            label={t({
              message: "Release channel",
              comment:
                "Label of the menu on the About page of Settings choosing whether Meru updates to beta versions too",
            })}
            description={t({
              message:
                "Beta gets new features sooner, but it may have more bugs.",
              comment:
                "Description of the Release channel menu on the About page of Settings",
            })}
          >
            {(ids) => (
              <Select
                items={UPDATE_CHANNELS.map((channel) => ({
                  value: channel,
                  label: channels[channel],
                }))}
                value={settings.updateChannel}
                onValueChange={(channel) => {
                  if (channel !== null) {
                    calls
                      .update({ key: "updateChannel", value: channel })
                      .catch(noop);
                  }
                }}
              >
                <SelectTrigger
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description || undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {UPDATE_CHANNELS.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {channels[channel]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </SettingRow>,
          <StatusRow key="status" updates={updates} />,
        ]}
      </Rows>
    </SettingGroup>
  );
};
