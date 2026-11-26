import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReleaseNotes } from "./release-notes.tsx";

/** A script URL, spelled so that nothing reads it as one to run. */
const SCRIPT_URL = ["javascript", "alert(1)"].join(":");

const render = (notes: string) =>
  renderToStaticMarkup(<ReleaseNotes notes={notes} onLink={() => null} />);

describe(ReleaseNotes, () => {
  it("renders the notes' Markdown as formatted text", () => {
    const html = render(
      "## Features\n\n- **Bold** and `code`\n- A [link](https://github.com/zoidsh/meru)"
    );

    expect(html).toContain("<h4");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<code");
    expect(html).toContain('href="https://github.com/zoidsh/meru"');
  });

  it("writes a shortcut's <kbd> as a key, the one tag of the notes' own it keeps", () => {
    expect(render("Press <kbd>Cmd</kbd> and <kbd>K</kbd>.")).toMatch(
      /<kbd data-slot="kbd"[^>]*>Cmd<\/kbd>.*<kbd data-slot="kbd"[^>]*>K<\/kbd>/u
    );
  });

  it.each([
    ["a script", '<script>alert("x")</script>', "<script"],
    ["a frame", '<iframe src="https://example.com"></iframe>', "<iframe"],
    ["a handler", '<div onclick="alert(1)">Hi</div>', "onclick"],
    [
      "a styled block",
      '<div style="position:fixed">Hi</div>',
      "position:fixed",
    ],
    ["an HTML image", '<img src="https://example.com/x.png">', "<img"],
    ["a Markdown image", "![shot](https://example.com/x.png)", "<img"],
    ["a script link", `[run](${SCRIPT_URL})`, "javascript"],
    ["a file link", "[file](file:///etc/hosts)", "file:"],
  ])("renders nothing live of %s", (_what, notes, absent) => {
    expect(render(notes)).not.toContain(absent);
  });

  it("gives a footnote none of the ids its notes name, so none can clash with the page's", () => {
    const html = render("See this[^ids].\n\n[^ids]: The note.");

    expect(html).toContain("The note.");
    expect(html).not.toContain("id=");
  });

  it("keeps a refused link's text, as text", () => {
    expect(render(`[run](${SCRIPT_URL}) now`)).toContain("<span>run</span>");
  });
});
