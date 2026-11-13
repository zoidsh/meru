import type { Clock, Unsubscribe } from "../../core/ports.ts";

interface Timer {
  readonly at: number;
  readonly task: () => void;
}

export class FakeClock implements Clock {
  #now: number;
  readonly #timers = new Set<Timer>();

  constructor(now = 0) {
    this.#now = now;
  }

  readonly now = () => this.#now;

  readonly schedule = (delay: number, task: () => void): Unsubscribe => {
    const timer = { at: this.#now + delay, task };
    this.#timers.add(timer);
    return () => {
      this.#timers.delete(timer);
    };
  };

  /** Moves time on, running each timer that falls due in the order it falls due. */
  readonly advance = (milliseconds: number) => {
    const until = this.#now + milliseconds;
    for (;;) {
      const [next] = [...this.#timers].toSorted((a, b) => a.at - b.at);
      if (next === undefined || next.at > until) {
        break;
      }
      this.#timers.delete(next);
      this.#now = next.at;
      next.task();
    }
    this.#now = until;
  };

  /** Moves time on as a sleep of the machine does, running no timer: they fire late, once something runs them. */
  readonly sleep = (milliseconds: number) => {
    this.#now += milliseconds;
  };

  get pending(): number {
    return this.#timers.size;
  }
}
