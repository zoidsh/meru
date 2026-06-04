import {
  type GmailLabelColor,
  type GmailLabelColorInput,
  type GmailLabelTextColor,
  gmailLabelColorInputSchema,
} from "@meru/shared/schemas";
import { resolveGmailLabelTextColor } from "@meru/shared/gmail";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meru/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { Item, ItemActions, ItemContent, ItemGroup } from "@meru/ui/components/item";
import { useForm } from "@tanstack/react-form";
import { PencilIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";

const HEX_COLOR_REGEXP = /^#[0-9a-fA-F]{6}$/;

const textColorItems: { value: GmailLabelTextColor; label: string }[] = [
  { value: "auto", label: "Auto (contrast)" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
];

function LabelColorForm({
  labelColor = { label: "", color: "#1a73e8", textColor: "auto" },
  type,
  onSubmit,
}: {
  labelColor?: GmailLabelColorInput;
  type: "add" | "edit";
  onSubmit: (labelColor: GmailLabelColorInput) => void;
}) {
  const form = useForm({
    defaultValues: labelColor,
    validators: {
      onSubmit: gmailLabelColorInputSchema,
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
            <FieldLabel htmlFor={field.name}>Label</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Work"
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      <form.Field name="color">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Color</FieldLabel>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Pick color"
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
                placeholder="#1a73e8 or rgb(26, 115, 232)"
              />
            </div>
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      <form.Field name="textColor">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Text Color</FieldLabel>
            <Select
              items={textColorItems}
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
                {textColorItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.Field>
      <div className="flex justify-end">
        <Button type="submit">{type === "add" ? "Add" : "Save"}</Button>
      </div>
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
            Add Label Color
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Label Color</DialogTitle>
        </DialogHeader>
        <LabelColorForm
          type="add"
          onSubmit={(values) => {
            onAdd(values);

            setIsDialogOpen(false);
          }}
        />
      </DialogContent>
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

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button size="icon" className="size-8 p-0" variant="outline">
            <PencilIcon />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Label Color</DialogTitle>
        </DialogHeader>
        <LabelColorForm
          labelColor={labelColor}
          type="edit"
          onSubmit={(values) => {
            onEdit({ ...labelColor, ...values });

            setIsDialogOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function GmailLabelColors() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config) {
    return;
  }

  return (
    <Field>
      <FieldDescription>
        Recolor Gmail label chips by their exact name. The text color is chosen automatically for
        contrast against the background.
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
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Are you sure you want to delete the color for ${labelColor.label}?`,
                    );

                    if (confirmed) {
                      configMutation.mutate({
                        "gmail.labelColors": config["gmail.labelColors"].filter(
                          (existingLabelColor) => existingLabelColor.id !== labelColor.id,
                        ),
                      });
                    }
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
