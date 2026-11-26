import { useLingui } from "@lingui/react/macro";

import type { GMAIL_PAGE_KEYS, SettingChange } from "#contract/settings.ts";
import {
  VERIFICATION_CODE_AFTER_COPY,
  VERIFICATION_CODE_COPY_MODES,
} from "#core/settings.ts";
import type {
  VerificationCodeAfterCopy,
  VerificationCodeCopyMode,
} from "#core/settings.ts";
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
  "verificationCodeCopyMode" | "verificationCodeAfterCopy"
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

  const afterCopy: Record<VerificationCodeAfterCopy, string> = {
    nothing: t({
      message: "Do nothing",
      comment:
        "Choice of the After copying menu in Settings: the email whose verification code was copied is left as it is",
    }),
    markRead: t({
      message: "Mark as read",
      comment:
        "Choice of the After copying menu in Settings: the email whose verification code was copied is marked read",
    }),
    trash: t({
      message: "Move to Trash",
      comment:
        "Choice of the After copying menu in Settings: the email whose verification code was copied is moved to Trash, Gmail's folder of that name",
    }),
  };

  /** A menu under Find verification codes, disabled while it is off. */
  const choiceRow = <Value extends string>(
    key: string,
    label: string,
    description: string | undefined,
    values: readonly Value[],
    labels: Record<Value, string>,
    value: Value,
    onChange: (value: Value) => void
  ) => {
    const disabled = codesOff || codesPro;

    return (
      <SettingRow
        key={key}
        label={label}
        description={codesOff ? codesOffReason : description}
        disabled={disabled}
        pro={codesPro}
      >
        {(ids) => (
          <Select
            items={values.map((each) => ({ value: each, label: labels[each] }))}
            value={value}
            disabled={disabled}
            onValueChange={(chosen) => {
              if (chosen !== null) {
                onChange(chosen);
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
                {values.map((each) => (
                  <SelectItem key={each} value={each}>
                    {labels[each]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </SettingRow>
    );
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
          message: "Compose",
          comment:
            "Title of the group of Settings for writing emails in Gmail; Compose is Gmail's own name for writing a new email",
        })}
      >
        <Rows>
          {[
            switchRow(
              "closeComposeWindowAfterSend",
              t({
                message: "Close compose window after sending",
                comment:
                  "Label of the switch in Settings that closes a compose window, one Meru opened for an email link or Gmail's pop-out, once its email is sent",
              }),
              t({
                message:
                  "Closes a compose window of its own once Gmail sends the email.",
                comment:
                  "Description of the Close compose window after sending switch in Settings; a compose window of its own is a separate window for writing one email, not the one docked in Gmail's page",
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
            choiceRow(
              "verificationCodeCopyMode",
              t({
                message: "Copy code",
                comment:
                  "Label of the menu in Settings choosing when a verification code is copied",
              }),
              undefined,
              VERIFICATION_CODE_COPY_MODES,
              copyModes,
              settings.verificationCodeCopyMode,
              (value) => {
                write({ key: "verificationCodeCopyMode", value });
              }
            ),
            choiceRow(
              "verificationCodeAfterCopy",
              t({
                message: "After copying",
                comment:
                  "Label of the menu in Settings choosing what is done with the email whose verification code was copied",
              }),
              t({
                message:
                  "Meru can occasionally mistake a regular email for one with a code.",
                comment:
                  "Description of the After copying menu in Settings, which can mark the email read or move it to Trash; it warns that a code found by mistake can act on a real email",
              }),
              VERIFICATION_CODE_AFTER_COPY,
              afterCopy,
              settings.verificationCodeAfterCopy,
              (value) => {
                write({ key: "verificationCodeAfterCopy", value });
              }
            ),
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
