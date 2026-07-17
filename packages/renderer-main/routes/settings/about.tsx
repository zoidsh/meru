import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
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

function DiagnosticInfo() {
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
    { label: "Application Version", value: info.version },
    { label: "Operating System", value: info.os },
    { label: "Device ID", value: info.deviceId },
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
  const exportLogsMutation = useMutation({
    mutationFn: () => ipc.main.invoke("about.exportLogs"),
    onSuccess: ({ canceled }) => {
      if (!canceled) {
        toast("Logs exported successfully");
      }
    },
    onError: () => {
      toast.error("Failed to export logs");
    },
  });

  return (
    <Field>
      <FieldLabel>Logs</FieldLabel>
      <FieldDescription>
        Export application logs to a file to help diagnose issues or share with support.
      </FieldDescription>
      <div>
        <Button
          variant="outline"
          onClick={() => {
            exportLogsMutation.mutate();
          }}
          disabled={exportLogsMutation.isPending}
        >
          Export Logs
        </Button>
      </div>
    </Field>
  );
}

export function AboutSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>About Meru</SettingsTitle>
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
