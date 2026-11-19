import { describe, expect, it } from "vitest";

import type { QuietWindow } from "#core/notification-gate.ts";
import type { DoNotDisturb } from "#core/state.ts";
import type {
  NotificationContent,
  NotificationEvents,
  Notifier,
} from "#platform/notifications.ts";

import { createDownloadNotifications } from "./download-notifications.ts";

interface Shown extends NotificationContent {
  events: NotificationEvents;
}

const setup = ({
  isMacOS = true,
  quiet = false,
  quietHours = [] as QuietWindow[],
  doNotDisturb = undefined as DoNotDisturb | undefined,
} = {}) => {
  const shown: Shown[] = [];
  const shownFiles: string[] = [];
  const logs: string[] = [];
  let listed = 0;
  const notifier: Notifier = {
    show: (content, events) => {
      shown.push({ ...content, events });

      return { close: () => {} };
    },
  };
  const notifications = createDownloadNotifications({
    notifier,
    isMacOS,
    quiet,
    quietHours: () => quietHours,
    doNotDisturb: () => doNotDisturb,
    // Tuesday 17 November 2026, 14:00 by the local clock.
    now: () => new Date(2026, 10, 17, 14),
    showInFolder: (id) => {
      shownFiles.push(id);
    },
    showList: () => {
      listed += 1;
    },
    log: (message) => {
      logs.push(message);
    },
  });

  return {
    notifications,
    shown,
    shownFiles,
    logs,
    listed: () => listed,
  };
};

const text = ({ title, body, actions, silent }: NotificationContent) => ({
  title,
  body,
  actions,
  silent,
});

describe(createDownloadNotifications, () => {
  it("tells of a finished download by its name, choosing it or its button showing the file in its folder", () => {
    const { notifications, shown, shownFiles } = setup();

    notifications.ended({ id: "d1", fileName: "report.pdf", end: "completed" });
    shown[0]?.events.onClick();
    shown[0]?.events.onAction?.(0);

    expect([shown.map(text), shownFiles]).toStrictEqual([
      [
        {
          title: "Downloaded report.pdf",
          body: "",
          actions: ["Show in Finder"],
          silent: false,
        },
      ],
      ["d1", "d1"],
    ]);
  });

  it("names the button Show in folder off macOS, and is silent where every notification is", () => {
    const { notifications, shown } = setup({ isMacOS: false, quiet: true });

    notifications.ended({ id: "d1", fileName: "report.pdf", end: "completed" });

    expect(shown.map(({ actions, silent }) => [actions, silent])).toStrictEqual(
      [[["Show in folder"], true]]
    );
  });

  it("tells of a failed download with its name, choosing it showing the list, and of a cancelled one nothing", () => {
    const { notifications, shown, listed } = setup();

    notifications.ended({ id: "d1", fileName: "minutes.pdf", end: "failed" });
    notifications.ended({ id: "d2", fileName: "backup.zip", end: "cancelled" });
    shown[0]?.events.onClick();

    expect([shown.map(text), listed()]).toStrictEqual([
      [
        {
          title: "Download failed",
          body: "minutes.pdf",
          actions: undefined,
          silent: false,
        },
      ],
      1,
    ]);
  });

  it("is held by Do Not Disturb and by quiet hours, which it logs", () => {
    const held = [
      setup({ doNotDisturb: { until: null } }),
      setup({ quietHours: [{ start: "13:00", end: "15:00" }] }),
    ];

    for (const { notifications } of held) {
      notifications.ended({ id: "d1", fileName: "a.pdf", end: "completed" });
      notifications.ended({ id: "d2", fileName: "b.pdf", end: "failed" });
    }

    expect(held.map(({ shown, logs }) => [shown.length, logs])).toStrictEqual([
      [
        0,
        [
          "Held a download's notification: doNotDisturb",
          "Held a download's notification: doNotDisturb",
        ],
      ],
      [
        0,
        [
          "Held a download's notification: quietHours",
          "Held a download's notification: quietHours",
        ],
      ],
    ]);
  });
});
