import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  ArchiveIcon,
  InboxIcon,
  MailOpenIcon,
  OctagonAlertIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import type { ShellState } from "#contract/shell.ts";
import { dateForm, inboxKey } from "#core/inbox.ts";
import type { MailAction } from "#core/mail-actions.ts";
import { Button } from "#ui/button.tsx";

import { shellCalls } from "./sync.ts";

type InboxState = ShellState["inbox"];
type Row = InboxState["rows"][number];
type InboxProfile = InboxState["profiles"][number];

const keyOf = (row: Row) => inboxKey(row.profileId, row.messageId);

/** The keys Gmail gives each action, which the list answers too. */
const ACTION_KEYS: Record<MailAction, string> = {
  archive: "e",
  markAsRead: "I",
  delete: "#",
  markAsSpam: "!",
};

const ACTION_ICONS: Record<MailAction, ReactNode> = {
  archive: <ArchiveIcon />,
  markAsRead: <MailOpenIcon />,
  delete: <Trash2Icon />,
  markAsSpam: <OctagonAlertIcon />,
};

const ACTIONS = Object.keys(ACTION_KEYS) as MailAction[];

const useActionLabels = (): Record<MailAction, string> => {
  const { t } = useLingui();

  return {
    archive: t({
      message: "Archive",
      context: "inbox action",
      comment:
        "Button on a message in the unified inbox that archives it. Gmail's own word for the action",
    }),
    markAsRead: t({
      message: "Mark as read",
      context: "inbox action",
      comment:
        "Button on a message in the unified inbox that marks it read. Gmail's own words for the action",
    }),
    delete: t({
      message: "Delete",
      context: "inbox action",
      comment:
        "Button on a message in the unified inbox that moves it to Trash. Gmail's own word for the action",
    }),
    markAsSpam: t({
      message: "Report spam",
      context: "inbox action",
      comment:
        "Button on a message in the unified inbox that reports it as spam. Gmail's own words for the action",
    }),
  };
};

const useFailureText = (
  notice: InboxState["notice"],
  profiles: readonly InboxProfile[]
) => {
  const { t } = useLingui();

  if (!notice) {
    return "";
  }

  const name =
    profiles.find((profile) => profile.id === notice.profileId)?.name ?? "";
  const failed = {
    archive: t({
      message: "Couldn’t archive the message.",
      comment:
        "Said in the unified inbox when archiving a message failed and the message was put back in the list",
    }),
    markAsRead: t({
      message: "Couldn’t mark the message as read.",
      comment:
        "Said in the unified inbox when marking a message read failed and the message was put back in the list",
    }),
    delete: t({
      message: "Couldn’t move the message to Trash.",
      comment:
        "Said in the unified inbox when deleting a message failed and the message was put back in the list",
    }),
    markAsSpam: t({
      message: "Couldn’t report the message as spam.",
      comment:
        "Said in the unified inbox when reporting a message as spam failed and the message was put back in the list",
    }),
  }[notice.action];
  const why =
    notice.reason === "signedOut"
      ? t({
          message: `${name} is signed out.`,
          comment:
            "Second sentence after an action in the unified inbox failed because the profile's Google account is signed out; {name} is the profile",
        })
      : t({
          message: "It’s back in the list.",
          comment:
            "Second sentence after an action in the unified inbox failed: the message shows in the list again",
        });

  return `${failed} ${why}`;
};

/** v3's three forms by the local clock, and the full date and time. */
const useDates = () => {
  const { i18n } = useLingui();

  return useMemo(() => {
    const forms = {
      time: new Intl.DateTimeFormat(i18n.locale, {
        hour: "numeric",
        minute: "2-digit",
      }),
      day: new Intl.DateTimeFormat(i18n.locale, {
        month: "short",
        day: "numeric",
      }),
      date: new Intl.DateTimeFormat(i18n.locale),
    };
    const full = new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: "full",
      timeStyle: "short",
    });

    return (issued: number) => ({
      short: forms[dateForm(issued, new Date())].format(issued),
      full: full.format(issued),
    });
  }, [i18n.locale]);
};

/** What a profile that adds no rows says in place of them. */
const ProfileNotes = ({ profiles }: { profiles: readonly InboxProfile[] }) => {
  const { t } = useLingui();
  const notes = profiles.flatMap((profile) => {
    const { name } = profile;

    switch (profile.status) {
      case "unknown": {
        return [
          {
            profile,
            text: t({
              message: `Checking ${name} for mail…`,
              comment:
                "Shown in the unified inbox while a profile's unread mail has not been read yet; {name} is the profile",
            }),
          },
        ];
      }
      case "signedOut": {
        return [
          {
            profile,
            text: t({
              message: `${name} is signed out.`,
              comment:
                "Shown in the unified inbox for a profile whose Google account is signed out, so its mail is missing from the list; {name} is the profile",
            }),
          },
        ];
      }
      case "failed": {
        return [
          {
            profile,
            text: t({
              message: `Couldn’t check ${name} for mail.`,
              comment:
                "Shown in the unified inbox for a profile whose unread mail could not be read, so its mail is missing from the list; {name} is the profile",
            }),
          },
        ];
      }
      default: {
        return [];
      }
    }
  });

  if (notes.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1 px-4 pb-2 text-sm text-muted-foreground">
      {notes.map(({ profile, text }) => (
        <li key={profile.id} className="flex items-center gap-2">
          <span>{text}</span>
          {profile.status === "signedOut" && (
            <Button
              variant="link"
              size="xs"
              onClick={() => {
                shellCalls().selectProfile({ profileId: profile.id });
              }}
            >
              {t({
                message: `Open ${profile.name}`,
                comment:
                  "Button beside a signed-out profile in the unified inbox that shows that profile, where it can be signed in; {name} is the profile",
              })}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
};

/** Where a profile's feed lists fewer than are unread, as it does past 20. */
const MoreNotes = ({ profiles }: { profiles: readonly InboxProfile[] }) => {
  const { t } = useLingui();
  const more = profiles.filter(
    (profile) =>
      profile.status === "ok" &&
      profile.unreadCount !== null &&
      profile.unreadCount > profile.listed
  );

  if (more.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1 px-4 py-3 text-sm text-muted-foreground">
      {more.map(({ id, name, listed, unreadCount }) => (
        <li key={id}>
          {t({
            message: `${name}: the newest ${listed} of ${unreadCount ?? 0} unread`,
            comment:
              "Below the unified inbox when a profile has more unread mail than the list shows, since Gmail lists only the newest; {name} is the profile, {listed} how many are shown, {unreadCount} how many are unread",
          })}
        </li>
      ))}
    </ul>
  );
};

const InboxRow = ({
  row,
  profileName,
  selected,
  rowRef,
  onSelect,
  onKeyDown,
}: {
  row: Row;
  profileName: string;
  selected: boolean;
  rowRef: (element: HTMLTableRowElement | null) => void;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
}) => {
  const labels = useActionLabels();
  const dates = useDates();
  const { short, full } = dates(row.issued);
  const sender = row.senderName || row.senderAddress;

  return (
    <tr
      ref={rowRef}
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      data-selected={selected || undefined}
      className="group h-10 cursor-default border-b border-border text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted data-selected:bg-muted/60"
      onFocus={onSelect}
      onKeyDown={onKeyDown}
      onClick={() => {
        shellCalls().openInboxMessage({
          profileId: row.profileId,
          messageId: row.messageId,
        });
      }}
    >
      <td
        className="truncate py-0 pr-3 pl-4 text-xs text-muted-foreground"
        title={profileName}
      >
        {profileName}
      </td>
      <td
        dir="auto"
        className="truncate pr-3 font-medium"
        title={`${row.senderName} <${row.senderAddress}>`}
      >
        {sender}
      </td>
      <td className="pr-3">
        <span className="flex min-w-0 gap-2">
          <span
            dir="auto"
            className="max-w-[60%] shrink-0 truncate"
            title={row.subject}
          >
            {row.subject}
          </span>
          {row.summary && (
            <span
              dir="auto"
              className="min-w-0 truncate text-muted-foreground"
              title={row.summary}
            >
              {row.summary}
            </span>
          )}
        </span>
      </td>
      <td className="relative pr-4 text-right">
        <time
          dateTime={new Date(row.issued).toISOString()}
          title={full}
          className="text-xs whitespace-nowrap text-muted-foreground tabular-nums group-focus-within:invisible group-hover:invisible group-data-selected:invisible"
        >
          {short}
        </time>
        <span className="absolute inset-y-0 right-3 flex items-center gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-data-selected:opacity-100">
          {ACTIONS.map((action) => (
            <Button
              key={action}
              variant="ghost"
              size="icon-sm"
              // The list's keys are the keyboard's way to them.
              tabIndex={-1}
              aria-label={labels[action]}
              aria-keyshortcuts={
                action === "markAsRead" ? "Shift+I" : ACTION_KEYS[action]
              }
              title={labels[action]}
              // Keeps focus on the row, which the keys act from.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={(event) => {
                event.stopPropagation();
                shellCalls().runInboxAction({
                  profileId: row.profileId,
                  messageId: row.messageId,
                  action,
                });
              }}
            >
              {ACTION_ICONS[action]}
            </Button>
          ))}
        </span>
      </td>
    </tr>
  );
};

/**
 * Every profile's unread mail in the content area, in place of the tab:
 * main sends the rows while it is open and keeps them, so a reload shows
 * the same list. Gmail's keys move, open and act on the selected row, and
 * only while focus is in the list.
 */
export const Inbox = ({ inbox }: { inbox: InboxState }) => {
  const { t } = useLingui();
  const { rows, profiles } = inbox;
  // The index stands in once its row is gone, so the row that took its
  // place is selected.
  const [selection, setSelection] = useState({ key: "", index: 0 });
  const gridRef = useRef<HTMLTableElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const focusedOnOpen = useRef(false);
  const failure = useFailureText(inbox.notice, profiles);
  const names = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.name])),
    [profiles]
  );

  const foundIndex = rows.findIndex((row) => keyOf(row) === selection.key);
  const selectedIndex =
    foundIndex === -1 ? Math.min(selection.index, rows.length - 1) : foundIndex;
  const selected = rows[selectedIndex];
  const selectedRowKey = selected && keyOf(selected);
  const select = (index: number) => {
    const row = rows[index];

    if (row) {
      setSelection({ key: keyOf(row), index });
    }
  };

  // A row an action took away hands focus, which would fall to the page, to
  // the row that took its place.
  useLayoutEffect(() => {
    const active = document.activeElement;
    const inList =
      active === document.body || (active && gridRef.current?.contains(active));

    if (!inList) {
      return;
    }

    const element =
      selectedRowKey === undefined
        ? gridRef.current
        : rowRefs.current.get(selectedRowKey);

    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedRowKey]);

  // Opening puts focus on the first row, or the list when there is none;
  // later rows keep the selection.
  useEffect(() => {
    if (focusedOnOpen.current) {
      return;
    }

    focusedOnOpen.current = true;

    const element =
      selectedRowKey === undefined
        ? gridRef.current
        : rowRefs.current.get(selectedRowKey);

    element?.focus({ preventScroll: true });
  }, [selectedRowKey]);

  const move = (index: number) => {
    const next = Math.max(0, Math.min(index, rows.length - 1));
    const row = rows[next];

    if (row) {
      select(next);
      rowRefs.current.get(keyOf(row))?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The window's shortcuts go to the menu.
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      shellCalls().setInboxOpen({ open: false });

      return;
    }

    // A row's own keys; the list hears only what bubbles past them.
    if (!selected || event.currentTarget === gridRef.current) {
      return;
    }

    const message = {
      profileId: selected.profileId,
      messageId: selected.messageId,
    };
    const action = ACTIONS.find(
      (candidate) => ACTION_KEYS[candidate] === event.key
    );

    if (action) {
      event.preventDefault();
      shellCalls().runInboxAction({ ...message, action });

      return;
    }

    switch (event.key) {
      case "ArrowDown":
      case "j": {
        event.preventDefault();
        move(selectedIndex + 1);
        break;
      }
      case "ArrowUp":
      case "k": {
        event.preventDefault();
        move(selectedIndex - 1);
        break;
      }
      case "Home": {
        event.preventDefault();
        move(0);
        break;
      }
      case "End": {
        event.preventDefault();
        move(rows.length - 1);
        break;
      }
      case "Enter":
      case "o": {
        event.preventDefault();
        shellCalls().openInboxMessage(message);
        break;
      }
      default: {
        break;
      }
    }
  };

  return (
    <section
      aria-labelledby="inbox-heading"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <h2 id="inbox-heading" className="flex-1 text-base font-semibold">
          {t({
            message: "Unified inbox",
            comment:
              "Heading of the list of every profile's unread mail, shown in place of the tab",
          })}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({
            message: "Close unified inbox",
            comment:
              "Accessible name and tooltip of the button that closes the unified inbox and shows the tab again",
          })}
          title={t({
            message: "Close unified inbox",
            comment:
              "Accessible name and tooltip of the button that closes the unified inbox and shows the tab again",
          })}
          onClick={() => {
            shellCalls().setInboxOpen({ open: false });
          }}
        >
          <XIcon />
        </Button>
      </header>
      <output
        aria-live="polite"
        className={cn(
          "mx-4 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive",
          !failure && "sr-only"
        )}
      >
        {failure}
      </output>
      <ProfileNotes profiles={profiles} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table
          ref={gridRef}
          // A data grid the keys move through, as ARIA's grid pattern has it.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
          role="grid"
          aria-label={t({
            message: "Unread messages",
            comment:
              "Accessible name of the unified inbox's list of every profile's unread mail, read by screen readers",
          })}
          aria-describedby={rows.length === 0 ? "inbox-empty" : undefined}
          tabIndex={rows.length === 0 ? 0 : -1}
          className="w-full table-fixed border-collapse border-t border-border outline-none"
          onKeyDown={(event) => {
            if (event.target === event.currentTarget) {
              onKeyDown(event);
            }
          }}
        >
          <colgroup>
            <col className="w-28" />
            <col className="w-48" />
            <col />
            <col className="w-36" />
          </colgroup>
          <tbody>
            {rows.map((row, index) => {
              const key = keyOf(row);

              return (
                <InboxRow
                  key={key}
                  row={row}
                  profileName={names.get(row.profileId) ?? ""}
                  selected={key === selectedRowKey}
                  rowRef={(element) => {
                    if (element) {
                      rowRefs.current.set(key, element);
                    } else {
                      rowRefs.current.delete(key);
                    }
                  }}
                  onSelect={() => {
                    select(index);
                  }}
                  onKeyDown={onKeyDown}
                />
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div
            id="inbox-empty"
            className="flex flex-col items-center gap-2 px-8 py-16 text-center"
          >
            <InboxIcon aria-hidden className="size-6 text-muted-foreground" />
            <p className="font-medium">
              {t({
                message: "No unread messages",
                comment:
                  "Heading of the unified inbox when no profile has unread mail",
              })}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t({
                message:
                  "The unified inbox shows the unread mail of every profile in one place. A message leaves the list once it is read.",
                comment:
                  "Shown in the unified inbox when no profile has unread mail",
              })}
            </p>
          </div>
        )}
        <MoreNotes profiles={profiles} />
      </div>
    </section>
  );
};

/** The titlebar's button that shows the unified inbox, or the tab again. */
export const InboxButton = ({
  open,
  profileCount,
}: {
  open: boolean;
  profileCount: number;
}) => {
  const { t } = useLingui();

  if (profileCount < 2) {
    return null;
  }

  const label = t({
    message: "Unified inbox",
    comment:
      "Accessible name and tooltip of the inbox button in the title bar, pressed while the list of every profile's unread mail shows",
  });

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={open}
      aria-label={label}
      title={label}
      className={cn("[app-region:no-drag]", open && "bg-muted text-foreground")}
      onClick={() => {
        shellCalls().setInboxOpen({ open: !open });
      }}
    >
      <InboxIcon />
    </Button>
  );
};
