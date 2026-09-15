import type { GmailAction } from "@meru/shared/gmail";
import { getGoogleDomainFaviconUrl } from "@meru/shared/google";
import { ms } from "@meru/shared/ms";
import { ipc } from "@meru/shared/renderer/ipc";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@meru/ui/components/avatar";
import { Button } from "@meru/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { Table, TableBody, TableCell, TableRow } from "@meru/ui/components/table";
import { cn } from "@meru/ui/lib/utils";
import {
  type PaginationState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  InboxIcon,
  Loader2Icon,
  MailOpenIcon,
  OctagonAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { navigate } from "wouter/use-hash-location";
import { AccountBadge } from "@/components/account-badge";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { createDateTimeFormatter, dayjs } from "@/lib/date";
import { useUnifiedInbox, type UnifiedInboxMessage } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";

const columnHelper = createColumnHelper<UnifiedInboxMessage>();

const MESSAGE_ACTIONS = [
  { action: "archive", label: "Archive", icon: ArchiveIcon },
  { action: "markAsRead", label: "Mark as read", icon: MailOpenIcon },
  { action: "delete", label: "Delete", icon: Trash2Icon },
  { action: "markAsSpam", label: "Mark as spam", icon: OctagonAlertIcon },
] as const satisfies {
  action: GmailAction;
  label: string;
  icon: typeof ArchiveIcon;
}[];

type PendingMessageAction = { messageId: string; action: GmailAction };

const createColumns = ({
  showSenderIcons,
  pending,
  onAction,
}: {
  showSenderIcons: boolean;
  pending: PendingMessageAction | null;
  onAction: (message: UnifiedInboxMessage, action: GmailAction) => void;
}) => [
  columnHelper.accessor("account.label", {
    cell: (props) => (
      <AccountBadge label={props.getValue()} color={props.row.original.account.color} />
    ),
  }),
  columnHelper.accessor("author.name", {
    cell: (props) => {
      const domain = props.row.original.author.email.split("@")[1];

      return (
        <div
          className="flex max-w-36 items-center gap-2"
          title={[props.row.original.author, ...props.row.original.contributors]
            .map(({ name, email }) => `${name} <${email}>`)
            .join(", ")}
        >
          {showSenderIcons && (
            <AvatarGroup>
              <Avatar className="size-4">
                {domain && <AvatarImage src={getGoogleDomainFaviconUrl(domain, 32)} />}
                <AvatarFallback />
              </Avatar>
              {props.row.original.contributors.slice(0, 2).map((contributor) => {
                const contributorDomain = contributor.email.split("@")[1];

                return (
                  <Avatar key={contributor.email} className="size-4">
                    {contributorDomain && (
                      <AvatarImage src={getGoogleDomainFaviconUrl(contributorDomain, 32)} />
                    )}
                    <AvatarFallback />
                  </Avatar>
                );
              })}
            </AvatarGroup>
          )}
          <div className="truncate">
            {props.row.original.contributors.length === 0
              ? props.row.original.author.name
              : [
                  props.row.original.author.name.split(" ")[0],
                  ...props.row.original.contributors.map(
                    (contributor) => contributor.name.split(" ")[0],
                  ),
                ].join(", ")}
          </div>
        </div>
      );
    },
  }),
  columnHelper.accessor("subject", {
    cell: (props) => (
      // Faded rather than covered by a background, because the row's own hover
      // colour is semi-transparent and a band painted over it would come out
      // darker than the row. This is the cell the row actions overlap, the
      // date cell being narrower than they are, so the fade has to finish
      // short of this cell's edge rather than at it.
      <div className="flex flex-1 gap-2 overflow-hidden group-hover:mask-r-from-[calc(100%-8rem)] group-hover:mask-r-to-[calc(100%-3.5rem)] group-data-[pending]:mask-r-from-[calc(100%-8rem)] group-data-[pending]:mask-r-to-[calc(100%-3.5rem)] group-data-[state=selected]:mask-r-from-[calc(100%-8rem)] group-data-[state=selected]:mask-r-to-[calc(100%-3.5rem)]">
        <div className="max-w-sm shrink-0 truncate" title={props.getValue()}>
          {props.getValue()}
        </div>
        <div className="min-w-0 truncate text-muted-foreground" title={props.row.original.summary}>
          {props.row.original.summary}
        </div>
      </div>
    ),
  }),
  columnHelper.accessor("receivedAt", {
    cell: (props) => {
      const date = dayjs(props.getValue());

      const pendingAction =
        pending && pending.messageId === props.row.original.id ? pending.action : null;

      return (
        <>
          {/* Hidden rather than faded, because the actions cover it whole. */}
          <div
            className="whitespace-nowrap text-muted-foreground group-hover:invisible group-data-[pending]:invisible group-data-[state=selected]:invisible"
            title={createDateTimeFormatter({
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(date.toDate())}
          >
            {date.isToday()
              ? createDateTimeFormatter({
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(date.toDate())
              : date.isSame(dayjs(), "year")
                ? createDateTimeFormatter({
                    month: "short",
                    day: "numeric",
                  }).format(date.toDate())
                : createDateTimeFormatter().format(date.toDate())}
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 opacity-0 transition-opacity group-hover:opacity-100 group-data-[pending]:opacity-100 group-data-[state=selected]:opacity-100">
            {MESSAGE_ACTIONS.map(({ action, label, icon: Icon }) => (
              <Button
                key={action}
                variant="ghost"
                size="icon-sm"
                // Out of the tab order because the document-level hotkeys are
                // the keyboard path, and Enter on a focused one would reach
                // the `enter` hotkey, which cancels the press and opens the
                // message.
                tabIndex={-1}
                title={label}
                disabled={pendingAction !== null}
                className={cn(pendingAction === action && "disabled:opacity-100")}
                onClick={(event) => {
                  event.stopPropagation();

                  onAction(props.row.original, action);
                }}
              >
                {pendingAction === action ? <Loader2Icon className="animate-spin" /> : <Icon />}
              </Button>
            ))}
          </div>
        </>
      );
    },
  }),
];

function UnifiedInboxTable({
  messages,
  rowsPerPage,
  showSenderIcons,
}: {
  messages: UnifiedInboxMessage[];
  rowsPerPage: number;
  showSenderIcons: boolean;
}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: rowsPerPage,
  });

  const [focusedIndex, setFocusedIndex] = useState(-1);

  const [pending, setPending] = useState<PendingMessageAction | null>(null);

  // Mirrors `pending` so that the guard below reads it without taking it as a
  // dependency: the hotkeys memoize their callbacks on their own dependencies,
  // and a `runAction` that changed identity would leave them holding one from
  // before the request started, whose guard sees nothing pending.
  const pendingRef = useRef<PendingMessageAction | null>(null);

  // Held until the whole cycle is done rather than removing the row at once,
  // because the poll a moment later rewrites the list from a feed the action
  // has not reached yet, and a row taken away optimistically comes back.
  const runAction = useCallback(async (message: UnifiedInboxMessage, action: GmailAction) => {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = { messageId: message.id, action };

    setPending(pendingRef.current);

    try {
      await ipc.main.invoke("gmail.handleMessage", message.account.id, message.id, action);
    } finally {
      pendingRef.current = null;

      setPending(null);
    }
  }, []);

  const columns = useMemo(
    () => createColumns({ showSenderIcons, pending, onAction: runAction }),
    [showSenderIcons, pending, runAction],
  );

  const table = useReactTable({
    data: messages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    // Every push of the accounts rebuilds `messages`, which the default would
    // read as new data and answer by sending the reader back to page one.
    autoResetPageIndex: false,
  });

  const configMutation = useConfigMutation();

  const rows = table.getRowModel().rows;

  const focusedRowRef = useRef<HTMLTableRowElement>(null);

  const isGPrefixActiveRef = useRef(false);

  const gPrefixTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openMessage = (message: UnifiedInboxMessage) => {
    navigate("/");

    ipc.main.send("accounts.selectAccount", message.account.id);

    ipc.main.send("gmail.openMessage", message.id);
  };

  useHotkeys(
    ["j", "down"],
    (event) => {
      event.preventDefault();

      if (focusedIndex === -1) {
        setFocusedIndex(0);

        return;
      }

      if (focusedIndex < rows.length - 1) {
        setFocusedIndex(focusedIndex + 1);
      } else if (table.getCanNextPage()) {
        table.nextPage();

        setFocusedIndex(0);
      }
    },
    [focusedIndex, rows],
  );

  useHotkeys(
    ["k", "up"],
    (event) => {
      event.preventDefault();

      if (focusedIndex === -1) {
        setFocusedIndex(0);

        return;
      }

      if (focusedIndex > 0) {
        setFocusedIndex(focusedIndex - 1);
      } else if (table.getCanPreviousPage()) {
        table.previousPage();

        setFocusedIndex(table.getState().pagination.pageSize - 1);
      }
    },
    [focusedIndex],
  );

  useHotkeys(
    ["enter", "o"],
    (event) => {
      event.preventDefault();

      const focusedMessage = rows[focusedIndex]?.original;

      if (focusedMessage) {
        openMessage(focusedMessage);
      }
    },
    [focusedIndex, rows],
  );

  const handleFocusedMessage = (action: GmailAction) => {
    const focusedMessage = rows[focusedIndex]?.original;

    if (focusedMessage) {
      runAction(focusedMessage, action);
    }
  };

  useHotkeys(
    "e",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("archive");
    },
    [focusedIndex, rows],
  );

  useHotkeys(
    "shift+i",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("markAsRead");
    },
    [focusedIndex, rows],
  );

  // Matched on the character rather than the key, because the default matches
  // the physical key instead, where Shift-3 is `3` and never `#`.
  useHotkeys(
    "#",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("delete");
    },
    { useKey: true },
    [focusedIndex, rows],
  );

  useHotkeys(
    "!",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("markAsSpam");
    },
    { useKey: true },
    [focusedIndex, rows],
  );

  useHotkeys("g", () => {
    isGPrefixActiveRef.current = true;

    clearTimeout(gPrefixTimeoutRef.current);

    gPrefixTimeoutRef.current = setTimeout(() => {
      isGPrefixActiveRef.current = false;
    }, ms("1s"));
  });

  useHotkeys("n", () => {
    if (!isGPrefixActiveRef.current) {
      return;
    }

    isGPrefixActiveRef.current = false;

    clearTimeout(gPrefixTimeoutRef.current);

    if (table.getCanNextPage()) {
      table.nextPage();

      setFocusedIndex(0);
    }
  });

  useHotkeys("p", () => {
    if (!isGPrefixActiveRef.current) {
      return;
    }

    isGPrefixActiveRef.current = false;

    clearTimeout(gPrefixTimeoutRef.current);

    if (table.getCanPreviousPage()) {
      table.previousPage();

      setFocusedIndex(0);
    }
  });

  useEffect(() => {
    setPagination((current) => ({
      ...current,
      pageIndex: Math.min(current.pageIndex, Math.max(table.getPageCount() - 1, 0)),
    }));
  }, [messages.length, table]);

  useEffect(() => {
    setFocusedIndex((current) => Math.min(current, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  // Also on `rows`, because acting on the focused row unmounts it and the row
  // that takes its index inherits the ref without inheriting the focus.
  useEffect(() => {
    focusedRowRef.current?.focus({ preventScroll: true });

    focusedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, rows]);

  useEffect(() => {
    return () => {
      clearTimeout(gPrefixTimeoutRef.current);
    };
  }, []);

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={row.id}
                ref={index === focusedIndex ? focusedRowRef : undefined}
                tabIndex={index === focusedIndex ? -1 : undefined}
                data-state={index === focusedIndex ? "selected" : undefined}
                // `relative` anchors the row actions rendered from the
                // receivedAt cell, which are wider than that cell is.
                className="group relative cursor-default outline-none"
                data-pending={pending?.messageId === row.original.id || undefined}
                onClick={() => {
                  openMessage(row.original);
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "px-3 py-3",
                      cell.column.id === "subject" && "w-full max-w-0",
                      cell.column.id === "receivedAt" && "text-right",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm">Rows per page</div>
          <Select
            value={rowsPerPage}
            onValueChange={(value) => {
              if (value) {
                table.setPageSize(value);

                configMutation.mutate({ "unifiedInbox.rowsPerPage": value });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 15, 20, 25, 30].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.firstPage()}
            title="First page"
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.previousPage()}
            title="Previous page"
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.nextPage()}
            title="Next page"
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.lastPage()}
            title="Last page"
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </>
  );
}

export function UnifiedInbox() {
  const { config } = useConfig();

  const unifiedInbox = useUnifiedInbox();

  const renderContent = () => {
    if (!config) {
      return;
    }

    if (unifiedInbox.messages.length === 0) {
      return (
        <div className="py-20">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No unread messages</EmptyTitle>
              <EmptyDescription>
                The unified inbox shows every unread message from your accounts in one place. A
                message leaves the list after you read it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }

    return (
      <UnifiedInboxTable
        messages={unifiedInbox.messages}
        rowsPerPage={config["unifiedInbox.rowsPerPage"]}
        showSenderIcons={config["unifiedInbox.showSenderIcons"]}
      />
    );
  };

  return (
    <>
      <SettingsHeader className="flex-col">
        <SettingsTitle>Unified inbox</SettingsTitle>
      </SettingsHeader>
      {renderContent()}
    </>
  );
}
