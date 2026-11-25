import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

import type { SettingsState } from "#contract/settings.ts";
import { SEARCH_QUERY_MAX_LENGTH } from "#core/gmail-hash.ts";
import {
  SAVED_SEARCH_LABEL_MAX_LENGTH,
  SAVED_SEARCHES_MAX,
} from "#core/saved-searches.ts";
import type { SavedSearchRefusal } from "#core/saved-searches.ts";
import { Button } from "#ui/button.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from "#ui/field.tsx";
import { Input } from "#ui/input.tsx";

import { SettingGroup } from "./setting-group.tsx";
import { settingsCalls } from "./sync.ts";

type ListedProfile = SettingsState["profiles"][number];

type ListedSearch = ListedProfile["savedSearches"][number];

/**
 * The search's name as typed, saved once: on Enter, on leaving the field or
 * on leaving the page; Escape keeps the old one.
 */
const SearchNameInput = ({
  profileId,
  search,
  shown,
  onDone,
}: {
  profileId: string;
  search: ListedSearch;
  shown: string;
  /** Once saved or kept, `true` when by a key, so focus goes back to Rename. */
  onDone: (byKey: boolean) => void;
}) => {
  const { t } = useLingui();
  const [text, setText] = useState(search.name ?? "");
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (done.current) {
      return;
    }

    done.current = true;

    if (save && text.trim() !== (search.name ?? "")) {
      settingsCalls()
        .renameSavedSearch({ profileId, searchId: search.id, name: text })
        .catch(noop);
    }
  };

  // Leaving the page by the menu's Back or by closing the window blurs
  // nothing, so what is typed is saved as the field or the document goes.
  const saveOnLeaving = useEffectEvent(() => {
    finish(true);
  });

  useEffect(() => {
    const onPageHide = () => {
      saveOnLeaving();
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      saveOnLeaving();
    };
  }, []);

  return (
    <Input
      ref={input}
      value={text}
      maxLength={SAVED_SEARCH_LABEL_MAX_LENGTH}
      placeholder={search.query}
      autoComplete="off"
      aria-label={t({
        message: `Name of ${shown}`,
        comment:
          "Name of the field that renames a saved search in Settings; shown is its name, else its Gmail query",
      })}
      onChange={(event) => {
        setText(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          finish(event.key === "Enter");
          onDone(true);
        }
      }}
      onBlur={() => {
        finish(true);
        onDone(false);
      }}
    />
  );
};

const SearchRow = ({
  profileId,
  search,
  editing,
  onRename,
  onRenamed,
  onRemove,
  buttons,
}: {
  profileId: string;
  search: ListedSearch;
  editing: boolean;
  onRename: () => void;
  onRenamed: (byKey: boolean) => void;
  onRemove: () => void;
  buttons: RefObject<Map<string, HTMLButtonElement>>;
}) => {
  const { t } = useLingui();
  const labelId = useId();
  const shown = search.name ?? search.query;

  return (
    <Field
      orientation="horizontal"
      {...(editing ? { "aria-label": shown } : { "aria-labelledby": labelId })}
    >
      <FieldContent className="min-w-0">
        {editing ? (
          <SearchNameInput
            profileId={profileId}
            search={search}
            shown={shown}
            onDone={onRenamed}
          />
        ) : (
          <FieldLabel id={labelId} className="wrap-anywhere">
            {search.name === null ? (
              <span className="line-clamp-2" title={search.query}>
                {search.query}
              </span>
            ) : (
              shown
            )}
          </FieldLabel>
        )}
        {(search.name !== null || editing) && (
          <FieldDescription
            className="line-clamp-2 font-mono text-[12.5px] wrap-anywhere"
            title={search.query}
          >
            {search.query}
          </FieldDescription>
        )}
      </FieldContent>
      <div className="flex items-center gap-1">
        <Button
          ref={(button) => {
            if (button) {
              buttons.current.set(`rename:${search.id}`, button);
            } else {
              buttons.current.delete(`rename:${search.id}`);
            }
          }}
          variant="ghost"
          size="icon-sm"
          aria-label={t({
            message: `Rename ${shown}`,
            comment:
              "Button in Settings that renames a saved search; shown is its name, else its Gmail query",
          })}
          title={t({
            message: "Rename",
            comment:
              "Tooltip of the button in Settings that renames a saved search",
          })}
          onClick={onRename}
        >
          <PencilIcon />
        </Button>
        <Button
          ref={(button) => {
            if (button) {
              buttons.current.set(`remove:${search.id}`, button);
            } else {
              buttons.current.delete(`remove:${search.id}`);
            }
          }}
          variant="ghost"
          size="icon-sm"
          aria-label={t({
            message: `Remove ${shown}`,
            comment:
              "Button in Settings that removes a saved search at once; shown is its name, else its Gmail query",
          })}
          title={t({
            message: "Remove",
            comment:
              "Tooltip of the button in Settings that removes a saved search",
          })}
          onClick={(event) => {
            // The next row moves under the pointer, so a double-click would
            // remove it too; a key press has a detail of 0.
            if (event.detail <= 1) {
              onRemove();
            }
          }}
        >
          <XIcon />
        </Button>
      </div>
    </Field>
  );
};

/** Search and Name, saved together or refused with the reason under Search. */
const AddForm = ({
  profileId,
  searchInput,
  onClose,
}: {
  profileId: string;
  /** The card's, so removing the last row can put focus here. */
  searchInput: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) => {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  // Counted, so a refusal said again is announced again.
  const [refusal, setRefusal] = useState<{
    reason: SavedSearchRefusal;
    attempt: number;
  }>();
  const attempts = useRef(0);
  const searchId = useId();
  const nameId = useId();
  const errorId = useId();

  useEffect(() => {
    searchInput.current?.focus();
  }, [searchInput]);

  const most = SAVED_SEARCHES_MAX;
  const reasons: Record<SavedSearchRefusal, string> = {
    empty: t({
      message: "Enter a search.",
      comment:
        "Shown under the Search field in Settings when Save is pressed with it empty",
    }),
    duplicate: t({
      message: "You've already saved this search.",
      comment:
        "Shown under the Search field in Settings when the profile has a saved search with the same Gmail query",
    }),
    full: t({
      message: `This profile has ${most} saved searches, the most it can keep.`,
      comment:
        "Shown under the Search field in Settings when the profile cannot keep another saved search; {most} is how many a profile can keep",
    }),
    unwritable: t({
      message: "This search can't be saved.",
      comment:
        "Shown under the Search field in Settings when the search cannot be saved for another reason",
    }),
  };

  const save = async () => {
    const reason = await settingsCalls().addSavedSearch({
      profileId,
      query,
      name,
    });

    if (reason === null) {
      onClose();

      return;
    }

    attempts.current += 1;
    setRefusal({ reason, attempt: attempts.current });
    searchInput.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save().catch(noop);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <FieldSet
      aria-label={t({
        message: "Add saved search",
        comment:
          "Name of the group of fields in Settings that adds a saved search to a profile",
      })}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-2">
        <Field
          className="min-w-0 flex-[1_1_180px]"
          data-invalid={refusal !== undefined || undefined}
        >
          <FieldLabel htmlFor={searchId}>
            {t({
              message: "Search",
              comment:
                "Label of the field in Settings that takes the Gmail query of a new saved search",
            })}
          </FieldLabel>
          <Input
            ref={searchInput}
            id={searchId}
            value={query}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            placeholder={t({
              message: "label:receipts is:unread",
              comment:
                "Example Gmail query in the empty Search field of a new saved search; Gmail's operators (label:, is:) stay as they are, the label name may be translated",
            })}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={refusal !== undefined || undefined}
            aria-describedby={refusal ? errorId : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setRefusal(undefined);
            }}
            onKeyDown={onKeyDown}
          />
          {refusal && (
            <FieldError key={refusal.attempt} id={errorId}>
              {reasons[refusal.reason]}
            </FieldError>
          )}
        </Field>
        <Field className="min-w-0 flex-[1_1_180px]">
          <FieldLabel htmlFor={nameId}>
            {t({
              message: "Name",
              comment:
                "Label of the field in Settings that takes the name of a new saved search",
            })}
          </FieldLabel>
          <Input
            id={nameId}
            value={name}
            maxLength={SAVED_SEARCH_LABEL_MAX_LENGTH}
            placeholder={t({
              message: "Optional",
              comment:
                "Placeholder of the Name field of a new saved search in Settings, which may stay empty",
            })}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
            }}
            onKeyDown={onKeyDown}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            save().catch(noop);
          }}
        >
          {t({
            message: "Save",
            comment:
              "Button in Settings that adds the saved search typed above",
          })}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t({
            message: "Cancel",
            comment:
              "Button in Settings that closes the fields of a new saved search without adding it",
          })}
        </Button>
      </div>
    </FieldSet>
  );
};

/** A profile's saved searches, each renamed or removed in place, and the add. */
export const SavedSearchesCard = ({ profile }: { profile: ListedProfile }) => {
  const { t } = useLingui();
  const [editing, setEditing] = useState<string>();
  const [adding, setAdding] = useState(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  // Where focus goes once the render it waits for is done, a new object for
  // each request so one asked for again runs again.
  const [focusNext, setFocusNext] = useState<{ target: string }>();
  const searches = profile.savedSearches;

  useEffect(() => {
    if (focusNext === undefined) {
      return;
    }

    const targets: Record<string, HTMLElement | null | undefined> = {
      add: addButton.current,
      search: searchInput.current,
    };
    const target =
      targets[focusNext.target] ?? buttons.current.get(focusNext.target);

    if (target) {
      target.focus();
      setFocusNext(undefined);
    }
  }, [focusNext]);

  const remove = (search: ListedSearch, index: number) => {
    const next = searches[index + 1];

    let target = "add";

    if (next) {
      target = `remove:${next.id}`;
    } else if (adding) {
      target = "search";
    }

    setFocusNext({ target });
    settingsCalls()
      .removeSavedSearch({ profileId: profile.id, searchId: search.id })
      .catch(noop);
  };

  return (
    <SettingGroup
      title={t({
        message: "Saved searches",
        comment:
          "Title of the card on a profile's page in Settings that lists its saved Gmail searches",
      })}
      description={t({
        message: "Open these from Saved Searches in the Mail menu.",
        comment:
          "Description of the Saved searches card on a profile's page in Settings; Saved Searches and Mail name the menus as the app's menu bar shows them",
      })}
    >
      <div className="flex flex-col gap-4">
        {searches.length > 0 ? (
          <FieldGroup>
            {/* Flat and keyed, so a row keeps its element, and focus, as one before it goes. */}
            {searches.flatMap((search, index) => [
              ...(index > 0
                ? [<FieldSeparator key={`separator:${search.id}`} />]
                : []),
              <SearchRow
                key={search.id}
                profileId={profile.id}
                search={search}
                editing={editing === search.id}
                buttons={buttons}
                onRename={() => {
                  setEditing(search.id);
                }}
                onRenamed={(byKey) => {
                  setEditing(undefined);

                  if (byKey) {
                    setFocusNext({ target: `rename:${search.id}` });
                  }
                }}
                onRemove={() => {
                  remove(search, index);
                }}
              />,
            ])}
          </FieldGroup>
        ) : (
          <FieldDescription>
            {t({
              message: "You haven't saved any searches yet.",
              comment:
                "Shown in the Saved searches card on a profile's page in Settings while it has none",
            })}
          </FieldDescription>
        )}
        {adding ? (
          <AddForm
            profileId={profile.id}
            searchInput={searchInput}
            onClose={() => {
              setAdding(false);
              setFocusNext({ target: "add" });
            }}
          />
        ) : (
          <div>
            <Button
              ref={addButton}
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(true);
              }}
            >
              <PlusIcon data-icon="inline-start" />
              {t({
                message: "Add search",
                comment:
                  "Button on a profile's page in Settings that opens the fields to add a saved search",
              })}
            </Button>
          </div>
        )}
      </div>
    </SettingGroup>
  );
};
