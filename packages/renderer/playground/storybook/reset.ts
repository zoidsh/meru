import { useExtensionActionsStore } from "@/lib/extension-actions";
import { queryClient } from "@/lib/react-query";
import {
  useAccountsStore,
  useAppUpdaterStore,
  useFindInPageStore,
  useTabsStore,
  useTrialStore,
} from "@/lib/stores";

/**
 * The renderer's stores and its query cache are module singletons, which the
 * playground's own page never had to think about because every scenario was a
 * fresh page load. A host that switches scenario in place inherits whatever the
 * last one pushed, so each store goes back to the state it was created with.
 *
 * The theme store is deliberately absent: dark mode belongs to the host rather
 * than to a scenario, and it survives the switch.
 */
function resetStore<State>(store: {
  setState: (state: State, replace: true) => void;
  getInitialState: () => State;
}): void {
  store.setState(store.getInitialState(), true);
}

export function resetRendererState(): void {
  resetStore(useAccountsStore);

  resetStore(useAppUpdaterStore);

  resetStore(useExtensionActionsStore);

  resetStore(useFindInPageStore);

  resetStore(useTabsStore);

  resetStore(useTrialStore);

  queryClient.clear();
}
