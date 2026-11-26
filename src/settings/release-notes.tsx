import { Markdown, RuleType } from "markdown-to-jsx/react";
import type { MarkdownToJSX } from "markdown-to-jsx/react";
import type { ReactNode } from "react";

import { isReleaseLink } from "#core/releases.ts";
import { Kbd } from "#ui/kbd.tsx";

const HEADING = "mt-4 text-sm font-semibold first:mt-0";

/** A heading of the notes, below the release's own. */
const NotesHeading = ({ children }: { children?: ReactNode }) => (
  <h4 className={HEADING}>{children}</h4>
);

/** A heading under that one. */
const NotesSubheading = ({ children }: { children?: ReactNode }) => (
  <h5 className={HEADING}>{children}</h5>
);

/** A web link opens in the default browser; any other keeps only its text. */
const NotesLink = ({
  href,
  children,
  onLink,
}: {
  href?: string;
  children?: ReactNode;
  onLink: (url: string) => void;
}) =>
  isReleaseLink(href) ? (
    <a
      href={href}
      className="font-medium underline underline-offset-4"
      onClick={(event) => {
        // The window would go there itself, leaving Settings.
        event.preventDefault();
        onLink(href);
      }}
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );

/**
 * Of the notes' own HTML only `<kbd>`, the one tag they write shortcuts
 * with, is kept; an image is left out, since the window loads nothing from
 * the web.
 */
const renderRule: MarkdownToJSX.Options["renderRule"] = (
  next,
  node,
  renderChildren,
  state
) => {
  if (node.type === RuleType.htmlBlock && node.tag === "kbd") {
    return (
      <Kbd key={state.key}>{renderChildren(node.children ?? [], state)}</Kbd>
    );
  }

  if (
    node.type === RuleType.htmlBlock ||
    node.type === RuleType.htmlSelfClosing ||
    node.type === RuleType.image
  ) {
    return null;
  }

  return next();
};

const OVERRIDES: MarkdownToJSX.Overrides = {
  h1: NotesHeading,
  h2: NotesHeading,
  h3: NotesSubheading,
  h4: NotesSubheading,
  h5: NotesSubheading,
  h6: NotesSubheading,
  p: { props: { className: "mt-2 first:mt-0" } },
  ul: { props: { className: "mt-2 flex list-disc flex-col gap-1 pl-5" } },
  ol: { props: { className: "mt-2 flex list-decimal flex-col gap-1 pl-5" } },
  code: { props: { className: "rounded-sm bg-muted px-1 font-mono text-xs" } },
  pre: {
    props: {
      className: "mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs",
    },
  },
  blockquote: {
    props: { className: "mt-2 border-l-2 pl-3 text-muted-foreground" },
  },
  hr: { props: { className: "my-3 border-border" } },
};

/**
 * A release's notes as React elements. They come from GitHub, outside Meru,
 * into a window that holds the Settings bridge, so they are read as
 * untrusted: nothing of their HTML runs or loads, and a web link goes to
 * `onLink`.
 */
export const ReleaseNotes = ({
  notes,
  onLink,
}: {
  notes: string;
  onLink: (url: string) => void;
}) => (
  <div className="text-sm leading-relaxed">
    <Markdown
      options={{
        forceBlock: true,
        renderRule,
        overrides: {
          ...OVERRIDES,
          a: { component: NotesLink, props: { onLink } },
        },
      }}
    >
      {notes}
    </Markdown>
  </div>
);
