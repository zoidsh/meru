import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useUnifiedInbox, type UnifiedInboxMessage } from "@/lib/hooks";
import { createDateTimeFormatter, dayjs } from "@meru/shared/renderer/date";
import { ipc } from "@meru/shared/renderer/ipc";
import { AccountBadge } from "@meru/ui/components/account-badge";
import { Button } from "@meru/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  InboxIcon,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import {
  type PaginationState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@meru/ui/components/avatar";
import { getGoogleDomainFaviconUrl } from "@meru/shared/google";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";

const columnHelper = createColumnHelper<UnifiedInboxMessage>();

const createColumns = ({ showSenderIcons }: { showSenderIcons: boolean }) => [
  columnHelper.accessor("account.label", {
    cell: (props) => (
      <div className="w-20">
        <AccountBadge label={props.getValue()} color={props.row.original.account.color} />
      </div>
    ),
  }),
  columnHelper.accessor("author.name", {
    cell: (props) => {
      const domain = props.row.original.author.email.split("@")[1];

      return (
        <div
          className="w-36 flex items-center gap-2"
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
      <div className="flex-1 flex gap-2 overflow-hidden">
        <div className="truncate shrink-0 max-w-sm" title={props.getValue()}>
          {props.getValue()}
        </div>
        <div className="text-muted-foreground truncate min-w-0" title={props.row.original.summary}>
          {props.row.original.summary}
        </div>
      </div>
    ),
  }),
  columnHelper.accessor("receivedAt", {
    cell: (props) => {
      const date = dayjs(props.getValue());

      return (
        <div
          className="text-muted-foreground whitespace-nowrap"
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

  const columns = useMemo(() => createColumns({ showSenderIcons }), [showSenderIcons]);

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
  });

  const configMutation = useConfigMutation();

  return (
    <>
      <div className="text-sm border rounded-lg overflow-hidden">
        {table.getRowModel().rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-6 not-last:border-b p-3 whitespace-nowrap hover:bg-muted/50 transition-colors cursor-default"
            onClick={() => {
              ipc.main.send("settings.toggleIsOpen", false);

              ipc.main.send("accounts.selectAccount", row.original.account.id);

              ipc.main.send("gmail.openMessage", row.original.id);
            }}
          >
            {row.getVisibleCells().map((cell) => (
              <Fragment key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-4">
        <div className="flex gap-2 items-center">
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
        <div className="flex gap-2 items-center">
          <div className="text-sm">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => table.lastPage()}
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
              <EmptyTitle>No Unread Messages</EmptyTitle>
              <EmptyDescription>
                Your unified inbox will show all your unread messages in one place. Once you read a
                message, it will disappear from the unified inbox.
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
        <SettingsTitle>Unified Inbox</SettingsTitle>
      </SettingsHeader>
      {renderContent()}
    </>
  );
}
