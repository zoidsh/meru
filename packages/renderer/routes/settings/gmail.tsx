import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@meru/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

const unreadCountPreferenceItems = [
  { value: "first-section", label: "First Section Only" },
  { value: "inbox", label: "Inbox Only" },
];

const inboxCategoriesToMonitorItems = [
  { value: "primary", label: "Primary Only" },
  { value: "all", label: "All Categories" },
];

export function GmailSettings() {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

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
            <FieldLegend>General</FieldLegend>
            <ConfigSwitchField
              label="Hide Gmail Logo"
              description="Hides the Gmail logo on the top left corner."
              configKey="gmail.hideGmailLogo"
              restartRequired
            />
            <ConfigSwitchField
              label="Hide Out of Office Banner"
              description="Hides the out of office banner at the top of the window."
              configKey="gmail.hideOutOfOfficeBanner"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Compose</FieldLegend>
            <ConfigSwitchField
              label="Always Compose New Emails in New Window"
              description="Opens a new window for composing emails instead of inside Gmail."
              configKey="gmail.openComposeInNewWindow"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Close Compose Window After Send"
              description="Automatically closes the compose window after pressing the send button."
              configKey="gmail.closeComposeWindowAfterSend"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Conversation</FieldLegend>
            <ConfigSwitchField
              label="Reverse Conversation"
              description="Displays email conversations in reverse order, showing the latest message at the top."
              configKey="gmail.reverseConversation"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Move Attachments to Top"
              description="Moves email attachments to the top of the email."
              configKey="gmail.moveAttachmentsToTop"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Always Reply/Forward in Pop-Out"
              description="Opens reply and forward in a pop-out instead of below the message."
              configKey="gmail.replyForwardInPopOut"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Inbox</FieldLegend>
            <ConfigSwitchField
              label="Hide Inbox Footer"
              description="Hides the footer at the bottom of the inbox."
              configKey="gmail.hideInboxFooter"
              restartRequired
            />
            <ConfigSwitchField
              label="Show Sender Icons"
              description="Show sender icons next to the senders in your inbox."
              configKey="gmail.showSenderIcons"
              restartRequired
              licenseKeyRequired
            />
            <Field>
              <FieldContent>
                <FieldLabel className="flex items-center gap-2">
                  Unread Count Preference <LicenseKeyRequiredFieldBadge />
                </FieldLabel>
                <FieldDescription>
                  When using multiple inboxes, sets which sections contribute to the unread count
                  shown on the app. Default combines all sections.
                </FieldDescription>
              </FieldContent>
              <Select
                items={unreadCountPreferenceItems}
                value={config["gmail.unreadCountPreference"]}
                onValueChange={(value) => {
                  if (value) {
                    configMutation.mutate(
                      {
                        "gmail.unreadCountPreference": value,
                      },
                      {
                        onSuccess: restartRequiredToast,
                      },
                    );
                  }
                }}
                disabled={!isLicenseKeyValid}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unread count preference" />
                </SelectTrigger>
                <SelectContent>
                  {unreadCountPreferenceItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldContent>
                <FieldLabel className="flex items-center gap-2">
                  Categories to Monitor
                  <LicenseKeyRequiredFieldBadge />
                </FieldLabel>
                <FieldDescription>
                  If using an inbox with categories, choose which inbox categories are monitored for
                  new email notifications and included in the unified inbox.
                </FieldDescription>
              </FieldContent>
              <Select
                items={inboxCategoriesToMonitorItems}
                value={config["gmail.inboxCategoriesToMonitor"]}
                onValueChange={(value) => {
                  if (value) {
                    configMutation.mutate(
                      {
                        "gmail.inboxCategoriesToMonitor": value,
                      },
                      {
                        onSuccess: restartRequiredToast,
                      },
                    );
                  }
                }}
                disabled={!isLicenseKeyValid}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select inbox categories to monitor" />
                </SelectTrigger>
                <SelectContent>
                  {inboxCategoriesToMonitorItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Advanced</FieldLegend>
            <Field>
              <FieldContent>
                <FieldLabel className="flex items-center gap-2">
                  User Styles
                  <LicenseKeyRequiredFieldBadge />
                </FieldLabel>
                <FieldDescription>
                  Add your own custom CSS to further personalize the Gmail interface. A restart is
                  required after making changes.
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
                  Open in Editor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    ipc.main.send("gmail.openUserStyles", "folder");
                  }}
                  disabled={!isLicenseKeyValid}
                >
                  Open in Folder
                </Button>
              </div>
            </Field>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
