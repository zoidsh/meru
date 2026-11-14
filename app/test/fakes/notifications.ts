import type { NotificationPort, NotificationSpec } from "../../core/ports.ts";

export class FakeNotifications implements NotificationPort {
  /** Every notification shown, in order, each with a click on it. */
  readonly shown: { spec: NotificationSpec; click: () => void }[] = [];

  readonly show = (spec: NotificationSpec, onClick: () => void) => {
    this.shown.push({ click: onClick, spec });
  };
}
