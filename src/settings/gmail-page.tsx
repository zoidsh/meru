import { useLingui } from "@lingui/react/macro";

import type { GMAIL_PAGE_KEYS, SettingChange } from "#contract/settings.ts";
import { VERIFICATION_CODE_COPY_MODES } from "#core/settings.ts";
import type { VerificationCodeCopyMode } from "#core/settings.ts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

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

  if (!settings) {
    return null;
  }

  const calls = settingsCalls();
  const write = (change: SettingChange) => {
    void calls.update(change);
  };
  const codesOff = !settings.verificationCodes;
  const codesOffReason = t({
    message: "Turn on Find codes in new mail to use this.",
    comment:
      "Description of a verification code setting on the Gmail page in Settings while Find codes in new mail, the switch above it, is off",
  });

  /** A row under Find codes in new mail is disabled while it is off, its value kept. */
  const switchRow = (
    key: SwitchKey,
    label: string,
    description: string,
    dependent = false
  ) => {
    const disabled = dependent && codesOff;

    return (
      <SettingRow
        key={key}
        label={label}
        description={disabled ? codesOffReason : description}
        disabled={disabled}
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
      message: "When you press Copy",
      comment:
        "Choice of the Copy the code menu in Settings: the code is copied when the Copy button on its notification is pressed",
    }),
    immediately: t({
      message: "As soon as it arrives",
      comment:
        "Choice of the Copy the code menu in Settings: the code is copied as soon as the email with it arrives",
    }),
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {t({
              message: "Gmail's page",
              comment:
                "Title of the group of Settings that hide or change parts of Gmail's own page",
            })}
          </CardTitle>
          <CardDescription>
            {t({
              message: "Changes what Meru shows, not your Gmail settings.",
              comment:
                "Description of the Gmail's page group in Settings: these settings change only what Meru shows, never Gmail's own settings",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Rows>
            {[
              switchRow(
                "hideGmailLogo",
                t({
                  message: "Hide the Gmail logo",
                  comment:
                    "Label of the switch in Settings that hides the Gmail logo on Gmail's page",
                }),
                t({
                  message: "The logo in the top left corner.",
                  comment:
                    "Description of the Hide the Gmail logo switch in Settings",
                })
              ),
              switchRow(
                "hidePromoBanner",
                t({
                  message: "Hide promotional banners",
                  comment:
                    "Label of the switch in Settings that hides Google's promotional banners on Gmail's page",
                }),
                t({
                  message:
                    "Google's offers above the message list, such as Workspace upgrades.",
                  comment:
                    "Description of the Hide promotional banners switch in Settings; Workspace is Google Workspace, kept as Google names it",
                })
              ),
              switchRow(
                "hideUpgradeButton",
                t({
                  message: "Hide the Upgrade button",
                  comment:
                    "Label of the switch in Settings that hides Gmail's own Upgrade button; Upgrade is the label of Gmail's button, written as Gmail writes it, not Meru Pro's",
                }),
                t({
                  message: "Gmail's own button, at the top of the page.",
                  comment:
                    "Description of the Hide the Upgrade button switch in Settings",
                })
              ),
              switchRow(
                "hideInboxFooter",
                t({
                  message: "Hide the inbox footer",
                  comment:
                    "Label of the switch in Settings that hides the footer Gmail shows under its message list",
                }),
                t({
                  message:
                    "Storage, policies and account activity, under the message list.",
                  comment:
                    "Description of the Hide the inbox footer switch in Settings: what Gmail's footer shows",
                })
              ),
              switchRow(
                "extendDarkTheme",
                t({
                  message: "Extend Gmail's Dark theme",
                  comment:
                    "Label of the switch in Settings that darkens what Gmail's own Dark theme leaves white; Dark is the name of Gmail's theme, as Gmail writes it",
                }),
                t({
                  message:
                    "Darkens what Gmail's Dark theme leaves white. Only while Gmail's own theme is Dark, whatever Meru's.",
                  comment:
                    "Description of the Extend Gmail's Dark theme switch in Settings; Dark is the name of Gmail's theme, and Meru's is the theme chosen in Meru",
                })
              ),
            ]}
          </Rows>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {t({
              message: "Conversations",
              comment:
                "Title of the group of Settings for how Gmail shows an open conversation",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                    "In an open conversation. On screen only: Gmail's order is unchanged.",
                  comment:
                    "Description of the Newest message first switch in Settings",
                })
              ),
              switchRow(
                "moveAttachmentsToTop",
                t({
                  message: "Attachments at the top",
                  comment:
                    "Label of the switch in Settings that shows each Gmail message's attachments above its text",
                }),
                t({
                  message: "Above each message's text, rather than below it.",
                  comment:
                    "Description of the Attachments at the top switch in Settings",
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
                  message: "The quoted text Gmail folds behind its ••• button.",
                  comment:
                    "Description of the Show trimmed content switch in Settings; ••• is the label of Gmail's button that shows trimmed content, kept as is",
                })
              ),
            ]}
          </Rows>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {t({
              message: "Verification codes",
              comment:
                "Title of the group of Settings for one-time codes found in new mail",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Rows>
            {[
              switchRow(
                "verificationCodes",
                t({
                  message: "Find codes in new mail",
                  comment:
                    "Label of the switch in Settings that looks for a verification code in each new email",
                }),
                t({
                  message:
                    "A notification shows the code, even during quiet hours or Do Not Disturb.",
                  comment:
                    "Description of the Find codes in new mail switch in Settings; quiet hours and Do Not Disturb are the Notifications page's settings of those names",
                })
              ),
              <SettingRow
                key="verificationCodeCopyMode"
                label={t({
                  message: "Copy the code",
                  comment:
                    "Label of the menu in Settings choosing when a verification code is copied",
                })}
                description={
                  codesOff
                    ? codesOffReason
                    : t({
                        message:
                          "With the notification's Copy button, or as soon as the email arrives.",
                        comment:
                          "Description of the Copy the code menu in Settings; Copy is the label of the button on the verification code notification",
                      })
                }
                disabled={codesOff}
              >
                {(ids) => (
                  <Select
                    items={VERIFICATION_CODE_COPY_MODES.map((mode) => ({
                      value: mode,
                      label: copyModes[mode],
                    }))}
                    value={settings.verificationCodeCopyMode}
                    disabled={codesOff}
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
                  message: "Never before its code is copied.",
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
                    "Instead of marking it read. A wrong guess can move a real email.",
                  comment:
                    "Description of the Move to Trash after copying switch in Settings: it takes the place of marking the email read, and a code found by mistake can move a real email",
                }),
                true
              ),
            ]}
          </Rows>
        </CardContent>
      </Card>
    </>
  );
};
