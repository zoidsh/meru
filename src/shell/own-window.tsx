import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { EllipsisVerticalIcon } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

import type { ShellState } from "#contract/shell.ts";
import { isAppId } from "#core/apps.ts";
import { TITLEBAR_HEIGHT } from "#core/layout.ts";
import {
  OWN_WINDOW_INSET,
  OWN_WINDOW_RADIUS,
  ownWindowCardFrameName,
  ownWindowFindFrameName,
  ownWindowFrameName,
} from "#core/own-window.ts";
import { titlebarStart } from "#core/titlebar.ts";
import { AppIcon } from "#shared/app-icon.tsx";
import { Badge } from "#ui/badge.tsx";

import { OwnWindowBookmarkButton } from "./bookmarks.tsx";
import { wholePoint } from "./context-menu.ts";
import { Downloads, DownloadsButton } from "./downloads.tsx";
import { FindBar } from "./find-bar.tsx";
import { shellPlatform } from "./platform.ts";
import { ScreenPicker } from "./screen-picker.tsx";
import {
  closeShellDocument,
  openShellDocument,
  shellDocument,
  subscribeShellDocuments,
} from "./shell-document.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { TabProblem } from "./tab-problem.tsx";
import { tabTitle } from "./tab-strip.tsx";
import { TitlebarButton } from "./titlebar-button.tsx";
import { NavigationButtons } from "./titlebar.tsx";

type OwnWindow = ShellState["windows"][number];

/** More options, last in the titlebar, whose native menu main pops up under it. */
const MoreOptionsButton = ({
  profileId,
  tabId,
}: {
  profileId: string;
  tabId: string;
}) => {
  const { t } = useLingui();

  return (
    <TitlebarButton
      label={t({
        message: "More options",
        comment:
          "Accessible name and tooltip of the button at the right of a tab's own window's title bar that opens a menu: Move to main window, Copy URL and the like",
      })}
      aria-haspopup="menu"
      onClick={(event) => {
        const { left, bottom } = event.currentTarget.getBoundingClientRect();

        shellCalls().openOwnWindowMenu({
          profileId,
          tabId,
          ...wholePoint(left, bottom),
        });
      }}
    >
      <EllipsisVerticalIcon />
    </TitlebarButton>
  );
};

/**
 * A tab's own window as the shell draws it, behind the page main places in
 * it: the titlebar, with the page's navigation, the profile's badge where
 * there are two or more profiles, the app's icon and the page's title, and
 * at its right the bookmark star, Downloads and More options, and the shell
 * grey with the profile's tint around the page. The whole titlebar drags the window
 * but for its controls.
 */
const OwnWindowFrame = ({ own }: { own: OwnWindow }) => {
  const { t } = useLingui();
  const profiles = useShellState("profiles");
  const shortcuts = useShellState("shortcuts");
  const downloads = useShellState("downloads");
  const appearance = useShellState("appearance");
  const tint = appearance?.tint ?? true;
  const downloadsShown = appearance?.buttons.downloads ?? true;
  const profile = profiles?.profiles.find(({ id }) => id === own.profileId);
  const title = tabTitle(own);

  return (
    <div
      data-tint
      style={{ "--tint": tint ? profile?.color : undefined } as CSSProperties}
      className="flex h-screen flex-col bg-shell"
    >
      <header
        aria-label={t({
          message: "Title bar",
          comment:
            "Accessible name of the strip across the top of the window, read by screen readers",
        })}
        data-tinted
        style={{
          height: TITLEBAR_HEIGHT,
          paddingLeft: titlebarStart(shellPlatform()),
        }}
        className="flex shrink-0 items-center gap-2 bg-shell pr-2 [app-region:drag]"
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
          <Badge variant="secondary" className="flex-none">
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
          {downloadsShown && (
            <DownloadsButton
              downloads={downloads}
              window={{ profileId: own.profileId, tabId: own.tabId }}
            />
          )}
          <MoreOptionsButton profileId={own.profileId} tabId={own.tabId} />
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

type ShownCard = NonNullable<OwnWindow["card"]>;

const closeDownloads = () => {
  shellCalls().setDownloadsOpen({ open: false });
};

/**
 * What closes the card, and the titlebar button that opens it; the screen
 * picker, which the page opened, has none.
 */
const useCardClosing = (
  own: OwnWindow,
  kind: ShownCard["kind"]
): { close: () => void; opener: string | undefined } => {
  const { profileId, tabId } = own;

  return useMemo(
    () =>
      kind === "downloads"
        ? { close: closeDownloads, opener: '[data-opens="downloads"]' }
        : {
            close: () => {
              shellCalls()
                .cancelScreenPicker({ window: { profileId, tabId } })
                .catch(noop);
            },
            opener: undefined,
          },
    [kind, profileId, tabId]
  );
};

/** The card as its kind draws it. */
const DrawnCard = ({ own, card }: { own: OwnWindow; card: ShownCard }) => {
  const downloads = useShellState("downloads");

  if (card.kind === "screen-picker") {
    return (
      <ScreenPicker
        key={card.request}
        card={card.picker}
        window={{ profileId: own.profileId, tabId: own.tabId }}
      />
    );
  }

  return downloads?.open ? <Downloads downloads={downloads} /> : null;
};

/**
 * The card open in a tab's own window, in a document of its own that main
 * lays over the whole page while one is open there, as the main window's
 * overlay covers its pages. Escape in it, a press beside the card and a
 * press on the window's titlebar but on the button that opened it close it.
 */
const OwnWindowCard = ({ own, card }: { own: OwnWindow; card: ShownCard }) => {
  const name = ownWindowCardFrameName(own);
  const target = useSyncExternalStore(subscribeShellDocuments, () =>
    shellDocument(name)
  );
  const titlebar = useSyncExternalStore(subscribeShellDocuments, () =>
    shellDocument(ownWindowFrameName(own))
  );
  const { close, opener } = useCardClosing(own, card.kind);

  useEffect(() => {
    openShellDocument(name);

    return () => {
      closeShellDocument(name);
    };
  }, [name]);

  useEffect(() => {
    if (!target) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      // Of another document, so not an instance of this one's Element.
      const pressed = event.target as Partial<Element> | null;

      if (!pressed?.closest?.("[data-overlay-card]")) {
        close();
      }
    };

    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("pointerdown", onPointerDown);

    return () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("pointerdown", onPointerDown);
    };
  }, [target, close]);

  useEffect(() => {
    if (!titlebar) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const pressed = event.target as Partial<Element> | null;

      if (opener === undefined || !pressed?.closest?.(opener)) {
        close();
      }
    };

    titlebar.addEventListener("pointerdown", onPointerDown);

    return () => {
      titlebar.removeEventListener("pointerdown", onPointerDown);
    };
  }, [titlebar, close, opener]);

  return target
    ? createPortal(<DrawnCard own={own} card={card} />, target.body)
    : null;
};

/** The frame of each tab's own window, in a document of the shell's each. */
export const OwnWindows = () => {
  const windows = useShellState("windows") ?? [];

  return windows.flatMap((own) => [
    <OwnWindowDocument key={ownWindowFrameName(own)} own={own} />,
    ...(own.card
      ? [
          <OwnWindowCard
            key={ownWindowCardFrameName(own)}
            own={own}
            card={own.card}
          />,
        ]
      : []),
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
