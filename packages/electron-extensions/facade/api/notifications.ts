import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

let createdNotificationCount = 0;

/**
 * `create` takes the notification id as an optional first argument and answers
 * with the id it used, so a caller that left it out gets a generated one back
 * the way Chrome hands one out.
 */
function takeNotificationId(callArguments: unknown[]) {
  const [notificationId] = callArguments;

  if (typeof notificationId === "string") {
    return notificationId;
  }

  createdNotificationCount += 1;

  return `notification-${createdNotificationCount}`;
}

export function createNotifications(): ChromeNamespace {
  return {
    create: createNoopMethod(takeNotificationId),
    // Nothing was ever shown, so nothing was updated or cleared
    update: createNoopMethod(() => false),
    clear: createNoopMethod(() => false),
    getAll: createNoopMethod(() => ({})),
    getPermissionLevel: createNoopMethod(() => "granted"),

    onClosed: createNoopEvent(),
    onClicked: createNoopEvent(),
    onButtonClicked: createNoopEvent(),
    onPermissionLevelChanged: createNoopEvent(),
    onShowSettings: createNoopEvent(),
  };
}
