import { ipc } from "@meru/shared/renderer/ipc";
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
import { platform } from "@/lib/utils";

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
        <FieldLabel htmlFor={fieldId}>Launch at login</FieldLabel>
        <FieldDescription>
          Start the application automatically when you log in to your computer.
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
          Default mail client <LicenseKeyRequiredFieldBadge />
        </FieldLabel>
        <FieldDescription>
          {isDefaultMailtoClient
            ? "Meru is set as the default mail client."
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

export function GeneralSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>General</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <DefaultMailClientField />
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Startup</FieldLegend>
            <LaunchAtLoginField />
            <ConfigSwitchField
              label="Launch minimized"
              description="Start the application minimized."
              configKey="launchMinimized"
            />
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
