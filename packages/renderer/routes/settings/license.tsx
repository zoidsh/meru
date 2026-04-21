import { useTranslation } from "@meru/i18n/provider";
import { ipc } from "@meru/renderer-lib/ipc";
import { WEBSITE_URL } from "@meru/shared/constants";
import { Button, buttonVariants } from "@meru/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@meru/ui/components/input-group";
import { Spinner } from "@meru/ui/components/spinner";
import { useForm, useForm as useTanStackForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";
import { useTrialStore } from "@/lib/stores";

export const licenseKeySchema = z.object({
  licenseKey: z.string(),
});

function LicenseKeyForm({
  onSubmit,
}: {
  onSubmit: (values: { licenseKey: z.infer<typeof licenseKeySchema>["licenseKey"] }) => void;
}) {
  const { t } = useTranslation();

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
                <FieldLabel>{t("settings.license.licenseKey")}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
                  placeholder={t("settings.license.licenseKeyPlaceholder")}
                />
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <div className="flex justify-end items-center">
        <Button type="submit">{t("settings.license.activate")}</Button>
      </div>
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
  const { t } = useTranslation();

  return (
    <Dialog {...props}>
      {children}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {variant === "activate"
              ? t("settings.license.activateLicenseKey")
              : t("settings.license.changeLicenseKey")}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>{t("settings.license.enterKeyDescription")}</DialogDescription>
        <LicenseKeyForm
          onSubmit={async ({ licenseKey }) => {
            const { success } = await ipc.main.invoke("licenseKey.activate", licenseKey);

            if (success && props.onOpenChange) {
              props.onOpenChange(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ActivateLicenseKeyButton() {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);

  return (
    <ActivateLicenseDialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="outline">{t("settings.license.activate")}</Button>} />
    </ActivateLicenseDialog>
  );
}

export function LicenseSettings() {
  const { t } = useTranslation();

  const trialDaysLeft = useTrialStore((state) => state.daysLeft);

  const [isChangeLicenseDialogOpen, setIsChangeLicenseDialogOpen] = useState(false);

  const [isLicenseKeyRevealed, setIsLicenseKeyRevealed] = useState(false);

  const { config } = useConfig();

  const deviceInfoQueryKey = ["license.getDeviceInfo"];

  const { data: deviceInfo, refetch: refetchDeviceInfo } = useQuery({
    queryKey: deviceInfoQueryKey,
    queryFn: () => ipc.main.invoke("license.getDeviceInfo"),
  });

  const deviceInfoForm = useTanStackForm({
    defaultValues: {
      label: deviceInfo?.label || "",
    },
    validators: {
      onSubmit: z.object({
        label: z.string().min(1, t("settings.license.deviceLabelRequired")),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      await ipc.main.invoke("license.updateDeviceInfo", {
        label: value.label,
      });

      await refetchDeviceInfo();

      formApi.reset();

      toast(t("settings.license.deviceLabelUpdated"));
    },
  });

  if (!config) {
    return;
  }

  const renderContent = () => {
    if (config.licenseKey) {
      return (
        <div className="space-y-4">
          <div className="text-sm">{t("settings.license.activeDescription")}</div>
          <div>
            <FieldGroup>
              <Field>
                <FieldLabel>{t("settings.license.licenseKey")}</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("settings.license.clickToReveal")}
                    value={isLicenseKeyRevealed ? config.licenseKey : ""}
                    onFocus={() => {
                      setIsLicenseKeyRevealed(true);
                    }}
                    onBlur={() => {
                      setIsLicenseKeyRevealed(false);
                    }}
                    readOnly
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="icon" variant="secondary">
                          <MoreHorizontalIcon />
                        </Button>
                      }
                    />
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => {
                          if (config.licenseKey) {
                            navigator.clipboard.writeText(config.licenseKey);

                            toast(t("settings.license.copiedToClipboard"));
                          }
                        }}
                      >
                        {t("settings.license.copy")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setIsChangeLicenseDialogOpen(true);
                        }}
                      >
                        {t("settings.license.change")}
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
                          {t("settings.license.deviceLabel")}
                        </FieldLabel>
                        <div className="flex gap-2 items-end">
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
                                <Spinner />
                              </InputGroupAddon>
                            )}
                          </InputGroup>
                          <deviceInfoForm.Subscribe
                            selector={(state) => [state.isPristine, state.isSubmitting]}
                          >
                            {([isPristine, isSubmitting]) => (
                              <Button variant="secondary" disabled={isPristine || isSubmitting}>
                                {isSubmitting && <Spinner />}
                                {t("settings.license.save")}
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

    if (trialDaysLeft) {
      return (
        <>
          <div className="space-y-2 text-sm mb-4">
            <div>{t("settings.license.trialDaysLeft", { count: trialDaysLeft })}</div>
            <div>{t("settings.license.trialPurchaseReminder")}</div>
          </div>
          <div className="flex gap-4">
            <ActivateLicenseKeyButton />
            <a
              href={`${WEBSITE_URL}#pricing`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants()}
            >
              {t("settings.license.purchase")}
            </a>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="space-y-2 text-sm mb-4">
          <div>{t("settings.license.freeDescriptionLine1")}</div>
          <div>{t("settings.license.freeDescriptionLine2")}</div>
        </div>
        <div className="flex gap-4">
          <ActivateLicenseKeyButton />
          <a
            href={`${WEBSITE_URL}#pricing`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants()}
          >
            {t("settings.license.purchase")}
          </a>
        </div>
      </>
    );
  };

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t("settings.license.title")}</SettingsTitle>
      </SettingsHeader>
      {renderContent()}
    </>
  );
}
