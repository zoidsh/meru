import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import type { SettingsCalls } from "#contract/settings.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#ui/dialog.tsx";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "#ui/empty.tsx";
import { ScrollArea } from "#ui/scroll-area.tsx";
import { Skeleton } from "#ui/skeleton.tsx";

import { ReleaseNotes } from "./release-notes.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

type ShownRelease = Awaited<ReturnType<SettingsCalls["listReleases"]>>[number];

type Listing =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; releases: ShownRelease[] };

const openLink = (url: string) => {
  settingsCalls()
    .openReleaseLink({ url })
    .catch(() => null);
};

/** Each release, its version, date and notes, the running one marked. */
const ReleaseList = ({
  releases,
  target,
}: {
  releases: ShownRelease[];
  target: string | null;
}) => {
  const { t, i18n } = useLingui();
  const articles = useRef(new Map<string, HTMLElement>());
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "long" });

  useEffect(() => {
    if (target !== null) {
      articles.current.get(target)?.scrollIntoView({ block: "start" });
    }
  }, [target]);

  return (
    <div className="flex flex-col gap-6 pr-3">
      {releases.map((release) => {
        const headingId = `release-${release.tag}`;

        return (
          <article
            key={release.tag}
            ref={(element) => {
              if (element) {
                articles.current.set(release.tag, element);
              } else {
                articles.current.delete(release.tag);
              }
            }}
            aria-labelledby={headingId}
            className="flex flex-col gap-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="text-base font-semibold">
                {release.tag}
              </h3>
              {release.current ? (
                <Badge>
                  {t({
                    message: "Current version",
                    comment:
                      "Badge in Settings' What's new dialog on the release of the version of Meru that is running",
                  })}
                </Badge>
              ) : null}
            </div>
            <time
              dateTime={new Date(release.publishedAt).toISOString()}
              className="text-xs text-muted-foreground"
            >
              {date.format(release.publishedAt)}
            </time>
            <ReleaseNotes notes={release.notes} onLink={openLink} />
          </article>
        );
      })}
    </div>
  );
};

/**
 * The releases, asked of main as it shows: a placeholder while they load,
 * and on a failure Try again, which asks afresh through `onRetry`.
 */
const ReleasesBody = ({
  target,
  onRetry,
}: {
  target: string | null;
  onRetry: () => void;
}) => {
  const { t } = useLingui();
  const [listing, setListing] = useState<Listing>({ status: "loading" });

  useEffect(() => {
    let current = true;

    settingsCalls()
      .listReleases({})
      .then((releases) => {
        if (current) {
          setListing({ status: "ready", releases });
        }

        return null;
      })
      .catch(() => {
        if (current) {
          setListing({ status: "failed" });
        }
      });

    return () => {
      current = false;
    };
  }, []);

  if (listing.status === "ready") {
    return <ReleaseList releases={listing.releases} target={target} />;
  }

  if (listing.status === "failed") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {t({
              message: "Couldn't load what's new.",
              comment:
                "Shown in Settings' What's new dialog when Meru's release notes could not be loaded from GitHub",
            })}
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t({
              message: "Try again",
              comment:
                "Button in Settings' What's new dialog that loads the release notes again after they failed to load",
            })}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <output
      aria-label={t({
        message: "Loading what's new",
        comment:
          "Accessible name of the placeholder in Settings' What's new dialog while Meru's release notes load from GitHub",
      })}
      className="flex flex-col gap-4 pr-3"
    >
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </output>
  );
};

/**
 * What's new's Show and its dialog: Meru's releases from GitHub, newest
 * first, in a list that scrolls inside the dialog. Main opening About for
 * the update card's What's new opens it at that version's release.
 */
export const WhatsNewDialog = ({ describedBy }: { describedBy: string }) => {
  const { t } = useLingui();
  const page = useSettingsState("page");
  const channel = useSettingsState("settings")?.updateChannel;
  const [shown, setShown] = useState(false);
  // The opening of the page whose release the person closed the dialog on.
  const [closedAt, setClosedAt] = useState<number>();
  const [tries, setTries] = useState(0);
  const asked =
    page?.whatsNew !== null &&
    page?.whatsNew !== undefined &&
    page.opened !== closedAt
      ? page.whatsNew
      : null;

  return (
    <Dialog
      open={shown || asked !== null}
      onOpenChange={(open) => {
        setShown(open);

        if (!open) {
          setClosedAt(page?.opened);
        }
      }}
    >
      <DialogTrigger
        aria-describedby={describedBy || undefined}
        render={<Button variant="outline" size="sm" />}
      >
        {t({
          message: "Show",
          comment:
            "Button of the What's new row on the About page of Settings that opens the list of Meru's releases and their notes",
        })}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t({
              message: "What's new",
              comment:
                "Title of the dialog in Settings listing Meru's releases, newest first, with what changed in each",
            })}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[60vh]">
          {/* Asked afresh for each try and channel, which main answers from what it kept. */}
          <ReleasesBody
            key={`${channel}-${tries}`}
            target={asked}
            onRetry={() => {
              setTries((count) => count + 1);
            }}
          />
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button />}>
            {t({
              message: "Done",
              comment: "Button that closes the What's new dialog in Settings",
            })}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
