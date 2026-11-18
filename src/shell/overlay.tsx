import { Trans } from "@lingui/react/macro";
import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

import type { ShellState } from "#contract/shell.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";
import { Input } from "#ui/input.tsx";
import { Label } from "#ui/label.tsx";

import { Inbox } from "./inbox.tsx";
import { OverlayCard } from "./overlay-card.tsx";
import { openOverlayDocument } from "./shell-document.ts";
import { shellCalls, useShellState } from "./sync.ts";

/** Stable, so a render of the field does not select what is typed again. */
const focusAndSelect = (input: HTMLInputElement | null) => {
  input?.focus();
  input?.select();
};

const RenameProfile = ({
  profileId,
  name,
}: Extract<ShellState["overlay"], { kind: "rename-profile" }>) => {
  const headingId = useId();
  const fieldId = useId();

  return (
    <OverlayCard kind="rename-profile" labelledBy={headingId}>
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
  const inbox = useShellState("inbox");
  const target = openOverlayDocument();
  const open = overlay && overlay.kind !== "none" ? overlay : undefined;

  useClosers(target);
  useCloseOnShellPress(open?.kind);

  if (!target || !open) {
    return null;
  }

  return createPortal(
    open.kind === "inbox" ? (
      inbox?.open && <Inbox inbox={inbox} />
    ) : (
      <RenameProfile key={open.profileId} {...open} />
    ),
    target.body
  );
};
