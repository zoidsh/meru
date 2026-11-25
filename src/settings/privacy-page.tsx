import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import type { PRIVACY_PAGE_KEYS } from "#contract/settings.ts";
import { Button } from "#ui/button.tsx";
import { Switch } from "#ui/switch.tsx";

import { useNeedsPro } from "./pro-badge.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";
import { TrustedSitesDialog } from "./trusted-sites-dialog.tsx";

/**
 * The content blocker's two switches, asking before a link opens and the
 * sites trusted not to ask: app settings alone, so the page has no scopes.
 */
export const PrivacyPage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");
  const trustedSites = useSettingsState("trustedSites");
  const needsPro = useNeedsPro();

  if (!settings || !trustedSites) {
    return null;
  }

  const calls = settingsCalls();

  const switchRow = (
    key: (typeof PRIVACY_PAGE_KEYS)[number],
    label: string,
    description?: string
  ) => {
    const pro = needsPro.setting(key);

    return (
      <SettingRow
        key={key}
        label={label}
        description={description}
        disabled={pro}
        pro={pro}
      >
        {(ids) => (
          <Switch
            checked={settings[key]}
            disabled={pro}
            aria-labelledby={ids.label}
            aria-describedby={ids.description || undefined}
            onCheckedChange={(checked) => {
              calls.update({ key, value: checked }).catch(noop);
            }}
          />
        )}
      </SettingRow>
    );
  };

  const count = trustedSites.length;
  const sitesOff = !settings.confirmLinks;
  let sitesDescription: string;

  if (sitesOff) {
    sitesDescription = t({
      message: "Turn on Ask before opening links first.",
      comment:
        "Description of the Trusted sites row in Settings while Ask before opening links, the switch above it, is off; it says what to do to use the row",
    });
  } else if (count === 0) {
    sitesDescription = t({
      message: "You haven't trusted any sites yet.",
      comment:
        "Description of the Trusted sites row in Settings when no site is trusted",
    });
  } else {
    sitesDescription = t({
      message: plural(count, {
        one: "Links to # site open without asking.",
        other: "Links to # sites open without asking.",
      }),
      comment:
        "Description of the Trusted sites row in Settings; # counts the sites whose links open in the default browser without Meru asking first",
    });
  }

  return (
    <>
      <SettingGroups>
        <SettingGroup
          title={t({
            message: "Content blocker",
            comment:
              "Title of the group of Settings that block ads and trackers in Meru's pages",
          })}
          description={t({
            message: "Works on every page in Meru, including Gmail.",
            comment: "Description of the Content blocker group in Settings",
          })}
        >
          <Rows>
            {[
              switchRow(
                "blockAds",
                t({
                  message: "Block ads",
                  comment:
                    "Label of the switch in Settings that blocks ads in Meru's pages",
                })
              ),
              switchRow(
                "blockTrackers",
                t({
                  message: "Block trackers",
                  comment:
                    "Label of the switch in Settings that blocks trackers, including the pixels that tell a sender an email was opened",
                }),
                t({
                  message: "Stops scripts that follow you from site to site.",
                  comment:
                    "Description of the Block trackers switch in Settings",
                })
              ),
            ]}
          </Rows>
        </SettingGroup>
        <SettingGroup
          title={t({
            message: "Links",
            comment:
              "Title of the group of Settings for links that leave Meru for the default browser",
          })}
        >
          <Rows>
            {[
              switchRow(
                "confirmLinks",
                t({
                  message: "Ask before opening links",
                  comment:
                    "Label of the switch in Settings that has Meru ask before a link from a page opens in the default browser",
                }),
                t({
                  message:
                    "Meru asks before a link opens in your default browser.",
                  comment:
                    "Description of the Ask before opening links switch in Settings",
                })
              ),
              <SettingRow
                key="trustedSites"
                label={t({
                  message: "Trusted sites",
                  comment:
                    "Label of the row in Settings for the sites whose links open in the default browser without asking",
                })}
                description={sitesDescription}
                disabled={sitesOff}
              >
                {(ids) => (
                  <TrustedSitesDialog
                    sites={trustedSites}
                    disabled={sitesOff}
                    describedBy={ids.description}
                  />
                )}
              </SettingRow>,
            ]}
          </Rows>
        </SettingGroup>
      </SettingGroups>
      <p className="flex flex-wrap items-baseline gap-x-1 text-sm text-muted-foreground">
        {t({
          message:
            "You can delete cookies and cached files for each profile on its page.",
          comment:
            "Line under the Privacy & Security page in Settings, before a button that opens the Profiles section",
        })}
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={() => {
            calls
              .openPage({ section: "profiles", profileId: null })
              .catch(noop);
          }}
        >
          {t({
            message: "Go to Profiles",
            comment:
              "Button under the Privacy & Security page in Settings that opens the Profiles section; Profiles is the section's name",
          })}
        </Button>
      </p>
    </>
  );
};
