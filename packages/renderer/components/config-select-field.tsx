import type { Config } from "@meru/shared/types";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@meru/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { LicenseKeyRequiredFieldBadge } from "./license-key-required-field-badge";

export function ConfigSelectField({
  configKey,
  label,
  description,
  items,
  placeholder,
  licenseKeyRequired,
  disabled,
  restartRequired,
}: {
  configKey: keyof Config;
  label: string;
  description: string;
  items: { value: string; label: string }[];
  placeholder: string;
  licenseKeyRequired?: boolean;
  disabled?: boolean;
  restartRequired?: boolean;
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

  if (!config) {
    return;
  }

  const value = config[configKey];

  if (typeof value !== "string") {
    throw new Error(`ConfigSelectField: Config key "${configKey}" is not a string`);
  }

  const isDisabled = disabled || (licenseKeyRequired && !isLicenseKeyValid);

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
          if (newValue) {
            configMutation.mutate({
              [configKey]: newValue,
            });
          }
        }}
        disabled={isDisabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
