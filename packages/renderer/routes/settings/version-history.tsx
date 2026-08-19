import { ipc } from "@meru/shared/renderer/ipc";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@meru/ui/components/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@meru/ui/components/item";
import { Kbd } from "@meru/ui/components/kbd";
import { Skeleton } from "@meru/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { z } from "zod";
import { SettingsDescription, SettingsHeader, SettingsTitle } from "@/components/settings";
import { dayjs } from "@/lib/date";
import { useConfig } from "@/lib/react-query";

export function VersionHistorySettings() {
  const { config } = useConfig();

  const { data: info } = useQuery({
    queryKey: ["about", "info"],
    queryFn: () => ipc.main.invoke("about.getInfo"),
  });

  const currentTagName = info ? `v${info.version}` : undefined;

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["github", "releases"],
    queryFn: async () => {
      const res: unknown = await fetch("https://api.github.com/repos/zoidsh/meru/releases").then(
        (response) => response.json(),
      );

      return z
        .array(
          z.object({
            published_at: z.string(),
            body: z.string().nullable(),
            tag_name: z.string(),
            prerelease: z.boolean(),
            id: z.number(),
          }),
        )
        .parse(res);
    },
  });

  const renderContent = () => {
    if (isPending) {
      return (
        <>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </>
      );
    }

    if (isError) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Couldn't load what's new</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => {
                void refetch();
              }}
            >
              Try Again
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    const releases =
      config?.["updates.channel"] === "beta"
        ? data
        : data.filter((release) => !release.prerelease || release.tag_name === currentTagName);

    return releases.map((release) => (
      <Item key={release.id} variant="muted">
        <ItemContent>
          <div className="flex items-center justify-between gap-2">
            <ItemTitle className="text-2xl font-semibold">{release.tag_name}</ItemTitle>
            {release.tag_name === currentTagName ? <Badge>Current Version</Badge> : null}
          </div>
          <ItemDescription>{dayjs(release.published_at).fromNow()}</ItemDescription>
          <div className="prose dark:prose-invert prose-h3:text-lg prose-li:marker:text-white prose-li:pl-0 mt-6 text-sm">
            <Markdown
              rehypePlugins={[rehypeRaw]}
              components={{
                h2: "h3",
                kbd: Kbd,
              }}
            >
              {release.body}
            </Markdown>
          </div>
        </ItemContent>
      </Item>
    ));
  };

  return (
    <>
      <SettingsHeader className="flex-col items-start justify-start gap-1">
        <SettingsTitle>What's New</SettingsTitle>
        {info ? <SettingsDescription>Current version: v{info.version}</SettingsDescription> : null}
      </SettingsHeader>
      <div className="space-y-8">{renderContent()}</div>
    </>
  );
}
