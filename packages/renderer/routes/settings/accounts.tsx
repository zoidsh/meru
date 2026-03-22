import { ipc } from "@meru/renderer-lib/ipc";
import { accountColorsMap } from "@meru/shared/accounts";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { EmojiPickerButton } from "@meru/ui/components/emoji-picker-button";
import { Input } from "@meru/ui/components/input";
import { Item, ItemActions, ItemContent, ItemTitle } from "@meru/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { Switch } from "@meru/ui/components/switch";
import { cn } from "@meru/ui/lib/utils";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { Entries } from "type-fest";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";
import { useAccountsStore, useTrialStore } from "@/lib/stores";
import { restartRequiredToast } from "@/lib/toast";
import { useForm } from "@tanstack/react-form";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@meru/ui/components/field";

function AccountForm({
  account = {
    label: "",
    color: null,
    gmail: { unreadBadge: true },
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
          <FieldLegend>Options</FieldLegend>
          <form.Field name="gmail.unreadBadge">
            {(field) => (
              <Field>
                <FieldLabel>Unread Badge</FieldLabel>
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="notifications">
            {(field) => (
              <Field>
                <FieldLabel>Notifications</FieldLabel>
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>
        </FieldSet>
      </FieldGroup>
      <div className="flex justify-end items-center">
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

function AccountMenuButton({ account, removable }: { account: AccountConfig; removable: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon" className="size-8 p-0" variant="outline">
              <EllipsisIcon />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => {
              setIsOpen(true);
            }}
          >
            Edit
          </DropdownMenuItem>
          {removable && (
            <DropdownMenuItem
              className="text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground"
              onClick={() => {
                const confirmed = window.confirm(
                  `Are you sure you want to remove ${account.label}?`,
                );

                if (confirmed) {
                  ipc.main.send("accounts.removeAccount", account.id);
                }
              }}
            >
              Remove
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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

            setIsOpen(false);

            if (
              account.gmail.unreadBadge !== values.gmail.unreadBadge ||
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

export function AccountsSettings() {
  const accounts = useAccountsStore((state) => state.accounts);

  if (!accounts.length) {
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
        <div className="space-y-4">
          {accounts.map((account, index) => (
            <Item key={account.config.id} variant="muted">
              <ItemContent className="gap-2">
                <ItemTitle>
                  <div
                    className={cn(
                      "size-2 rounded-full",
                      account.config.color
                        ? `${accountColorsMap[account.config.color].className}`
                        : "border",
                    )}
                  />
                  {account.config.label}
                </ItemTitle>
                {(account.config.gmail.unreadBadge || account.config.notifications) && (
                  <div className="flex gap-2">
                    {account.config.gmail.unreadBadge && (
                      <Badge variant="outline">Unread Badge</Badge>
                    )}
                    {account.config.notifications && <Badge variant="outline">Notifications</Badge>}
                  </div>
                )}
              </ItemContent>
              <ItemActions>
                {accounts.length > 1 && (
                  <>
                    <Button
                      size="icon"
                      className="size-8 p-0"
                      variant="outline"
                      disabled={index === 0}
                      onClick={() => {
                        ipc.main.send("accounts.moveAccount", account.config.id, "up");
                      }}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      size="icon"
                      className="size-8 p-0"
                      variant="outline"
                      disabled={index + 1 === accounts.length}
                      onClick={() => {
                        ipc.main.send("accounts.moveAccount", account.config.id, "down");
                      }}
                    >
                      <ArrowDownIcon />
                    </Button>
                  </>
                )}
                <AccountMenuButton account={account.config} removable={accounts.length > 1} />
              </ItemActions>
            </Item>
          ))}
        </div>
      </SettingsContent>
    </>
  );
}
