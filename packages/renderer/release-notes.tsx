/*
 * What's new: GitHub release notes drawn over the whole window.
 *
 * Release bodies are markup from outside Meru, so this page loads with no
 * preload and holds no bridge to the main process. Nothing it imports may call
 * `ipc`, `renderApp` included: what it needs comes in its search parameters,
 * and it closes itself by setting its fragment to `#close`, which main watches
 * for.
 */
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@meru/ui/components/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { Kbd } from "@meru/ui/components/kbd";
import { Skeleton } from "@meru/ui/components/skeleton";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import z from "zod";
import { dayjs } from "@/lib/date";

const GITHUB_RELEASES_URL = "https://github.com/zoidsh/meru/releases";

const searchParams = new URLSearchParams(window.location.search);

const currentTagName = `v${searchParams.get("version")}`;

const isBetaChannel = searchParams.get("channel") === "beta";

function setDarkMode(darkMode: boolean) {
  document.documentElement.classList.toggle("dark", darkMode);
}

setDarkMode(searchParams.get("darkMode") === "true");

// Main sets the app's theme as the native theme, which Chromium reports to
// every page as the color scheme it prefers.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
  setDarkMode(event.matches);
});

function close() {
  window.location.hash = "close";
}

const releasesSchema = z.array(
  z.object({
    published_at: z.string(),
    body: z.string().nullable(),
    tag_name: z.string(),
    prerelease: z.boolean(),
    id: z.number(),
  }),
);

function useReleases() {
  return useQuery({
    queryKey: ["github", "releases"],
    queryFn: async () => {
      const response = await fetch("https://api.github.com/repos/zoidsh/meru/releases");

      return releasesSchema.parse(await response.json());
    },
    select: (releases) =>
      isBetaChannel
        ? releases
        : releases.filter((release) => !release.prerelease || release.tag_name === currentTagName),
  });
}

function Releases() {
  const { data: releases, isPending, isError, refetch } = useReleases();

  if (isPending) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Couldn't load what's new</EmptyTitle>
          <EmptyDescription>
            The release notes come from GitHub. Check your connection, then try again, or read them
            on <a href={GITHUB_RELEASES_URL}>GitHub</a>.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() => {
              refetch();
            }}
          >
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="divide-y">
      {releases.map((release) => (
        <section key={release.id} className="px-6 py-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">{release.tag_name}</h2>
            {release.tag_name === currentTagName ? <Badge>Current version</Badge> : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {dayjs(release.published_at).fromNow()}
          </div>
          <div className="prose dark:prose-invert prose-h3:text-lg prose-li:pl-0 prose-li:marker:text-muted-foreground mt-4 text-sm">
            <Markdown
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
              components={{
                h2: "h3",
                kbd: Kbd,
              }}
            >
              {release.body}
            </Markdown>
          </div>
        </section>
      ))}
    </div>
  );
}

function ReleaseDate() {
  const { data: releases } = useReleases();

  const [firstRelease] = releases ?? [];

  if (!firstRelease) {
    return null;
  }

  return <DialogDescription>{dayjs(firstRelease.published_at).format("LL")}</DialogDescription>;
}

function WhatsNew() {
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div className="fixed inset-0 animate-in bg-black/40 duration-100 fade-in-0" />
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
      >
        {/* The notes take the focus rather than the close button, so the keys scroll them. */}
        <DialogContent
          initialFocus={bodyRef}
          className="flex h-[min(calc(100%-4rem),48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogHeader className="border-b px-6 py-4 pr-12">
            <DialogTitle className="text-lg font-semibold">What's new</DialogTitle>
            <ReleaseDate />
          </DialogHeader>
          <div ref={bodyRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <Releases />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <QueryClientProvider client={new QueryClient()}>
      <WhatsNew />
    </QueryClientProvider>,
  );
}
