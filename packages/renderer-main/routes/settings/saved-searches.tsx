import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  type GmailSavedSearch,
  type GmailSavedSearchInput,
  gmailSavedSearchInputSchema,
} from "@meru/shared/schemas";
import { Button } from "@meru/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meru/ui/components/dialog";
import { EmojiPickerButton } from "@meru/ui/components/emoji-picker-button";
import { Input } from "@meru/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@meru/ui/components/item";
import { GripVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
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
              <FieldLabel>Label</FieldLabel>
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
              <FieldLabel>Query</FieldLabel>
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
        <Button type="submit">{type === "add" ? "Add" : "Save"}</Button>
      </div>
    </form>
  );
}

export function AddSavedSearchButton({
  onAdd,
}: {
  onAdd: (savedSearch: GmailSavedSearchInput) => void;
}) {
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
            Add
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Saved Search</DialogTitle>
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

function EditSavedSearchButton({
  savedSearch,
  onEdit,
}: {
  savedSearch: GmailSavedSearch;
  onEdit: (editedSavedSearch: GmailSavedSearch) => void;
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
          <DialogTitle>Edit Saved Search</DialogTitle>
        </DialogHeader>
        <SavedSearchForm
          savedSearch={savedSearch}
          onSubmit={(values) => {
            onEdit({
              ...savedSearch,
              ...values,
            });

            setIsDialogOpen(false);
          }}
          type="edit"
        />
      </DialogContent>
    </Dialog>
  );
}

function SortableSavedSearchItem({
  savedSearch,
  index,
  onDelete,
  onEdit,
  disabled,
}: {
  savedSearch: GmailSavedSearch;
  index: number;
  onDelete: () => void;
  onEdit: (editedSavedSearch: GmailSavedSearch) => void;
  disabled: boolean;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: savedSearch.id, index, disabled });

  return (
    <Item ref={ref} className={isDragging ? "opacity-50" : undefined} variant="muted">
      <Button
        ref={handleRef}
        size="icon"
        className="size-8 cursor-grab touch-none p-0"
        variant="ghost"
        disabled={disabled}
        aria-label={`Drag ${savedSearch.label} to reorder`}
      >
        <GripVerticalIcon />
      </Button>
      <ItemContent>
        <ItemTitle>{savedSearch.label}</ItemTitle>
        <ItemDescription>{savedSearch.query}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <EditSavedSearchButton savedSearch={savedSearch} onEdit={onEdit} />
        <Button
          size="icon"
          className="size-8 p-0"
          variant="outline"
          onClick={() => {
            const confirmed = window.confirm(
              `Are you sure you want to delete ${savedSearch.label}?`,
            );

            if (confirmed) {
              onDelete();
            }
          }}
        >
          <TrashIcon />
        </Button>
      </ItemActions>
    </Item>
  );
}

export function SavedSearchesSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config) {
    return;
  }

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Saved Searches</SettingsTitle>
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
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner>
          Upgrade to Meru Pro to add saved searches
        </LicenseKeyRequiredBanner>
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled) {
              return;
            }

            configMutation.mutate({
              "gmail.savedSearches": move(config["gmail.savedSearches"], event),
            });
          }}
        >
          <ItemGroup>
            {config["gmail.savedSearches"].map((savedSearch, index) => (
              <SortableSavedSearchItem
                key={savedSearch.id}
                savedSearch={savedSearch}
                index={index}
                disabled={!isLicenseKeyValid}
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
            ))}
          </ItemGroup>
        </DragDropProvider>
      </SettingsContent>
    </>
  );
}
