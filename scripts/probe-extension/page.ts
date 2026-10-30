import { listen, probeChrome as chrome, report, reportEvent, takeInventory } from "./chrome";

// The same events the worker listens for, where Chromium is known to deliver
// them, so a silence in the worker can be told apart from no event at all
listen("page", "storage.onChanged", chrome.storage?.onChanged, (changes, areaName) => ({
  areaName,
  keys: Object.keys(changes),
}));

listen("page", "alarms.onAlarm", chrome.alarms?.onAlarm, ({ name }) => ({ name }));

void report("/inventory", { context: "page", inventory: takeInventory() });

void chrome.runtime.sendMessage("wake").then(
  (response) => reportEvent("page", "runtime.sendMessage", { response }),
  (error: unknown) => reportEvent("page", "runtime.sendMessage", { error: String(error) }),
);
