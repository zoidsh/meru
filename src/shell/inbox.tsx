import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  ArchiveIcon,
  InboxIcon,
  MailOpenIcon,
  OctagonAlertIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";

import type { ShellState } from "#contract/shell.ts";
import { inboxKeyCommand } from "#core/inbox-keys.ts";
import { dateForm, inboxKey } from "#core/inbox.ts";
import type { MailAction } from "#core/mail-actions.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#ui/empty.tsx";
import { Kbd } from "#ui/kbd.tsx";
import { TooltipTrigger } from "#ui/tooltip.tsx";

import { OverlayCard } from "./overlay-card.tsx";
import { ShellTooltip, ShellTooltipContent } from "./shell-tooltip.tsx";
import { shellCalls, useShellState } from "./sync.ts";
import { TitlebarButton } from "./titlebar-button.tsx";

type InboxState = ShellState["inbox"];
type Row = InboxState["rows"][number];
type InboxProfile = InboxState["profiles"][number];

const keyOf = (row: Row) => inboxKey(row.profileId, row.messageId);

/** Each action's key, which `inboxKeyCommand` answers, as a person reads it. */
const ACTION_KEY_LABELS: Record<MailAction, string> = {
  archive: "E",
  markAsRead: "⇧I",
  delete: "#",
  markAsSpam: "!",
};

/** The same keys, as `aria-keyshortcuts` names them. */
const ACTION_SHORTCUTS: Record<MailAction, string> = {
  archive: "E",
  markAsRead: "Shift+I",
  delete: "#",
  markAsSpam: "!",
};

const ACTION_ICONS: Record<MailAction, ReactNode> = {
  archive: <ArchiveIcon />,
  markAsRead: <MailOpenIcon />,
  delete: <Trash2Icon />,
  markAsSpam: <OctagonAlertIcon />,
};

const ACTIONS = Object.keys(ACTION_KEY_LABELS) as MailAction[];

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

/** Where a profile's feed lists fewer than are unread, as it does past 20. */
const MoreNotes = ({ profiles }: { profiles: readonly InboxProfile[] }) => {
  const { t } = useLingui();
  const more = profiles.flatMap(({ id, name, status, listed, unreadCount }) =>
    status === "ok" && unreadCount !== null && unreadCount > listed
      ? [{ id, name, listed, unreadCount }]
      : []
  );

  if (more.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1 px-2 py-2 text-xs text-muted-foreground">
      {more.map(({ id, name, listed, unreadCount }) => (
        <li key={id}>
          {t({
            message: plural(unreadCount, {
              one: `${name}: the newest ${listed} of # unread`,
              other: `${name}: the newest ${listed} of # unread`,
            }),
            comment:
              "Below the unified inbox when a profile has more unread mail than the list shows, since Gmail lists only the newest; {name} is the profile, {listed} how many are shown, # how many are unread",
          })}
        </li>
      ))}
    </ul>
  );
};

type Dates = ReturnType<typeof useDates>;
type ActionLabels = ReturnType<typeof useActionLabels>;

const InboxRow = ({
  row,
  profileName,
  profileColor,
  dates,
  labels,
  selected,
  rowRef,
  onSelect,
  onKeyDown,
}: {
  row: Row;
  profileName: string;
  profileColor: string | undefined;
  dates: Dates;
  labels: ActionLabels;
  selected: boolean;
  rowRef: (element: HTMLTableRowElement | null) => void;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
}) => {
  const { short, full } = dates(row.issued);
  const sender = row.senderName || row.senderAddress;
  // Each cell draws the row's fill, as a table row has no rounded corners.
  const cell =
    "h-8 py-0 group-hover:bg-muted/60 group-focus-visible:bg-muted group-data-selected:bg-muted";

  return (
    <tr
      ref={rowRef}
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      data-selected={selected || undefined}
      className="group cursor-default text-sm outline-none"
      onFocus={onSelect}
      onKeyDown={onKeyDown}
      onClick={() => {
        shellCalls().openInboxMessage({
          profileId: row.profileId,
          messageId: row.messageId,
        });
      }}
    >
      {/* Named by the profile's name inside, which the rule does not read. */}
      {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
      <td className={cn(cell, "rounded-l-[10px] pl-2")}>
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: profileColor }}
          />
          <span className="truncate text-xs text-muted-foreground">
            {profileName}
          </span>
        </span>
      </td>
      <td
        dir="auto"
        // A right-to-left name keeps its own direction but lines up with the
        // column, as the subject does.
        className={cn(cell, "truncate pl-3 text-left font-medium")}
      >
        {sender}
      </td>
      <td className={cn(cell, "pl-3")}>
        <span className="flex min-w-0 gap-1">
          <span dir="auto" className="max-w-[60%] shrink-0 truncate text-left">
            {row.subject}
          </span>
          {row.summary && (
            <span
              dir="auto"
              className="min-w-0 truncate text-left text-muted-foreground before:mr-1 before:content-['-']"
            >
              {row.summary}
            </span>
          )}
        </span>
      </td>
      <td
        className={cn(cell, "relative rounded-r-[10px] pr-2 pl-3 text-right")}
      >
        <time
          dateTime={new Date(row.issued).toISOString()}
          title={full}
          className="text-xs whitespace-nowrap text-muted-foreground tabular-nums group-hover:invisible group-data-selected:invisible"
        >
          {short}
        </time>
        {/* Not hit-testable while hidden, so a click there opens the row. */}
        <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 rounded-r-[10px] bg-linear-to-r from-transparent to-muted to-[16px] pl-4 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-data-selected:pointer-events-auto group-data-selected:opacity-100">
          {ACTIONS.map((action) => (
            <ShellTooltip key={action}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    // The list's keys are the keyboard's way to them.
                    tabIndex={-1}
                    aria-label={labels[action]}
                    aria-keyshortcuts={ACTION_SHORTCUTS[action]}
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
                  />
                }
              >
                {ACTION_ICONS[action]}
              </TooltipTrigger>
              <ShellTooltipContent side="top">
                {labels[action]}
                <Kbd>{ACTION_KEY_LABELS[action]}</Kbd>
              </ShellTooltipContent>
            </ShellTooltip>
          ))}
        </span>
      </td>
    </tr>
  );
};

/**
 * Every profile's unread mail in an overlay over the page: main sends the
 * rows while it is open and keeps them, so a reload shows the same list.
 * The arrows and Gmail's keys move, open and act on the selected row.
 */
export const Inbox = ({ inbox }: { inbox: InboxState }) => {
  const { t } = useLingui();
  const { rows, profiles } = inbox;
  const colors = useShellState("profiles");
  // The index stands in once its row is gone, so the row that took its
  // place is selected.
  const [selection, setSelection] = useState({ key: "", index: 0 });
  const headingId = useId();
  const emptyId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const focusedOnOpen = useRef(false);
  const failure = useFailureText(inbox.notice, profiles);
  const dates = useDates();
  const labels = useActionLabels();
  const names = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.name])),
    [profiles]
  );
  const colorOf = (profileId: string) =>
    colors?.profiles.find((profile) => profile.id === profileId)?.color;

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

  // A row an action took away hands focus, which would fall to the
  // document's body, to the row that took its place.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const active = grid?.ownerDocument.activeElement;
    const inList =
      active === grid?.ownerDocument.body || (active && grid?.contains(active));

    if (!inList) {
      return;
    }

    const element =
      selectedRowKey === undefined ? grid : rowRefs.current.get(selectedRowKey);

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
    if (event.metaKey || event.ctrlKey || event.altKey || !selected) {
      return;
    }

    const message = {
      profileId: selected.profileId,
      messageId: selected.messageId,
    };
    const command = inboxKeyCommand(event);

    if (!command) {
      return;
    }

    event.preventDefault();

    if (command.kind === "action") {
      shellCalls().runInboxAction({ ...message, action: command.action });
    } else if (command.kind === "open") {
      shellCalls().openInboxMessage(message);
    } else {
      move(
        {
          next: selectedIndex + 1,
          previous: selectedIndex - 1,
          first: 0,
          last: rows.length - 1,
        }[command.to]
      );
    }
  };

  return (
    <OverlayCard kind="inbox" labelledBy={headingId}>
      <header className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-3">
        <h2 id={headingId} className="text-base leading-5 font-medium">
          {t({
            message: "Unified inbox",
            comment:
              "Title of the overlay over the page that lists every profile's unread mail",
          })}
        </h2>
        {rows.length > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {rows.length}
          </Badge>
        )}
      </header>
      <div className="-mx-1 h-px shrink-0 bg-foreground/10" />
      <output
        aria-live="polite"
        className={cn(
          "mx-1 mt-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive",
          !failure && "sr-only"
        )}
      >
        {failure}
      </output>
      <div className="min-h-0 overflow-y-auto pt-1">
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
          aria-describedby={rows.length === 0 ? emptyId : undefined}
          tabIndex={rows.length === 0 ? 0 : -1}
          className="w-full table-fixed border-separate border-spacing-0 outline-none"
        >
          <colgroup>
            <col className="w-[92px]" />
            <col className="w-[152px]" />
            <col />
            <col className="w-20" />
          </colgroup>
          <tbody>
            {rows.map((row, index) => {
              const key = keyOf(row);

              return (
                <InboxRow
                  key={key}
                  row={row}
                  profileName={names.get(row.profileId) ?? ""}
                  profileColor={colorOf(row.profileId)}
                  dates={dates}
                  labels={labels}
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
          <Empty id={emptyId} className="p-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t({
                  message: "No unread messages",
                  comment:
                    "Heading of the unified inbox when no profile has unread mail",
                })}
              </EmptyTitle>
              <EmptyDescription>
                {t({
                  message:
                    "Unread mail from all your profiles shows here. A message leaves the list once you read it.",
                  comment:
                    "Shown in the unified inbox when no profile has unread mail",
                })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <MoreNotes profiles={profiles} />
      </div>
    </OverlayCard>
  );
};

/** The titlebar's button that opens the unified inbox, or closes it. */
export const InboxButton = ({
  open,
  profileCount,
  shortcut,
}: {
  open: boolean;
  profileCount: number;
  shortcut: string | undefined;
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
    <TitlebarButton
      data-opens="inbox"
      pressed={open}
      label={label}
      shortcut={shortcut}
      onClick={() => {
        shellCalls().setInboxOpen({ open: !open });
      }}
    >
      <InboxIcon />
    </TitlebarButton>
  );
};
