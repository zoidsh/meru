import { useLingui } from "@lingui/react/macro";

import type { GMAIL_PAGE_KEYS, SettingChange } from "#contract/settings.ts";
import { VERIFICATION_CODE_COPY_MODES } from "#core/settings.ts";
import type { VerificationCodeCopyMode } from "#core/settings.ts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { useNeedsPro } from "./pro-badge.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

type SwitchKey = Exclude<
  (typeof GMAIL_PAGE_KEYS)[number],
  "verificationCodeCopyMode"
>;

/**
 * Gmail's page, its conversations and verification codes: app settings
 * alone, which no profile overrides, so the page has no scopes.
 */
export const GmailPage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");
  const needsPro = useNeedsPro();

  if (!settings) {
    return null;
  }

  const calls = settingsCalls();
  const write = (change: SettingChange) => {
    void calls.update(change);
  };
  const codesPro = needsPro.capability("verificationCodes");
  // On the free version the rows say Pro, not to turn the switch on.
  const codesOff = !settings.verificationCodes && !codesPro;
  const codesOffReason = t({
    message: "Turn on Find verification codes first.",
    comment:
      "Description of a verification code setting on the Gmail page in Settings while Find verification codes, the switch above it, is off; it says what to do to use the setting",
  });

  /** A row under Find verification codes is disabled while it is off, its value kept. */
  const switchRow = (
    key: SwitchKey,
    label: string,
    description: string | undefined,
    dependent = false
  ) => {
    const off = dependent && codesOff;
    const pro = needsPro.setting(key);
    const disabled = off || pro;

    return (
      <SettingRow
        key={key}
        label={label}
        description={off ? codesOffReason : description}
        disabled={disabled}
        pro={pro}
      >
        {(ids) => (
          <Switch
            checked={settings[key]}
            disabled={disabled}
            aria-labelledby={ids.label}
            aria-describedby={ids.description || undefined}
            onCheckedChange={(checked) => {
              write({ key, value: checked });
            }}
          />
        )}
      </SettingRow>
    );
  };

  const copyModes: Record<VerificationCodeCopyMode, string> = {
    notificationClick: t({
      message: "When you click Copy",
      comment:
        "Choice of the Copy code menu in Settings: the code is copied when the Copy button on its notification is clicked",
    }),
    immediately: t({
      message: "As soon as it arrives",
      comment:
        "Choice of the Copy code menu in Settings: the code is copied as soon as the email with it arrives",
    }),
  };

  return (
    <SettingGroups>
      <SettingGroup
        title={t({
          message: "Gmail appearance",
          comment:
            "Title of the group of Settings that hide or change parts of how the Gmail page looks",
        })}
        description={t({
          message:
            "These change how Gmail looks in Meru. Your Gmail settings stay the same.",
          comment:
            "Description of the Gmail appearance group in Settings: these settings change only what Meru shows, never the person's settings in Gmail",
        })}
      >
        <Rows>
          {[
            switchRow(
              "hidePromoBanner",
              t({
                message: "Hide promotions",
                comment:
                  "Label of the switch in Settings that hides the promotional banners Google shows above the inbox, such as offers to upgrade to Google Workspace",
              }),
              t({
                message: "Hides offers from Google above your inbox.",
                comment:
                  "Description of the Hide promotions switch in Settings",
              })
            ),
            switchRow(
              "hideUpgradeButton",
              t({
                message: "Hide Upgrade button",
                comment:
                  "Label of the switch in Settings that hides the Upgrade button Gmail shows at the top of its page; Upgrade is the label of Gmail's button, written as Gmail writes it, not Meru Pro's",
              }),
              undefined
            ),
            switchRow(
              "hideInboxFooter",
              t({
                message: "Hide inbox footer",
                comment:
                  "Label of the switch in Settings that hides the footer Gmail shows under the inbox",
              }),
              t({
                message:
                  "Hides the storage and account details below your inbox.",
                comment:
                  "Description of the Hide inbox footer switch in Settings: Gmail's footer shows the storage used, policies and account activity",
              })
            ),
            switchRow(
              "extendDarkTheme",
              t({
                message: "Extend Gmail's dark theme",
                comment:
                  "Label of the switch in Settings that darkens the parts of Gmail its own dark theme leaves white, such as the conversation view and the compose window",
              }),
              t({
                message:
                  "Darkens the conversation view, the compose window, menus and dialogs that Gmail leaves white. Only works when Gmail itself is set to Dark.",
                comment:
                  "Description of the Extend Gmail's dark theme switch in Settings; Dark is the name of the theme chosen in Gmail's own settings, as Gmail writes it",
              })
            ),
          ]}
        </Rows>
      </SettingGroup>
      <SettingGroup
        title={t({
          message: "Conversations",
          comment:
            "Title of the group of Settings for how Gmail shows an open conversation",
        })}
      >
        <Rows>
          {[
            switchRow(
              "reverseConversation",
              t({
                message: "Newest message first",
                comment:
                  "Label of the switch in Settings that shows an open Gmail conversation with its latest message at the top",
              }),
              t({
                message:
                  "Shows the newest message at the top of a conversation.",
                comment:
                  "Description of the Newest message first switch in Settings; only what Meru shows changes, not the order in Gmail",
              })
            ),
            switchRow(
              "moveAttachmentsToTop",
              t({
                message: "Show attachments first",
                comment:
                  "Label of the switch in Settings that shows each Gmail message's attachments above its text",
              }),
              t({
                message:
                  "Shows attachments above the message instead of below it.",
                comment:
                  "Description of the Show attachments first switch in Settings",
              })
            ),
            switchRow(
              "showTrimmedContent",
              t({
                message: "Show trimmed content",
                comment:
                  "Label of the switch in Settings that shows the quoted text Gmail trims; trimmed content is Gmail's own name for it",
              }),
              t({
                message:
                  "Shows the quoted text that Gmail hides behind the ••• button.",
                comment:
                  "Description of the Show trimmed content switch in Settings; ••• is the label of Gmail's button that shows trimmed content, kept as is",
              })
            ),
          ]}
        </Rows>
      </SettingGroup>
      <SettingGroup
        title={t({
          message: "Verification codes",
          comment:
            "Title of the group of Settings for one-time codes found in new mail",
        })}
      >
        <Rows>
          {[
            switchRow(
              "verificationCodes",
              t({
                message: "Find verification codes",
                comment:
                  "Label of the switch in Settings that looks for a verification code in each new email",
              }),
              t({
                message:
                  "Shows a notification with the code when an email has one.",
                comment:
                  "Description of the Find verification codes switch in Settings",
              })
            ),
            switchRow(
              "verificationCodesDuringDoNotDisturb",
              t({
                message: "Show during Do Not Disturb",
                comment:
                  "Label of the switch in Settings that lets a verification code's notification show while Do Not Disturb or quiet hours hold other notifications",
              }),
              t({
                message:
                  "Shows codes even when Do Not Disturb or quiet hours are on.",
                comment:
                  "Description of the Show during Do Not Disturb switch in Settings; Do Not Disturb and quiet hours are the Notifications page's settings of those names",
              }),
              true
            ),
            <SettingRow
              key="verificationCodeCopyMode"
              label={t({
                message: "Copy code",
                comment:
                  "Label of the menu in Settings choosing when a verification code is copied",
              })}
              description={codesOff ? codesOffReason : undefined}
              disabled={codesOff || codesPro}
              pro={codesPro}
            >
              {(ids) => (
                <Select
                  items={VERIFICATION_CODE_COPY_MODES.map((mode) => ({
                    value: mode,
                    label: copyModes[mode],
                  }))}
                  value={settings.verificationCodeCopyMode}
                  disabled={codesOff || codesPro}
                  onValueChange={(mode) => {
                    if (mode !== null) {
                      write({ key: "verificationCodeCopyMode", value: mode });
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
                      {VERIFICATION_CODE_COPY_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {copyModes[mode]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SettingRow>,
            switchRow(
              "verificationCodeMarkRead",
              t({
                message: "Mark as read after copying",
                comment:
                  "Label of the switch in Settings that marks the email with a verification code read once the code is copied",
              }),
              t({
                message: "Marks the email as read after you copy its code.",
                comment:
                  "Description of the Mark as read after copying switch in Settings",
              }),
              true
            ),
            switchRow(
              "verificationCodeTrash",
              t({
                message: "Move to Trash after copying",
                comment:
                  "Label of the switch in Settings that moves the email with a verification code to Trash once the code is copied; Trash is Gmail's folder of that name",
              }),
              t({
                message:
                  "Moves the email to the Trash after you copy its code. Meru can occasionally mistake a regular email for one with a code.",
                comment:
                  "Description of the Move to Trash after copying switch in Settings; Trash is Gmail's folder of that name, and the second sentence warns that a code found by mistake can move a real email",
              }),
              true
            ),
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
