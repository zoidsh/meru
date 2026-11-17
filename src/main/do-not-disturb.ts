import { t } from "@lingui/core/macro";

import {
  DO_NOT_DISTURB_DURATIONS,
  doNotDisturbEnd,
  isDoNotDisturbOn,
} from "#core/notification-gate.ts";
import type { DoNotDisturbDuration } from "#core/notification-gate.ts";
import type { DoNotDisturb, State } from "#core/state.ts";
import type { ContextMenuItem } from "#platform/window.ts";

import { doNotDisturbCommandId } from "./commands.ts";
import type { Command, CommandContext } from "./commands.ts";
import type { Profiles } from "./profiles.ts";

/** The longest `setTimeout` waits before it fires at once instead. */
const LONGEST_TIMER = 2_147_483_647;

export interface DoNotDisturbDeps {
  profiles: Pick<
    Profiles,
    "get" | "onChange" | "switchDoNotDisturb" | "forgetEndedDoNotDisturb"
  >;
  now: () => Date;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Do Not Disturb, kept in the state so a restart keeps it. Whether it holds
 * is read from its end at every decision; the timer at its end only switches
 * it off, so the menu and the shell's button follow. One that ended while
 * Meru was closed reads as off and goes with the next write.
 */
export const createDoNotDisturb = ({
  profiles,
  now,
  log,
}: DoNotDisturbDeps) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const current = (): DoNotDisturb | undefined => {
    const { doNotDisturb } = profiles.get();

    return isDoNotDisturbOn(doNotDisturb, now().getTime())
      ? doNotDisturb
      : undefined;
  };

  const switchTo = async (until: number | null | undefined) => {
    try {
      await profiles.switchDoNotDisturb(until);
    } catch (error) {
      log(`Do Not Disturb was not switched: ${describe(error)}`);
    }
  };

  /**
   * Whether it ended is decided in turn with the person's own switches, so
   * one they make meanwhile is never undone; set again when nothing ended.
   */
  const forgetIfEnded = async () => {
    try {
      if (!(await profiles.forgetEndedDoNotDisturb())) {
        // oxlint-disable-next-line no-use-before-define -- the timer and arm call each other
        arm(profiles.get());
      }
    } catch (error) {
      log(`An ended Do Not Disturb was not switched off: ${describe(error)}`);
    }
  };

  const arm = (state: State) => {
    clearTimeout(timer);
    timer = undefined;

    const until = state.doNotDisturb?.until;

    if (typeof until !== "number" || until <= now().getTime()) {
      return;
    }

    timer = setTimeout(
      () => {
        timer = undefined;
        void forgetIfEnded();
      },
      Math.min(until - now().getTime(), LONGEST_TIMER)
    );
  };

  arm(profiles.get());
  profiles.onChange(arm);

  return {
    /** On, and not yet ended; else `undefined`. */
    current,
    switchOn: (duration: DoNotDisturbDuration) =>
      switchTo(doNotDisturbEnd(duration, now())),
    switchOff: () => switchTo(undefined),
    /**
     * Sets the timer again, since one may fire late after the computer
     * sleeps; one that ended meanwhile is switched off.
     */
    resume: () => {
      void forgetIfEnded();
    },
    dispose: () => {
      clearTimeout(timer);
    },
  };
};

/** What the Do Not Disturb menus say while it holds, by the local clock. */
export const doNotDisturbStatus = (
  doNotDisturb: DoNotDisturb,
  locale: string
) => {
  if (doNotDisturb.until === null) {
    return t({
      message: "On Until Turned Off",
      comment:
        "Line, not clickable, atop the Do Not Disturb menu while it holds notifications until the person turns it off",
    });
  }

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(doNotDisturb.until);

  return t({
    message: `On Until ${time}`,
    comment:
      "Line, not clickable, atop the Do Not Disturb menu while it holds notifications; {time} is the time of day it ends, such as 14:30",
  });
};

/**
 * The Do Not Disturb menu, in the application menu and from the shell's
 * button alike: while on, what it holds until and Turn Off, then the
 * durations.
 */
export const doNotDisturbItems = (
  commands: readonly Command[],
  context: CommandContext,
  locale: string,
  run: (command: Command) => void
): ContextMenuItem[] => {
  const item = (id: string): ContextMenuItem[] => {
    const command = commands.find((candidate) => candidate.id === id);

    return command
      ? [
          {
            label: command.title(),
            enabled: command.isAvailable?.(context) ?? true,
            click: () => {
              run(command);
            },
          },
        ]
      : [];
  };
  const durations = DO_NOT_DISTURB_DURATIONS.flatMap((duration) =>
    item(doNotDisturbCommandId(duration))
  );

  return context.doNotDisturb
    ? [
        {
          label: doNotDisturbStatus(context.doNotDisturb, locale),
          enabled: false,
        },
        ...item("doNotDisturb.off"),
        { type: "separator" },
        ...durations,
      ]
    : durations;
};
