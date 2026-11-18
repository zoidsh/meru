import { describe, expect, it } from "vitest";

import { createShellDocuments } from "./shell-document.ts";

const setup = () => {
  const calls: string[] = [];
  const gone = new Map<string, () => void>();
  let count = 0;

  const documents = createShellDocuments((name, onGone) => {
    count += 1;

    const id = `${name}#${count}`;
    const view = {
      id,
      closed: false,
      close: () => {
        view.closed = true;
        calls.push(`close ${id}`);
      },
    };

    gone.set(id, onGone);
    calls.push(`open ${id}`);

    return {
      view,
      stop: () => {
        calls.push(`stop ${id}`);
      },
    };
  });

  documents.subscribe(() => {
    calls.push("notify");
  });

  return { documents, calls, gone };
};

describe(createShellDocuments, () => {
  it("opens a document once, and stops what was set up for it as it is closed", () => {
    const { documents, calls } = setup();

    const first = documents.open("a");
    const again = documents.open("a");

    documents.close("a");

    expect([first === again, documents.get("a"), calls]).toStrictEqual([
      true,
      undefined,
      ["open a#1", "notify", "stop a#1", "close a#1", "notify"],
    ]);
  });

  it("stops what was set up for a document that went by itself, told or found closed, and opens it anew", () => {
    const { documents, calls, gone } = setup();

    documents.open("a");
    gone.get("a#1")?.();
    // Told late, for a document already opened anew, it leaves that one.
    documents.open("a");
    gone.get("a#1")?.();

    const second = documents.get("a") as { close: () => void } | undefined;

    second?.close();
    documents.open("a");

    expect(calls).toStrictEqual([
      "open a#1",
      "notify",
      "stop a#1",
      "notify",
      "open a#2",
      "notify",
      "close a#2",
      "stop a#2",
      "open a#3",
      "notify",
    ]);
  });
});
