/**
 * Gmail's own Dark theme leaves no mark in the DOM; its page's background is
 * the cheapest test (gmail-probe.md, section 3): `rgb(17, 17, 17)` under Dark,
 * `rgb(248, 250, 253)` under Default.
 */
const DARK_BELOW = 64;

/**
 * Whether a computed `background-color` is Gmail's Dark: opaque and dark. A
 * photo theme, whose page is no opaque colour, is not.
 */
export const isDarkBackground = (color: string): boolean => {
  const parts =
    /^rgba?\((?<red>[\d.]+), (?<green>[\d.]+), (?<blue>[\d.]+)(?:, (?<alpha>[\d.]+))?\)$/u.exec(
      color
    )?.groups;

  if (!parts) {
    return false;
  }

  const { red, green, blue, alpha = "1" } = parts;

  return (
    Number(alpha) === 1 &&
    0.2126 * Number(red) + 0.7152 * Number(green) + 0.0722 * Number(blue) <
      DARK_BELOW
  );
};

/**
 * The colours of Meru's layer over Gmail's Dark, measured from Gmail's own
 * Dark (gmail-probe.md, section 3), but for the link colour, which Gmail's
 * Dark never draws on a surface of its own.
 */
export const DARK = {
  /** Gmail's card, `rgba(51, 51, 51, 0.8)` over its `rgb(17, 17, 17)` page, made opaque. */
  surface: "rgb(44, 44, 44)",
  /** Gmail's card colour without its transparency, for a bar on the surface. */
  raised: "rgb(51, 51, 51)",
  text: "rgba(255, 255, 255, 0.87)",
  secondary: "rgba(255, 255, 255, 0.7)",
  divider: "rgba(255, 255, 255, 0.12)",
  outline: "rgba(255, 255, 255, 0.3)",
  hover: "rgba(255, 255, 255, 0.08)",
  link: "#a8c7fa",
  /** What Gmail paints a message's body and the editor with, kept as a card. */
  card: "rgb(255, 255, 255)",
  cardText: "rgb(34, 34, 34)",
} as const;
