import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { accountColorsMap } from "@meru/shared/accounts";
import { ipc } from "@meru/shared/renderer/ipc";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
import type { AccountConfig } from "@meru/shared/schemas";
import { type AccountConfigInput, accountConfigInputSchema } from "@meru/shared/schemas";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meru/ui/components/dialog";
import { EmojiPickerButton } from "@meru/ui/components/emoji-picker-button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@meru/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { Switch } from "@meru/ui/components/switch";
import { cn } from "@meru/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { GripVerticalIcon, PencilIcon, TrashIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { Entries } from "type-fest";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useAccountsStore, useTrialStore } from "@/lib/stores";
import { restartRequiredToast } from "@/lib/toast";

function AccountForm({
  account = {
    label: "",
    color: null,
    gmail: { unreadBadge: true, unifiedInbox: true },
    notifications: true,
  },
  placeholder = "Work",
  onSubmit,
  type,
}: {
  account?: AccountConfigInput;
  placeholder?: string;
  onSubmit: (values: AccountConfigInput) => void;
  type: "add" | "edit";
}) {
  const form = useForm({
    defaultValues: account,
    validators: {
      onSubmit: accountConfigInputSchema,
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
        <FieldSet>
          <form.Field name="color">
            {(field) => (
              <Field>
                <FieldLabel>Color</FieldLabel>
                <div className="flex gap-2">
                  <Select
                    name={field.name}
                    value={field.state.value}
                    onValueChange={field.handleChange}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(value: keyof typeof accountColorsMap | null) => {
                          if (!value) {
                            return "Optional";
                          }

                          const { label, className } = accountColorsMap[value];

                          return (
                            <div className="flex items-center gap-2">
                              <div className={`size-2 rounded-full ${className}`} />
                              {label}
                            </div>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(accountColorsMap) as Entries<typeof accountColorsMap>).map(
                        ([colorKey, { label, className }]) => (
                          <SelectItem key={colorKey} value={colorKey}>
                            <div className="flex items-center gap-2">
                              <div className={`size-2 rounded-full ${className}`} />
                              {label}
                            </div>
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  {field.state.value && (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        form.setFieldValue("color", null);
                      }}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              </Field>
            )}
          </form.Field>
          <form.Field name="label">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field>
                  <FieldLabel>Label</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      placeholder={placeholder}
                    />
                    <EmojiPickerButton
                      onEmojiSelect={({ emoji }) => {
                        form.setFieldValue("label", `${form.getFieldValue("label")}${emoji}`);
                      }}
                      modal
                    />
                  </div>
                </Field>
              );
            }}
          </form.Field>
        </FieldSet>
        <FieldSet>
          <FieldLabel>Options</FieldLabel>
          <form.Field name="gmail.unreadBadge">
            {(field) => (
              <Field orientation="horizontal" className="w-fit">
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
                <FieldLabel>Unread Badge</FieldLabel>
              </Field>
            )}
          </form.Field>
          <form.Field name="gmail.unifiedInbox">
            {(field) => (
              <Field orientation="horizontal" className="w-fit">
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
                <FieldLabel>Unified Inbox</FieldLabel>
              </Field>
            )}
          </form.Field>
          <form.Field name="notifications">
            {(field) => (
              <Field orientation="horizontal" className="w-fit">
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
                <FieldLabel>Notifications</FieldLabel>
              </Field>
            )}
          </form.Field>
        </FieldSet>
      </FieldGroup>
      <div className="flex items-center justify-end">
        <Button type="submit">{type === "add" ? "Add" : "Save"}</Button>
      </div>
    </form>
  );
}

function AddAccountButton() {
  const isDialogOpen = useAccountsStore((state) => state.isAddAccountDialogOpen);

  const setIsDialogOpen = useAccountsStore((state) => state.setIsAddAccountDialogOpen);

  const isTrialActive = useTrialStore((state) => Boolean(state.daysLeft));

  const { config } = useConfig();

  if (!config) {
    return;
  }

  if (!isTrialActive && !config.licenseKey) {
    return <Button disabled>Add</Button>;
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger render={<Button>Add</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
        </DialogHeader>
        <AccountForm
          onSubmit={(account) => {
            ipc.main.send("accounts.addAccount", account);

            setIsDialogOpen(false);
          }}
          type="add"
        />
      </DialogContent>
    </Dialog>
  );
}

function EditAccountButton({ account }: { account: AccountConfig }) {
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
          <DialogTitle>Edit Account</DialogTitle>
        </DialogHeader>
        <AccountForm
          account={account}
          onSubmit={(values) => {
            ipc.main.send("accounts.updateAccount", {
              ...account,
              ...values,
              gmail: { ...account.gmail, ...values.gmail },
            });

            setIsDialogOpen(false);

            if (
              account.gmail.unreadBadge !== values.gmail.unreadBadge ||
              account.gmail.unifiedInbox !== values.gmail.unifiedInbox ||
              account.notifications !== values.notifications
            ) {
              restartRequiredToast();
            }
          }}
          type="edit"
        />
      </DialogContent>
    </Dialog>
  );
}

function SortableAccountItem({
  account,
  index,
  removable,
  disabled,
}: {
  account: AccountConfig;
  index: number;
  removable: boolean;
  disabled: boolean;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: account.id, index, disabled });

  return (
    <Item ref={ref} className={isDragging ? "opacity-50" : undefined} variant="muted">
      <Button
        ref={handleRef}
        size="icon"
        className="size-8 cursor-grab touch-none p-0"
        variant="ghost"
        disabled={disabled}
        aria-label={`Drag ${account.label} to reorder`}
      >
        <GripVerticalIcon />
      </Button>
      <ItemContent className="gap-2">
        <ItemTitle>
          <div
            className={cn(
              "size-2 rounded-full",
              account.color ? `${accountColorsMap[account.color].className}` : "border",
            )}
          />
          {account.label}
        </ItemTitle>
        {(account.gmail.unreadBadge || account.notifications) && (
          <div className="flex gap-2">
            {account.gmail.unreadBadge && <Badge variant="outline">Unread Badge</Badge>}
            {account.gmail.unifiedInbox && <Badge variant="outline">Unified Inbox</Badge>}
            {account.notifications && <Badge variant="outline">Notifications</Badge>}
          </div>
        )}
      </ItemContent>
      <ItemActions>
        <EditAccountButton account={account} />
        {removable && (
          <Button
            size="icon"
            className="size-8 p-0"
            variant="outline"
            onClick={() => {
              const confirmed = window.confirm(`Are you sure you want to remove ${account.label}?`);

              if (confirmed) {
                ipc.main.send("accounts.removeAccount", account.id);
              }
            }}
          >
            <TrashIcon />
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}

export function AccountsSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Accounts</SettingsTitle>
        <AddAccountButton />
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner>
          Upgrade to Meru Pro to add more accounts
        </LicenseKeyRequiredBanner>
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled) {
              return;
            }

            configMutation.mutate({
              accounts: move(config.accounts, event),
            });
          }}
        >
          <ItemGroup>
            {config.accounts.map((account, index) => (
              <SortableAccountItem
                key={account.id}
                account={account}
                index={index}
                removable={config.accounts.length > 1}
                disabled={config.accounts.length < 2}
              />
            ))}
          </ItemGroup>
        </DragDropProvider>
      </SettingsContent>
    </>
  );
}
