/*
 * Structural rather than imported from `mdast`, whose types reach this package
 * only as another package's dependency.
 */
type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string };
};

function isHtml(node: MarkdownNode | undefined, html: string) {
  return node?.type === "html" && node.value === html;
}

/**
 * Turns `<kbd>Cmd</kbd>` into a `kbd` element without parsing HTML.
 *
 * Release notes write shortcuts that way, and it is the only HTML they are
 * allowed: they come from GitHub, outside the app, and render on a page that
 * holds the IPC bridge. Any other HTML stays raw, which the page never renders.
 */
export function remarkKbd() {
  return (tree: MarkdownNode) => {
    replaceKbd(tree);
  };
}

function replaceKbd(parent: MarkdownNode) {
  const children = parent.children ?? [];

  for (let index = 0; index < children.length; index++) {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- markup, not text
    if (isHtml(children[index], "<kbd>")) {
      let end = index + 1;

      while (children[end]?.type === "text") {
        end++;
      }

      // oxlint-disable-next-line lingui/no-unlocalized-strings -- markup, not text
      if (end > index + 1 && isHtml(children[end], "</kbd>")) {
        const text = children.slice(index + 1, end);

        children.splice(index, end - index + 1, {
          type: "kbd",
          data: { hName: "kbd" },
          children: text,
        });

        continue;
      }
    }

    replaceKbd(children[index] as MarkdownNode);
  }
}
