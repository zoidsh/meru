import { useLingui } from "@lingui/react/macro";
import { createPortal } from "react-dom";

import type { ShellState } from "#contract/shell.ts";
import { OVERLAY_MARGIN } from "#core/layout.ts";
import { OVERLAY_FRAME_NAME } from "#core/overlay.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";
import { Input } from "#ui/input.tsx";

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

const RenameProfile = ({
  profileId,
  name,
}: Extract<ShellState["overlay"], { kind: "rename-profile" }>) => {
  const { t } = useLingui();

  return (
    <div style={{ padding: OVERLAY_MARGIN }}>
      <form
        aria-label={t({
          message: "Rename profile",
          comment:
            "Accessible name of the small panel over the page with a field for a profile's new name, read by screen readers",
        })}
        className="rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        onSubmit={(event) => {
          event.preventDefault();

          const field = new FormData(event.currentTarget).get("name");

          shellCalls().renameProfile({
            profileId,
            name: typeof field === "string" ? field : "",
          });
        }}
      >
        <Input
          name="name"
          defaultValue={name}
          maxLength={PROFILE_NAME_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          aria-label={t({
            message: "Profile name",
            comment:
              "Accessible name of the field that holds a profile's name while it is renamed, read by screen readers",
          })}
          // Not by viewport: this document's is the overlay's own small view.
          className="text-sm select-text"
          ref={focusAndSelect}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              shellCalls().closeOverlay({});
            }
          }}
        />
      </form>
    </div>
  );
};

/** Draws the open overlay, if any, into the overlay's document. */
export const OverlayLayer = () => {
  const overlay = useShellState("overlay");
  const target = openOverlayDocument();

  if (!target || overlay?.kind !== "rename-profile") {
    return null;
  }

  return createPortal(
    <RenameProfile key={overlay.profileId} {...overlay} />,
    target.body
  );
};
