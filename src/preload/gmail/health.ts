import type { GmailHealth } from "#contract/gmail-channels.ts";
import {
  HOOKS,
  VIEW_ANCHORS,
  decideHook,
  detectViews,
  guardedSelector,
  witnessSelector,
} from "#core/gmail-hooks.ts";
import type { HookName, HookStatus, Witness } from "#core/gmail-hooks.ts";

export interface HealthPage {
  root: ParentNode;
  hash: string;
  isVisible: (element: Element) => boolean;
}

/** A selector this engine cannot parse matches nothing, as it does in CSS. */
const select = (root: ParentNode, selector: string): Element[] => {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
};

const related = (a: Element, b: Element) => a.contains(b) || b.contains(a);

/** Every hook's status in the views the page shows, without the timing. */
export const checkHealth = ({
  root,
  hash,
  isVisible,
}: HealthPage): Omit<GmailHealth, "ms"> => {
  const views = detectViews(
    {
      list: select(root, VIEW_ANCHORS.list).some(isVisible),
      thread: select(root, VIEW_ANCHORS.thread).length > 0,
      compose: select(root, VIEW_ANCHORS.compose).length > 0,
    },
    hash
  );
  const hooks = Object.fromEntries(
    HOOKS.map((hook) => {
      const matches = hook.anchors.flatMap((anchor) =>
        select(root, guardedSelector(anchor))
      );
      const witnesses =
        hook.witness === undefined
          ? []
          : select(root, witnessSelector(hook.witness)).filter(isVisible);
      let witness: Witness = "none";

      if (witnesses.length > 0) {
        witness = witnesses.every((each) =>
          matches.some((match) => related(match, each))
        )
          ? "covered"
          : "uncovered";
      }

      return [hook.name, decideHook(hook, views, matches.length > 0, witness)];
    })
  ) as Record<HookName, HookStatus>;

  return { views, hooks };
};
