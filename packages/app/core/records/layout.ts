import { z } from "zod";

import { idSchema } from "./id.ts";

/** `vertical` puts the two sides next to each other with a vertical divider between them, `horizontal` stacks them. */
export const orientationSchema = z.enum(["vertical", "horizontal"]);

export type Orientation = z.infer<typeof orientationSchema>;

export const leafSchema = z.object({
  kind: z.literal("leaf"),
  paneId: idSchema,
  // The cap is the only thing between this model and a stack of tabs per pane.
  tabIds: z.array(idSchema).min(1).max(1),
});

export type Leaf = z.infer<typeof leafSchema>;

export interface Split {
  readonly kind: "split";
  readonly id: string;
  readonly orientation: Orientation;
  /** The share of the split's length, less its gap, that `first` takes. */
  readonly ratio: number;
  readonly first: LayoutNode;
  readonly second: LayoutNode;
}

export type LayoutNode = Leaf | Split;

// Annotated rather than inferred: zod cannot infer a type through a recursive union.
export const splitSchema: z.ZodType<Split> = z.object({
  get first() {
    return layoutNodeSchema;
  },
  id: idSchema,
  kind: z.literal("split"),
  orientation: orientationSchema,
  ratio: z.number().gt(0).lt(1),
  get second() {
    return layoutNodeSchema;
  },
});

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.union([
  leafSchema,
  splitSchema,
]);

/** The tree of splits a group holds; `null` is the empty layout that closing the last pane leaves. */
export const layoutSchema = layoutNodeSchema.nullable();

export type Layout = z.infer<typeof layoutSchema>;
