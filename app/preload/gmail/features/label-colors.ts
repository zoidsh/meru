import type { LabelColor } from "../../../core/records/label-color.ts";
import { cssOf } from "../../content/styles.ts";
import type { StyleRule } from "../../content/styles.ts";
import type { GmailFeature } from "../feature.ts";

/** A label's name as it goes into a quoted CSS string, so a name holding a quote or a backslash cannot end the string and write rules of its own. */
export const quoteLabel = (label: string): string =>
  label
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\D ")
    .replaceAll("\n", "\\A ");

const textColorOf = (label: LabelColor): string => {
  if (label.textColor === "white") {
    return "#ffffff";
  }
  if (label.textColor === "black") {
    return "#000000";
  }
  return `contrast-color(${label.color})`;
};

// Gmail draws a label in three places, each coloured by its name: the chip in a thread row (`.at`, whose text sits in descendants), the row in the label menu of an open conversation (`.ahR`), and the chip on a card in the new conversation view (`.aim`), whose own text is already white on Gmail's colour.
const rulesFor = (label: LabelColor): StyleRule[] => {
  const name = quoteLabel(label.label);
  const text = textColorOf(label);
  const background = `background-color: ${label.color} !important;`;
  return [
    { declarations: background, selector: `.at[title="${name}"]` },
    {
      declarations: `color: ${text} !important;`,
      selector: `.at[title="${name}"] *`,
    },
    {
      declarations: `${background} color: ${text} !important;`,
      selector: `.ahR .hN[data-name="${name}"], .ahR .hO[data-name="${name}"]`,
    },
    {
      declarations: background,
      selector: `.aim:has([data-tooltip="${name}"]) .aEe`,
    },
  ];
};

export const labelColorRules = (labels: readonly LabelColor[]): StyleRule[] =>
  labels.flatMap(rulesFor);

export const labelColors: GmailFeature = {
  apply: ({ settings, style }) => {
    style(cssOf(labelColorRules(settings.labelColors)));
  },
  id: "labelColors",
};
