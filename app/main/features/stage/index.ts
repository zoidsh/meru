import { DisposableStore } from "../../../core/disposable.ts";
import type { ChromeInsets } from "../../../core/engines/chrome.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { LogPort } from "../../../core/log.ts";
import type {
  Unsubscribe,
  ViewFactoryPort,
  ViewPort,
  WindowPort,
} from "../../../core/ports.ts";
import type { Orientation } from "../../../core/records/layout.ts";
import type { Disposition } from "../../../core/records/link.ts";
import type {
  NavigationAction,
  PageHistory,
} from "../../../core/records/navigation.ts";
import type { Point } from "../../../core/records/rect.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { dragPushes } from "../../../shared/channels/drag.ts";
import { stage, stagePushes } from "../../../shared/channels/stage.ts";
import type {
  DragSubject,
  StageSnapshot,
} from "../../../shared/channels/stage.ts";
import type {
  CommandContext,
  CommandRegistrar,
} from "../../../shared/commands/define.ts";
import type { SettingsStore } from "../settings/index.ts";
import { stageCommands } from "./commands.ts";
import { Stage } from "./stage.ts";
import type { StageError, StageProfiles } from "./stage.ts";
import type { ContentPage } from "./tab-views.ts";

export type { StageError, StageProfiles } from "./stage.ts";
export { Stage } from "./stage.ts";

export interface StagesOptions {
  readonly views: ViewFactoryPort;
  /** Hears the keys typed into a view, for the window `windowId`. */
  readonly keys: {
    readonly attach: (view: ViewPort, windowId: number) => Unsubscribe;
  };
  readonly profiles: StageProfiles;
  readonly events: AppEvents;
  /** Where a tab's pane starts instead of the tab's address, for the end-to-end suite, which asserts on views and bounds and never on a network page. */
  readonly paneUrl?: (tab: Tab) => string;
  /** The content preload a tab's page runs, by its app. */
  readonly content?: (tab: Tab) => ContentPage | undefined;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly dragPreload: string | undefined;
  readonly overlayPreload: string | undefined;
  /** The address of the page a drag of the tab shows over the panes. */
  readonly tabDragUrl: (tab: Tab) => string;
  /** What the chrome takes of a window's content area. */
  readonly insets: () => ChromeInsets;
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
  /** A link a pane's page opens; true takes it from the page. */
  readonly onOpen: (
    tabId: string,
    url: string,
    disposition: Disposition
  ) => boolean;
  /** A blank popup a pane's page opened navigated to `url`; true shows it. */
  readonly onPopup: (url: string) => boolean;
  /** Where the tab's page stood when it went to sleep, which its next view starts at. */
  readonly historyOf?: (tabId: string) => PageHistory | undefined;
  /** A split command ran in the window whose chrome page is `windowId`, which splits nothing until an app for the new pane is picked. */
  readonly onSplitRequested: (
    windowId: number,
    orientation: Orientation
  ) => void;
  readonly log: LogPort;
}

const inWindow =
  (run: (windowId: number) => Result<undefined, StageError>) =>
  ({ windowId }: CommandContext): Result<undefined, StageError> =>
    windowId === null ? err("unknownWindow") : run(windowId);

export class Stages {
  readonly #options: StagesOptions;
  readonly #disposables = new DisposableStore();
  readonly #bySender = new Map<number, Stage>();
  readonly #unassign = new Map<number, Unsubscribe>();
  /** Where a tab no stage kept a view of was asked to go, which its view starts at when one is made, without becoming the tab's stored address. */
  readonly #startAt = new Map<string, string>();

  constructor(options: StagesOptions) {
    this.#options = options;
  }

  start(): void {
    const { registrar, settings, commands, events } = this.#options;
    this.#disposables.add(
      events.on("stage.invalidated", () => {
        for (const tabId of this.#startAt.keys()) {
          if (this.#options.profiles.tab(tabId) === undefined) {
            this.#startAt.delete(tabId);
          }
        }
        for (const found of this.all) {
          found.refresh();
        }
        events.emit("stage.shown", null);
      }),
      events.on("sidebar.changed", () => {
        this.relayout();
      }),
      events.on("tab.focused", ({ tabId }) => {
        for (const found of this.all) {
          found.refresh();
          found.focusTab(tabId);
        }
        events.emit("stage.shown", null);
      }),
      commands.register(stageCommands, {
        back: inWindow((windowId) => this.#navigate(windowId, "back")),
        equalise: inWindow((windowId) =>
          this.#with(windowId, (found) => found.equalise())
        ),
        maximise: inWindow((windowId) =>
          this.#with(windowId, (found) => found.maximise())
        ),
        swap: inWindow((windowId) =>
          this.#with(windowId, (found) => found.swap())
        ),
        closeTab: inWindow((windowId) => this.close(windowId)),
        focusNext: inWindow((windowId) => this.focusNext(windowId)),
        focusPrevious: inWindow((windowId) => this.focusPrevious(windowId)),
        forward: inWindow((windowId) => this.#navigate(windowId, "forward")),
        reload: inWindow((windowId) => this.#navigate(windowId, "reload")),
        stop: inWindow((windowId) => this.#navigate(windowId, "stop")),
        splitHorizontal: inWindow((windowId) =>
          this.#requestSplit(windowId, "horizontal")
        ),
        splitVertical: inWindow((windowId) =>
          this.#requestSplit(windowId, "vertical")
        ),
      }),
      settings.subscribe((changes) => {
        const restyle = changes.some(
          (change) => change.key === "appearance.style"
        );
        const rezoom = changes.some((change) => change.key === "stage.zoom");
        for (const found of this.all) {
          if (restyle) {
            found.restyle();
          }
          if (rezoom) {
            found.rezoom();
          }
        }
      }),
      registrar.register(stage, {
        beginDrag: (subject, { contentsId }) =>
          this.beginDrag(contentsId, subject),
        dragTo: ({ x, y, buttons }, { contentsId }) =>
          this.dragTo(contentsId, { x, y }, buttons),
        endDrag: (point, { contentsId }) => this.endDrag(contentsId, point),
        cancelDrag: (_payload, { contentsId }) => this.cancelDrag(contentsId),
        snapshot: (_payload, { contentsId }) => this.snapshot(contentsId),
        openTab: ({ appId, profileId, split }, { contentsId }) => {
          const opened = this.#with(contentsId, (found) =>
            found.openTab(profileId, appId, split)
          );
          return opened.ok ? ok(null) : opened;
        },
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  #requestSplit(
    windowId: number,
    orientation: Orientation
  ): Result<undefined, StageError> {
    return this.#with(windowId, () => {
      this.#options.onSplitRequested(windowId, orientation);
      return ok(undefined);
    });
  }

  #navigate(
    contentsId: number,
    action: NavigationAction
  ): Result<undefined, StageError> {
    return this.#with(contentsId, (found) => found.navigate(action));
  }

  /** Opens the stage of a window that shows the group `groupId` names, read again on every change. */
  open(window: WindowPort, groupId: () => string | undefined): Stage {
    const windowId = window.contentsId;
    const { content, paneUrl, profiles, settings } = this.#options;
    const opened = new Stage({
      ...(content === undefined ? {} : { content }),
      dragPreload: this.#options.dragPreload,
      groupId,
      keys: (view) => this.#options.keys.attach(view, windowId),
      overlayPreload: this.#options.overlayPreload,
      tabDragUrl: this.#options.tabDragUrl,
      onPointer: (contentsId, point) => {
        this.#options.registrar.push(contentsId, dragPushes.pointer, point);
      },
      insets: this.#options.insets,
      onChange: (snapshot) => {
        this.#options.registrar.push(windowId, stagePushes.changed, snapshot);
      },
      log: this.#options.log,
      onAudible: () => {
        this.#options.events.emit("tab.audible", null);
      },
      onOpen: this.#options.onOpen,
      onPopup: this.#options.onPopup,
      onOverlay: (contentsId, surface) => {
        if (surface === null) {
          this.#bySender.delete(contentsId);
          this.#unassign.get(contentsId)?.();
          this.#unassign.delete(contentsId);
        } else {
          this.#bySender.set(contentsId, opened);
          this.#unassign.set(
            contentsId,
            this.#options.registrar.assign(contentsId, surface)
          );
        }
      },
      profiles,
      style: () => settings.get("appearance.style"),
      startOf: (tab: Tab) => {
        const asked = this.#startAt.get(tab.id);
        this.#startAt.delete(tab.id);
        const history =
          asked === undefined ? this.#options.historyOf?.(tab.id) : undefined;
        return {
          url: asked ?? paneUrl?.(tab) ?? tab.url,
          ...(history === undefined ? {} : { history }),
        };
      },
      views: this.#options.views,
      window,
      zoom: (profileId) => settings.get("stage.zoom", profileId),
    });
    this.#bySender.set(windowId, opened);
    window.onClosed(() => {
      for (const [sender, found] of this.#bySender) {
        if (found === opened) {
          this.#bySender.delete(sender);
        }
      }
    });
    opened.start();
    return opened;
  }

  /** Loads the address in the tab's view in every stage that keeps one, or, while none does, in the view the tab is next given. */
  load(tabId: string, url: string): void {
    let loaded = false;
    for (const found of this.all) {
      loaded = found.load(tabId, url) || loaded;
    }
    if (!loaded) {
      this.#startAt.set(tabId, url);
    }
  }

  /** The tabs a pane of some window shows. */
  shown(): Set<string> {
    return new Set(
      this.all.flatMap((found) => found.panes().map(({ tab }) => tab.id))
    );
  }

  /** The tabs whose page in some window plays sound. */
  audible(): Set<string> {
    return new Set(
      this.all.flatMap((found) =>
        found
          .kept()
          .filter(({ view }) => view.audible())
          .map(({ tab }) => tab.id)
      )
    );
  }

  /** Lets go of the tab's view in every stage that keeps one out of sight, so its page's memory goes back, answering where its page stood; the tab loads again when it is next shown. */
  sleep(tabId: string): PageHistory | undefined {
    let history: PageHistory | undefined;
    for (const found of this.all) {
      history = found.sleep(tabId) ?? history;
    }
    return history;
  }

  /** Lays every stage out again, after what the chrome takes of the windows changed. */
  relayout(): void {
    for (const found of this.all) {
      found.restyle();
    }
  }

  close(windowId: number): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.close());
  }

  focusNext(windowId: number): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.focusNext());
  }

  focusPrevious(windowId: number): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.focusPrevious());
  }

  beginDrag(
    sender: number,
    subject: DragSubject
  ): Result<undefined, StageError> {
    return this.#with(sender, (found) => found.beginDrag(subject));
  }

  // Only a release ends a drag: a move with no button held, such as a view reports when it appears under a resting pointer, is ignored rather than taken for one.
  dragTo(
    sender: number,
    point: Point,
    buttons: number
  ): Result<undefined, StageError> {
    return this.#with(sender, (found) =>
      buttons === 0 ? ok(undefined) : found.dragTo(point)
    );
  }

  endDrag(sender: number, point: Point): Result<undefined, StageError> {
    return this.#with(sender, (found) => found.endDrag(point));
  }

  /** Ends the sender's stage's drag with nothing dropped, telling the window's chrome page when the drag's own page cancelled it. */
  cancelDrag(sender: number): Result<undefined, StageError> {
    return this.#with(sender, (found) => {
      const windowId = found.window.contentsId;
      if (sender !== windowId) {
        this.#options.registrar.push(windowId, stagePushes.dragCancelled, {});
      }
      return found.cancelDrag();
    });
  }

  snapshot(sender: number): Result<StageSnapshot, StageError> {
    return this.#with(sender, (found) => ok(found.snapshot()));
  }

  /** The stage of the window whose chrome page is `sender`. */
  find(sender: number): Stage | undefined {
    return this.#bySender.get(sender);
  }

  get all(): readonly Stage[] {
    return [...new Set(this.#bySender.values())];
  }

  #with<T>(
    sender: number,
    run: (stage: Stage) => Result<T, StageError>
  ): Result<T, StageError> {
    const found = this.#bySender.get(sender);
    if (found === undefined) {
      return err("unknownWindow");
    }
    try {
      return run(found);
    } catch (error) {
      this.#options.log.error("A stage request threw", { error });
      return err("failed");
    }
  }
}
