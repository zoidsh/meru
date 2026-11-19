import type { IncomingMessage, ServerResponse } from "node:http";

import { page } from "./pages.ts";

/** The Gmail stand-in's page of files to download. */
export const DOWNLOADS_PATH = "/downloads";

export const DOWNLOADS_TITLE = "Downloads stand-in";

/**
 * Each file the page links to: `small` arrives at once; `slow` sends its
 * first half and the rest when released; `unsized` the same, naming no size;
 * `stalled` sends nothing past its headers until released.
 */
export const DOWNLOAD_FILES = {
  small: { name: "report.pdf", size: 2048, type: "application/pdf" },
  slow: { name: "archive.zip", size: 40_000, type: "application/zip" },
  stalled: { name: "backup.zip", size: 12_000, type: "application/zip" },
  unsized: {
    name: "stream.bin",
    size: 30_000,
    type: "application/octet-stream",
  },
} as const;

export type DownloadFile = keyof typeof DOWNLOAD_FILES;

const FILES_PATH = "/files/";

export const DOWNLOAD_LINKS = {
  small: "Download the report",
  slow: "Download the archive",
  stalled: "Download the backup",
  unsized: "Download the stream",
} as const satisfies Record<DownloadFile, string>;

const isFile = (name: string): name is DownloadFile => name in DOWNLOAD_FILES;

/** The files the stand-in serves and the page linking to them. */
export const createDownloadFiles = () => {
  const held = new Map<DownloadFile, (() => void)[]>();

  const answer = (request: IncomingMessage, response: ServerResponse) => {
    const path = request.url ?? "";

    if (path === DOWNLOADS_PATH) {
      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(
          page(
            DOWNLOADS_TITLE,
            Object.entries(DOWNLOAD_LINKS)
              .map(
                ([file, label]) => `<a href="${FILES_PATH}${file}">${label}</a>`
              )
              .join("\n    ")
          )
        );

      return true;
    }

    const file = path.startsWith(FILES_PATH)
      ? path.slice(FILES_PATH.length)
      : "";

    if (!isFile(file)) {
      return false;
    }

    const { name, size, type } = DOWNLOAD_FILES[file];

    response.writeHead(200, {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      ...(file !== "unsized" && { "Content-Length": String(size) }),
    });

    if (file === "small") {
      response.end(Buffer.alloc(size, 1));

      return true;
    }

    const half = file === "stalled" ? 0 : Math.floor(size / 2);

    if (half === 0) {
      response.flushHeaders();
    } else {
      response.write(Buffer.alloc(half, 1));
    }

    const rest = held.get(file) ?? [];

    rest.push(() => {
      response.end(Buffer.alloc(size - half, 1));
    });
    held.set(file, rest);

    return true;
  };

  return {
    answer,
    /** Sends the rest of each `file` under way. */
    release: (file: DownloadFile) => {
      const rest = held.get(file) ?? [];

      held.delete(file);

      for (const send of rest) {
        send();
      }
    },
  };
};
