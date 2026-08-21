import type { Config } from "@meru/shared/types";
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
import { Field, FieldContent, FieldDescription, FieldLabel } from "@meru/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { type ReactNode, useState } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { LicenseKeyRequiredFieldBadge } from "./license-key-required-field-badge";

export function ConfigSelectField({
  configKey,
  label,
  description,
  items,
  licenseKeyRequired,
  disabled,
  restartRequired,
  confirmation,
}: {
  configKey: keyof Config;
  label: string;
  description: ReactNode;
  items: { value: string; label: string }[];
  licenseKeyRequired?: boolean;
  disabled?: boolean;
  restartRequired?: boolean;
  /**
   * Holds the value back until the user confirms it. The field keeps rendering
   * the value from config while the dialog is open, so cancelling needs no
   * reverting — nothing was written.
   */
  confirmation?: {
    when: (value: string) => boolean;
    title: string;
    description: ReactNode;
    confirmLabel: string;
  };
}) {
  const { config } = useConfig();

  const configMutation = useConfigMutation({
    onSuccess: () => {
      if (restartRequired) {
        restartRequiredToast();
      }
    },
  });

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const [confirmableValue, setConfirmableValue] = useState<string | null>(null);

  if (!config) {
    return;
  }

  const value = config[configKey];

  if (typeof value !== "string") {
    throw new Error(`ConfigSelectField: Config key "${configKey}" is not a string`);
  }

  const isDisabled = disabled || (licenseKeyRequired && !isLicenseKeyValid);

  const setValue = (newValue: string) => {
    configMutation.mutate({
      [configKey]: newValue,
    });
  };

  return (
    <Field>
      <FieldContent>
        <FieldLabel className="flex items-center gap-2">
          {label}
          {licenseKeyRequired && <LicenseKeyRequiredFieldBadge />}
        </FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Select
        items={items}
        value={value}
        onValueChange={(newValue) => {
          if (!newValue) {
            return;
          }

          if (confirmation?.when(newValue)) {
            setConfirmableValue(newValue);

            return;
          }

          setValue(newValue);
        }}
        disabled={isDisabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {confirmation && (
        <Dialog
          open={confirmableValue !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setConfirmableValue(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmation.title}</DialogTitle>
            </DialogHeader>
            <DialogDescription>{confirmation.description}</DialogDescription>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button
                onClick={() => {
                  if (confirmableValue) {
                    setValue(confirmableValue);
                  }

                  setConfirmableValue(null);
                }}
              >
                {confirmation.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Field>
  );
}
