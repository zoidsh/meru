import { useLingui } from "@lingui/react/macro";
import { useEffect, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

import type { ShellState } from "#contract/shell.ts";
import { isAppId } from "#core/apps.ts";
import { TITLEBAR_HEIGHT } from "#core/layout.ts";
import {
  OWN_WINDOW_INSET,
  OWN_WINDOW_RADIUS,
  ownWindowFindFrameName,
  ownWindowFrameName,
} from "#core/own-window.ts";
import { Badge } from "#ui/badge.tsx";

import { AppIcon } from "./app-icon.tsx";
import { OwnWindowBookmarkButton } from "./bookmarks.tsx";
import { FindBar } from "./find-bar.tsx";
import {
  closeShellDocument,
  openShellDocument,
  shellDocument,
  subscribeShellDocuments,
} from "./shell-document.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { TabProblem } from "./tab-problem.tsx";
import { tabTitle } from "./tab-strip.tsx";
import { NavigationButtons } from "./titlebar.tsx";

type OwnWindow = ShellState["windows"][number];

/**
 * A tab's own window as the shell draws it, behind the page main places in
 * it: the titlebar, with the page's navigation, the profile's badge where
 * there are two or more profiles, the app's icon and the page's title, and
 * at its right the bookmark star, and the shell grey with the profile's tint around the page. The whole
 * titlebar drags the window but for its controls.
 */
const OwnWindowFrame = ({ own }: { own: OwnWindow }) => {
  const { t } = useLingui();
  const profiles = useShellState("profiles");
  const shortcuts = useShellState("shortcuts");
  const profile = profiles?.profiles.find(({ id }) => id === own.profileId);
  const title = tabTitle(own);

  return (
    <div
      data-tint
      style={{ "--tint": profile?.color } as CSSProperties}
      className="flex h-screen flex-col bg-shell"
    >
      <header
        aria-label={t({
          message: "Title bar",
          comment:
            "Accessible name of the strip across the top of the window, read by screen readers",
        })}
        data-tinted
        style={{ height: TITLEBAR_HEIGHT }}
        className="flex shrink-0 items-center gap-2 bg-shell px-2 [app-region:drag] in-data-[platform=darwin]:pl-20"
      >
        <div className="flex items-center gap-1">
          <NavigationButtons
            shortcuts={shortcuts}
            navigation={own.navigation}
            reloadWakes={false}
            navigate={(action) => {
              shellCalls().navigateTab({
                profileId: own.profileId,
                tabId: own.tabId,
                action,
              });
            }}
          />
        </div>
        {profile && (profiles?.profiles.length ?? 0) >= 2 && (
          <Badge variant="secondary" className="flex-none gap-1">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: profile.color }}
            />
            {profile.name}
          </Badge>
        )}
        <div className="flex max-w-80 min-w-0 items-center gap-1.5 text-xs">
          {isAppId(own.app) && (
            <AppIcon app={own.app} aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate" title={title}>
            {title}
          </span>
        </div>
        <div aria-hidden className="h-full min-w-16 flex-1" />
        <div className="flex items-center gap-1">
          <OwnWindowBookmarkButton
            profileId={own.profileId}
            tabId={own.tabId}
            bookmarked={own.bookmarked}
          />
        </div>
      </header>
      {/* Where main places the page, by the same measurements. */}
      <div
        style={{
          paddingLeft: OWN_WINDOW_INSET,
          paddingRight: OWN_WINDOW_INSET,
          paddingBottom: OWN_WINDOW_INSET,
        }}
        className="flex min-h-0 flex-1"
      >
        <div
          data-page-area
          style={{ borderRadius: OWN_WINDOW_RADIUS }}
          className="flex-1 overflow-hidden bg-background"
        >
          <TabProblem
            profileId={own.profileId}
            tab={{ id: own.tabId, app: own.app, status: own.status }}
          />
        </div>
      </div>
    </div>
  );
};

/** One window's document, opened while the window is listed and closed after. */
const OwnWindowDocument = ({ own }: { own: OwnWindow }) => {
  const name = ownWindowFrameName(own);
  const target = useSyncExternalStore(subscribeShellDocuments, () =>
    shellDocument(name)
  );

  useEffect(() => {
    openShellDocument(name);

    return () => {
      closeShellDocument(name);
    };
  }, [name]);

  return target
    ? createPortal(<OwnWindowFrame own={own} />, target.body)
    : null;
};

/**
 * The find bar of a tab's own window, in a document of its own that main
 * shows over the page, opened while the bar is open and closed after.
 */
const OwnWindowFind = ({
  own,
  bar,
}: {
  own: OwnWindow;
  bar: NonNullable<OwnWindow["find"]>;
}) => {
  const name = ownWindowFindFrameName(own);
  const target = useSyncExternalStore(subscribeShellDocuments, () =>
    shellDocument(name)
  );
  const { profileId, tabId } = own;

  useEffect(() => {
    openShellDocument(name);

    return () => {
      closeShellDocument(name);
    };
  }, [name]);

  // Escape anywhere in it closes it, as in the overlay's document.
  useEffect(() => {
    if (!target) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        shellCalls().closeFind({ profileId, tabId });
      }
    };

    target.addEventListener("keydown", onKeyDown);

    return () => {
      target.removeEventListener("keydown", onKeyDown);
    };
  }, [target, profileId, tabId]);

  return target
    ? createPortal(<FindBar {...bar} tab={{ profileId, tabId }} />, target.body)
    : null;
};

/** The frame of each tab's own window, in a document of the shell's each. */
export const OwnWindows = () => {
  const windows = useShellState("windows") ?? [];

  return windows.flatMap((own) => [
    <OwnWindowDocument key={ownWindowFrameName(own)} own={own} />,
    ...(own.find
      ? [
          <OwnWindowFind
            key={ownWindowFindFrameName(own)}
            own={own}
            bar={own.find}
          />,
        ]
      : []),
  ]);
};
