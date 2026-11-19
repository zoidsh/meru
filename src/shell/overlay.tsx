import { Trans } from "@lingui/react/macro";
import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import type { ShellState } from "#contract/shell.ts";
import { staysOpenOutside } from "#core/overlay.ts";
import type { Overlay } from "#core/overlay.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";
import { Input } from "#ui/input.tsx";
import { Label } from "#ui/label.tsx";

import { Downloads } from "./downloads.tsx";
import { DropZone } from "./drop-zone.tsx";
import { FindBar } from "./find-bar.tsx";
import { Inbox } from "./inbox.tsx";
import { OpenAppOverlay } from "./open-app.tsx";
import { OverlayCard } from "./overlay-card.tsx";
import { openOverlayDocument } from "./shell-document.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { Toast } from "./toast.tsx";

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
 * close the overlay; the find bar stays through a press beside it.
 */
const useClosers = (
  target: Document | undefined,
  kind: Overlay["kind"] | undefined
) => {
  const staysOutside = staysOpenOutside(kind && { kind });

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
    if (!kind || staysOpenOutside({ kind })) {
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
  const downloads = useShellState("downloads");
  const target = openOverlayDocument();
  const open = overlay && overlay.kind !== "none" ? overlay : undefined;

  useClosers(target, open?.kind);
  useCloseOnShellPress(open?.kind);

  if (!target || !open) {
    return null;
  }

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
    case "find": {
      drawn = <FindBar key={`${open.profileId}/${open.tabId}`} {...open} />;
      break;
    }
    default: {
      drawn = <RenameProfile key={open.profileId} {...open} />;
    }
  }

  return createPortal(drawn, target.body);
};
