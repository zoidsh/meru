import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@meru/ui/components/field";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig } from "@/lib/react-query";
import { GmailLabelColors } from "./label-colors";

const unreadCountPreferenceItems = [
  {
    value: "first-section",
    label: msg({
      message: "First section only",
      comment:
        "Option of the Unread count preference setting: count only the first section of Gmail's multiple inboxes",
    }),
  },
  {
    value: "inbox",
    label: msg({
      message: "Inbox only",
      comment:
        "Option of the Unread count preference setting. Inbox is Gmail's folder of that name, so it follows Gmail's word for it",
    }),
  },
];

const inboxCategoriesToMonitorItems = [
  {
    value: "primary",
    label: msg({
      message: "Primary only",
      comment:
        "Option of the Categories to monitor setting. Primary is Gmail's inbox category of that name, so it follows Gmail's word for it",
    }),
  },
  {
    value: "all",
    label: msg({
      message: "All categories",
      comment: "Option of the Categories to monitor setting: every category of Gmail's inbox",
    }),
  },
];

export function GmailSettings() {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { config } = useConfig();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        {/* oxlint-disable-next-line lingui/no-unlocalized-strings -- a product name, which stays as it is */}
        <SettingsTitle>Gmail</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Gmail page's section about how Gmail looks">
                Appearance
              </Trans>
            </FieldLegend>
            <ConfigSwitchField
              label={t`Hide Gmail logo`}
              description={t`Hide the Gmail logo in the top left corner.`}
              configKey="gmail.hideGmailLogo"
              restartRequired
            />
            <ConfigSwitchField
              label={t({
                message: "Hide out-of-office banner",
                comment:
                  "The out-of-office banner is the one Gmail shows while an out-of-office reply is on, so it follows Gmail's word for it",
              })}
              description={t({
                message: "Hide the out-of-office banner at the top of the window.",
                comment:
                  "The out-of-office banner is the one Gmail shows while an out-of-office reply is on, so it follows Gmail's word for it",
              })}
              configKey="gmail.hideOutOfOfficeBanner"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t`Hide promotional banner`}
              description={t`Hide the promotional banners at the top of the message list, such as the Google Workspace upgrade offer.`}
              configKey="gmail.hidePromoBanner"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t({
                message: "Hide upgrade button",
                comment:
                  "The upgrade button is Gmail's own Upgrade button, so it follows Gmail's word for it, not Meru Pro's",
              })}
              description={t({
                message: "Hide the Upgrade button in Gmail.",
                comment:
                  "Upgrade is the label of Gmail's own button, so it is written as Gmail writes it, not as Meru Pro's Upgrade",
              })}
              configKey="gmail.hideUpgradeButton"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t({
                message: "Extend dark theme",
                comment: "Dark theme is Gmail's own theme of that name",
              })}
              description={t({
                message:
                  "Extend Gmail's own dark theme to emails and the compose window. Gmail's theme has to be set to dark. The feature is in beta, so report anything it gets wrong.",
                comment:
                  "Dark theme is Gmail's own theme of that name, and dark the name of its setting, so both follow Gmail's words for them",
              })}
              configKey="gmail.extendDarkTheme"
              restartRequired
              licenseKeyRequired
              maturity="Beta"
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Gmail page's section about writing emails">
                Compose
              </Trans>
            </FieldLegend>
            <ConfigSwitchField
              label={t`Always compose new emails in new window`}
              description={t`Open a new window to compose an email, instead of composing inside Gmail.`}
              configKey="gmail.openComposeInNewWindow"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t`Close compose window after send`}
              description={t`Close the compose window after you send.`}
              configKey="gmail.closeComposeWindowAfterSend"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Gmail page's section about reading an email conversation">
                Conversation
              </Trans>
            </FieldLegend>
            <ConfigSwitchField
              label={t`Reverse conversation`}
              description={t`Show email conversations in reverse order, with the latest message at the top.`}
              configKey="gmail.reverseConversation"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t`Move attachments to top`}
              description={t`Move email attachments to the top of the email.`}
              configKey="gmail.moveAttachmentsToTop"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t`Always show trimmed content`}
              description={t({
                message: "Show the quoted text Gmail hides behind the ••• button.",
                comment:
                  "••• is the label of Gmail's button that shows trimmed content, kept as is",
              })}
              configKey="gmail.showTrimmedContent"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t`Load clipped messages in full`}
              description={t({
                message:
                  "Show the whole message when Gmail clips a long one, instead of a “View entire message” link.",
                comment:
                  "View entire message is the text of Gmail's own link under a clipped message, so it is written as Gmail writes it",
              })}
              configKey="gmail.loadClippedMessages"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t({
                message: "Always reply and forward in a pop-out",
                comment:
                  "A pop-out is Gmail's own name for a reply in its own window, so it follows Gmail's word for it",
              })}
              description={t({
                message: "Open replies and forwards in a pop-out instead of below the message.",
                comment:
                  "A pop-out is Gmail's own name for a reply in its own window, so it follows Gmail's word for it",
              })}
              configKey="gmail.replyForwardInPopOut"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Gmail page's section about Gmail's inbox; Inbox follows Gmail's word for it">
                Inbox
              </Trans>
            </FieldLegend>
            <ConfigSwitchField
              label={t`Hide inbox footer`}
              description={t`Hide the footer at the bottom of the inbox.`}
              configKey="gmail.hideInboxFooter"
              restartRequired
            />
            <ConfigSwitchField
              label={t`Show sender icons`}
              description={t`Show sender icons next to the senders in your inbox.`}
              configKey="gmail.showSenderIcons"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSelectField
              configKey="gmail.unreadCountPreference"
              label={t`Unread count preference`}
              description={t({
                message:
                  "With multiple inboxes, choose which sections count toward the unread count shown in the app. The default combines every section.",
                comment:
                  "Multiple inboxes is Gmail's own inbox type of that name, so it follows Gmail's word for it",
              })}
              items={unreadCountPreferenceItems.map(({ value, label }) => ({
                value,
                label: t(label),
              }))}
              licenseKeyRequired
              restartRequired
            />
            <ConfigSelectField
              configKey="gmail.inboxCategoriesToMonitor"
              label={t`Categories to monitor`}
              description={t({
                message:
                  "With a categorized inbox, choose which categories are watched for new email notifications and included in the unified inbox.",
                comment:
                  "A categorized inbox is Gmail's own inbox type of that name, with categories such as Primary and Promotions, so it follows Gmail's words for them",
              })}
              items={inboxCategoriesToMonitorItems.map(({ value, label }) => ({
                value,
                label: t(label),
              }))}
              licenseKeyRequired
              restartRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend className="flex items-center gap-2">
              <Trans>Label colors</Trans>
              <LicenseKeyRequiredFieldBadge />
            </FieldLegend>
            <GmailLabelColors />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Gmail page's section for settings most people leave alone">
                Advanced
              </Trans>
            </FieldLegend>
            <Field>
              <FieldContent>
                <FieldTitle>
                  <Trans comment="Setting for the user's own CSS, applied to Gmail">
                    User styles
                  </Trans>
                  <LicenseKeyRequiredFieldBadge />
                </FieldTitle>
                <FieldDescription>
                  <Trans>
                    Add your own CSS to personalize the Gmail interface further. Changes take effect
                    after a restart.
                  </Trans>
                </FieldDescription>
              </FieldContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    ipc.main.send("gmail.openUserStyles", "editor");
                  }}
                  disabled={!isLicenseKeyValid}
                >
                  <Trans comment="Button that opens the user styles file in the default text editor">
                    Open in editor
                  </Trans>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    ipc.main.send("gmail.openUserStyles", "folder");
                  }}
                  disabled={!isLicenseKeyValid}
                >
                  <Trans comment="Button that shows the user styles file in its folder">
                    Open in folder
                  </Trans>
                </Button>
              </div>
            </Field>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
