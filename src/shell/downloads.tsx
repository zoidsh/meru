import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import { relativeTime, sizeUnit } from "#core/downloads.ts";
import { Button } from "#ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#ui/empty.tsx";

import { shellCalls } from "./sync.ts";
import { TitlebarButton } from "./titlebar-button.tsx";
import { TitledOverlay, TitledOverlayBody } from "./titled-overlay.tsx";

type DownloadsState = ShellState["downloads"];
type Row = DownloadsState["rows"][number];

const MINUTE = 60_000;

/** Now, again each minute, so "2 minutes ago" keeps counting. */
const useNow = () => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, MINUTE);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return now;
};

const useFormats = () => {
  const { i18n } = useLingui();
  const { locale } = i18n;

  const size = (bytes: number, unitOf = bytes) => {
    const { unit, divisor } = sizeUnit(unitOf);

    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "short",
      maximumFractionDigits: 1,
    }).format(bytes / divisor);
  };
  const amount = (bytes: number, unitOf: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      bytes / sizeUnit(unitOf).divisor
    );
  const ago = (then: number, now: number) => {
    const start = new Date(now);

    start.setHours(0, 0, 0, 0);

    const { value, unit } = relativeTime(then, now, start.getTime());

    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      value,
      unit
    );
  };

  return { size, amount, ago };
};

const showInFolderLabel = (t: ReturnType<typeof useLingui>["t"]) =>
  document.documentElement.dataset.platform === "darwin"
    ? t({
        message: "Show in Finder",
        comment:
          "Button on a finished download in the Downloads card on macOS that shows the file in Finder",
      })
    : t({
        message: "Show in folder",
        comment:
          "Button on a finished download in the Downloads card on Windows and Linux that shows the file in its folder",
      });

/** The second line of a row: how far it is, or how it ended and when. */
const RowDetail = ({ row, now }: { row: Row; now: number }) => {
  const { t } = useLingui();
  const { size, amount, ago } = useFormats();
  const when = ago(row.startedAt, now);

  switch (row.state) {
    case "progressing": {
      if (row.received === 0) {
        return t({
          message: "Starting…",
          comment:
            "Second line of a download in the Downloads card before anything of it has arrived",
        });
      }

      if (row.total === 0) {
        return size(row.received);
      }

      const done = amount(row.received, row.total);
      const total = size(row.total);

      return t({
        message: `${done} of ${total}`,
        comment:
          "How much of a running download has arrived, in the Downloads card, such as 12.4 of 48 MB; done is a number, total a size with its unit",
      });
    }
    case "completed": {
      const saved = size(row.total);

      return t({
        message: `${saved} · ${when}`,
        comment:
          "Second line of a finished download in the Downloads card, such as 2.4 MB · 2 hours ago; {saved} is its size with its unit, {when} when it started, such as 2 hours ago or yesterday",
      });
    }
    case "failed": {
      return (
        <Trans comment="Second line of a download in the Downloads card that was interrupted, such as Failed · 2 hours ago, Failed in the destructive colour; {when} is when it started, such as 2 hours ago or yesterday">
          <span className="text-destructive">Failed</span> · {when}
        </Trans>
      );
    }
    case "cancelled": {
      return t({
        message: `Cancelled · ${when}`,
        comment:
          "Second line of a download in the Downloads card that was cancelled, such as Cancelled · 2 hours ago; {when} is when it started, such as 2 hours ago or yesterday",
      });
    }
    default: {
      return t({
        message: "Moved or deleted",
        comment:
          "Second line of a finished download in the Downloads card whose file is no longer where it was saved",
      });
    }
  }
};

/** Keeps focus on the row, which the keys act from. */
const keepFocus = (event: { preventDefault: () => void }) => {
  event.preventDefault();
};

const DownloadRow = ({
  row,
  now,
  selected,
  rowRef,
  onSelect,
  onKeyDown,
}: {
  row: Row;
  now: number;
  selected: boolean;
  rowRef: (element: HTMLTableRowElement | null) => void;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
}) => {
  const { t } = useLingui();
  const ended = row.state !== "progressing" && row.state !== "completed";
  const removeLabel = t({
    message: "Remove from the list",
    comment:
      "Button on a download in the Downloads card that takes it off the list, leaving the file",
  });
  const cancelLabel = t({
    message: "Cancel download",
    comment:
      "Button on a running download in the Downloads card that stops it; it shows a spinner until pointed at",
  });
  const showLabel = showInFolderLabel(t);
  const shown = "group-hover:opacity-100 group-data-selected:opacity-100";

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
        if (row.state === "completed") {
          shellCalls().openDownload({ id: row.id });
        }
      }}
    >
      <td className="rounded-l-sm py-1.5 pl-2 group-hover:bg-muted/60 group-focus-visible:bg-muted group-data-selected:bg-muted">
        <span className="flex min-w-0 items-center gap-2">
          <FileIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="flex min-w-0 flex-col">
            <span className={cn("truncate", ended && "text-muted-foreground")}>
              {row.fileName}
            </span>
            <span className="truncate text-xs text-muted-foreground tabular-nums">
              <RowDetail row={row} now={now} />
            </span>
          </span>
        </span>
      </td>
      <td className="w-px rounded-r-sm pr-2 pl-2 group-hover:bg-muted/60 group-focus-visible:bg-muted group-data-selected:bg-muted">
        <span className="flex items-center justify-end gap-0.5">
          {row.state === "progressing" && (
            // As Reload turns into Stop: a spinner until pointed at; the
            // keyboard's highlight leaves it, Delete cancelling instead.
            <Button
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={cancelLabel}
              title={cancelLabel}
              onMouseDown={keepFocus}
              onClick={(event) => {
                event.stopPropagation();
                shellCalls().cancelDownload({ id: row.id });
              }}
            >
              <LoaderCircleIcon
                aria-hidden
                className="animate-spin group-hover:hidden"
              />
              <XIcon aria-hidden className="hidden group-hover:block" />
            </Button>
          )}
          {row.state === "completed" && (
            <Button
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={showLabel}
              title={showLabel}
              className={cn("opacity-0", shown)}
              onMouseDown={keepFocus}
              onClick={(event) => {
                event.stopPropagation();
                shellCalls().showDownload({ id: row.id });
              }}
            >
              <FolderIcon />
            </Button>
          )}
          {row.state !== "progressing" && (
            <Button
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={removeLabel}
              title={removeLabel}
              className={cn("opacity-0", shown)}
              onMouseDown={keepFocus}
              onClick={(event) => {
                event.stopPropagation();
                shellCalls().removeDownload({ id: row.id });
              }}
            >
              <XIcon />
            </Button>
          )}
        </span>
      </td>
    </tr>
  );
};

/**
 * Every download of every profile, newest first: Up, Down, Home and End move
 * the selection, Enter opens a finished file, Delete or Backspace takes the
 * selected download off the list.
 */
export const Downloads = ({ downloads }: { downloads: DownloadsState }) => {
  const { t } = useLingui();
  const { rows } = downloads;
  const now = useNow();
  const [selection, setSelection] = useState({ id: "", index: 0 });
  const titleId = useId();
  const emptyId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const focusedOnOpen = useRef(false);

  const foundIndex = rows.findIndex((row) => row.id === selection.id);
  const selectedIndex =
    foundIndex === -1 ? Math.min(selection.index, rows.length - 1) : foundIndex;
  const selected = rows[selectedIndex];
  const selectedId = selected?.id;
  const select = (index: number) => {
    const row = rows[index];

    if (row) {
      setSelection({ id: row.id, index });
    }
  };

  // A row taken off the list hands focus to the one that took its place.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const active = grid?.ownerDocument.activeElement;
    const inList =
      active === grid?.ownerDocument.body || (active && grid?.contains(active));

    if (!inList) {
      return;
    }

    const element =
      selectedId === undefined ? grid : rowRefs.current.get(selectedId);

    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // Opening puts focus on the first row, or the list when there is none.
  useEffect(() => {
    if (focusedOnOpen.current) {
      return;
    }

    focusedOnOpen.current = true;

    const element =
      selectedId === undefined
        ? gridRef.current
        : rowRefs.current.get(selectedId);

    element?.focus({ preventScroll: true });
  }, [selectedId]);

  const move = (index: number) => {
    const next = Math.max(0, Math.min(index, rows.length - 1));
    const row = rows[next];

    if (row) {
      select(next);
      rowRefs.current.get(row.id)?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The window's shortcuts go to the menu.
    if (event.metaKey || event.ctrlKey || event.altKey || !selected) {
      return;
    }

    const to = {
      ArrowDown: selectedIndex + 1,
      ArrowUp: selectedIndex - 1,
      Home: 0,
      End: rows.length - 1,
    }[event.key];

    if (to !== undefined) {
      event.preventDefault();
      move(to);
    } else if (event.key === "Enter") {
      event.preventDefault();

      if (selected.state === "completed") {
        shellCalls().openDownload({ id: selected.id });
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();

      if (selected.state === "progressing") {
        shellCalls().cancelDownload({ id: selected.id });
      } else {
        shellCalls().removeDownload({ id: selected.id });
      }
    }
  };

  const clearable = rows.some((row) => row.state !== "progressing");

  return (
    <TitledOverlay
      kind="downloads"
      titleId={titleId}
      title={t({
        message: "Downloads",
        comment:
          "Title of the overlay over the page that lists the files downloaded in every profile",
      })}
      action={
        rows.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            disabled={!clearable}
            onClick={() => {
              shellCalls().clearDownloads({});
            }}
          >
            {t({
              message: "Clear all",
              comment:
                "Button in the Downloads card's header that takes every download off the list but those still running",
            })}
          </Button>
        )
      }
    >
      <TitledOverlayBody>
        <div className="min-h-0 overflow-y-auto">
          <table
            ref={gridRef}
            // A list the keys move through, as ARIA's grid pattern has it.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
            role="grid"
            aria-label={t({
              message: "Downloaded files",
              comment:
                "Accessible name of the Downloads card's list, read by screen readers",
            })}
            aria-describedby={rows.length === 0 ? emptyId : undefined}
            tabIndex={rows.length === 0 ? 0 : -1}
            className="w-full table-fixed border-separate border-spacing-0 outline-none"
          >
            <tbody>
              {rows.map((row, index) => (
                <DownloadRow
                  key={row.id}
                  row={row}
                  now={now}
                  selected={row.id === selectedId}
                  rowRef={(element) => {
                    if (element) {
                      rowRefs.current.set(row.id, element);
                    } else {
                      rowRefs.current.delete(row.id);
                    }
                  }}
                  onSelect={() => {
                    select(index);
                  }}
                  onKeyDown={onKeyDown}
                />
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <Empty id={emptyId}>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <DownloadIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {t({
                    message: "No downloads yet",
                    comment:
                      "Heading of the Downloads card when nothing is listed",
                  })}
                </EmptyTitle>
                <EmptyDescription>
                  {t({
                    message: "Files you download appear here for 30 days.",
                    comment:
                      "Shown in the Downloads card when nothing is listed",
                  })}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </TitledOverlayBody>
    </TitledOverlay>
  );
};

/**
 * The titlebar's button that opens the Downloads card, or closes it. While
 * anything downloads the icon fills with green from the top as the total
 * does, and pulses green while a size is not known; once one finished, it is
 * green until the card is opened.
 */
export const DownloadsButton = ({
  downloads,
}: {
  downloads: DownloadsState | undefined;
}) => {
  const { t, i18n } = useLingui();
  const open = downloads?.open ?? false;
  const button = downloads?.button ?? { kind: "plain" };
  const label = t({
    message: "Downloads",
    comment:
      "Accessible name and tooltip of the Downloads button in the title bar, pressed while the list of downloaded files shows",
  });
  let description: string | undefined;
  let fill: string | undefined;

  if (button.kind === "finished") {
    description = t({
      message: "A download finished",
      comment:
        "Read by screen readers on the title bar's Downloads button, green once a download finished and the list has not been opened since",
    });
    fill = "inset(0)";
  } else if (button.kind === "running") {
    const share =
      button.progress === null
        ? undefined
        : new Intl.NumberFormat(i18n.locale, { style: "percent" }).format(
            button.progress
          );

    description =
      share === undefined
        ? t({
            message: "Downloading",
            comment:
              "Read by screen readers on the title bar's Downloads button while a download whose size is not known runs",
          })
        : t({
            message: `${share} downloaded`,
            comment:
              "Read by screen readers on the title bar's Downloads button while downloads run, such as 40% downloaded",
          });
    fill =
      button.progress === null
        ? "inset(0)"
        : `inset(0 0 ${(100 - button.progress * 100).toFixed(1)}% 0)`;
  }

  return (
    <TitlebarButton
      data-opens="downloads"
      data-downloads={button.kind}
      pressed={open}
      label={label}
      aria-description={description}
      onClick={() => {
        shellCalls().setDownloadsOpen({ open: !open });
      }}
    >
      <span className="relative inline-flex">
        <DownloadIcon aria-hidden />
        {fill && (
          <DownloadIcon
            aria-hidden
            style={{ clipPath: fill }}
            className={cn(
              "absolute inset-0 text-success transition-[clip-path] duration-300 motion-reduce:transition-none",
              button.kind === "running" &&
                button.progress === null &&
                "animate-pulse motion-reduce:animate-none motion-reduce:opacity-60"
            )}
          />
        )}
      </span>
    </TitlebarButton>
  );
};
