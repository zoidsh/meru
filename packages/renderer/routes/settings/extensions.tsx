import {
  type CuratedExtension,
  curatedExtensions,
  ONEPASSWORD_EXTENSION_ID,
} from "@meru/shared/extensions";
import { ipc } from "@meru/shared/renderer/ipc";
import { Alert, AlertDescription, AlertTitle } from "@meru/ui/components/alert";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meru/ui/components/dialog";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
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
import { Spinner } from "@meru/ui/components/spinner";
import { Switch } from "@meru/ui/components/switch";
import { cn } from "@meru/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, KeyRoundIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { toast } from "sonner";
import { BetaFieldBadge } from "@/components/beta-field-badge";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { CopyButton } from "@/components/copy-button";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { queryClient, useConfig } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { platform } from "@/lib/utils";

const installedExtensionsQueryKey = ["installed-extensions"];

const ONEPASSWORD_ALLOWED_BROWSERS_COMMAND = "sudo nano /etc/1password/custom_allowed_browsers";

function Code({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      className={cn("rounded-sm bg-muted px-1 py-0.5 font-mono text-xs", className)}
      {...props}
    />
  );
}

function OnePasswordSetupSteps() {
  if (platform.isLinux) {
    return (
      <>
        <li>Quit 1Password.</li>
        <li>
          Open the browser allowlist in an editor with root permissions.
          <div className="mt-2 flex items-center gap-2">
            <Code className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5">
              {ONEPASSWORD_ALLOWED_BROWSERS_COMMAND}
            </Code>
            <CopyButton value={ONEPASSWORD_ALLOWED_BROWSERS_COMMAND} size="icon-sm" />
          </div>
        </li>
        <li>
          Add <Code>meru</Code> on its own line, then save.
        </li>
        <li>Open and unlock 1Password again.</li>
        <li>Restart Meru.</li>
      </>
    );
  }

  return (
    <>
      <li>Open and unlock 1Password.</li>
      <li>Select your account at the top of the sidebar, then select Settings.</li>
      <li>Select Browser, then select Add Browser.</li>
      <li>
        {platform.isMacOS
          ? "Choose Meru in the Applications folder."
          : "Choose Meru in C:\\Program Files."}
      </li>
      <li>Restart Meru.</li>
    </>
  );
}

function OnePasswordSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect 1Password</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Filling passwords and passkeys needs the 1Password desktop app, because Meru stores no
          vault data of its own. Trust Meru in 1Password's settings to connect the two.
        </DialogDescription>
        <ol className="ml-4 list-decimal space-y-2 marker:text-muted-foreground">
          <OnePasswordSetupSteps />
        </ol>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Later</Button>} />
          <Button
            onClick={() => {
              ipc.main.send("app.relaunch");
            }}
          >
            Restart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ExtensionError = {
  title: string;
  description: string;
};

function ExtensionErrorDialog({
  error,
  onDismiss,
}: {
  error: ExtensionError | null;
  onDismiss: () => void;
}) {
  return (
    <Dialog
      open={Boolean(error)}
      onOpenChange={(open) => {
        if (!open) {
          onDismiss();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{error?.title}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="whitespace-pre-line">{error?.description}</DialogDescription>
        <DialogFooter>
          <DialogClose render={<Button>OK</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

  const isOnePassword = extension.id === ONEPASSWORD_EXTENSION_ID;

  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);

  const [extensionError, setExtensionError] = useState<ExtensionError | null>(null);

  const extensionMutation = useMutation({
    mutationFn: (install: boolean) =>
      install
        ? ipc.main.invoke("extensions.install", extension.id)
        : ipc.main.invoke("extensions.uninstall", extension.id),
    onSuccess: ({ error }, install) => {
      if (error) {
        setExtensionError({
          title: install
            ? `Couldn't install ${extension.name}`
            : `Couldn't uninstall ${extension.name}`,
          description: error,
        });

        return;
      }

      queryClient.invalidateQueries({
        queryKey: installedExtensionsQueryKey,
      });

      // The setup dialog ends on restarting Meru and carries its own restart
      // button, so the toast would only repeat it.
      if (isOnePassword && install) {
        setIsSetupDialogOpen(true);

        return;
      }

      restartRequiredToast();
    },
  });

  return (
    <>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <a
              href={`https://chromewebstore.google.com/detail/${extension.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:underline"
            >
              {extension.name}
              <ExternalLinkIcon className="size-3 text-muted-foreground" />
            </a>
            {installedVersion && <Badge variant="outline">Version {installedVersion}</Badge>}
            <LicenseKeyRequiredFieldBadge />
          </ItemTitle>
          <ItemDescription>{extension.description}</ItemDescription>
          {isOnePassword && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 self-start"
              // The dialog explains how to pair the extension with 1Password's
              // desktop app, which there is nothing to pair until it is
              // installed. Installing needs Meru Pro, so this locks with it.
              disabled={!installed}
              onClick={() => {
                setIsSetupDialogOpen(true);
              }}
            >
              Set up desktop app
            </Button>
          )}
        </ItemContent>
        <ItemActions>
          {extensionMutation.isPending && <Spinner />}
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
      {isOnePassword && (
        <OnePasswordSetupDialog open={isSetupDialogOpen} onOpenChange={setIsSetupDialogOpen} />
      )}
      <ExtensionErrorDialog
        error={extensionError}
        onDismiss={() => {
          setExtensionError(null);
        }}
      />
    </>
  );
}

function PasskeysAlert() {
  if (platform.isMacOS) {
    return (
      <Alert>
        <KeyRoundIcon />
        <AlertTitle>Passkeys work with Touch ID</AlertTitle>
        <AlertDescription>
          Add a passkey to your Google account from its security settings inside Meru and sign in
          with Touch ID — lighter than running an extension. iCloud passkeys don't work here, and
          filling passwords still needs a password manager.
        </AlertDescription>
      </Alert>
    );
  }

  if (platform.isWindows) {
    return (
      <Alert>
        <KeyRoundIcon />
        <AlertTitle>Passkeys work with Windows Hello</AlertTitle>
        <AlertDescription>
          Google sign-in uses Windows' own passkey dialog, so Windows Hello and synced passkeys work
          with no extension. Filling passwords still needs a password manager.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <KeyRoundIcon />
      <AlertTitle>Passkeys need a password manager</AlertTitle>
      <AlertDescription>
        Linux has no system passkey support, so a password manager extension is the only way to sign
        in to Google with a passkey in Meru.
      </AlertDescription>
    </Alert>
  );
}

function UpdateExtensionsButton() {
  const [extensionError, setExtensionError] = useState<ExtensionError | null>(null);

  const updateExtensionsMutation = useMutation({
    mutationFn: () => ipc.main.invoke("extensions.update"),
    onSuccess: ({ error, results }) => {
      if (error) {
        setExtensionError({ title: "Couldn't update extensions", description: error });

        return;
      }

      let updatedAny = false;

      const failedUpdates: { name: string; reason: string }[] = [];

      for (const result of results ?? []) {
        const name = curatedExtensions.find(({ id }) => id === result.id)?.name ?? result.id;

        switch (result.status) {
          case "updated": {
            updatedAny = true;

            toast.success(`${name} updated to ${result.version}`);

            break;
          }
          case "upToDate": {
            toast.success(`${name} is up to date`);

            break;
          }
          case "failed": {
            failedUpdates.push({ name, reason: result.error });

            break;
          }
        }
      }

      const [firstFailedUpdate] = failedUpdates;

      if (firstFailedUpdate) {
        setExtensionError({
          title:
            failedUpdates.length === 1
              ? `Couldn't update ${firstFailedUpdate.name}`
              : `Couldn't update ${failedUpdates.length} extensions`,
          description: `${failedUpdates
            .map(({ name, reason }) => `${name}: ${reason}`)
            .join("\n")}\n\nTry updating again.`,
        });
      }

      if (updatedAny) {
        queryClient.invalidateQueries({
          queryKey: installedExtensionsQueryKey,
        });

        restartRequiredToast();
      }
    },
  });

  return (
    <>
      <Button
        variant="outline"
        disabled={updateExtensionsMutation.isPending}
        onClick={() => {
          updateExtensionsMutation.mutate();
        }}
      >
        {updateExtensionsMutation.isPending && <Spinner />}
        Update extensions
      </Button>
      <ExtensionErrorDialog
        error={extensionError}
        onDismiss={() => {
          setExtensionError(null);
        }}
      />
    </>
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
        <SettingsTitle className="flex items-center gap-2">
          Extensions
          <BetaFieldBadge />
        </SettingsTitle>
        {config["extensions.installed"].length > 0 && <UpdateExtensionsButton />}
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldDescription>
            Extensions are loaded into every account and take effect after a restart. Meru installs
            the official extensions from the Chrome Web Store.
          </FieldDescription>
          <ConfigSwitchField
            label="Show extensions button"
            description="Show a titlebar button that lists the installed extensions and opens their popups."
            configKey="extensions.showTitlebarButton"
            licenseKeyRequired
          />
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Password managers</FieldLegend>
            <PasskeysAlert />
            <ItemGroup>
              {curatedExtensions
                .filter(({ category }) => category === "passwordManager")
                .map((extension) => (
                  <ExtensionItem
                    key={extension.id}
                    extension={extension}
                    installed={config["extensions.installed"].includes(extension.id)}
                    installedVersion={
                      installedExtensions?.find(({ id }) => id === extension.id)?.version
                    }
                  />
                ))}
            </ItemGroup>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
