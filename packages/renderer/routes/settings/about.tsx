import { Trans, useLingui } from "@lingui/react/macro";
import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@meru/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@meru/ui/components/item";
import { Skeleton } from "@meru/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { settingsPageLabels } from "@/lib/settings-pages";

function DiagnosticInfo() {
  const { t } = useLingui();

  const { data: info, isPending } = useQuery({
    queryKey: ["about", "info"],
    queryFn: () => ipc.main.invoke("about.getInfo"),
  });

  if (isPending || !info) {
    return (
      <ItemGroup>
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </ItemGroup>
    );
  }

  const rows = [
    { label: t`Application version`, value: info.version },
    { label: t`Operating system`, value: info.os },
    {
      label: t({
        message: "Device ID",
        comment: "The identifier Meru's license and trial checks know this computer by",
      }),
      value: info.deviceId,
    },
  ];

  return (
    <ItemGroup>
      {rows.map(({ label, value }) => (
        <Item key={label} variant="muted">
          <ItemContent className="min-w-0">
            <ItemTitle>{label}</ItemTitle>
            <ItemDescription className="truncate">{value}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <CopyButton value={value} />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

function ExportLogsField() {
  const { t } = useLingui();

  const exportLogsMutation = useMutation({
    mutationFn: () => ipc.main.invoke("about.exportLogs"),
    onError: () => {
      toast.error(t`Couldn't export the logs.`);
    },
  });

  return (
    <Field>
      <FieldTitle>
        <Trans comment="Heading of the About Meru section for exporting the application's logs">
          Logs
        </Trans>
      </FieldTitle>
      <FieldDescription>
        <Trans>
          Export the application logs to a file, to diagnose a problem or to share with support.
        </Trans>
      </FieldDescription>
      <div>
        <Button
          variant="outline"
          onClick={() => {
            exportLogsMutation.mutate();
          }}
          disabled={exportLogsMutation.isPending}
        >
          <Trans>Export logs</Trans>
        </Button>
      </div>
    </Field>
  );
}

export function AboutSettings() {
  const { t } = useLingui();

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.about)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <FieldSet>
            <DiagnosticInfo />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <ExportLogsField />
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
