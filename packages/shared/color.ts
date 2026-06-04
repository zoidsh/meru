type Rgb = {
  red: number;
  green: number;
  blue: number;
};

function parseHexColor(input: string): Rgb | null {
  let hex = input.slice(1);

  if (hex.length === 3 || hex.length === 4) {
    hex = hex.replace(/./g, (channel) => channel + channel);
  }

  if (hex.length !== 6 && hex.length !== 8) {
    return null;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return null;
  }

  return { red, green, blue };
}

function parseRgbColor(input: string): Rgb | null {
  const match = input.match(/^rgba?\(([^)]+)\)$/i);

  const componentsString = match?.[1];

  if (!componentsString) {
    return null;
  }

  const [redComponent, greenComponent, blueComponent] = componentsString
    .split(/[,/\s]+/)
    .map((component) => component.trim())
    .filter(Boolean);

  if (!redComponent || !greenComponent || !blueComponent) {
    return null;
  }

  const red = Number.parseFloat(redComponent);
  const green = Number.parseFloat(greenComponent);
  const blue = Number.parseFloat(blueComponent);

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return null;
  }

  return { red, green, blue };
}

export function parseCssColor(input: string): Rgb | null {
  const trimmed = input.trim();

  if (trimmed.startsWith("#")) {
    return parseHexColor(trimmed);
  }

  if (/^rgba?\(/i.test(trimmed)) {
    return parseRgbColor(trimmed);
  }

  return null;
}

export function isValidCssColorInput(input: string) {
  return parseCssColor(input) !== null;
}

export function getContrastTextColor(input: string) {
  const rgb = parseCssColor(input);

  if (!rgb) {
    return "#ffffff";
  }

  // Perceived brightness (ITU-R BT.601). The 186 cutoff (out of 255) biases
  // toward white text, only using black on clearly light backgrounds so
  // mid-tone colors get light text.
  const brightness = (rgb.red * 299 + rgb.green * 587 + rgb.blue * 114) / 1000;

  return brightness > 186 ? "#000000" : "#ffffff";
}
