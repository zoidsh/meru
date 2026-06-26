import { closestCenter, DndContext, PointerSensor, useSensor } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
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
import { EllipsisIcon, GripVerticalIcon } from "lucide-react";
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

function SavedSearchMenuButton({
  savedSearch,
  onDelete,
  onEdit,
}: {
  savedSearch: GmailSavedSearch;
  onDelete: () => void;
  onEdit: (editedSavedSearch: GmailSavedSearch) => void;
}) {
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
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground"
            onClick={() => {
              const confirmed = window.confirm(
                `Are you sure you want to delete ${savedSearch.label}?`,
              );

              if (confirmed) {
                onDelete();
              }
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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

            setIsOpen(false);
          }}
          type="edit"
        />
      </DialogContent>
    </Dialog>
  );
}

function SortableSavedSearchItem({
  savedSearch,
  onDelete,
  onEdit,
  disabled,
}: {
  savedSearch: GmailSavedSearch;
  onDelete: () => void;
  onEdit: (editedSavedSearch: GmailSavedSearch) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: savedSearch.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <Item ref={setNodeRef} style={style} variant="muted">
      <Button
        size="icon"
        className="size-8 cursor-grab touch-none p-0"
        variant="ghost"
        disabled={disabled}
        aria-label={`Drag ${savedSearch.label} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon />
      </Button>
      <ItemContent>
        <ItemTitle>{savedSearch.label}</ItemTitle>
        <ItemDescription>{savedSearch.query}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <SavedSearchMenuButton savedSearch={savedSearch} onDelete={onDelete} onEdit={onEdit} />
      </ItemActions>
    </Item>
  );
}

export function SavedSearchesSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const pointerSensor = useSensor(PointerSensor);

  if (!config) {
    return;
  }

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Saved Searches</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner>
          Upgrade to Meru Pro to add saved searches
        </LicenseKeyRequiredBanner>
        <DndContext
          sensors={[pointerSensor]}
          collisionDetection={closestCenter}
          onDragEnd={(event) => {
            const { active, over } = event;

            if (!over || active.id === over.id) {
              return;
            }

            const oldIndex = config["gmail.savedSearches"].findIndex(
              (savedSearch) => savedSearch.id === active.id,
            );

            const newIndex = config["gmail.savedSearches"].findIndex(
              (savedSearch) => savedSearch.id === over.id,
            );

            configMutation.mutate({
              "gmail.savedSearches": arrayMove(config["gmail.savedSearches"], oldIndex, newIndex),
            });
          }}
        >
          <SortableContext
            items={config["gmail.savedSearches"].map((savedSearch) => savedSearch.id)}
            strategy={verticalListSortingStrategy}
          >
            <ItemGroup className="mb-4">
              {config["gmail.savedSearches"].map((savedSearch) => (
                <SortableSavedSearchItem
                  key={savedSearch.id}
                  savedSearch={savedSearch}
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
          </SortableContext>
        </DndContext>
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
