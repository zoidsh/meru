import { Trans, useLingui } from "@lingui/react/macro";
import { ipc } from "@meru/shared/renderer/ipc";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@meru/ui/components/item";
import { Kbd } from "@meru/ui/components/kbd";
import { Skeleton } from "@meru/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Markdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import z from "zod";
import { SettingsDescription, SettingsHeader, SettingsTitle } from "@/components/settings";
import { dayjs } from "@/lib/date";
import { useConfig } from "@/lib/react-query";
import { remarkKbd } from "@/lib/remark-kbd";
import { settingsPageLabels } from "@/lib/settings-pages";

/*
 * Where GitHub stores what is uploaded into a release body: `github.com/user-attachments`
 * now, `user-images.githubusercontent.com` before it. The other two serve
 * `user-attachments` behind a redirect, so a URL copied from there still shows.
 * Any other host would learn who reads the notes, and when.
 */
/* oxlint-disable lingui/no-unlocalized-strings -- hosts, the same in every language */
const GITHUB_IMAGE_HOSTS = new Set([
  "user-images.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "github-production-user-asset-6210df.s3.amazonaws.com",
]);
/* oxlint-enable lingui/no-unlocalized-strings */

function isGitHubImageUrl(src: unknown) {
  const url = typeof src === "string" ? URL.parse(src) : null;

  return (
    url?.protocol === "https:" &&
    (GITHUB_IMAGE_HOSTS.has(url.host) ||
      (url.host === "github.com" && url.pathname.startsWith("/user-attachments/assets/")))
  );
}

function isWebUrl(href: unknown) {
  const url = typeof href === "string" ? URL.parse(href) : null;

  return url?.protocol === "http:" || url?.protocol === "https:";
}

const releaseNotesComponents: Components = {
  h2: "h3",
  kbd: Kbd,
  // A new window, which the main window turns into the browser. A plain click
  // would navigate the window itself away from Meru.
  a: ({ node: _node, href, children, ...props }) =>
    isWebUrl(href) ? (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      children
    ),
  img: ({ node: _node, src, ...props }) =>
    isGitHubImageUrl(src) ? <img {...props} src={src} /> : null,
};

export function VersionHistorySettings() {
  const { config } = useConfig();

  const { t } = useLingui();

  const { data: info } = useQuery({
    queryKey: ["about", "info"],
    queryFn: () => ipc.main.invoke("about.getInfo"),
  });

  const version = info?.version;

  const currentTagName = info ? `v${info.version}` : undefined;

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
            <EmptyTitle>
              <Trans>Couldn't load what's new</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>
                The release notes come from GitHub. Check your connection, then try again.
              </Trans>
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => {
                refetch();
              }}
            >
              <Trans comment="Button that loads the release notes again after they failed to load">
                Try again
              </Trans>
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
            {release.tag_name === currentTagName ? (
              <Badge>
                <Trans comment="Badge on the release notes of the version that is running">
                  Current version
                </Trans>
              </Badge>
            ) : null}
          </div>
          <ItemDescription>{dayjs(release.published_at).fromNow()}</ItemDescription>
          <div className="prose dark:prose-invert prose-h3:text-lg prose-li:marker:text-white prose-li:pl-0 mt-6 text-sm">
            <Markdown
              remarkPlugins={[remarkKbd]}
              rehypePlugins={[rehypeSanitize]}
              components={releaseNotesComponents}
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
        <SettingsTitle>{t(settingsPageLabels.versionHistory)}</SettingsTitle>
        {info ? (
          <SettingsDescription>
            <Trans>Current version: v{version}</Trans>
          </SettingsDescription>
        ) : null}
      </SettingsHeader>
      <div className="space-y-8">{renderContent()}</div>
    </>
  );
}
