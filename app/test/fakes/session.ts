import { SESSION_BODY_CAP } from "../../core/ports.ts";
import type { Clock, SessionPort, SessionResponse } from "../../core/ports.ts";

const utf8Length = (text: string): number => {
  let length = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    length +=
      [0x80, 0x8_00, 0x1_00_00, Infinity].findIndex((end) => point < end) + 1;
  }
  return length;
};

/** What the fake answers an address with: a response, a failure of the network, or nothing, which the timeout ends. */
export type FakeAnswer = SessionResponse | Error | "silent";

export class FakeSessions implements SessionPort {
  /** Every partition cleared, in order, as the effect on the browser's storage. */
  readonly cleared: string[] = [];

  /** Every address asked for, with its partition, in order. */
  readonly fetched: { partition: string; url: string }[] = [];

  readonly #answers = new Map<string, FakeAnswer>();
  readonly #clock: Clock | undefined;

  /** A clock runs the timeout of a request nothing answers; without one, such a request fails the test. */
  constructor(clock?: Clock) {
    this.#clock = clock;
  }

  readonly clear = async (partition: string) => {
    await Promise.resolve();
    this.cleared.push(partition);
  };

  /** Answers `base`, the address up to its query, for one partition or every one; an address with no answer rejects as the network would. */
  readonly answer = (base: string, answer: FakeAnswer, partition = "*") => {
    this.#answers.set(`${partition} ${base}`, answer);
  };

  readonly fetchText = async (
    partition: string,
    url: string,
    timeout: number
  ): Promise<SessionResponse> => {
    await Promise.resolve();
    this.fetched.push({ partition, url });
    const [base = url] = url.split("?");
    const answer =
      this.#answers.get(`${partition} ${base}`) ??
      this.#answers.get(`* ${base}`) ??
      new Error(`Nothing answers ${base}`);
    if (answer === "silent") {
      return await this.#timeOut(timeout);
    }
    if (answer instanceof Error) {
      throw answer;
    }
    // The real session stops reading at the cap, so no caller ever sees more.
    if (
      answer.kind === "answered" &&
      utf8Length(answer.text) > SESSION_BODY_CAP
    ) {
      return { kind: "tooLarge" };
    }
    return answer;
  };

  async #timeOut(timeout: number): Promise<never> {
    const clock = this.#clock;
    if (clock === undefined) {
      throw new Error("A silent answer needs the fake a clock to time out on");
    }
    const { promise, reject } = Promise.withResolvers<never>();
    clock.schedule(timeout, () => {
      reject(new Error(`No answer within ${timeout} ms`));
    });
    return await promise;
  }
}
