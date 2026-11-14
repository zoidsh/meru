import { z } from "zod";

const HEX = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu;
const RGB =
  /^rgba?\(\s*[\d.]+%?(?:\s*[,\s]\s*[\d.]+%?){2}(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/iu;

/** Whether the text is a colour a label may take: a hex colour or `rgb()`, as 3.x accepted, matched whole so nothing else can ride into the style sheet it is written to. */
export const isLabelColor = (text: string): boolean =>
  HEX.test(text.trim()) || RGB.test(text.trim());

/** What a label's text is drawn in: `auto` picks black or white against the colour, as CSS's `contrast-color()` does. */
export const labelTextColorSchema = z.enum(["auto", "white", "black"]);

export type LabelTextColor = z.infer<typeof labelTextColorSchema>;

/** A colour the user gives one of Gmail's labels, by the label's name as Gmail shows it. */
export const labelColorSchema = z.object({
  label: z.string().trim().min(1).max(225),
  color: z.string().refine(isLabelColor),
  textColor: labelTextColorSchema,
});

export type LabelColor = z.infer<typeof labelColorSchema>;
