import { type CuratedExtension, curatedExtensions } from "@meru/shared/extensions";
import { ipc } from "@meru/shared/renderer/ipc";
import { FieldDescription } from "@meru/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@meru/ui/components/item";
import { Switch } from "@meru/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { queryClient, useConfig } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

const installedExtensionsQueryKey = ["installed-extensions"];

function ExtensionItem({
  extension,
  installed,
  installedVersion,
}: {
  extension: CuratedExtension;
  installed: boolean;
  installedVersion: string | undefined;
}) {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  const extensionMutation = useMutation({
    mutationFn: (install: boolean) =>
      install
        ? ipc.main.invoke("extensions.install", extension.id)
        : ipc.main.invoke("extensions.uninstall", extension.id),
    onSuccess: ({ error }) => {
      if (error) {
        toast.error(error);

        return;
      }

      queryClient.invalidateQueries({
        queryKey: installedExtensionsQueryKey,
      });

      restartRequiredToast();
    },
  });

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>
          {extension.name}
          <LicenseKeyRequiredFieldBadge />
        </ItemTitle>
        <ItemDescription>
          {extension.description}
          {installedVersion && ` Version ${installedVersion} is installed.`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={isLicenseKeyValid && installed}
          disabled={!isLicenseKeyValid || extensionMutation.isPending}
          onCheckedChange={(checked) => {
            extensionMutation.mutate(checked);
          }}
          aria-label={`Install ${extension.name}`}
        />
      </ItemActions>
    </Item>
  );
}

export function ExtensionsSettings() {
  const { config } = useConfig();

  const { data: installedExtensions } = useQuery({
    queryKey: installedExtensionsQueryKey,
    queryFn: () => ipc.main.invoke("extensions.getInstalled"),
  });

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Extensions</SettingsTitle>
      </SettingsHeader>
      <SettingsContent className="space-y-4">
        <LicenseKeyRequiredBanner />
        <FieldDescription>
          Extensions are loaded into every account and take effect after a restart.
        </FieldDescription>
        <ItemGroup>
          {curatedExtensions.map((extension) => (
            <ExtensionItem
              key={extension.id}
              extension={extension}
              installed={config["extensions.installed"].includes(extension.id)}
              installedVersion={installedExtensions?.find(({ id }) => id === extension.id)?.version}
            />
          ))}
        </ItemGroup>
      </SettingsContent>
    </Settings>
  );
}
