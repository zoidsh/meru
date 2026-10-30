import { callMember, report, reportEvent, takeInventory } from "./chrome";

void report("/inventory", { context: "content", inventory: takeInventory() });

// `dom`'s one method takes an element, so it is called here rather than with
// the worker's calls. The page's root has no shadow root, so Chrome answers null.
const documentElement = (globalThis as unknown as { document: { documentElement: unknown } })
  .document.documentElement;

void callMember("dom.openOrClosedShadowRoot", [documentElement]).then((settled) =>
  reportEvent("content", "call", {
    member: "dom.openOrClosedShadowRoot",
    args: ["document.documentElement"],
    ...settled,
  }),
);
