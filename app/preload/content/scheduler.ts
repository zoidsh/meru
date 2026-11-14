import type { Unsubscribe } from "../../core/ports.ts";
import { missed, resolveEntry } from "./selectors.ts";
import type { ClassCache, SelectorEntry } from "./selectors.ts";

/** What a feature does with an element its entry found, called once per element. */
export type ElementHandler = (element: HTMLElement) => void;

export interface SchedulerOptions {
  readonly document: Document;
  /** Reports an entry that found nothing where its context says it must, once per entry. */
  readonly report: (id: string) => void;
  readonly now?: () => number;
  /** How long an entry may miss before a miss counts as rot rather than a page still painting. */
  readonly grace?: number;
  /** Runs a batch when the page next paints; one frame holds however many mutations Gmail made. */
  readonly requestFrame?: (task: () => void) => void;
  /** Runs `task` after `delay` milliseconds. */
  readonly later?: (delay: number, task: () => void) => void;
}

interface Registration {
  readonly entry: SelectorEntry;
  readonly handle: ElementHandler | undefined;
  readonly handled: WeakSet<HTMLElement>;
  readonly since: number;
  reported: boolean;
  /** Whether a check is due once the grace is out, which a page that stopped changing needs to have its miss told. */
  rechecks: boolean;
}

const GRACE = 10_000;

/** One `MutationObserver` over the whole page, which runs every registered entry once per animation frame, hands each element to its feature once, and reports an entry that stopped finding what it must. */
export class DomScheduler {
  readonly #document: Document;
  readonly #report: (id: string) => void;
  readonly #now: () => number;
  readonly #grace: number;
  readonly #requestFrame: (task: () => void) => void;
  readonly #later: (delay: number, task: () => void) => void;
  readonly #registrations = new Set<Registration>();
  readonly #classes: ClassCache = new Map();
  readonly #observer: MutationObserver;
  #framed = false;
  #disposed = false;

  constructor(options: SchedulerOptions) {
    this.#document = options.document;
    this.#report = options.report;
    this.#now = options.now ?? (() => Date.now());
    this.#grace = options.grace ?? GRACE;
    this.#requestFrame =
      options.requestFrame ??
      ((task) => {
        requestAnimationFrame(task);
      });
    this.#later =
      options.later ??
      ((delay, task) => {
        setTimeout(task, delay);
      });
    this.#observer = new MutationObserver(() => {
      this.#schedule();
    });
  }

  /** Watches the page and runs every entry registered so far. */
  start(): void {
    if (this.#disposed) {
      return;
    }
    this.#observer.observe(this.#document, { childList: true, subtree: true });
    this.#schedule();
  }

  /** Runs the entry each batch, handing the elements it finds to `handle`; with no handler only its misses are reported. */
  register(entry: SelectorEntry, handle?: ElementHandler): Unsubscribe {
    const registration: Registration = {
      entry,
      handle,
      handled: new WeakSet(),
      rechecks: false,
      reported: false,
      since: this.#now(),
    };
    this.#registrations.add(registration);
    this.#schedule();
    return () => {
      this.#registrations.delete(registration);
    };
  }

  dispose(): void {
    this.#disposed = true;
    this.#observer.disconnect();
    this.#registrations.clear();
    this.#classes.clear();
  }

  #schedule(): void {
    if (this.#framed || this.#disposed) {
      return;
    }
    this.#framed = true;
    this.#requestFrame(() => {
      this.#framed = false;
      this.#run();
    });
  }

  #run(): void {
    if (this.#disposed) {
      return;
    }
    // What piled up while the frame was pending is already covered by the queries below, and left in the queue it would ask for another frame for nothing.
    this.#observer.takeRecords();
    for (const registration of this.#registrations) {
      this.#runOne(registration);
    }
  }

  #missedOnce(registration: Registration): void {
    if (registration.reported) {
      return;
    }
    const waited = this.#now() - registration.since;
    if (waited >= this.#grace) {
      registration.reported = true;
      this.#report(registration.entry.id);
    } else if (!registration.rechecks) {
      registration.rechecks = true;
      this.#later(this.#grace - waited, () => {
        registration.rechecks = false;
        this.#schedule();
      });
    }
  }

  #runOne(registration: Registration): void {
    const found = resolveEntry(
      this.#document,
      registration.entry,
      this.#classes
    );
    if (missed(this.#document, registration.entry, found)) {
      this.#missedOnce(registration);
      return;
    }
    const { handle } = registration;
    if (handle === undefined) {
      return;
    }
    for (const element of found) {
      if (!registration.handled.has(element)) {
        registration.handled.add(element);
        handle(element);
      }
    }
  }
}
