import { useTranslation } from "@meru/i18n/provider";
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
import { Field, FieldGroup, FieldLabel, FieldSet } from "@meru/ui/components/field";

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
  const { t } = useTranslation();

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
                <FieldLabel>{t("settings.accounts.color")}</FieldLabel>
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
                            return t("settings.accounts.colorOptional");
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
                  <FieldLabel>{t("settings.accounts.label")}</FieldLabel>
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
          <FieldLabel>{t("settings.accounts.options")}</FieldLabel>
          <form.Field name="gmail.unreadBadge">
            {(field) => (
              <Field orientation="horizontal" className="w-fit">
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
                <FieldLabel>{t("settings.accounts.unreadBadge")}</FieldLabel>
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
                <FieldLabel>{t("settings.accounts.unifiedInbox")}</FieldLabel>
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
                <FieldLabel>{t("settings.accounts.notifications")}</FieldLabel>
              </Field>
            )}
          </form.Field>
        </FieldSet>
      </FieldGroup>
      <div className="flex justify-end items-center">
        <Button type="submit">
          {type === "add" ? t("settings.accounts.add") : t("settings.accounts.save")}
        </Button>
      </div>
    </form>
  );
}

function AddAccountButton() {
  const { t } = useTranslation();

  const isDialogOpen = useAccountsStore((state) => state.isAddAccountDialogOpen);

  const setIsDialogOpen = useAccountsStore((state) => state.setIsAddAccountDialogOpen);

  const isTrialActive = useTrialStore((state) => Boolean(state.daysLeft));

  const { config } = useConfig();

  if (!config) {
    return;
  }

  if (!isTrialActive && !config.licenseKey) {
    return <Button disabled>{t("settings.accounts.add")}</Button>;
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger render={<Button>{t("settings.accounts.add")}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.accounts.addAccount")}</DialogTitle>
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
  const { t } = useTranslation();

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
            {t("settings.accounts.edit")}
          </DropdownMenuItem>
          {removable && (
            <DropdownMenuItem
              className="text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground"
              onClick={() => {
                const confirmed = window.confirm(
                  t("settings.accounts.removeConfirm", { label: account.label }),
                );

                if (confirmed) {
                  ipc.main.send("accounts.removeAccount", account.id);
                }
              }}
            >
              {t("settings.accounts.remove")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.accounts.editAccount")}</DialogTitle>
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

export function AccountsSettings() {
  const { t } = useTranslation();

  const accounts = useAccountsStore((state) => state.accounts);

  if (!accounts.length) {
    return;
  }

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t("settings.accounts.title")}</SettingsTitle>
        <AddAccountButton />
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner>
          {t("settings.accounts.upgradeToAddMore")}
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
                      <Badge variant="outline">{t("settings.accounts.unreadBadge")}</Badge>
                    )}
                    {account.config.gmail.unifiedInbox && (
                      <Badge variant="outline">{t("settings.accounts.unifiedInbox")}</Badge>
                    )}
                    {account.config.notifications && (
                      <Badge variant="outline">{t("settings.accounts.notifications")}</Badge>
                    )}
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
