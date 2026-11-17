/**
 * What a new-mail notification offers to do with its message, in the order
 * it offers them.
 */
export const MAIL_ACTIONS = [
  "archive",
  "markAsRead",
  "delete",
  "markAsSpam",
] as const;

export type MailAction = (typeof MAIL_ACTIONS)[number];

// Gmail's own codes for its private action endpoint; `delete` moves to Trash.
const ACTION_CODES: Record<MailAction, number> = {
  archive: 1,
  markAsRead: 3,
  delete: 9,
  markAsSpam: 7,
};

export const ACTION_PATH = "/mail/u/0/s/";

/** A POST to the action endpoint: its path and query, and its urlencoded body. */
export interface ActionRequest {
  path: string;
  body: string;
}

/** What the action endpoint answered, a redirect not followed. */
export type ActionResponse =
  | { kind: "redirect" }
  | {
      kind: "response";
      status: number;
      body: string;
      /** Each `Set-Cookie` header, as sent. */
      setCookies: readonly string[];
    };

/** What an action came to. A reason never holds what Gmail's answer said. */
export type ActionOutcome =
  | { kind: "ok" }
  | { kind: "signedOut" }
  | { kind: "failed"; reason: string };

/** The account's key and action token, which every action is sent with. */
export interface ActionKey {
  ik: string;
  at: string;
}

const request = (
  entry: unknown,
  { ik, at }: ActionKey,
  now: number
): ActionRequest => ({
  path: `${ACTION_PATH}?${new URLSearchParams({
    v: "or",
    ik,
    at,
    subui: "chrome",
    hl: "en",
    ts: String(now),
  }).toString()}`,
  body: new URLSearchParams({
    s_jr: JSON.stringify([null, [entry], 2, null, null, null, ik]),
  }).toString(),
});

/**
 * Asks only for the label counts, with no key and no token, which Gmail
 * refuses while answering with the account's key and a token in a cookie.
 */
export const keyRequest = (now: number): ActionRequest =>
  request(
    [null, null, null, null, null, null, [null, true, false]],
    { ik: "", at: "" },
    now
  );

/**
 * Runs `action` on the conversation of the message `messageId` names, a
 * message id as the feed gives it; Gmail ignores a thread's id.
 */
export const actionRequest = (
  action: MailAction,
  messageId: string,
  key: ActionKey,
  now: number
): ActionRequest =>
  request(
    [
      null,
      null,
      null,
      [null, ACTION_CODES[action], messageId, messageId, "l:all", [], [], []],
    ],
    key,
    now
  );

const PREFIX = ")]}'\n";

/**
 * The first chunk of a framed answer, `)]}'\n<length>&<json>…`, whose
 * length is in characters. Gmail sends one chunk per request entry, so a
 * body may run on past the first; one that ends short of it is refused.
 */
const firstChunk = (body: string): unknown[] | undefined => {
  const framing = /^(?<length>\d+)&/u.exec(body.slice(PREFIX.length));
  const length = Number(framing?.groups?.length);
  const start = PREFIX.length + (framing?.[0].length ?? 0);

  if (!framing || start + length > body.length) {
    return;
  }

  try {
    const chunk: unknown = JSON.parse(body.slice(start, start + length));

    return Array.isArray(chunk) ? chunk : undefined;
  } catch {
    return undefined;
  }
};

/**
 * What the first request's result, `chunk[1][0]`, says: done only when its
 * error, `[1]`, is an explicit `null`, else Gmail's numeric code from
 * `[null, text, code]`.
 */
const resultOf = (chunk: unknown[]): ActionOutcome => {
  const results: unknown = chunk[1];
  const first: unknown = Array.isArray(results) ? results[0] : undefined;

  if (!Array.isArray(first)) {
    return { kind: "failed", reason: "not an answer" };
  }

  const error: unknown = first[1];

  if (error === null) {
    return { kind: "ok" };
  }

  const code: unknown = Array.isArray(error) ? error[2] : undefined;

  return {
    kind: "failed",
    reason: `Gmail error ${typeof code === "number" ? String(code) : "unknown"}`,
  };
};

type Read<Value> =
  | { kind: "read"; value: Value }
  | Exclude<ActionOutcome, { kind: "ok" }>;

/**
 * Reads the framed answer out of a response: a redirect, an answer that is
 * not framed (Gmail's sign-in script) and a refusal all mean signed out.
 */
const framed = (response: ActionResponse): Read<unknown[]> => {
  if (
    response.kind === "redirect" ||
    response.status === 401 ||
    response.status === 403
  ) {
    return { kind: "signedOut" };
  }

  if (response.status !== 200) {
    return { kind: "failed", reason: `HTTP ${response.status}` };
  }

  if (!response.body.startsWith(PREFIX)) {
    return { kind: "signedOut" };
  }

  const chunk = firstChunk(response.body);

  return chunk
    ? { kind: "read", value: chunk }
    : { kind: "failed", reason: "not an answer" };
};

const TOKEN_COOKIE = "GMAIL_AT=";

// Where every chunk of an answer carries the account's key.
const KEY_INDEX = 4;

/**
 * The key from the answer to `keyRequest`, and the token from the cookie
 * that answer sets, which is what Gmail issued just then, where the
 * session's jar can hold an older one under another path.
 */
export const readKey = (response: ActionResponse): Read<ActionKey> => {
  const read = framed(response);

  if (read.kind !== "read") {
    return read;
  }

  const ik = read.value.at(KEY_INDEX);
  const setCookies = response.kind === "response" ? response.setCookies : [];
  const at = setCookies
    .find((cookie) => cookie.startsWith(TOKEN_COOKIE))
    ?.split(";", 1)[0]
    ?.slice(TOKEN_COOKIE.length);

  if (typeof ik !== "string" || !/^[\da-z]+$/u.test(ik)) {
    return { kind: "failed", reason: "no key" };
  }

  if (!at) {
    return { kind: "failed", reason: "no token" };
  }

  return { kind: "read", value: { ik, at } };
};

/**
 * What the answer to `actionRequest` says. An id that names no message is
 * answered as a success, and nothing changes.
 */
export const actionOutcome = (response: ActionResponse): ActionOutcome => {
  const read = framed(response);

  if (read.kind !== "read") {
    return read;
  }

  return resultOf(read.value);
};
