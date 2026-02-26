import { Button } from "@meru/ui/components/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@meru/ui/components/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@meru/ui/components/item";
import { Kbd } from "@meru/ui/components/kbd";
import { Skeleton } from "@meru/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import z from "zod";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { date } from "@/lib/date";

export function VersionHistorySettings() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["github", "releases"],
    queryFn: async () => {
      const res = await fetch("https://api.github.com/repos/zoidsh/meru/releases").then((res) =>
        res.json(),
      );

      return z
        .array(
          z.object({
            published_at: z.string(),
            body: z.string().nullable(),
            tag_name: z.string(),
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
            <EmptyTitle>Failed to load version history</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => {
                refetch();
              }}
            >
              Try Again
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    return data.map((release) => (
      <Item key={release.id} variant="muted">
        <ItemContent>
          <ItemTitle className="text-2xl font-semibold">{release.tag_name}</ItemTitle>
          <ItemDescription>{date(release.published_at).fromNow()}</ItemDescription>
          <div className="prose dark:prose-invert prose-h3:text-lg prose-li:marker:text-white prose-li:pl-0 text-sm mt-6">
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
      <SettingsHeader>
        <SettingsTitle>Version History</SettingsTitle>
      </SettingsHeader>
      <div className="space-y-8">{renderContent()}</div>
    </>
  );
}
