import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldContent,
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
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

function DiagnosticInfo() {
  const { data: info, isPending } = useQuery({
    queryKey: ["troubleshooting", "info"],
    queryFn: () => ipc.main.invoke("troubleshooting.getInfo"),
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
    { label: "Machine ID", value: info.machineId },
  ];

  return (
    <ItemGroup>
      {rows.map(({ label, value }) => (
        <Item key={label} variant="muted">
          <ItemContent>
            <ItemTitle>{label}</ItemTitle>
            <ItemDescription>{value}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(value);

                toast(`Copied ${label.toLowerCase()} to clipboard`);
              }}
            >
              <CopyIcon />
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

function ExportLogsField() {
  const exportLogsMutation = useMutation({
    mutationFn: () => ipc.main.invoke("troubleshooting.exportLogs"),
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
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel>Logs</FieldLabel>
        <FieldDescription>
          Export application logs to a file to help diagnose issues or share with support.
        </FieldDescription>
      </FieldContent>
      <Button
        variant="outline"
        onClick={() => {
          exportLogsMutation.mutate();
        }}
        disabled={exportLogsMutation.isPending}
      >
        Export Logs
      </Button>
    </Field>
  );
}

export function TroubleshootingSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Troubleshooting</SettingsTitle>
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
