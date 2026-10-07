/**
 * A script the fixture's account-session copies declare in its isolated world,
 * standing for one an extension's worker would inject with `executeScript`.
 * It marks the document so the end-to-end tests can see it ran, and says
 * whether `chrome.runtime` reached it, which in an account session is the
 * shim the derive put ahead of it.
 */
type FixtureDocument = {
  documentElement: {
    setAttribute: (name: string, value: string) => void;
  };
};

const { document, chrome } = globalThis as unknown as {
  document: FixtureDocument;
  chrome?: { runtime?: { id?: string } };
};

document.documentElement.setAttribute(
  "data-meru-fixture-declared",
  JSON.stringify({ runtimeId: chrome?.runtime?.id ?? null }),
);
