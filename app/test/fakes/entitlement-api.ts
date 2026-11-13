import type {
  EntitlementApi,
  EntitlementApiError,
  EntitlementRequest,
} from "../../core/ports.ts";
import { err } from "../../core/result.ts";
import type { Result } from "../../core/result.ts";

export type Answer = Result<{ readonly token: string }, EntitlementApiError>;

/** An answer, or one made from the request, such as a token signed for its device. */
export type Scripted =
  | Answer
  | ((request: EntitlementRequest) => Answer | Promise<Answer>);

export class FakeEntitlementApi implements EntitlementApi {
  /** Every request, in order, as the effect the app has on the API. */
  readonly requests: EntitlementRequest[] = [];
  readonly #answers: Scripted[];

  constructor(answers: readonly Scripted[] = []) {
    this.#answers = [...answers];
  }

  /** Queues answers for the next requests, in order. */
  readonly script = (...answers: readonly Scripted[]) => {
    this.#answers.push(...answers);
  };

  readonly issue = async (request: EntitlementRequest): Promise<Answer> => {
    this.requests.push(request);
    await Promise.resolve();
    const next = this.#answers.shift();
    if (next === undefined) {
      return err({ detail: "No answer was scripted", kind: "serverError" });
    }
    return typeof next === "function" ? await next(request) : next;
  };
}
