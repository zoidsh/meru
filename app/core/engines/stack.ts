/** A window's child views bottom first: the panes in layout order, the overlays above them, and a fullscreen pane, one of `panes`, on top. */
export const stackOf = <V>(
  panes: readonly V[],
  overlays: readonly V[],
  fullscreen?: V
): V[] => [
  ...panes.filter((pane) => pane !== fullscreen),
  ...overlays,
  ...(fullscreen === undefined ? [] : [fullscreen]),
];

export type StackOperation<V> =
  | { readonly kind: "remove"; readonly view: V }
  | { readonly kind: "add"; readonly view: V; readonly index: number };

// Electron's addChildView moves an attached view to the top whatever index it is given, so a view out of place is removed and inserted again rather than added where it belongs.
/** The removals and insertions that turn the child views `current` into `wanted`, applied in order. */
export const stackPlan = <V>(
  current: readonly V[],
  wanted: readonly V[]
): StackOperation<V>[] => {
  const operations: StackOperation<V>[] = current
    .filter((view) => !wanted.includes(view))
    .map((view) => ({ kind: "remove", view }));
  let children = current.filter((view) => wanted.includes(view));
  for (const [index, view] of wanted.entries()) {
    if (children[index] === view) {
      continue;
    }
    if (children.includes(view)) {
      operations.push({ kind: "remove", view });
      children = children.filter((child) => child !== view);
    }
    operations.push({ index, kind: "add", view });
    children = children.toSpliced(index, 0, view);
  }
  return operations;
};
