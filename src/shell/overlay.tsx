import { Trans } from "@lingui/react/macro";
import { cn } from "cn";
import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import type { ShellState } from "#contract/shell.ts";
import { OVERLAY_FRAME_NAME, OVERLAY_WIDTHS } from "#core/overlay.ts";
import type { OverlayWidth } from "#core/overlay.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";
import { Input } from "#ui/input.tsx";
import { Label } from "#ui/label.tsx";

import { shellCalls, useShellState } from "./sync.ts";

const STYLESHEETS = 'style, link[rel="stylesheet"]';

/** Gives the overlay's document the shell's styles, again whenever they change. */
const mirrorStyles = (target: Document) => {
  const copy = () => {
    for (const node of target.head.querySelectorAll(STYLESHEETS)) {
      node.remove();
    }

    for (const node of document.head.querySelectorAll(STYLESHEETS)) {
      // A clone keeps the nonce the dev server's CSP asks of its styles.
      target.head.append(node.cloneNode(true));
    }
  };

  copy();
  // The dev server adds and rewrites styles as their sources change.
  new MutationObserver(copy).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
};

let overlayDocument: Document | undefined;

/**
 * The document of the view main shows over the content views, opened once:
 * a blank page of the shell's, in its process, which this tree draws into.
 * Main allows the shell to open this and nothing else.
 */
const openOverlayDocument = () => {
  if (overlayDocument) {
    return overlayDocument;
  }

  const opened = window.open("about:blank", OVERLAY_FRAME_NAME);

  if (!opened) {
    return;
  }

  const target = opened.document;

  target.documentElement.lang = document.documentElement.lang;
  Object.assign(
    target.documentElement.dataset,
    document.documentElement.dataset
  );
  mirrorStyles(target);
  // Clear wherever the overlay draws nothing, so the page shows through.
  target.body.className = "bg-transparent";
  overlayDocument = target;

  return target;
};

/** Stable, so a render of the field does not select what is typed again. */
const focusAndSelect = (input: HTMLInputElement | null) => {
  input?.focus();
  input?.select();
};

/**
 * The card every overlay draws in, placed in the view that covers the
 * content area: 64px below its top, centred, as tall as what it holds and
 * at most to 16px above its bottom. A press beside it closes the overlay.
 */
const OverlayCard = ({
  width,
  labelledBy,
  className,
  children,
}: {
  width: OverlayWidth;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className="pointer-events-none fixed inset-x-0 top-16 bottom-4 flex items-start justify-center px-2">
    {/* Open but not modal: the page beside it stays in view. */}
    <dialog
      open
      aria-labelledby={labelledBy}
      data-overlay-card
      style={{ width: OVERLAY_WIDTHS[width] }}
      className={cn(
        "pointer-events-auto relative m-0 flex max-h-full max-w-full flex-col overflow-hidden rounded-[14px] border-0 bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
        className
      )}
    >
      {children}
    </dialog>
  </div>
);

const RenameProfile = ({
  profileId,
  name,
}: Extract<ShellState["overlay"], { kind: "rename-profile" }>) => {
  const headingId = useId();
  const fieldId = useId();

  return (
    <OverlayCard width="narrow" labelledBy={headingId}>
      <form
        className="flex flex-col gap-2 p-2"
        onSubmit={(event) => {
          event.preventDefault();

          const field = new FormData(event.currentTarget).get("name");

          shellCalls().renameProfile({
            profileId,
            name: typeof field === "string" ? field : "",
          });
        }}
      >
        <Label id={headingId} htmlFor={fieldId} className="leading-5">
          <Trans comment="Heading of the small panel over the page with a field for a profile's new name, and the field's label">
            Rename profile
          </Trans>
        </Label>
        <Input
          id={fieldId}
          name="name"
          defaultValue={name}
          maxLength={PROFILE_NAME_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          // Not by viewport: this document's is the overlay's own view.
          className="text-sm select-text"
          ref={focusAndSelect}
        />
      </form>
    </OverlayCard>
  );
};

/**
 * Escape anywhere in the overlay's document, and a press outside its card,
 * close the overlay.
 */
const useClosers = (target: Document | undefined) => {
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
  }, [target]);
};

/**
 * In the shell's own document, a press closes the open overlay, except on
 * the button that opened it, marked `data-opens` with its kind, whose click
 * closes it instead of opening it again.
 */
const useCloseOnShellPress = (kind: string | undefined) => {
  useEffect(() => {
    if (!kind) {
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

/** Draws the open overlay, if any, into the overlay's document. */
export const OverlayLayer = () => {
  const overlay = useShellState("overlay");
  const target = openOverlayDocument();
  const open = overlay && overlay.kind !== "none" ? overlay : undefined;

  useClosers(target);
  useCloseOnShellPress(open?.kind);

  if (!target || !open) {
    return null;
  }

  return createPortal(
    <RenameProfile key={open.profileId} {...open} />,
    target.body
  );
};
