import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { isValidCssColorInput } from "@meru/shared/color";
import { resolveGmailLabelTextColor } from "@meru/shared/gmail";
import {
  type GmailLabelColor,
  type GmailLabelColorInput,
  type GmailLabelTextColor,
  gmailLabelColorInputSchema,
} from "@meru/shared/schemas";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meru/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import { Item, ItemActions, ItemContent, ItemGroup } from "@meru/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { useForm } from "@tanstack/react-form";
import { PencilIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { SettingsDialogContent } from "@/components/settings-dialog-content";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";

const HEX_COLOR_REGEXP = /^#[0-9a-fA-F]{6}$/;

const EXAMPLE_HEX_COLOR = "#1a73e8";

const EXAMPLE_RGB_COLOR = "rgb(26, 115, 232)";

// lingui-set comment="Option of a label color's Text color setting"
const textColorItems: { value: GmailLabelTextColor; label: MessageDescriptor }[] = [
  { value: "auto", label: msg`Auto` },
  { value: "white", label: msg`White` },
  { value: "black", label: msg`Black` },
];
// lingui-reset

function LabelColorForm({
  labelColor = { label: "", color: "#1a73e8", textColor: "auto" },
  type,
  onSubmit,
}: {
  labelColor?: GmailLabelColorInput;
  type: "add" | "edit";
  onSubmit: (labelColor: GmailLabelColorInput) => void;
}) {
  const { t } = useLingui();

  const schema = useMemo(
    () =>
      gmailLabelColorInputSchema.extend({
        label: z.string().min(
          1,
          t({
            message: "Enter a label",
            context: "Gmail label",
            comment:
              "Error under the empty Label field, which takes the exact name of a Gmail label; label is Gmail's word",
          }),
        ),
        color: z
          .string()
          .min(1, t`Enter a color`)
          .refine(isValidCssColorInput, t`Enter a valid hex, rgb, or rgba color`),
      }),
    [t],
  );

  const translatedTextColorItems = textColorItems.map(({ value, label }) => ({
    value,
    label: t(label),
  }));

  const form = useForm({
    defaultValues: labelColor,
    validators: {
      onSubmit: schema,
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
      <form.Field name="label">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>
              <Trans
                context="Gmail label"
                comment="Field for the exact name of the Gmail label to recolor; label is Gmail's word"
              >
                Label
              </Trans>
            </FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder={t({
                message: "Work",
                comment: "Example of a Gmail label's name, shown in the empty Label field",
              })}
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      <form.Field name="color">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>
              <Trans comment="Field for the background color of a Gmail label">Color</Trans>
            </FieldLabel>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label={t`Pick color`}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                value={HEX_COLOR_REGEXP.test(field.state.value) ? field.state.value : "#000000"}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={t({
                  message: `${EXAMPLE_HEX_COLOR} or ${EXAMPLE_RGB_COLOR}`,
                  comment:
                    "Placeholder of the Color field, giving two example colors: a hex code and an rgb() value",
                })}
              />
            </div>
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      <form.Field name="textColor">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>
              <Trans comment="Setting for the color of a Gmail label's name">Text color</Trans>
            </FieldLabel>
            <Select
              items={translatedTextColorItems}
              value={field.state.value}
              onValueChange={(value) => {
                if (value) {
                  field.handleChange(value);
                }
              }}
            >
              <SelectTrigger id={field.name}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {translatedTextColorItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.Field>
      <DialogFooter>
        <DialogClose
          render={
            <Button variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          }
        />
        <Button type="submit">
          {type === "add" ? (
            <Trans comment="Button that adds the label color in the dialog">Add</Trans>
          ) : (
            <Trans comment="Button that saves the label color's changes in the dialog">Save</Trans>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddLabelColorButton({ onAdd }: { onAdd: (labelColor: GmailLabelColorInput) => void }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isLicenseKeyValid = useIsLicenseKeyValid();

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={!isLicenseKeyValid}>
            <Trans>Add label color</Trans>
          </Button>
        }
      />
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Add label color</Trans>
          </DialogTitle>
        </DialogHeader>
        <LabelColorForm
          type="add"
          onSubmit={(values) => {
            onAdd(values);

            setIsDialogOpen(false);
          }}
        />
      </SettingsDialogContent>
    </Dialog>
  );
}

function EditLabelColorButton({
  labelColor,
  onEdit,
}: {
  labelColor: GmailLabelColor;
  onEdit: (editedLabelColor: GmailLabelColor) => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { t } = useLingui();

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button size="icon" className="size-8 p-0" variant="outline" title={t`Edit label color`}>
            <PencilIcon />
          </Button>
        }
      />
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit label color</Trans>
          </DialogTitle>
        </DialogHeader>
        <LabelColorForm
          labelColor={labelColor}
          type="edit"
          onSubmit={(values) => {
            onEdit({ ...labelColor, ...values });

            setIsDialogOpen(false);
          }}
        />
      </SettingsDialogContent>
    </Dialog>
  );
}

export function GmailLabelColors() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <Field>
      <FieldDescription>
        <Trans>
          Recolor Gmail labels by their exact name. The text color defaults to whatever contrasts
          with the background, and can be set to white or black instead.
        </Trans>
      </FieldDescription>
      {config["gmail.labelColors"].length > 0 && (
        <ItemGroup className="grid grid-cols-2 gap-2">
          {config["gmail.labelColors"].map((labelColor) => (
            <Item key={labelColor.id} variant="muted" size="sm">
              <ItemContent>
                <Badge
                  className="border-border"
                  style={{
                    backgroundColor: labelColor.color,
                    color: resolveGmailLabelTextColor(labelColor.color, labelColor.textColor),
                  }}
                >
                  {labelColor.label}
                </Badge>
              </ItemContent>
              <ItemActions>
                <EditLabelColorButton
                  labelColor={labelColor}
                  onEdit={(editedLabelColor) => {
                    configMutation.mutate({
                      "gmail.labelColors": config["gmail.labelColors"].map((existingLabelColor) =>
                        existingLabelColor.id === editedLabelColor.id
                          ? editedLabelColor
                          : existingLabelColor,
                      ),
                    });
                  }}
                />
                <Button
                  size="icon"
                  className="size-8 p-0"
                  variant="outline"
                  title={t`Delete label color`}
                  onClick={() => {
                    configMutation.mutate({
                      "gmail.labelColors": config["gmail.labelColors"].filter(
                        (existingLabelColor) => existingLabelColor.id !== labelColor.id,
                      ),
                    });
                  }}
                >
                  <TrashIcon />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      <div>
        <AddLabelColorButton
          onAdd={(labelColor) => {
            if (!isLicenseKeyValid) {
              return;
            }

            configMutation.mutate({
              "gmail.labelColors": [
                ...config["gmail.labelColors"],
                {
                  id: crypto.randomUUID(),
                  ...labelColor,
                },
              ],
            });
          }}
        />
      </div>
    </Field>
  );
}
