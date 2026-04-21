import { useTranslation } from "@meru/i18n/provider";
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

export function GmailSettings() {
  const { t } = useTranslation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const unreadCountPreferenceItems = [
    { value: "first-section", label: t("settings.gmail.unreadCountPreferences.firstSection") },
    { value: "inbox", label: t("settings.gmail.unreadCountPreferences.inbox") },
  ];

  const inboxCategoriesToMonitorItems = [
    { value: "primary", label: t("settings.gmail.inboxCategories.primary") },
    { value: "all", label: t("settings.gmail.inboxCategories.all") },
  ];

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.gmail.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t("settings.gmail.general")}</FieldLegend>
            <ConfigSwitchField
              label={t("settings.gmail.hideGmailLogo")}
              description={t("settings.gmail.hideGmailLogoDescription")}
              configKey="gmail.hideGmailLogo"
              restartRequired
            />
            <ConfigSwitchField
              label={t("settings.gmail.hideOutOfOffice")}
              description={t("settings.gmail.hideOutOfOfficeDescription")}
              configKey="gmail.hideOutOfOfficeBanner"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.gmail.compose")}</FieldLegend>
            <ConfigSwitchField
              label={t("settings.gmail.composeInNewWindow")}
              description={t("settings.gmail.composeInNewWindowDescription")}
              configKey="gmail.openComposeInNewWindow"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t("settings.gmail.closeComposeAfterSend")}
              description={t("settings.gmail.closeComposeAfterSendDescription")}
              configKey="gmail.closeComposeWindowAfterSend"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.gmail.conversation")}</FieldLegend>
            <ConfigSwitchField
              label={t("settings.gmail.reverseConversation")}
              description={t("settings.gmail.reverseConversationDescription")}
              configKey="gmail.reverseConversation"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t("settings.gmail.moveAttachmentsToTop")}
              description={t("settings.gmail.moveAttachmentsToTopDescription")}
              configKey="gmail.moveAttachmentsToTop"
              restartRequired
              licenseKeyRequired
            />
            <ConfigSwitchField
              label={t("settings.gmail.replyForwardInPopOut")}
              description={t("settings.gmail.replyForwardInPopOutDescription")}
              configKey="gmail.replyForwardInPopOut"
              restartRequired
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.gmail.inbox")}</FieldLegend>
            <ConfigSwitchField
              label={t("settings.gmail.hideInboxFooter")}
              description={t("settings.gmail.hideInboxFooterDescription")}
              configKey="gmail.hideInboxFooter"
              restartRequired
            />
            <ConfigSwitchField
              label={t("settings.gmail.showSenderIcons")}
              description={t("settings.gmail.showSenderIconsDescription")}
              configKey="gmail.showSenderIcons"
              restartRequired
              licenseKeyRequired
            />
            <Field>
              <FieldContent>
                <FieldLabel className="flex items-center gap-2">
                  {t("settings.gmail.unreadCountPreference")} <LicenseKeyRequiredFieldBadge />
                </FieldLabel>
                <FieldDescription>
                  {t("settings.gmail.unreadCountPreferenceDescription")}
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
                  <SelectValue placeholder={t("settings.gmail.selectUnreadCountPreference")} />
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
                  {t("settings.gmail.categoriesToMonitor")}
                  <LicenseKeyRequiredFieldBadge />
                </FieldLabel>
                <FieldDescription>
                  {t("settings.gmail.categoriesToMonitorDescription")}
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
                  <SelectValue placeholder={t("settings.gmail.selectCategoriesToMonitor")} />
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
            <FieldLegend>{t("settings.gmail.advanced")}</FieldLegend>
            <Field>
              <FieldContent>
                <FieldLabel className="flex items-center gap-2">
                  {t("settings.gmail.userStyles")}
                  <LicenseKeyRequiredFieldBadge />
                </FieldLabel>
                <FieldDescription>{t("settings.gmail.userStylesDescription")}</FieldDescription>
              </FieldContent>
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    ipc.main.send("gmail.openUserStylesInEditor");
                  }}
                  disabled={!isLicenseKeyValid}
                >
                  {t("settings.gmail.openInEditor")}
                </Button>
              </div>
            </Field>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
