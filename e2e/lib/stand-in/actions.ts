/** Where Meru sends an action on a message. */
export const ACTION_PATH = "/mail/u/0/s/";

/** The key and token the stand-in's action endpoint hands out and asks for. */
export const ACTION_KEY = "0a1b2c3d4e";
export const ACTION_TOKEN = "stand-in-token";

/** An action the endpoint took, by Gmail's code, on a message id. */
export interface StandInAction {
  account: string;
  code: number;
  messageId: string;
}

/** One chunk as Gmail frames it, carrying the key and the first request's error. */
export const actionAnswer = (error: unknown) => {
  const json = JSON.stringify([null, [[null, error]], 2, 0, ACTION_KEY]);

  return `)]}'\n${json.length}&${json}`;
};

/** The code and message id of the action an `s_jr` body asks for, if any. */
export const actionOf = (body: string) => {
  let sjr: unknown = null;

  try {
    sjr = JSON.parse(new URLSearchParams(body).get("s_jr") ?? "");
  } catch {
    // Not an action, like the key request's body.
  }

  const call = Array.isArray(sjr)
    ? ((sjr as unknown[][][][])[1]?.[0]?.[3] as unknown[] | undefined)
    : undefined;
  const [, code, messageId] = call ?? [];

  return typeof code === "number" && typeof messageId === "string"
    ? { code, messageId }
    : undefined;
};
