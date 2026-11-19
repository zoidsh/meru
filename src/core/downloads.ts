import { z } from "zod/mini";

import type { Platform } from "./platform.ts";
import type { State } from "./state.ts";

export const DOWNLOAD_STATES = [
  "progressing",
  "completed",
  "cancelled",
  "failed",
] as const;

export type DownloadState = (typeof DOWNLOAD_STATES)[number];

// Loose, so a key a later build adds survives this one writing the list.
const entrySchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  fileName: z.string(),
  path: z.string(),
  /** In bytes; 0 while the size is not known. */
  size: z.number().check(z.nonnegative()),
  /** When it started, in milliseconds since the epoch. */
  startedAt: z.number(),
  state: z.enum(DOWNLOAD_STATES),
});

/**
 * A download as the history keeps it. One that reads as progressing at
 * startup was running when Meru quit, which cancelled it.
 */
export type DownloadEntry = z.infer<typeof entrySchema>;

/** How long a download stays listed, counted from its start. */
export const DOWNLOAD_LIFETIME = 30 * 24 * 60 * 60 * 1000;

const readable = (entry: unknown): DownloadEntry | undefined => {
  const parsed = entrySchema.safeParse(entry);

  return parsed.success ? parsed.data : undefined;
};

/**
 * The history's entries that can be read, newest first, as the file holds
 * them. An entry that does not parse or repeats an earlier one's id is kept
 * in the file where it was, and not shown; a `downloads` that is not a list
 * reads as none and is kept as found until a download is added.
 */
export const downloads = (state: State): DownloadEntry[] => {
  const entries = state.downloads;

  if (!Array.isArray(entries)) {
    return [];
  }

  const ids = new Set<string>();

  return entries.flatMap((entry: unknown) => {
    const download = readable(entry);

    if (!download || ids.has(download.id)) {
      return [];
    }

    ids.add(download.id);

    return [download];
  });
};

const withEntries = (
  state: State,
  change: (entries: unknown[]) => unknown[]
): State => ({
  ...state,
  downloads: change(Array.isArray(state.downloads) ? state.downloads : []),
});

/** With `entry` first, as the newest. */
export const addDownload = (state: State, entry: DownloadEntry): State =>
  withEntries(state, (entries) => [entry, ...entries]);

/**
 * With the shown entry whose id is `id` changed as `change` says; nothing
 * when there is none.
 */
export const updateDownload = (
  state: State,
  id: string,
  change: Partial<Omit<DownloadEntry, "id">>
): State | undefined =>
  downloads(state).some((entry) => entry.id === id)
    ? withEntries(state, (entries) => {
        const index = entries.findIndex((entry) => readable(entry)?.id === id);

        return entries.map((entry, at) =>
          at === index ? { ...(entry as DownloadEntry), ...change } : entry
        );
      })
    : undefined;

/**
 * Without the shown entries `drop` picks; entries that do not parse stay.
 * Nothing when it picks none.
 */
export const removeDownloads = (
  state: State,
  drop: (entry: DownloadEntry) => boolean
): State | undefined => {
  const dropped = new Set(
    downloads(state)
      .filter(drop)
      .map((entry) => entry.id)
  );

  if (dropped.size === 0) {
    return undefined;
  }

  return withEntries(state, (entries) => {
    // Only the shown entry of an id goes, never a later one repeating it.
    const seen = new Set<string>();

    return entries.filter((entry) => {
      const id = readable(entry)?.id;

      if (id === undefined || seen.has(id)) {
        return true;
      }

      seen.add(id);

      return !dropped.has(id);
    });
  });
};

/** Whether the entry is older than the history keeps. */
export const expired = (entry: DownloadEntry, now: number) =>
  now - entry.startedAt >= DOWNLOAD_LIFETIME;

/** Whether Clear all takes the entry: everything but a running download. */
export const clearable = (entry: Pick<DownloadEntry, "state">) =>
  entry.state !== "progressing";

/**
 * What a download running when Meru quit reads as at the next start: its
 * quit cancelled it.
 */
export const settledAtStart = (
  state: State,
  /** Whether this run started it, which leaves it running. */
  runs: (id: string) => boolean = () => false
): State | undefined => {
  const running = downloads(state).filter(
    (entry) => entry.state === "progressing" && !runs(entry.id)
  );

  let next: State | undefined;

  for (const entry of running) {
    next = updateDownload(next ?? state, entry.id, { state: "cancelled" });
  }

  return next;
};

// Extensions that come before another and belong with it, as `.tar.gz`.
const INNER_EXTENSIONS = new Set(["tar"]);

/**
 * The name split where a counter goes: before its extension, a compound one
 * kept whole. A number in brackets the name already ends in is part of it,
 * as Chrome has it: a second `Tax return (2023).pdf` is `Tax return (2023) (1).pdf`.
 */
const splitName = (fileName: string) => {
  const parts = fileName.split(".");
  // A leading dot names a hidden file and starts no extension.
  const first = parts[0] === "" ? 2 : 1;
  let at = parts.length > first ? parts.length - 1 : parts.length;

  if (at > first && INNER_EXTENSIONS.has((parts[at - 1] ?? "").toLowerCase())) {
    at -= 1;
  }

  const stem = parts.slice(0, at).join(".");
  const extension = at < parts.length ? `.${parts.slice(at).join(".")}` : "";

  return { base: stem, extension };
};

/**
 * `fileName`, or the first of `name (1).ext`, `name (2).ext` and on that is
 * not taken.
 */
export const unusedName = (
  fileName: string,
  taken: (fileName: string) => boolean
) => {
  if (!taken(fileName)) {
    return fileName;
  }

  const { base, extension } = splitName(fileName);

  for (let next = 1; ; next += 1) {
    const candidate = `${base} (${next})${extension}`;

    if (!taken(candidate)) {
      return candidate;
    }
  }
};

/**
 * How a file system compares names: without case on macOS and Windows, as
 * their usual volumes do.
 */
export const nameKey = (fileName: string, platform: Platform) =>
  platform === "darwin" || platform === "win32"
    ? fileName.toLowerCase()
    : fileName;

const EXTENSIONS: Record<string, string> = {
  "application/gzip": "gz",
  "application/json": "json",
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/rtf": "rtf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.rar": "rar",
  "application/x-7z-compressed": "7z",
  "application/x-gzip": "gz",
  "application/x-rar-compressed": "rar",
  "application/x-tar": "tar",
  "application/x-zip-compressed": "zip",
  "application/xml": "xml",
  "application/zip": "zip",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/vnd.microsoft.icon": "ico",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "text/calendar": "ics",
  "text/css": "css",
  "text/csv": "csv",
  "text/html": "html",
  "text/plain": "txt",
  "text/rtf": "rtf",
  "text/xml": "xml",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-msvideo": "avi",
};

/**
 * `fileName` with the extension a file of `mimeType` usually has, when it
 * has none and the type is one of the common ones.
 */
export const withExtension = (fileName: string, mimeType: string) => {
  if (splitName(fileName).extension !== "") {
    return fileName;
  }

  const type = (mimeType.split(";")[0] ?? "").trim().toLowerCase();
  const extension = EXTENSIONS[type];

  return extension ? `${fileName}.${extension}` : fileName;
};

/** A running download's bytes, `total` 0 while its size is not known. */
export interface Progress {
  received: number;
  total: number;
}

/**
 * The share done of everything running, as the Dock and taskbar and the
 * titlebar's button show it: `undefined` with nothing running, `null` while
 * a size is not known. `finished` is the bytes of those that finished since
 * nothing last ran, which keep their share so it never runs backwards.
 */
export const totalProgress = (
  running: readonly Progress[],
  finished: number
): number | null | undefined => {
  if (running.length === 0) {
    return undefined;
  }

  if (running.some((each) => each.total <= 0)) {
    return null;
  }

  const received = running.reduce((sum, each) => sum + each.received, finished);
  const total = running.reduce((sum, each) => sum + each.total, finished);

  return Math.min(1, received / total);
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type TimeUnit = "second" | "minute" | "hour" | "day";

/**
 * How long ago `then` was, as `Intl.RelativeTimeFormat` takes it, in whole
 * units counting back: within a minute is now; days count by the calendar,
 * so last evening is yesterday.
 */
export const relativeTime = (
  then: number,
  now: number,
  /** Where `now`'s day started, in the local time zone. */
  startOfToday: number
): { value: number; unit: TimeUnit } => {
  const ago = Math.max(0, now - then);

  if (ago < MINUTE) {
    return { value: 0, unit: "second" };
  }

  if (ago < HOUR) {
    return { value: -Math.floor(ago / MINUTE), unit: "minute" };
  }

  if (then >= startOfToday) {
    return { value: -Math.floor(ago / HOUR), unit: "hour" };
  }

  return {
    value: -Math.ceil((startOfToday - then) / DAY),
    unit: "day",
  };
};

export type SizeUnit = "byte" | "kilobyte" | "megabyte" | "gigabyte";

const SIZE_UNITS: readonly SizeUnit[] = [
  "byte",
  "kilobyte",
  "megabyte",
  "gigabyte",
];

/** The unit `bytes` reads in, counted in thousands as Finder counts. */
export const sizeUnit = (bytes: number) => {
  let index = 0;

  while (index < SIZE_UNITS.length - 1 && bytes >= 1000 ** (index + 1)) {
    index += 1;
  }

  return {
    unit: SIZE_UNITS[index] ?? "byte",
    divisor: 1000 ** index,
  };
};
