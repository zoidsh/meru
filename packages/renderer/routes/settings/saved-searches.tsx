import { useTranslation } from "@meru/i18n/provider";
import {
  type GmailSavedSearch,
  type GmailSavedSearchInput,
  gmailSavedSearchInputSchema,
} from "@meru/shared/schemas";
import { arrayMove } from "@meru/shared/utils";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@meru/ui/components/table";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import { useForm } from "@tanstack/react-form";
import { Field, FieldGroup, FieldLabel } from "@meru/ui/components/field";

export function SavedSearchForm({
  savedSearch = { label: "", query: "" },
  labelPlaceholder = "Friends",
  queryPlaceholder = "label:friends is:unread",
  type,
  onSubmit,
}: {
  savedSearch?: GmailSavedSearchInput;
  labelPlaceholder?: string;
  queryPlaceholder?: string;
  type: "add" | "edit";
  onSubmit: (savedSearch: GmailSavedSearchInput) => void;
}) {
  const { t } = useTranslation();

  const form = useForm({
    defaultValues: savedSearch,
    validators: {
      onSubmit: gmailSavedSearchInputSchema,
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
        <form.Field name="label">
          {(field) => (
            <Field>
              <FieldLabel>{t("settings.savedSearches.label")}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={labelPlaceholder}
                />
                <EmojiPickerButton
                  onEmojiSelect={({ emoji }) => {
                    form.setFieldValue("label", `${form.getFieldValue("label")}${emoji}`);
                  }}
                  modal
                />
              </div>
            </Field>
          )}
        </form.Field>
        <form.Field name="query">
          {(field) => (
            <Field>
              <FieldLabel>{t("settings.savedSearches.query")}</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={queryPlaceholder}
              />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit">
          {type === "add" ? t("settings.savedSearches.add") : t("settings.savedSearches.save")}
        </Button>
      </div>
    </form>
  );
}

export function AddSavedSearchButton({
  onAdd,
}: {
  onAdd: (savedSearch: GmailSavedSearchInput) => void;
}) {
  const { t } = useTranslation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isLicenseKeyValid = useIsLicenseKeyValid();

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button
            onClick={() => {
              setIsDialogOpen(true);
            }}
            disabled={!isLicenseKeyValid}
          >
            {t("settings.savedSearches.add")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.savedSearches.addSavedSearch")}</DialogTitle>
        </DialogHeader>
        <SavedSearchForm
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

function SavedSearchMenuButton({
  savedSearch,
  onDelete,
  onEdit,
}: {
  savedSearch: GmailSavedSearch;
  onDelete: () => void;
  onEdit: (editedSavedSearch: GmailSavedSearch) => void;
}) {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon" className="size-8 p-0" variant="ghost">
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
            {t("settings.savedSearches.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground"
            onClick={() => {
              const confirmed = window.confirm(
                t("settings.savedSearches.deleteConfirm", { label: savedSearch.label }),
              );

              if (confirmed) {
                onDelete();
              }
            }}
          >
            {t("settings.savedSearches.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.savedSearches.editSavedSearch")}</DialogTitle>
        </DialogHeader>
        <SavedSearchForm
          savedSearch={savedSearch}
          onSubmit={(values) => {
            onEdit({
              ...savedSearch,
              ...values,
            });

            setIsOpen(false);
          }}
          type="edit"
        />
      </DialogContent>
    </Dialog>
  );
}

export function SavedSearchesSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const moveSavedSearch = (savedSearchId: string, direction: "up" | "down") => {
    const savedSearchIndex = config["gmail.savedSearches"].findIndex(
      (savedSearch) => savedSearch.id === savedSearchId,
    );

    configMutation.mutate({
      "gmail.savedSearches": arrayMove(
        config["gmail.savedSearches"],
        savedSearchIndex,
        direction === "up" ? savedSearchIndex - 1 : savedSearchIndex + 1,
      ),
    });
  };

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t("settings.savedSearches.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner>
          {t("settings.savedSearches.upgradeBanner")}
        </LicenseKeyRequiredBanner>
        <Table className="mb-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.savedSearches.label")}</TableHead>
              <TableHead>{t("settings.savedSearches.query")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {config["gmail.savedSearches"].map((savedSearch, index) => (
              <TableRow key={savedSearch.id}>
                <TableCell>{savedSearch.label}</TableCell>
                <TableCell>{savedSearch.query}</TableCell>
                <TableCell className="flex justify-end">
                  {config["gmail.savedSearches"].length > 1 && (
                    <>
                      <Button
                        size="icon"
                        className="size-8 p-0"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => {
                          moveSavedSearch(savedSearch.id, "up");
                        }}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        size="icon"
                        className="size-8 p-0"
                        variant="ghost"
                        disabled={index + 1 === config["gmail.savedSearches"].length}
                        onClick={() => {
                          moveSavedSearch(savedSearch.id, "down");
                        }}
                      >
                        <ArrowDownIcon />
                      </Button>
                    </>
                  )}
                  <SavedSearchMenuButton
                    savedSearch={savedSearch}
                    onDelete={() => {
                      const deleteSavedSearchId = savedSearch.id;

                      configMutation.mutate({
                        "gmail.savedSearches": config["gmail.savedSearches"].filter(
                          (savedSearch) => savedSearch.id !== deleteSavedSearchId,
                        ),
                      });
                    }}
                    onEdit={(editedSavedSearch) => {
                      configMutation.mutate({
                        "gmail.savedSearches": config["gmail.savedSearches"].map((savedSearch) =>
                          savedSearch.id === editedSavedSearch.id ? editedSavedSearch : savedSearch,
                        ),
                      });
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end">
          <AddSavedSearchButton
            onAdd={(savedSearch) => {
              configMutation.mutate({
                "gmail.savedSearches": [
                  ...config["gmail.savedSearches"],
                  {
                    id: crypto.randomUUID(),
                    ...savedSearch,
                  },
                ],
              });
            }}
          />
        </div>
      </SettingsContent>
    </>
  );
}
