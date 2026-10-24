import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { accountColorsMap } from "@meru/shared/accounts";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountConfig } from "@meru/shared/schemas";
import { type AccountConfigInput, accountConfigInputSchema } from "@meru/shared/schemas";
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
  AlertDialogTrigger,
} from "@meru/ui/components/alert-dialog";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@meru/ui/components/field";
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
import { EmojiPickerButton } from "@/components/emoji-picker-button";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { SettingsDialogContent } from "@/components/settings-dialog-content";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { useAccountsStore } from "@/lib/stores";
import { restartRequiredToast } from "@/lib/toast";

/**
 * Each names both the switch in the account dialog and the badge on the
 * account's row, except the unread badge, whose words are too long for the row
 * in some languages and so has a message of its own there.
 */
const accountOptionLabels = {
  unreadBadge: msg({
    message: "Unread badge",
    comment: "Switch for showing the account's unread badge",
  }),
  unifiedInbox: msg({
    message: "Unified inbox",
    comment: "Switch, and a badge on the account, for including the account in the unified inbox",
  }),
  notifications: msg({
    message: "Notifications",
    comment: "Switch, and a badge on the account, for showing the account's notifications",
  }),
  disabled: msg({
    message: "Disabled",
    comment:
      "Switch, and a badge on the account, for an account Meru keeps signed in but doesn't load",
  }),
};

const unreadBadgeRowLabel = msg({
  message: "Unread badge",
  context: "account row badge",
  comment:
    "Badge on an account's row in Settings when its unread badge is on: a short badge on a row that cannot wrap; keep it as short as possible",
});

function AccountForm({
  account = {
    label: "",
    color: null,
    gmail: { unreadBadge: true, unifiedInbox: true },
    notifications: true,
  },
  placeholder,
  onSubmit,
  type,
  isLastEnabledAccount = false,
}: {
  account?: AccountConfigInput;
  placeholder?: string;
  onSubmit: (values: AccountConfigInput) => void;
  type: "add" | "edit";
  /** Locks the Disabled switch: turning this one off would leave Meru nothing to run. */
  isLastEnabledAccount?: boolean;
}) {
  const { t } = useLingui();

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
                <FieldLabel htmlFor={field.name}>
                  <Trans comment="Field that picks the account's color">Color</Trans>
                </FieldLabel>
                <div className="flex gap-2">
                  <Select
                    name={field.name}
                    value={field.state.value}
                    onValueChange={field.handleChange}
                  >
                    <SelectTrigger id={field.name}>
                      <SelectValue>
                        {(value: keyof typeof accountColorsMap | null) => {
                          if (!value) {
                            return t({
                              message: "None",
                              comment: "The account's color when no color is picked",
                            });
                          }

                          const { label, className } = accountColorsMap[value];

                          return (
                            <div className="flex items-center gap-2">
                              <div className={`size-2 rounded-full ${className}`} />
                              {t(label)}
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
                              {t(label)}
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
                      title={t`Clear color`}
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
                  <FieldLabel htmlFor={field.name}>
                    <Trans comment="Field for the name Meru shows for the account">Label</Trans>
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      placeholder={
                        placeholder ??
                        t({
                          message: "Work",
                          comment: "Example of an account's label, shown in the empty Label field",
                        })
                      }
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
          <FieldLegend variant="label">
            <Trans comment="Heading of the account's switches in the account dialog">Options</Trans>
          </FieldLegend>
          <form.Field name="gmail.unreadBadge">
            {(field) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>{t(accountOptionLabels.unreadBadge)}</FieldLabel>
                </FieldContent>
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="gmail.unifiedInbox">
            {(field) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>
                    {t(accountOptionLabels.unifiedInbox)}
                  </FieldLabel>
                </FieldContent>
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
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>
                    {t(accountOptionLabels.notifications)}
                  </FieldLabel>
                </FieldContent>
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>
          {type === "edit" && (
            <form.Field name="disabled">
              {(field) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>{t(accountOptionLabels.disabled)}</FieldLabel>
                    <FieldDescription>
                      {isLastEnabledAccount ? (
                        <Trans>Meru needs at least one account turned on.</Trans>
                      ) : (
                        <Trans>Meru keeps this account signed in but doesn't load it.</Trans>
                      )}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id={field.name}
                    name={field.name}
                    checked={field.state.value === true}
                    onCheckedChange={field.handleChange}
                    disabled={isLastEnabledAccount}
                  />
                </Field>
              )}
            </form.Field>
          )}
        </FieldSet>
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
          {type === "add" ? (
            <Trans comment="Button that adds the account in the dialog">Add</Trans>
          ) : (
            <Trans comment="Button that saves the account's changes in the dialog">Save</Trans>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddAccountButton() {
  const isDialogOpen = useAccountsStore((state) => state.isAddAccountDialogOpen);

  const setIsDialogOpen = useAccountsStore((state) => state.setIsAddAccountDialogOpen);

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const addLabel = <Trans comment="Button that opens the dialog for adding an account">Add</Trans>;

  if (!isLicenseKeyValid) {
    return <Button disabled>{addLabel}</Button>;
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger render={<Button>{addLabel}</Button>} />
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Add account</Trans>
          </DialogTitle>
        </DialogHeader>
        <AccountForm
          onSubmit={(account) => {
            ipc.main.send("accounts.addAccount", account);

            setIsDialogOpen(false);
          }}
          type="add"
        />
      </SettingsDialogContent>
    </Dialog>
  );
}

function EditAccountButton({
  account,
  isLastEnabledAccount,
}: {
  account: AccountConfig;
  isLastEnabledAccount: boolean;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { t } = useLingui();

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button size="icon" className="size-8 p-0" variant="outline" title={t`Edit account`}>
            <PencilIcon />
          </Button>
        }
      />
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit account</Trans>
          </DialogTitle>
        </DialogHeader>
        <AccountForm
          account={account}
          onSubmit={(values) => {
            ipc.main.send("accounts.updateAccount", {
              ...account,
              ...values,
              gmail: { ...account.gmail, ...values.gmail },
            });

            // Its own channel, because turning an account on or off builds or
            // tears down the account behind it rather than only writing a flag.
            if ((account.disabled === true) !== (values.disabled === true)) {
              ipc.main.send("accounts.setAccountEnabled", account.id, values.disabled !== true);
            }

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
          isLastEnabledAccount={isLastEnabledAccount}
        />
      </SettingsDialogContent>
    </Dialog>
  );
}

function SortableAccountItem({
  account,
  index,
  removable,
  disabled,
  isLastEnabledAccount,
}: {
  account: AccountConfig;
  index: number;
  removable: boolean;
  disabled: boolean;
  isLastEnabledAccount: boolean;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: account.id, index, disabled });

  const { t } = useLingui();

  const { label } = account;

  return (
    <Item ref={ref} className={isDragging ? "opacity-50" : undefined} variant="muted">
      <Button
        ref={handleRef}
        size="icon"
        className="size-8 cursor-grab touch-none p-0"
        variant="ghost"
        disabled={disabled}
        aria-label={t`Drag ${label} to reorder`}
      >
        <GripVerticalIcon />
      </Button>
      <ItemContent className={cn("gap-2", account.disabled && "opacity-60")}>
        <ItemTitle>
          <div
            className={cn(
              "size-2 rounded-full",
              account.color ? `${accountColorsMap[account.color].className}` : "border",
            )}
          />
          {account.label}
        </ItemTitle>
        {(account.disabled ||
          account.gmail.unreadBadge ||
          account.gmail.unifiedInbox ||
          account.notifications) && (
          <div className="flex gap-2">
            {account.disabled && <Badge variant="outline">{t(accountOptionLabels.disabled)}</Badge>}
            {account.gmail.unreadBadge && <Badge variant="outline">{t(unreadBadgeRowLabel)}</Badge>}
            {account.gmail.unifiedInbox && (
              <Badge variant="outline">{t(accountOptionLabels.unifiedInbox)}</Badge>
            )}
            {account.notifications && (
              <Badge variant="outline">{t(accountOptionLabels.notifications)}</Badge>
            )}
          </div>
        )}
      </ItemContent>
      <ItemActions>
        <EditAccountButton account={account} isLastEnabledAccount={isLastEnabledAccount} />
        {removable && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  size="icon"
                  className="size-8 p-0"
                  variant="outline"
                  title={t`Remove account`}
                >
                  <TrashIcon />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans>Remove {label}?</Trans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans>
                    Meru signs out of this account and clears its data from this computer, including
                    saved tabs and bookmarks. Your Gmail account isn't affected.
                  </Trans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Trans>Cancel</Trans>
                </AlertDialogCancel>
                <AlertDialogClose
                  render={<AlertDialogAction variant="destructive" />}
                  onClick={() => {
                    ipc.main.send("accounts.removeAccount", account.id);
                  }}
                >
                  <Trans>Remove account</Trans>
                </AlertDialogClose>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </ItemActions>
    </Item>
  );
}

export function AccountsSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  const enabledAccounts = config.accounts.filter((account) => !account.disabled);

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.accounts)}</SettingsTitle>
        <AddAccountButton />
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner>
          <Trans>Upgrade to Meru Pro to add more accounts</Trans>
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
                removable={
                  account.disabled === true ||
                  enabledAccounts.some((enabledAccount) => enabledAccount.id !== account.id)
                }
                disabled={config.accounts.length < 2}
                isLastEnabledAccount={enabledAccounts.length === 1 && !account.disabled}
              />
            ))}
          </ItemGroup>
        </DragDropProvider>
      </SettingsContent>
    </>
  );
}
