import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import type { ShellState } from "#contract/shell.ts";
import { staysOpenOnPressOutside } from "#core/overlay.ts";
import type { Overlay } from "#core/overlay.ts";

import { Downloads } from "./downloads.tsx";
import { DropZone } from "./drop-zone.tsx";
import { FindBar } from "./find-bar.tsx";
import { Inbox } from "./inbox.tsx";
import { LicenseNotice } from "./license-notice.tsx";
import { OpenAppOverlay } from "./open-app.tsx";
import { MainScreenPicker } from "./screen-picker.tsx";
import { openOverlayDocument } from "./shell-document.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { Toast } from "./toast.tsx";
import { UpdateCard } from "./update-card.tsx";

/**
 * Escape anywhere in the overlay's document, and a press outside its card,
 * close the overlay; the find bar stays through a press beside it.
 */
const useClosers = (
  target: Document | undefined,
  kind: Overlay["kind"] | undefined
) => {
  const staysOutside = staysOpenOnPressOutside(kind && { kind });

  useEffect(() => {
    if (!target) {
      return;
    }

    const close = () => {
      shellCalls().closeOverlay({});
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      // Of the overlay's document, so not an instance of this one's Element.
      const pressed = event.target as Partial<Element> | null;

      if (!staysOutside && !pressed?.closest?.("[data-overlay-card]")) {
        close();
      }
    };

    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("pointerdown", onPointerDown);

    return () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("pointerdown", onPointerDown);
    };
  }, [target, staysOutside]);
};

/**
 * In the shell's own document, a press closes the open overlay, except on
 * the button that opened it, marked `data-opens` with its kind, whose click
 * closes it instead of opening it again, and except the find bar, which a
 * press that selects another tab closes in main.
 */
const useCloseOnShellPress = (kind: Overlay["kind"] | undefined) => {
  useEffect(() => {
    if (!kind || staysOpenOnPressOutside({ kind })) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(`[data-opens="${kind}"]`)
      ) {
        shellCalls().closeOverlay({});
      }
    };

    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [kind]);
};

type OpenOverlay = Exclude<ShellState["overlay"], { kind: "none" }>;

/** The open overlay as its kind draws it. */
const OverlayContent = ({
  open,
  target,
}: {
  open: OpenOverlay;
  target: Document;
}) => {
  const inbox = useShellState("inbox");
  const downloads = useShellState("downloads");
  const pro = useShellState("pro");
  let drawn: ReactNode;

  switch (open.kind) {
    case "inbox": {
      drawn = inbox?.open && <Inbox inbox={inbox} />;
      break;
    }
    case "downloads": {
      drawn = downloads?.open && <Downloads downloads={downloads} />;
      break;
    }
    case "license": {
      drawn = pro && <LicenseNotice pro={pro} />;
      break;
    }
    case "open-app": {
      drawn = (
        <OpenAppOverlay
          key={`${open.profileId}/${open.split ?? ""}`}
          {...open}
        />
      );
      break;
    }
    case "toast": {
      drawn = <Toast {...open} target={target} />;
      break;
    }
    case "drop": {
      drawn = <DropZone {...open} />;
      break;
    }
    case "update": {
      drawn = <UpdateCard {...open} />;
      break;
    }
    case "screen-picker": {
      drawn = <MainScreenPicker />;
      break;
    }
    default: {
      drawn = <FindBar key={`${open.profileId}/${open.tabId}`} {...open} />;
    }
  }

  return drawn;
};

/** Draws the open overlay, if any, into the overlay's document. */
export const OverlayLayer = () => {
  const overlay = useShellState("overlay");
  const target = openOverlayDocument();
  const open = overlay && overlay.kind !== "none" ? overlay : undefined;

  useClosers(target, open?.kind);
  useCloseOnShellPress(open?.kind);

  return target && open
    ? createPortal(<OverlayContent open={open} target={target} />, target.body)
    : null;
};
