import type { SessionPort, SessionResponse } from "../../core/ports.ts";

export class FakeSessions implements SessionPort {
  /** Every partition cleared, in order, as the effect on the browser's storage. */
  readonly cleared: string[] = [];

  readonly clear = async (partition: string) => {
    await Promise.resolve();
    this.cleared.push(partition);
  };

  /** Every address asked for, with its partition, in order. */
  readonly fetched: { partition: string; url: string }[] = [];

  readonly #answers = new Map<string, SessionResponse | Error>();

  /** Answers `base`, the address up to its query, for one partition or every one; an address with no answer rejects as the network would. */
  readonly answer = (
    base: string,
    response: SessionResponse | Error,
    partition = "*"
  ) => {
    this.#answers.set(`${partition} ${base}`, response);
  };

  readonly fetchText = async (partition: string, url: string) => {
    await Promise.resolve();
    this.fetched.push({ partition, url });
    const [base = url] = url.split("?");
    const answer =
      this.#answers.get(`${partition} ${base}`) ??
      this.#answers.get(`* ${base}`) ??
      new Error(`Nothing answers ${base}`);
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  };
}
