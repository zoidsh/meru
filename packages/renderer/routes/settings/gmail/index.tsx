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
  { value: "first-section", label: "First section only" },
  { value: "inbox", label: "Inbox only" },
];

const inboxCategoriesToMonitorItems = [
  { value: "primary", label: "Primary only" },
  { value: "all", label: "All categories" },
];

export function GmailSettings() {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { config } = useConfig();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Gmail</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Appearance</FieldLegend>
            <ConfigSwitchField
              label="Hide Gmail logo"
              description="Hide the Gmail logo in the top left corner."
              configKey="gmail.hideGmailLogo"
              restartRequired
            />
            <ConfigSwitchField
              label="Hide out-of-office banner"
              description="Hide the out-of-office banner at the top of the window."
              configKey="gmail.hideOutOfOfficeBanner"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Hide promotional banner"
              description="Hide the promotional banners at the top of the message list, such as the Google Workspace upgrade offer."
              configKey="gmail.hidePromoBanner"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Hide upgrade button"
              description="Hide the Upgrade button in Gmail."
              configKey="gmail.hideUpgradeButton"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Extend dark theme"
              description="Extend Gmail's own dark theme to emails and the compose window. Gmail's theme has to be set to dark. The feature is in beta, so report anything it gets wrong."
              configKey="gmail.extendDarkTheme"
              restartRequired
              licenseKeyRequired
              beta
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Compose</FieldLegend>
            <ConfigSwitchField
              label="Always compose new emails in new window"
              description="Open a new window to compose an email, instead of composing inside Gmail."
              configKey="gmail.openComposeInNewWindow"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Close compose window after send"
              description="Close the compose window after you send."
              configKey="gmail.closeComposeWindowAfterSend"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Conversation</FieldLegend>
            <ConfigSwitchField
              label="Reverse conversation"
              description="Show email conversations in reverse order, with the latest message at the top."
              configKey="gmail.reverseConversation"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Move attachments to top"
              description="Move email attachments to the top of the email."
              configKey="gmail.moveAttachmentsToTop"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Always reply and forward in a pop-out"
              description="Open replies and forwards in a pop-out instead of below the message."
              configKey="gmail.replyForwardInPopOut"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Inbox</FieldLegend>
            <ConfigSwitchField
              label="Hide inbox footer"
              description="Hide the footer at the bottom of the inbox."
              configKey="gmail.hideInboxFooter"
              restartRequired
            />
            <ConfigSwitchField
              label="Show sender icons"
              description="Show sender icons next to the senders in your inbox."
              configKey="gmail.showSenderIcons"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSelectField
              configKey="gmail.unreadCountPreference"
              label="Unread count preference"
              description="With multiple inboxes, choose which sections count toward the unread count shown in the app. The default combines every section."
              items={unreadCountPreferenceItems}
              licenseKeyRequired
              restartRequired
            />
            <ConfigSelectField
              configKey="gmail.inboxCategoriesToMonitor"
              label="Categories to monitor"
              description="With a categorized inbox, choose which categories are watched for new email notifications and included in the unified inbox."
              items={inboxCategoriesToMonitorItems}
              licenseKeyRequired
              restartRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend className="flex items-center gap-2">
              Label colors
              <LicenseKeyRequiredFieldBadge />
            </FieldLegend>
            <GmailLabelColors />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Advanced</FieldLegend>
            <Field>
              <FieldContent>
                <FieldTitle>
                  User styles
                  <LicenseKeyRequiredFieldBadge />
                </FieldTitle>
                <FieldDescription>
                  Add your own CSS to personalize the Gmail interface further. Changes take effect
                  after a restart.
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
                  Open in editor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    ipc.main.send("gmail.openUserStyles", "folder");
                  }}
                  disabled={!isLicenseKeyValid}
                >
                  Open in folder
                </Button>
              </div>
            </Field>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
