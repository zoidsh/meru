/**
 * What a find request is asking for. The field sends an empty string whenever
 * it is cleared, which is most often someone deleting a query to type the next
 * one — so only the close, which sends `null`, may take the keyboard back.
 */
export type FindRequest = { kind: "search"; text: string } | { kind: "clear" } | { kind: "close" };

export function readFindRequest(text: string | null): FindRequest {
  if (text === null) {
    return { kind: "close" };
  }

  return text === "" ? { kind: "clear" } : { kind: "search", text };
}
