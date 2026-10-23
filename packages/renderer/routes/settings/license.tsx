import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { WEBSITE_URL } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { Button, buttonVariants } from "@meru/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meru/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@meru/ui/components/input-group";
import { useForm, useForm as useTanStackForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon, MoreHorizontalIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useState } from "react";
import { z } from "zod";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { SettingsDialogContent } from "@/components/settings-dialog-content";
import { useConfig } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { useTrialStore } from "@/lib/stores";

export const licenseKeySchema = z.object({
  licenseKey: z.string(),
});

function LicenseKeyForm({
  onSubmit,
}: {
  onSubmit: (values: { licenseKey: z.infer<typeof licenseKeySchema>["licenseKey"] }) => void;
}) {
  const form = useForm({
    defaultValues: {
      licenseKey: "",
    },
    validators: {
      onSubmit: licenseKeySchema,
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();

        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="licenseKey">
          {(field) => {
            return (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  <Trans>License key</Trans>
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
                  // oxlint-disable-next-line lingui/no-unlocalized-strings -- the license key's format, which is the same in every language
                  placeholder="MERU-XXXX-XXXX-XXXX-XXXX-XXXX"
                />
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose
          render={
            <Button variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          }
        />
        <Button type="submit">
          <Trans comment="Button that activates the license key entered in the dialog">
            Activate
          </Trans>
        </Button>
      </DialogFooter>
    </form>
  );
}

function ActivateLicenseDialog({
  variant = "activate",
  children,
  ...props
}: {
  children?: ReactNode;
  variant?: "activate" | "change";
  onOpenChange: (open: boolean) => void;
} & Omit<ComponentProps<typeof Dialog>, "children" | "onOpenChange">) {
  return (
    <Dialog {...props}>
      {children}
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            {variant === "activate" ? (
              <Trans>Activate license key</Trans>
            ) : (
              <Trans>Change license key</Trans>
            )}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <Trans>Enter the license key sent to your email address after your purchase.</Trans>
        </DialogDescription>
        <LicenseKeyForm
          onSubmit={async ({ licenseKey }) => {
            const { success } = await ipc.main.invoke("licenseKey.activate", licenseKey);

            if (success && props.onOpenChange) {
              props.onOpenChange(false);
            }
          }}
        />
      </SettingsDialogContent>
    </Dialog>
  );
}

function ActivateLicenseKeyButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ActivateLicenseDialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Trans comment="Button that opens the dialog for activating a license key">
              Activate
            </Trans>
          </Button>
        }
      />
    </ActivateLicenseDialog>
  );
}

export function LicenseSettings() {
  const { t } = useLingui();

  const exactTrialDaysLeft = useTrialStore((state) => state.daysLeft);

  // The API counts to a tenth of a day, which reads as noise in a sentence.
  const trialDaysLeft = Math.floor(exactTrialDaysLeft);

  const isTrialExpired = useTrialStore((state) => state.expired);

  const [isChangeLicenseDialogOpen, setIsChangeLicenseDialogOpen] = useState(false);

  const [isLicenseKeyRevealed, setIsLicenseKeyRevealed] = useState(false);

  const licenseKeyFieldId = useId();

  const { config } = useConfig();

  const deviceInfoQueryKey = ["license.getDeviceInfo"];

  const { data: deviceInfo, refetch: refetchDeviceInfo } = useQuery({
    queryKey: deviceInfoQueryKey,
    queryFn: () => ipc.main.invoke("license.getDeviceInfo"),
    enabled: Boolean(config?.licenseKey),
  });

  const deviceInfoForm = useTanStackForm({
    defaultValues: {
      label: deviceInfo?.label || "",
    },
    validators: {
      onSubmit: z.object({
        label: z.string().min(1, t`Enter a device label`),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      await ipc.main.invoke("license.updateDeviceInfo", {
        label: value.label,
      });

      await refetchDeviceInfo();

      formApi.reset();
    },
  });

  if (!config) {
    return;
  }

  const renderContent = () => {
    if (config.licenseKey) {
      return (
        <div className="space-y-4">
          <div className="text-sm">
            <Trans>
              You're using Meru Pro, with the professional features and a license for commercial
              use. Thank you for supporting Meru.
            </Trans>
          </div>
          <div>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={licenseKeyFieldId}>
                  <Trans>License key</Trans>
                </FieldLabel>
                <div className="flex gap-2">
                  <InputGroup>
                    <InputGroupInput
                      id={licenseKeyFieldId}
                      value={config.licenseKey}
                      type={isLicenseKeyRevealed ? "text" : "password"}
                      readOnly
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        title={isLicenseKeyRevealed ? t`Hide license key` : t`Show license key`}
                        onClick={() => {
                          setIsLicenseKeyRevealed((isRevealed) => !isRevealed);
                        }}
                      >
                        {isLicenseKeyRevealed ? <EyeOffIcon /> : <EyeIcon />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon"
                          variant="secondary"
                          title={t({
                            message: "More options",
                            comment: "Button that opens a menu of actions for the license key",
                          })}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      }
                    />
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => {
                          if (config.licenseKey) {
                            navigator.clipboard.writeText(config.licenseKey);
                          }
                        }}
                      >
                        <Trans comment="Menu item that copies the license key">Copy</Trans>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setIsChangeLicenseDialogOpen(true);
                        }}
                      >
                        <Trans comment="Menu item that opens the dialog for changing the license key">
                          Change
                        </Trans>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ActivateLicenseDialog
                    variant="change"
                    open={isChangeLicenseDialogOpen}
                    onOpenChange={setIsChangeLicenseDialogOpen}
                  />
                </div>
              </Field>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  deviceInfoForm.handleSubmit();
                }}
              >
                <deviceInfoForm.Field name="label">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          <Trans comment="Field for the name this computer goes by among the devices using the license key">
                            Device label
                          </Trans>
                        </FieldLabel>
                        <div className="flex items-end gap-2">
                          <InputGroup>
                            <InputGroupInput
                              id={field.name}
                              name={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              aria-invalid={isInvalid}
                              disabled={!deviceInfo}
                            />
                            {!deviceInfo && (
                              <InputGroupAddon>
                                <LoadingSpinner />
                              </InputGroupAddon>
                            )}
                          </InputGroup>
                          <deviceInfoForm.Subscribe
                            selector={(state) => [state.isPristine, state.isSubmitting]}
                          >
                            {([isPristine, isSubmitting]) => (
                              <Button
                                type="submit"
                                variant="secondary"
                                disabled={isPristine || isSubmitting}
                              >
                                {isSubmitting && <LoadingSpinner />}
                                <Trans comment="Button that saves the device label">Save</Trans>
                              </Button>
                            )}
                          </deviceInfoForm.Subscribe>
                        </div>
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    );
                  }}
                </deviceInfoForm.Field>
              </form>
            </FieldGroup>
          </div>
        </div>
      );
    }

    if (exactTrialDaysLeft || isTrialExpired) {
      return (
        <>
          <div className="mb-4 space-y-2 text-sm">
            {isTrialExpired ? (
              <>
                <div>
                  <Trans>
                    Your Meru Pro trial has ended. Meru Pro features stay on until you quit Meru.
                  </Trans>
                </div>
                <div>
                  <Trans>Upgrade to Meru Pro to keep using all features.</Trans>
                </div>
              </>
            ) : (
              <>
                <div>
                  {trialDaysLeft >= 1
                    ? t({
                        message: plural(trialDaysLeft, {
                          one: "You're using a Meru Pro trial with # day left.",
                          other: "You're using a Meru Pro trial with # days left.",
                        }),
                      })
                    : t`You're using a Meru Pro trial with less than a day left.`}
                </div>
                <div>
                  <Trans>
                    Upgrade to Meru Pro before your trial ends to keep using all features.
                  </Trans>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-4">
            <ActivateLicenseKeyButton />
            <a
              href={`${WEBSITE_URL}#pricing`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants()}
            >
              <Trans comment="Button on the License page in Settings, which opens Meru Pro's pricing page">
                Upgrade
              </Trans>
            </a>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="mb-4 space-y-2 text-sm">
          <div>
            <Trans>You're using the free version of Meru for personal use.</Trans>
          </div>
          <div>
            <Trans>
              Unlock Meru Pro for professional features and commercial use. Your upgrade supports
              ongoing development.
            </Trans>
          </div>
        </div>
        <div className="flex gap-4">
          <ActivateLicenseKeyButton />
          <a
            href={`${WEBSITE_URL}#pricing`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants()}
          >
            <Trans comment="Button on the License page in Settings, which opens Meru Pro's pricing page">
              Upgrade
            </Trans>
          </a>
        </div>
      </>
    );
  };

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.license)}</SettingsTitle>
      </SettingsHeader>
      {renderContent()}
    </>
  );
}
