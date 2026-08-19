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
import { FieldDescription, FieldLegend, FieldSet } from "@meru/ui/components/field";
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
            Restart Now
          </Button>
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

  const extensionMutation = useMutation({
    mutationFn: (install: boolean) =>
      install
        ? ipc.main.invoke("extensions.install", extension.id)
        : ipc.main.invoke("extensions.uninstall", extension.id),
    onSuccess: ({ error }, install) => {
      if (error) {
        toast.error(error);

        return;
      }

      void queryClient.invalidateQueries({
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
              onClick={() => {
                setIsSetupDialogOpen(true);
              }}
            >
              Set Up Desktop App
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
    </>
  );
}

function PasskeysAlert() {
  if (platform.isMacOS) {
    return (
      <Alert>
        <KeyRoundIcon />
        <AlertTitle>Meru can sign you in with a Touch ID passkey</AlertTitle>
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
        <AlertTitle>Meru can sign you in with your Windows passkeys</AlertTitle>
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
      <AlertTitle>Passkeys need a password manager on Linux</AlertTitle>
      <AlertDescription>
        Linux has no system passkey support, so a password manager extension is the only way to sign
        in to Google with a passkey in Meru.
      </AlertDescription>
    </Alert>
  );
}

function UpdateExtensionsButton() {
  const updateExtensionsMutation = useMutation({
    mutationFn: () => ipc.main.invoke("extensions.update"),
    onSuccess: ({ error, results }) => {
      if (error) {
        toast.error(error);

        return;
      }

      let updatedAny = false;

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
            toast.error(`Couldn't update ${name}: ${result.error}`);

            break;
          }
        }
      }

      if (updatedAny) {
        void queryClient.invalidateQueries({
          queryKey: installedExtensionsQueryKey,
        });

        restartRequiredToast();
      }
    },
  });

  return (
    <Button
      variant="outline"
      disabled={updateExtensionsMutation.isPending}
      onClick={() => {
        updateExtensionsMutation.mutate();
      }}
    >
      {updateExtensionsMutation.isPending && <Spinner />}
      Update Extensions
    </Button>
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
      <SettingsContent className="space-y-4">
        <LicenseKeyRequiredBanner />
        <FieldDescription>
          Extensions are loaded into every account and take effect after a restart. Meru installs
          the official extensions from the Chrome Web Store.
        </FieldDescription>
        <FieldSet>
          <FieldLegend>Password Managers</FieldLegend>
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
      </SettingsContent>
    </Settings>
  );
}
