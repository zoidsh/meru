# TODO

Follow-up work that should be picked up in a **new session** — items unrelated enough to their originating feature that they shouldn't ride along with it.

## Google App context-menu entries

Add "Copy Link" and "Open in Default Browser" entries to the right-click context menu for non-Gmail-view windows — extend `setupWindowContextMenu` in `packages/app/context-menu.ts`, guarded with `window !== accounts.getSelectedAccount().instance.gmail.view`. Gives immediate discoverability even for users who don't end up using the toolbar UI.
