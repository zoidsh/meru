/*
 * Ported from Dark Reader (https://github.com/darkreader/darkreader),
 * MIT License, Copyright (c) 2018-present Dark Reader Ltd.
 * Non-null assertions were refactored away to satisfy this repo's lint rules;
 * the parsing and conversion logic is otherwise unchanged.
 */

export type RGBA = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

export type HSLA = {
  h: number;
  s: number;
  l: number;
  a?: number;
};

export function getSRGBLightness(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// https://en.wikipedia.org/wiki/HSL_and_HSV
export function hslToRGB({ h, s, l, a = 1 }: HSLA): RGBA {
  if (s === 0) {
    const gray = Math.round(l * 255);

    return { r: gray, g: gray, b: gray, a };
  }

  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const lightnessOffset = l - chroma / 2;
  const [red, green, blue] = (
    h < 60
      ? [chroma, secondary, 0]
      : h < 120
        ? [secondary, chroma, 0]
        : h < 180
          ? [0, chroma, secondary]
          : h < 240
            ? [0, secondary, chroma]
            : h < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  ) as [number, number, number];

  return {
    r: Math.round((red + lightnessOffset) * 255),
    g: Math.round((green + lightnessOffset) * 255),
    b: Math.round((blue + lightnessOffset) * 255),
    a,
  };
}

// https://en.wikipedia.org/wiki/HSL_and_HSV
export function rgbToHSL({ r: r255, g: g255, b: b255, a = 1 }: RGBA): HSLA {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;

  const l = (max + min) / 2;

  if (chroma === 0) {
    return { h: 0, s: 0, l, a };
  }

  let h =
    (max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4) *
    60;

  if (h < 0) {
    h += 360;
  }

  const s = chroma / (1 - Math.abs(2 * l - 1));

  return { h, s, l, a };
}

function toFixed(value: number, digits = 0): string {
  const fixed = value.toFixed(digits);

  if (digits === 0) {
    return fixed;
  }

  const dot = fixed.indexOf(".");

  if (dot >= 0) {
    const zerosMatch = fixed.match(/0+$/);

    if (zerosMatch) {
      if (zerosMatch.index === dot + 1) {
        return fixed.substring(0, dot);
      }

      return fixed.substring(0, zerosMatch.index);
    }
  }

  return fixed;
}

export function rgbToString(rgb: RGBA): string {
  const { r, g, b, a } = rgb;

  if (a != null && a < 1) {
    return `rgba(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)}, ${toFixed(a, 2)})`;
  }

  return `rgb(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)})`;
}

export function rgbToHexString({ r, g, b, a }: RGBA): string {
  return `#${(a != null && a < 1 ? [r, g, b, Math.round(a * 255)] : [r, g, b])
    .map((value) => {
      return `${value < 16 ? "0" : ""}${value.toString(16)}`;
    })
    .join("")}`;
}

const rgbMatch = /^rgba?\([^()]+\)$/;
const hslMatch = /^hsla?\([^()]+\)$/;
const hexMatch = /^#[0-9a-f]+$/i;

const supportedColorFuncs = ["color", "color-mix", "hwb", "lab", "lch", "oklab", "oklch"];

const CHAR_0 = "0".charCodeAt(0);
const CHAR_9 = "9".charCodeAt(0);
const CHAR_E = "e".charCodeAt(0);
const CHAR_DOT = ".".charCodeAt(0);
const CHAR_PLUS = "+".charCodeAt(0);
const CHAR_MINUS = "-".charCodeAt(0);
const CHAR_SPACE = " ".charCodeAt(0);
const CHAR_COMMA = ",".charCodeAt(0);
const CHAR_SLASH = "/".charCodeAt(0);
const CHAR_UPPER_A = "A".charCodeAt(0);
const CHAR_UPPER_F = "F".charCodeAt(0);
const CHAR_LOWER_A = "a".charCodeAt(0);
const CHAR_LOWER_F = "f".charCodeAt(0);

function getNumbersFromString(input: string, range: number[], units: { [unit: string]: number }) {
  const numbers: number[] = [];
  const searchStart = input.indexOf("(") + 1;
  const searchEnd = input.length - 1;
  let numberStart = -1;
  let unitStart = -1;

  const push = (matchEnd: number) => {
    const numberEnd = unitStart > -1 ? unitStart : matchEnd;
    const numberText = input.slice(numberStart, numberEnd);
    let number = parseFloat(numberText);
    const bound = range[numbers.length] ?? 1;

    if (unitStart > -1) {
      const unit = input.slice(unitStart, matchEnd);
      const unitScale = units[unit];

      if (unitScale != null) {
        number *= bound / unitScale;
      }
    }

    if (bound > 1) {
      number = Math.round(number);
    }

    numbers.push(number);
    numberStart = -1;
    unitStart = -1;
  };

  for (let index = searchStart; index < searchEnd; index++) {
    const charCode = input.charCodeAt(index);
    const isNumberChar =
      (charCode >= CHAR_0 && charCode <= CHAR_9) ||
      charCode === CHAR_DOT ||
      charCode === CHAR_PLUS ||
      charCode === CHAR_MINUS ||
      charCode === CHAR_E;
    const isDelimiter =
      charCode === CHAR_SPACE || charCode === CHAR_COMMA || charCode === CHAR_SLASH;

    if (isNumberChar) {
      if (numberStart === -1) {
        numberStart = index;
      }
    } else if (numberStart > -1) {
      if (isDelimiter) {
        push(index);
      } else if (unitStart === -1) {
        unitStart = index;
      }
    }
  }

  if (numberStart > -1) {
    push(searchEnd);
  }

  return numbers;
}

const rgbRange = [255, 255, 255, 1];
const rgbUnits = { "%": 100 };
const hslRange = [360, 1, 1, 1];
const hslUnits = { "%": 100, deg: 360, rad: 2 * Math.PI, turn: 1 };

function parseRGB(rgbText: string): RGBA | null {
  const [r, g, b, a = 1] = getNumbersFromString(rgbText, rgbRange, rgbUnits);

  if (r == null || g == null || b == null || a == null) {
    return null;
  }

  return { r, g, b, a };
}

function parseHSL(hslText: string): RGBA | null {
  const [h, s, l, a = 1] = getNumbersFromString(hslText, hslRange, hslUnits);

  if (h == null || s == null || l == null || a == null) {
    return null;
  }

  return hslToRGB({ h, s, l, a });
}

function parseHex(hexText: string): RGBA | null {
  const length = hexText.length;
  const digitCount = length - 1;
  const isShort = digitCount === 3 || digitCount === 4;
  const isLong = digitCount === 6 || digitCount === 8;

  if (!isShort && !isLong) {
    return null;
  }

  const hexDigit = (index: number) => {
    const charCode = hexText.charCodeAt(index);

    if (charCode >= CHAR_UPPER_A && charCode <= CHAR_UPPER_F) {
      return charCode + 10 - CHAR_UPPER_A;
    }

    if (charCode >= CHAR_LOWER_A && charCode <= CHAR_LOWER_F) {
      return charCode + 10 - CHAR_LOWER_A;
    }

    return charCode - CHAR_0;
  };

  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  if (isShort) {
    r = hexDigit(1) * 17;
    g = hexDigit(2) * 17;
    b = hexDigit(3) * 17;

    if (digitCount === 4) {
      a = (hexDigit(4) * 17) / 255;
    }
  } else {
    r = hexDigit(1) * 16 + hexDigit(2);
    g = hexDigit(3) * 16 + hexDigit(4);
    b = hexDigit(5) * 16 + hexDigit(6);

    if (digitCount === 8) {
      a = (hexDigit(7) * 16 + hexDigit(8)) / 255;
    }
  }

  return { r, g, b, a };
}

function colorFromNumber(rgbNumber: number): RGBA {
  return {
    r: (rgbNumber >> 16) & 255,
    g: (rgbNumber >> 8) & 255,
    b: rgbNumber & 255,
    a: 1,
  };
}

let canvas: HTMLCanvasElement | undefined;
let canvasContext: CanvasRenderingContext2D | null = null;

function domParseColor(colorText: string): RGBA | null {
  if (!canvasContext) {
    canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvasContext = canvas.getContext("2d", { willReadFrequently: true });
  }

  if (!canvasContext) {
    return null;
  }

  canvasContext.fillStyle = colorText;
  canvasContext.fillRect(0, 0, 1, 1);
  const imageData = canvasContext.getImageData(0, 0, 1, 1).data;
  const red = imageData[0] ?? 0;
  const green = imageData[1] ?? 0;
  const blue = imageData[2] ?? 0;
  const alpha = imageData[3] ?? 0;
  const color = `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(2)})`;

  return parseRGB(color);
}

const knownColors: Map<string, number> = new Map(
  Object.entries({
    aliceblue: 0xf0f8ff,
    antiquewhite: 0xfaebd7,
    aqua: 0x00ffff,
    aquamarine: 0x7fffd4,
    azure: 0xf0ffff,
    beige: 0xf5f5dc,
    bisque: 0xffe4c4,
    black: 0x000000,
    blanchedalmond: 0xffebcd,
    blue: 0x0000ff,
    blueviolet: 0x8a2be2,
    brown: 0xa52a2a,
    burlywood: 0xdeb887,
    cadetblue: 0x5f9ea0,
    chartreuse: 0x7fff00,
    chocolate: 0xd2691e,
    coral: 0xff7f50,
    cornflowerblue: 0x6495ed,
    cornsilk: 0xfff8dc,
    crimson: 0xdc143c,
    cyan: 0x00ffff,
    darkblue: 0x00008b,
    darkcyan: 0x008b8b,
    darkgoldenrod: 0xb8860b,
    darkgray: 0xa9a9a9,
    darkgrey: 0xa9a9a9,
    darkgreen: 0x006400,
    darkkhaki: 0xbdb76b,
    darkmagenta: 0x8b008b,
    darkolivegreen: 0x556b2f,
    darkorange: 0xff8c00,
    darkorchid: 0x9932cc,
    darkred: 0x8b0000,
    darksalmon: 0xe9967a,
    darkseagreen: 0x8fbc8f,
    darkslateblue: 0x483d8b,
    darkslategray: 0x2f4f4f,
    darkslategrey: 0x2f4f4f,
    darkturquoise: 0x00ced1,
    darkviolet: 0x9400d3,
    deeppink: 0xff1493,
    deepskyblue: 0x00bfff,
    dimgray: 0x696969,
    dimgrey: 0x696969,
    dodgerblue: 0x1e90ff,
    firebrick: 0xb22222,
    floralwhite: 0xfffaf0,
    forestgreen: 0x228b22,
    fuchsia: 0xff00ff,
    gainsboro: 0xdcdcdc,
    ghostwhite: 0xf8f8ff,
    gold: 0xffd700,
    goldenrod: 0xdaa520,
    gray: 0x808080,
    grey: 0x808080,
    green: 0x008000,
    greenyellow: 0xadff2f,
    honeydew: 0xf0fff0,
    hotpink: 0xff69b4,
    indianred: 0xcd5c5c,
    indigo: 0x4b0082,
    ivory: 0xfffff0,
    khaki: 0xf0e68c,
    lavender: 0xe6e6fa,
    lavenderblush: 0xfff0f5,
    lawngreen: 0x7cfc00,
    lemonchiffon: 0xfffacd,
    lightblue: 0xadd8e6,
    lightcoral: 0xf08080,
    lightcyan: 0xe0ffff,
    lightgoldenrodyellow: 0xfafad2,
    lightgray: 0xd3d3d3,
    lightgrey: 0xd3d3d3,
    lightgreen: 0x90ee90,
    lightpink: 0xffb6c1,
    lightsalmon: 0xffa07a,
    lightseagreen: 0x20b2aa,
    lightskyblue: 0x87cefa,
    lightslategray: 0x778899,
    lightslategrey: 0x778899,
    lightsteelblue: 0xb0c4de,
    lightyellow: 0xffffe0,
    lime: 0x00ff00,
    limegreen: 0x32cd32,
    linen: 0xfaf0e6,
    magenta: 0xff00ff,
    maroon: 0x800000,
    mediumaquamarine: 0x66cdaa,
    mediumblue: 0x0000cd,
    mediumorchid: 0xba55d3,
    mediumpurple: 0x9370db,
    mediumseagreen: 0x3cb371,
    mediumslateblue: 0x7b68ee,
    mediumspringgreen: 0x00fa9a,
    mediumturquoise: 0x48d1cc,
    mediumvioletred: 0xc71585,
    midnightblue: 0x191970,
    mintcream: 0xf5fffa,
    mistyrose: 0xffe4e1,
    moccasin: 0xffe4b5,
    navajowhite: 0xffdead,
    navy: 0x000080,
    oldlace: 0xfdf5e6,
    olive: 0x808000,
    olivedrab: 0x6b8e23,
    orange: 0xffa500,
    orangered: 0xff4500,
    orchid: 0xda70d6,
    palegoldenrod: 0xeee8aa,
    palegreen: 0x98fb98,
    paleturquoise: 0xafeeee,
    palevioletred: 0xdb7093,
    papayawhip: 0xffefd5,
    peachpuff: 0xffdab9,
    peru: 0xcd853f,
    pink: 0xffc0cb,
    plum: 0xdda0dd,
    powderblue: 0xb0e0e6,
    purple: 0x800080,
    rebeccapurple: 0x663399,
    red: 0xff0000,
    rosybrown: 0xbc8f8f,
    royalblue: 0x4169e1,
    saddlebrown: 0x8b4513,
    salmon: 0xfa8072,
    sandybrown: 0xf4a460,
    seagreen: 0x2e8b57,
    seashell: 0xfff5ee,
    sienna: 0xa0522d,
    silver: 0xc0c0c0,
    skyblue: 0x87ceeb,
    slateblue: 0x6a5acd,
    slategray: 0x708090,
    slategrey: 0x708090,
    snow: 0xfffafa,
    springgreen: 0x00ff7f,
    steelblue: 0x4682b4,
    tan: 0xd2b48c,
    teal: 0x008080,
    thistle: 0xd8bfd8,
    tomato: 0xff6347,
    turquoise: 0x40e0d0,
    violet: 0xee82ee,
    wheat: 0xf5deb3,
    white: 0xffffff,
    whitesmoke: 0xf5f5f5,
    yellow: 0xffff00,
    yellowgreen: 0x9acd32,
  }),
);

const systemColors: Map<string, number> = new Map(
  Object.entries({
    ActiveBorder: 0x3b99fc,
    ActiveCaption: 0x000000,
    AppWorkspace: 0xaaaaaa,
    Background: 0x6363ce,
    ButtonFace: 0xffffff,
    ButtonHighlight: 0xe9e9e9,
    ButtonShadow: 0x9fa09f,
    ButtonText: 0x000000,
    CaptionText: 0x000000,
    GrayText: 0x7f7f7f,
    Highlight: 0xb2d7ff,
    HighlightText: 0x000000,
    InactiveBorder: 0xffffff,
    InactiveCaption: 0xffffff,
    InactiveCaptionText: 0x000000,
    InfoBackground: 0xfbfcc5,
    InfoText: 0x000000,
    Menu: 0xf6f6f6,
    MenuText: 0xffffff,
    Scrollbar: 0xaaaaaa,
    ThreeDDarkShadow: 0x000000,
    ThreeDFace: 0xc0c0c0,
    ThreeDHighlight: 0xffffff,
    ThreeDLightShadow: 0xffffff,
    ThreeDShadow: 0x000000,
    Window: 0xececec,
    WindowFrame: 0xaaaaaa,
    WindowText: 0x000000,
    "-webkit-focus-ring-color": 0xe59700,
  }).map(([key, value]) => [key.toLowerCase(), value] as [string, number]),
);

const rgbaParseCache = new Map<string, RGBA | null>();
const hslaParseCache = new Map<string, HSLA>();

export function parseColorWithCache(colorText: string): RGBA | null {
  const key = colorText.trim();

  if (rgbaParseCache.has(key)) {
    return rgbaParseCache.get(key) ?? null;
  }

  const color = parse(key);
  rgbaParseCache.set(key, color);

  return color;
}

export function parseToHSLWithCache(colorText: string): HSLA | null {
  const cached = hslaParseCache.get(colorText);

  if (cached) {
    return cached;
  }

  const rgb = parseColorWithCache(colorText);

  if (!rgb) {
    return null;
  }

  const hsl = rgbToHSL(rgb);
  hslaParseCache.set(colorText, hsl);

  return hsl;
}

export function parse(colorText: string): RGBA | null {
  const color = colorText.trim().toLowerCase();

  if (color.includes("(from ")) {
    if (color.indexOf("(from") !== color.lastIndexOf("(from")) {
      return null;
    }

    return domParseColor(color);
  }

  if (color.match(rgbMatch)) {
    if (color.startsWith("rgb(#") || color.startsWith("rgba(#")) {
      if (color.lastIndexOf("rgb") > 0) {
        return null;
      }

      return domParseColor(color);
    }

    return parseRGB(color);
  }

  if (color.match(hslMatch)) {
    return parseHSL(color);
  }

  if (color.match(hexMatch)) {
    return parseHex(color);
  }

  const knownColor = knownColors.get(color);

  if (knownColor != null) {
    return colorFromNumber(knownColor);
  }

  const systemColor = systemColors.get(color);

  if (systemColor != null) {
    return colorFromNumber(systemColor);
  }

  if (color === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (
    color.endsWith(")") &&
    supportedColorFuncs.some(
      (colorFunc) =>
        color.startsWith(colorFunc) &&
        color[colorFunc.length] === "(" &&
        color.lastIndexOf(colorFunc) === 0,
    )
  ) {
    return domParseColor(color);
  }

  return null;
}
