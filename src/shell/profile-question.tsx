import { useLingui } from "@lingui/react/macro";
import { useId } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "#ui/button.tsx";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "#ui/item.tsx";

import { shellCalls, useShellState } from "./sync.ts";
import { TitledOverlay, TitledOverlayBody } from "./titled-overlay.tsx";

/** Up and Down move between the profiles' rows, as in a menu. */
const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
  const rows = [
    ...(event.currentTarget
      .closest("[role=list]")
      ?.querySelectorAll<HTMLElement>("button") ?? []),
  ];
  const at = rows.indexOf(event.currentTarget);
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];

  if (step === undefined || at === -1) {
    return;
  }

  event.preventDefault();
  rows[(at + step + rows.length) % rows.length]?.focus();
};

/**
 * Asks which profile writes the email a link clicked in another app asked
 * for: each profile offered, in the titlebar's order, with its colour and
 * name. Cancel, Escape and a press beside the card open no email.
 */
export const ProfileQuestion = ({
  profileIds,
}: {
  profileIds: readonly string[];
}) => {
  const { t } = useLingui();
  const titleId = useId();
  const profiles = useShellState("profiles");
  const offered = profileIds.flatMap(
    (id) => profiles?.profiles.find((profile) => profile.id === id) ?? []
  );
  const calls = shellCalls();

  return (
    <TitledOverlay
      kind="profile-question"
      title={t({
        message: "Which profile should write this email?",
        comment:
          "Title of the card in the main window that asks which profile opens a new email for an email link clicked outside Meru; the profiles are listed below it",
      })}
      titleId={titleId}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            calls.closeOverlay({});
          }}
        >
          {t({
            message: "Cancel",
            comment:
              "Button of the card that asks which profile writes a new email for an email link; it opens no email",
          })}
        </Button>
      }
    >
      <TitledOverlayBody>
        {/* Its scrollbar hidden, as CommandList's is. */}
        <ItemGroup
          aria-labelledby={titleId}
          className="no-scrollbar min-h-0 gap-0 overflow-y-auto"
        >
          {offered.map((profile, index) => (
            // Item Group is a `role="list"` div, so the row is no `li`.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            <div key={profile.id} role="listitem">
              <Item
                size="sm"
                render={
                  // Named by the profile's name inside it.
                  // oxlint-disable-next-line jsx-a11y/control-has-associated-label
                  <button
                    type="button"
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- the card is asked for, and its first answer takes the keys
                    autoFocus={index === 0}
                  />
                }
                className="hover:bg-muted"
                onKeyDown={moveFocus}
                onClick={() => {
                  void calls.answerProfileQuestion({ profileId: profile.id });
                }}
              >
                <ItemMedia>
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: profile.color }}
                  />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="truncate">{profile.name}</ItemTitle>
                </ItemContent>
              </Item>
            </div>
          ))}
        </ItemGroup>
      </TitledOverlayBody>
    </TitledOverlay>
  );
};
