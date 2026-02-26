import { ipc } from "@meru/renderer-lib/ipc";
import { platform } from "@meru/renderer-lib/utils";
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
import { Switch } from "@meru/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoginItemSettings } from "electron";
import { useId } from "react";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { queryClient } from "@/lib/react-query";

function LaunchAtLoginField() {
  const queryKey = ["login-item-settings"];

  const { data: loginItemSettings } = useQuery({
    queryKey,
    queryFn: () => ipc.main.invoke("app.getLoginItemSettings"),
  });

  const loginItemSettingsMutation = useMutation({
    mutationFn: (settings: Partial<LoginItemSettings>) =>
      ipc.main.invoke("app.setLoginItemSettings", settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey,
      });
    },
  });

  const fieldId = useId();

  if (platform.isLinux || !loginItemSettings) {
    return;
  }

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={fieldId}>Launch at Login</FieldLabel>
        <FieldDescription>
          Enable this option to automatically start the application when you log into your computer.
        </FieldDescription>
      </FieldContent>
      <Switch
        id={fieldId}
        checked={loginItemSettings.openAtLogin}
        onCheckedChange={(checked) => {
          loginItemSettingsMutation.mutate({
            openAtLogin: checked,
          });
        }}
      />
    </Field>
  );
}

function DefaultMailClientField() {
  const queryKey = ["default-mailto-client"];

  const { data: isDefaultMailtoClient } = useQuery({
    queryKey,
    queryFn: () => ipc.main.invoke("app.getIsDefaultMailtoClient"),
  });

  const isDefaultMailtoClientMutation = useMutation({
    mutationFn: () => ipc.main.invoke("app.setAsDefaultMailtoClient"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey,
      });
    },
  });

  const fieldId = useId();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (typeof isDefaultMailtoClient !== "boolean") {
    return;
  }

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={fieldId}>
          Default Mail Client <LicenseKeyRequiredFieldBadge />
        </FieldLabel>
        <FieldDescription>
          {isDefaultMailtoClient
            ? "Meru is set as default mail client."
            : "Set Meru as the default mail client to handle email links and related protocols."}
        </FieldDescription>
      </FieldContent>
      {!isDefaultMailtoClient && (
        <Switch
          id={fieldId}
          checked={isDefaultMailtoClient}
          onCheckedChange={(checked) => {
            if (checked) {
              isDefaultMailtoClientMutation.mutate();
            }
          }}
          disabled={!isLicenseKeyValid}
        />
      )}
    </Field>
  );
}

export function AdvancedSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Advanced</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend>General</FieldLegend>
            <FieldGroup>
              <DefaultMailClientField />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Startup</FieldLegend>
            <LaunchAtLoginField />
            <ConfigSwitchField
              label="Launch Minimized"
              description="Enable this option to start the application in a minimized state."
              configKey="launchMinimized"
            />
          </FieldSet>
          <FieldSeparator />
          {platform.isMacOS && (
            <FieldSet>
              <FieldLegend>Screen Sharing</FieldLegend>
              <FieldGroup>
                <ConfigSwitchField
                  label="Use System Picker"
                  description="Use the system's native screen sharing picker when sharing your screen."
                  configKey="screenShare.useSystemPicker"
                  licenseKeyRequired
                  restartRequired
                />
              </FieldGroup>
            </FieldSet>
          )}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Miscellaneous</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Hardware Acceleration"
                description="Enabling hardware acceleration can improve performance but can also cause compatibility issues on some systems."
                configKey="hardwareAcceleration"
                restartRequired
              />
              {platform.isMacOS && (
                <ConfigSwitchField
                  label="Use Custom User Agent"
                  description="Some Gmail or Google app features may not work with the default user agent. Enabling this option will use a custom user agent and may help resolve issues, but can also cause others. Disable this option if you experience instability."
                  configKey="customUserAgent"
                  restartRequired
                />
              )}
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
