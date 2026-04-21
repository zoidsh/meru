import { useTranslation } from "@meru/i18n/provider";
import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

export function DownloadsSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();

  if (!config) {
    return null;
  }

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t("settings.downloads.title")}</SettingsTitle>
      </SettingsHeader>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t("settings.downloads.general")}</FieldLegend>
          <ConfigSwitchField
            label={t("settings.downloads.saveAs")}
            description={t("settings.downloads.saveAsDescription")}
            configKey="downloads.saveAs"
            restartRequired
          />
          <ConfigSwitchField
            label={t("settings.downloads.openFolderWhenDone")}
            description={t("settings.downloads.openFolderWhenDoneDescription")}
            configKey="downloads.openFolderWhenDone"
            restartRequired
          />
          <Field>
            <FieldLabel>{t("settings.downloads.defaultLocation")}</FieldLabel>
            <FieldDescription>
              {t("settings.downloads.defaultLocationDescription")}
            </FieldDescription>
            <div className="flex gap-2">
              <Input value={config["downloads.location"]} readOnly />
              <Button
                variant="outline"
                onClick={async () => {
                  const { canceled } = await ipc.main.invoke("downloads.setLocation");

                  if (!canceled) {
                    restartRequiredToast();
                  }
                }}
              >
                {t("settings.downloads.change")}
              </Button>
            </div>
          </Field>
        </FieldSet>
      </FieldGroup>
    </>
  );
}
