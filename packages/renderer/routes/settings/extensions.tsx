import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  BITWARDEN_EXTENSION_ID,
  type CuratedExtension,
  curatedExtensions,
  getConflictingExtensionIds,
  getCuratedExtension,
  normalizeExtensionSiteHostname,
  ONEPASSWORD_EXTENSION_ID,
} from "@meru/shared/extensions";
import { ipc } from "@meru/shared/renderer/ipc";
import type { Config } from "@meru/shared/types";
import { Alert, AlertDescription, AlertTitle } from "@meru/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@meru/ui/components/alert-dialog";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meru/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@meru/ui/components/item";
import { Switch } from "@meru/ui/components/switch";
import { cn } from "@meru/ui/lib/utils";
import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, FlaskConicalIcon, KeyRoundIcon } from "lucide-react";
import { type ComponentProps, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { CopyButton } from "@/components/copy-button";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { MaturityFieldBadge } from "@/components/maturity-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { SettingsDialogContent } from "@/components/settings-dialog-content";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { queryClient, useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { restartRequiredToast } from "@/lib/toast";
import { platform } from "@/lib/utils";

const installedExtensionsQueryKey = ["installed-extensions"];

/**
 * Shared by every item's install and uninstall, so that one in flight locks
 * the others: a swap reads what is installed when the user confirms it, and a
 * second item turned on meanwhile would install without asking.
 */
const extensionToggleMutationKey = ["extension-toggle"];

/**
 * Translated here rather than in `@meru/shared/extensions`, which end-to-end
 * tests and the download script import without the Lingui transform.
 */
// lingui-set comment="Description of a password manager extension in Settings. Google Account is Google's name for the account, so use Google's own word for it in that language"
const extensionDescriptions: Record<string, MessageDescriptor> = {
  [ONEPASSWORD_EXTENSION_ID]: msg`Fills and generates passwords and passkeys for your Google Account. Needs the 1Password desktop app, connected to Meru.`,
  [BITWARDEN_EXTENSION_ID]: msg`Fills and generates passwords and passkeys for your Google Account. Unlocking with biometrics needs the Bitwarden desktop app.`,
};
// lingui-reset

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
    const allowlistEntry = "meru";

    return (
      <>
        <li>
          <Trans>Quit 1Password.</Trans>
        </li>
        <li>
          <Trans>Open the browser allowlist in an editor with root permissions.</Trans>
          <div className="mt-2 flex items-center gap-2">
            <Code className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5">
              {ONEPASSWORD_ALLOWED_BROWSERS_COMMAND}
            </Code>
            <CopyButton value={ONEPASSWORD_ALLOWED_BROWSERS_COMMAND} size="icon-sm" />
          </div>
        </li>
        <li>
          <Trans comment="allowlistEntry is the line to add to 1Password's list of allowed browsers, which stays as it is">
            Add <Code>{allowlistEntry}</Code> on its own line, then save.
          </Trans>
        </li>
        <li>
          <Trans>Open and unlock 1Password again.</Trans>
        </li>
        <li>
          <Trans>Restart Meru.</Trans>
        </li>
      </>
    );
  }

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- a Windows folder path, the same in every language
  const installFolder = "%LOCALAPPDATA%\\Programs\\Meru";

  return (
    <>
      <li>
        <Trans>Open and unlock 1Password.</Trans>
      </li>
      <li>
        <Trans comment="Settings is the item in the 1Password app, so use the word 1Password shows in that language">
          Select your account at the top of the sidebar, then select Settings.
        </Trans>
      </li>
      <li>
        <Trans comment="Browser and Add Browser are in 1Password's settings, so use the words 1Password shows in that language">
          Select Browser, then select Add Browser.
        </Trans>
      </li>
      <li>
        {platform.isMacOS ? (
          <Trans comment="Applications is the macOS folder, so use the name the Finder shows in that language">
            Choose Meru in the Applications folder.
          </Trans>
        ) : (
          <Trans comment="installFolder is the folder Meru is installed in on Windows, which stays as it is">
            Choose Meru in <Code>{installFolder}</Code>.
          </Trans>
        )}
      </li>
      <li>
        <Trans>Restart Meru.</Trans>
      </li>
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
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Connect 1Password</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <Trans>
            Filling passwords and passkeys needs the 1Password desktop app, because Meru stores no
            vault data of its own. Trust Meru in 1Password's settings to connect the two.
          </Trans>
        </DialogDescription>
        <ol className="ml-4 list-decimal space-y-2 marker:text-muted-foreground">
          <OnePasswordSetupSteps />
        </ol>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline">
                <Trans comment="Dialog button that puts off restarting Meru">Later</Trans>
              </Button>
            }
          />
          <Button
            onClick={() => {
              ipc.main.send("app.relaunch");
            }}
          >
            <Trans comment="Dialog button that restarts Meru">Restart</Trans>
          </Button>
        </DialogFooter>
      </SettingsDialogContent>
    </Dialog>
  );
}

function ReplaceExtensionDialog({
  extension,
  replacedExtension,
  open,
  onOpenChange,
  onReplace,
}: {
  extension: CuratedExtension;
  replacedExtension: CuratedExtension | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplace: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  if (!replacedExtension) {
    return;
  }

  const extensionName = extension.name;

  const replacedExtensionName = replacedExtension.name;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent initialFocus={cancelButtonRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans comment="Both are password manager extensions">
              Replace {replacedExtensionName} with {extensionName}?
            </Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans comment="Both are password manager extensions">
              Only one password manager can be on at a time. Turning on {extensionName} turns off{" "}
              {replacedExtensionName} in Meru and signs you out of it here. Your passwords stay in
              your {replacedExtensionName} account.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelButtonRef}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogClose
            render={<AlertDialogAction variant="destructive" />}
            onClick={onReplace}
          >
            <Trans comment="Button that turns on a password manager extension in place of the one that is on">
              Replace
            </Trans>
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>{error?.title}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="whitespace-pre-line">{error?.description}</DialogDescription>
        <DialogFooter>
          <DialogClose
            render={
              <Button>
                <Trans>OK</Trans>
              </Button>
            }
          />
        </DialogFooter>
      </SettingsDialogContent>
    </Dialog>
  );
}

/**
 * The sites the user added on top of the ones the extension is offered for,
 * which only exist for an extension the catalog clamps to begin with.
 */
function ExtensionSitesDialog({
  extension,
  additionalSites,
  open,
  onOpenChange,
}: {
  extension: CuratedExtension;
  additionalSites: Config["extensions.additionalSites"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const siteInputId = useId();

  const { t } = useLingui();

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- an example address, the same in every language
  const exampleSite = "sso.example.com";

  const extensionName = extension.name;

  const [siteInput, setSiteInput] = useState("");

  const [siteInputError, setSiteInputError] = useState<string | null>(null);

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
      setSiteInputError(t`Enter a website address, like ${exampleSite}.`);

      return;
    }

    setSiteInput("");

    setSiteInputError(null);

    if (sites.includes(hostname)) {
      return;
    }

    saveSites([...sites, hostname]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans comment="extensionName is a password manager extension's name">
              Sites for {extensionName}
            </Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <Trans comment="extensionName is a password manager extension's name">
            {extensionName} runs on Google's sign-in pages only. Add a site to run it there too,
            such as your company's single sign-on provider. Sites apply after a restart.
          </Trans>
        </DialogDescription>
        {sites.length > 0 && (
          <div className="space-y-2">
            {sites.map((site) => (
              <div className="flex items-center gap-2 text-sm" key={site}>
                <div className="flex-1">{site}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    saveSites(sites.filter((keptSite) => keptSite !== site));
                  }}
                  aria-label={t({
                    message: `Remove ${site}`,
                    comment:
                      "Screen reader label of the button that removes a site; site is its address",
                  })}
                >
                  <Trans comment="Button that removes a site from the extension's sites">
                    Remove
                  </Trans>
                </Button>
              </div>
            ))}
          </div>
        )}
        <Field>
          <FieldLabel htmlFor={siteInputId} className="sr-only">
            <Trans comment="Screen reader label of the field for the address of a site to add">
              Site to add
            </Trans>
          </FieldLabel>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();

              addSite();
            }}
          >
            <Input
              id={siteInputId}
              value={siteInput}
              onChange={(event) => {
                setSiteInput(event.target.value);

                setSiteInputError(null);
              }}
              placeholder={exampleSite}
            />
            <Button type="submit" variant="outline">
              <Trans comment="Button that adds the site entered in the field">Add</Trans>
            </Button>
          </form>
          {siteInputError && <FieldError>{siteInputError}</FieldError>}
        </Field>
        <DialogFooter>
          <DialogClose
            render={
              <Button>
                <Trans comment="Button that closes the dialog of an extension's sites">Done</Trans>
              </Button>
            }
          />
        </DialogFooter>
      </SettingsDialogContent>
    </Dialog>
  );
}

function ExtensionItem({
  extension,
  extensionsEnabled,
  installedExtensionIds,
  installedVersion,
  additionalSites,
}: {
  extension: CuratedExtension;
  extensionsEnabled: boolean;
  installedExtensionIds: string[];
  installedVersion: string | undefined;
  additionalSites: Config["extensions.additionalSites"];
}) {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { t } = useLingui();

  const description = extensionDescriptions[extension.id];

  const extensionName = extension.name;

  const installed = installedExtensionIds.includes(extension.id);

  const [replacedExtensionId] = getConflictingExtensionIds(extension.id, installedExtensionIds);

  const replacedExtension = replacedExtensionId
    ? getCuratedExtension(replacedExtensionId)
    : undefined;

  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);

  const isAnyToggleRunning = useIsMutating({ mutationKey: extensionToggleMutationKey }) > 0;

  // Uninstalling is deliberately ungated, so that an extension can be taken off
  // a device that has lost its license — which needs the switch to stay on and
  // usable once something is installed, or the only way out of it is gone. The
  // master switch still locks it, since nothing loads while that is off.
  const toggleLocked = !extensionsEnabled || (!installed && !isLicenseKeyValid);

  const isOnePassword = extension.id === ONEPASSWORD_EXTENSION_ID;

  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);

  const [isSitesDialogOpen, setIsSitesDialogOpen] = useState(false);

  // Both dialogs act on an extension that is installed and loaded, which needs
  // Meru Pro and the master switch
  const dialogsLocked = !extensionsEnabled || !isLicenseKeyValid || !installed;

  const [extensionError, setExtensionError] = useState<ExtensionError | null>(null);

  // Shown only once there is a loaded extension to open, rather than locked
  // like the buttons beside it, since it is the extension's own way in
  const showsWindowButton = Boolean(extension.windowPagePath) && !dialogsLocked;

  const openWindowMutation = useMutation({
    mutationFn: () => ipc.main.invoke("extensions.openWindow", extension.id),
    onSuccess: ({ error }) => {
      if (error) {
        setExtensionError({ title: t`Couldn't open ${extensionName}`, description: error });
      }
    },
  });

  const extensionMutation = useMutation({
    mutationKey: extensionToggleMutationKey,
    mutationFn: (install: boolean) =>
      install
        ? ipc.main.invoke("extensions.install", extension.id)
        : ipc.main.invoke("extensions.uninstall", extension.id),
    onSuccess: ({ error }, install) => {
      if (error) {
        // A swap that failed partway has still uninstalled the other
        queryClient.invalidateQueries({
          queryKey: installedExtensionsQueryKey,
        });

        setExtensionError({
          title: install
            ? t`Couldn't install ${extensionName}`
            : t`Couldn't uninstall ${extensionName}`,
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
              {extensionName}
              <ExternalLinkIcon className="size-3 text-muted-foreground" />
            </a>
            {installedVersion && (
              <Badge variant="outline">
                <Trans comment="Badge with the installed version of the extension">
                  Version {installedVersion}
                </Trans>
              </Badge>
            )}
            <LicenseKeyRequiredFieldBadge />
          </ItemTitle>
          <ItemDescription>{description ? t(description) : extension.description}</ItemDescription>
          {(isOnePassword || showsWindowButton || extension.contentScriptMatches) && (
            <div className="mt-1 flex flex-wrap gap-2 self-start">
              {showsWindowButton && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={openWindowMutation.isPending}
                  onClick={() => {
                    openWindowMutation.mutate();
                  }}
                >
                  <Trans comment="Button that opens the extension's own window, to sign in to it">
                    Open {extensionName}
                  </Trans>
                </Button>
              )}
              {isOnePassword && (
                <Button
                  variant="outline"
                  size="sm"
                  // The dialog explains how to pair the extension with
                  // 1Password's desktop app, which there is nothing to pair
                  // until it is installed and loaded. Installing needs Meru Pro
                  // and loading needs the master switch, so this locks with both.
                  disabled={dialogsLocked}
                  onClick={() => {
                    setIsSetupDialogOpen(true);
                  }}
                >
                  <Trans comment="Button that opens the steps for connecting the extension to the 1Password desktop app">
                    Set up desktop app
                  </Trans>
                </Button>
              )}
              {extension.contentScriptMatches && (
                <Button
                  variant="outline"
                  size="sm"
                  // Locked with the setup button: nothing to scope until the
                  // extension is installed and loaded
                  disabled={dialogsLocked}
                  onClick={() => {
                    setIsSitesDialogOpen(true);
                  }}
                >
                  <Trans comment="Button that opens the dialog of the sites the extension runs on">
                    Add sites
                  </Trans>
                </Button>
              )}
            </div>
          )}
        </ItemContent>
        <ItemActions>
          {extensionMutation.isPending && <LoadingSpinner />}
          <Switch
            checked={extensionsEnabled && installed}
            disabled={toggleLocked || isAnyToggleRunning}
            onCheckedChange={(checked) => {
              if (checked && replacedExtension) {
                setIsReplaceDialogOpen(true);

                return;
              }

              extensionMutation.mutate(checked);
            }}
            aria-label={t({
              message: `Install ${extensionName}`,
              comment: "Screen reader label of the switch that installs the extension",
            })}
          />
        </ItemActions>
      </Item>
      <ReplaceExtensionDialog
        extension={extension}
        replacedExtension={replacedExtension}
        open={isReplaceDialogOpen}
        onOpenChange={setIsReplaceDialogOpen}
        onReplace={() => {
          extensionMutation.mutate(true);
        }}
      />
      {isOnePassword && (
        <OnePasswordSetupDialog open={isSetupDialogOpen} onOpenChange={setIsSetupDialogOpen} />
      )}
      {extension.contentScriptMatches && (
        <ExtensionSitesDialog
          extension={extension}
          additionalSites={additionalSites}
          open={isSitesDialogOpen}
          onOpenChange={setIsSitesDialogOpen}
        />
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

function ExperimentalAlert() {
  return (
    <Alert>
      <FlaskConicalIcon />
      <AlertTitle>
        <Trans>Extensions are in testing</Trans>
      </AlertTitle>
      <AlertDescription>
        <Trans>
          Extension support is still being tested and may not work as reliably as the rest of Meru.
          To help make it stable, report any issues.
        </Trans>
      </AlertDescription>
    </Alert>
  );
}

function PasskeysAlert() {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (platform.isMacOS) {
    return (
      <Alert>
        <KeyRoundIcon />
        <AlertTitle>
          <Trans>Sign in to Google with a passkey and Touch ID</Trans>
        </AlertTitle>
        <AlertDescription>
          {isLicenseKeyValid ? (
            <Trans>
              Add a passkey to your Google account from its security settings inside Meru, then sign
              in with Touch ID — no password manager extension to install, so Meru stays fast and
              light. iCloud passkeys don't work here, and filling passwords still needs a password
              manager.
            </Trans>
          ) : (
            <Trans>
              Meru Pro lets you add a passkey to your Google account from its security settings
              inside Meru, then sign in with Touch ID — no password manager extension to install, so
              Meru stays fast and light. iCloud passkeys don't work here, and filling passwords
              still needs a password manager.
            </Trans>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (platform.isWindows) {
    return (
      <Alert>
        <KeyRoundIcon />
        <AlertTitle>
          <Trans>Sign in to Google with a passkey and Windows Hello</Trans>
        </AlertTitle>
        <AlertDescription>
          <Trans>
            Add a passkey to your Google account from its security settings inside Meru, then sign
            in with Windows Hello — no password manager extension to install, so Meru stays fast and
            light. Passkeys from Chrome, Google Password Manager, or your phone don't work here, and
            filling passwords still needs a password manager.
          </Trans>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <KeyRoundIcon />
      <AlertTitle>
        <Trans>Passkeys need a password manager</Trans>
      </AlertTitle>
      <AlertDescription>
        <Trans>
          Linux has no system passkey support, so a password manager extension is the only way to
          sign in to Google with a passkey in Meru.
        </Trans>
      </AlertDescription>
    </Alert>
  );
}

function UpdateExtensionsButton() {
  const { t } = useLingui();

  const [extensionError, setExtensionError] = useState<ExtensionError | null>(null);

  const updateExtensionsMutation = useMutation({
    mutationFn: () => ipc.main.invoke("extensions.update"),
    onSuccess: ({ error, results }) => {
      if (error) {
        setExtensionError({ title: t`Couldn't update extensions`, description: error });

        return;
      }

      let updatedAny = false;

      const failedUpdates: { name: string; reason: string }[] = [];

      for (const result of results ?? []) {
        const name = curatedExtensions.find(({ id }) => id === result.id)?.name ?? result.id;

        switch (result.status) {
          case "updated": {
            updatedAny = true;

            const { version } = result;

            toast.success(
              t({
                message: `${name} updated to ${version}`,
                comment: "name is an extension's name",
              }),
            );

            break;
          }
          case "upToDate": {
            toast.success(
              t({
                message: `${name} is up to date`,
                comment: "name is an extension's name",
              }),
            );

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
        const failedName = firstFailedUpdate.name;

        const failedCount = failedUpdates.length;

        const failures = failedUpdates
          .map(({ name, reason }) =>
            t({
              message: `${name}: ${reason}`,
              comment:
                "name is an extension's name; reason is the technical reason, left untranslated",
            }),
          )
          .join("\n");

        setExtensionError({
          title:
            failedCount === 1
              ? t({
                  message: `Couldn't update ${failedName}`,
                  comment:
                    "failedName is an extension's name, shown when only that one failed to update",
                })
              : t({
                  message: plural(failedCount, {
                    one: "Couldn't update # extension",
                    other: "Couldn't update # extensions",
                  }),
                  comment: "Title of the dialog when more than one extension failed to update",
                }),
          description: `${failures}\n\n${t`Try updating again.`}`,
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
        {updateExtensionsMutation.isPending && <LoadingSpinner />}
        <Trans>Update extensions</Trans>
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

  const { t } = useLingui();

  const { data: installedExtensions } = useQuery({
    queryKey: installedExtensionsQueryKey,
    queryFn: () => ipc.main.invoke("extensions.getInstalled"),
  });

  if (!config) {
    return;
  }

  const extensionsEnabled = config["extensions.enabled"];

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle className="flex items-center gap-2">
          {t(settingsPageLabels.extensions)}
          <MaturityFieldBadge maturity="Experimental" />
        </SettingsTitle>
        {extensionsEnabled && config["extensions.installed"].length > 0 && (
          <UpdateExtensionsButton />
        )}
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ExperimentalAlert />
          <FieldDescription>
            <Trans>
              Extensions add features to Meru, like filling passwords on the Google sign-in page.
              Turn one on below and Meru installs the official version from the Chrome Web Store.
              Extensions start after a restart, and every account shares one copy, so you sign in to
              an extension once.
            </Trans>
          </FieldDescription>
          <ConfigSwitchField
            label={t`Enable extensions`}
            description={t`Run the installed extensions. Turning this off stops them without uninstalling them.`}
            configKey="extensions.enabled"
            licenseKeyRequired
            restartRequired
          />
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the password manager extensions">Password managers</Trans>
            </FieldLegend>
            <PasskeysAlert />
            <ItemGroup>
              {curatedExtensions
                .filter(({ category }) => category === "passwordManager")
                .map((extension) => (
                  <ExtensionItem
                    key={extension.id}
                    extension={extension}
                    extensionsEnabled={extensionsEnabled}
                    installedExtensionIds={config["extensions.installed"]}
                    installedVersion={
                      installedExtensions?.find(({ id }) => id === extension.id)?.version
                    }
                    additionalSites={config["extensions.additionalSites"]}
                  />
                ))}
            </ItemGroup>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
