import {
  type CuratedExtension,
  curatedExtensions,
  normalizeExtensionSiteHostname,
} from "@meru/shared/extensions";
import { ipc } from "@meru/shared/renderer/ipc";
import type { Config } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from "@meru/ui/components/item";
import { Switch } from "@meru/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { queryClient, useConfig, useConfigMutation } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

const installedExtensionsQueryKey = ["installed-extensions"];

/**
 * The sites the user added on top of the ones the extension is offered for, which
 * only exist for an extension the catalog clamps to begin with.
 */
function ExtensionAdditionalSites({
  extension,
  additionalSites,
}: {
  extension: CuratedExtension;
  additionalSites: Config["extensions.additionalSites"];
}) {
  const [siteInput, setSiteInput] = useState("");

  const configMutation = useConfigMutation({ onSuccess: restartRequiredToast });

  const sites = additionalSites[extension.id] ?? [];

  const saveSites = (updatedSites: string[]) => {
    configMutation.mutate({
      "extensions.additionalSites": { ...additionalSites, [extension.id]: updatedSites },
    });
  };

  const addSite = () => {
    const hostname = normalizeExtensionSiteHostname(siteInput);

    if (!hostname) {
      toast.error("Enter a site as a hostname, like sso.example.com.");

      return;
    }

    setSiteInput("");

    if (sites.includes(hostname)) {
      return;
    }

    saveSites([...sites, hostname]);
  };

  return (
    <Field>
      <FieldLabel>Additional Sites</FieldLabel>
      <FieldDescription>
        {extension.name} only runs on the sign-in pages Meru offers it for. Sites added here run it
        too, such as your company's single sign-on provider.
      </FieldDescription>
      {sites.map((site) => (
        <div className="flex items-center gap-2 text-sm" key={site}>
          <div className="flex-1">{site}</div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => {
              saveSites(sites.filter((keptSite) => keptSite !== site));
            }}
            aria-label={`Remove ${site} from ${extension.name}`}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();

          addSite();
        }}
      >
        <Input
          value={siteInput}
          onChange={(event) => {
            setSiteInput(event.target.value);
          }}
          placeholder="sso.example.com"
          aria-label={`Site to add to ${extension.name}`}
        />
        <Button type="submit" variant="outline">
          <PlusIcon /> Add
        </Button>
      </form>
    </Field>
  );
}

function ExtensionItem({
  extension,
  installed,
  installedVersion,
  additionalSites,
}: {
  extension: CuratedExtension;
  installed: boolean;
  installedVersion: string | undefined;
  additionalSites: Config["extensions.additionalSites"];
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
      {isLicenseKeyValid && installed && extension.contentScriptMatches && (
        <ItemFooter>
          <ExtensionAdditionalSites extension={extension} additionalSites={additionalSites} />
        </ItemFooter>
      )}
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
              additionalSites={config["extensions.additionalSites"]}
            />
          ))}
        </ItemGroup>
      </SettingsContent>
    </Settings>
  );
}
