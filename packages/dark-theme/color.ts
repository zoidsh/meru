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

const CHAR_CODE_0 = 48;
const CHAR_CODE_9 = 57;
const CHAR_CODE_LOWER_A = 97;
const CHAR_CODE_LOWER_E = 101;
const CHAR_CODE_LOWER_F = 102;
const CHAR_CODE_UPPER_A = 65;
const CHAR_CODE_UPPER_F = 70;
const CHAR_CODE_DOT = 46;
const CHAR_CODE_PLUS = 43;
const CHAR_CODE_MINUS = 45;
const CHAR_CODE_SPACE = 32;
const CHAR_CODE_COMMA = 44;
const CHAR_CODE_SLASH = 47;
const CHAR_CODE_HASH = 35;
const CHAR_CODE_OPEN_PAREN = 40;

export function getSRGBLightness(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function rgbToHSL({ r: red255, g: green255, b: blue255, a = 1 }: RGBA): HSLA {
  const red = red255 / 255;
  const green = green255 / 255;
  const blue = blue255 / 255;

  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const chroma = maxChannel - minChannel;
  const lightness = (maxChannel + minChannel) / 2;

  if (chroma === 0) {
    return { h: 0, s: 0, l: lightness, a };
  }

  let hueSegment: number;

  if (maxChannel === red) {
    hueSegment = ((green - blue) / chroma) % 6;
  } else if (maxChannel === green) {
    hueSegment = (blue - red) / chroma + 2;
  } else {
    hueSegment = (red - green) / chroma + 4;
  }

  let hue = hueSegment * 60;

  if (hue < 0) {
    hue += 360;
  }

  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));

  return { h: hue, s: saturation, l: lightness, a };
}

export function hslToRGB({ h, s, l, a = 1 }: HSLA): RGBA {
  if (s === 0) {
    const gray = Math.round(l * 255);

    return { r: gray, g: gray, b: gray, a };
  }

  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const middle = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const base = l - chroma / 2;
  const sextant = Math.min(5, Math.max(0, Math.floor(h / 60)));

  let red = 0;
  let green = 0;
  let blue = 0;

  switch (sextant) {
    case 0:
      red = chroma;
      green = middle;
      break;
    case 1:
      red = middle;
      green = chroma;
      break;
    case 2:
      green = chroma;
      blue = middle;
      break;
    case 3:
      green = middle;
      blue = chroma;
      break;
    case 4:
      red = middle;
      blue = chroma;
      break;
    default:
      red = chroma;
      blue = middle;
  }

  return {
    r: Math.round((red + base) * 255),
    g: Math.round((green + base) * 255),
    b: Math.round((blue + base) * 255),
    a,
  };
}

function formatFixed(value: number, digits = 0): string {
  const fixed = value.toFixed(digits);

  if (digits === 0) {
    return fixed;
  }

  const dotIndex = fixed.indexOf(".");

  if (dotIndex < 0) {
    return fixed;
  }

  let end = fixed.length;

  while (end > dotIndex && fixed.charCodeAt(end - 1) === CHAR_CODE_0) {
    end--;
  }

  if (end === dotIndex + 1) {
    end = dotIndex;
  }

  return end === fixed.length ? fixed : fixed.slice(0, end);
}

export function rgbToString(rgb: RGBA): string {
  const { r, g, b, a } = rgb;

  if (a != null && a < 1) {
    return `rgba(${formatFixed(r)}, ${formatFixed(g)}, ${formatFixed(b)}, ${formatFixed(a, 2)})`;
  }

  return `rgb(${formatFixed(r)}, ${formatFixed(g)}, ${formatFixed(b)})`;
}

export function rgbToHexString({ r, g, b, a }: RGBA): string {
  const channels = a != null && a < 1 ? [r, g, b, Math.round(a * 255)] : [r, g, b];

  let hex = "#";

  for (const channel of channels) {
    if (channel < 16) {
      hex += "0";
    }

    hex += channel.toString(16);
  }

  return hex;
}

function isNumberCharCode(charCode: number): boolean {
  return (
    (charCode >= CHAR_CODE_0 && charCode <= CHAR_CODE_9) ||
    charCode === CHAR_CODE_DOT ||
    charCode === CHAR_CODE_PLUS ||
    charCode === CHAR_CODE_MINUS ||
    charCode === CHAR_CODE_LOWER_E
  );
}

function isDelimiterCharCode(charCode: number): boolean {
  return (
    charCode === CHAR_CODE_SPACE || charCode === CHAR_CODE_COMMA || charCode === CHAR_CODE_SLASH
  );
}

type ComponentSpan = {
  numberStart: number;
  numberEnd: number;
  unitEnd: number;
};

// Reads the numeric components of a color function body: each span covers a
// number and an optional trailing unit, and components are scaled so a value in
// units maps onto its bound (e.g. 50% of 255 → 127.5). Bounds above 1 mark
// integer channels and round; the alpha bound of 1 keeps fractions intact.
function readColorComponents(
  functionText: string,
  componentBounds: number[],
  unitScales: { [unit: string]: number },
): number[] {
  const bodyStart = functionText.indexOf("(") + 1;
  const bodyEnd = functionText.length - 1;
  const spans: ComponentSpan[] = [];

  let numberStart = -1;
  let numberEnd = -1;

  const closeSpan = (unitEnd: number) => {
    spans.push({ numberStart, numberEnd: numberEnd === -1 ? unitEnd : numberEnd, unitEnd });
    numberStart = -1;
    numberEnd = -1;
  };

  for (let index = bodyStart; index < bodyEnd; index++) {
    const charCode = functionText.charCodeAt(index);

    if (isNumberCharCode(charCode)) {
      if (numberStart === -1) {
        numberStart = index;
      }
    } else if (numberStart > -1) {
      if (isDelimiterCharCode(charCode)) {
        closeSpan(index);
      } else if (numberEnd === -1) {
        numberEnd = index;
      }
    }
  }

  if (numberStart > -1) {
    closeSpan(bodyEnd);
  }

  return spans.map((span, componentIndex) => {
    let component = parseFloat(functionText.slice(span.numberStart, span.numberEnd));
    const bound = componentBounds[componentIndex] ?? 1;

    if (span.numberEnd < span.unitEnd) {
      const unitScale = unitScales[functionText.slice(span.numberEnd, span.unitEnd)];

      if (unitScale != null) {
        component *= bound / unitScale;
      }
    }

    if (bound > 1) {
      component = Math.round(component);
    }

    return component;
  });
}

const rgbComponentBounds = [255, 255, 255, 1];
const rgbUnitScales = { "%": 100 };
const hslComponentBounds = [360, 1, 1, 1];
const hslUnitScales = { "%": 100, deg: 360, rad: 2 * Math.PI, turn: 1 };

function parseRgbFunction(rgbText: string): RGBA | null {
  const [red, green, blue, alpha = 1] = readColorComponents(
    rgbText,
    rgbComponentBounds,
    rgbUnitScales,
  );

  if (red === undefined || green === undefined || blue === undefined) {
    return null;
  }

  return { r: red, g: green, b: blue, a: alpha };
}

function parseHslFunction(hslText: string): RGBA | null {
  const [hue, saturation, lightness, alpha = 1] = readColorComponents(
    hslText,
    hslComponentBounds,
    hslUnitScales,
  );

  if (hue === undefined || saturation === undefined || lightness === undefined) {
    return null;
  }

  return hslToRGB({ h: hue, s: saturation, l: lightness, a: alpha });
}

function hexNibbleAt(hexText: string, index: number): number {
  const charCode = hexText.charCodeAt(index);

  if (charCode >= CHAR_CODE_UPPER_A && charCode <= CHAR_CODE_UPPER_F) {
    return charCode - CHAR_CODE_UPPER_A + 10;
  }

  if (charCode >= CHAR_CODE_LOWER_A && charCode <= CHAR_CODE_LOWER_F) {
    return charCode - CHAR_CODE_LOWER_A + 10;
  }

  return charCode - CHAR_CODE_0;
}

function parseHexColor(hexText: string): RGBA | null {
  const hexPairAt = (index: number) =>
    hexNibbleAt(hexText, index) * 16 + hexNibbleAt(hexText, index + 1);
  const hexSingleAt = (index: number) => hexNibbleAt(hexText, index) * 17;

  switch (hexText.length - 1) {
    case 3:
      return { r: hexSingleAt(1), g: hexSingleAt(2), b: hexSingleAt(3), a: 1 };
    case 4:
      return { r: hexSingleAt(1), g: hexSingleAt(2), b: hexSingleAt(3), a: hexSingleAt(4) / 255 };
    case 6:
      return { r: hexPairAt(1), g: hexPairAt(3), b: hexPairAt(5), a: 1 };
    case 8:
      return { r: hexPairAt(1), g: hexPairAt(3), b: hexPairAt(5), a: hexPairAt(7) / 255 };
    default:
      return null;
  }
}

function isHexColorText(colorText: string): boolean {
  if (colorText.charCodeAt(0) !== CHAR_CODE_HASH || colorText.length < 2) {
    return false;
  }

  for (let index = 1; index < colorText.length; index++) {
    const charCode = colorText.charCodeAt(index);
    const isHexDigit =
      (charCode >= CHAR_CODE_0 && charCode <= CHAR_CODE_9) ||
      (charCode >= CHAR_CODE_LOWER_A && charCode <= CHAR_CODE_LOWER_F);

    if (!isHexDigit) {
      return false;
    }
  }

  return true;
}

// A simple color function is `name(` + a paren-free body + `)`; anything nested
// (like `rgb(var(--x))`) has to fall through to the later checks and end up
// unparsed, matching how these values behave everywhere else in the engine.
function readSimpleFunctionBody(colorText: string, functionName: string): string | null {
  if (!colorText.startsWith(`${functionName}(`) || !colorText.endsWith(")")) {
    return null;
  }

  const body = colorText.slice(functionName.length + 1, -1);

  if (body.length === 0 || body.includes("(") || body.includes(")")) {
    return null;
  }

  return body;
}

function rgbaFromNumber(rgbNumber: number): RGBA {
  return {
    r: (rgbNumber >> 16) & 255,
    g: (rgbNumber >> 8) & 255,
    b: rgbNumber & 255,
    a: 1,
  };
}

const namedColorValues: Map<string, number> = new Map(
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

const systemColorValues: Map<string, number> = new Map(
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
  }).map(([name, rgbNumber]) => [name.toLowerCase(), rgbNumber]),
);

const cssWideFunctionNames = ["color", "color-mix", "hwb", "lab", "lch", "oklab", "oklch"];

function isCssWideColorFunction(colorText: string): boolean {
  if (!colorText.endsWith(")")) {
    return false;
  }

  return cssWideFunctionNames.some(
    (functionName) =>
      colorText.startsWith(functionName) &&
      colorText.charCodeAt(functionName.length) === CHAR_CODE_OPEN_PAREN &&
      colorText.lastIndexOf(functionName) === 0,
  );
}

let parseCanvas: HTMLCanvasElement | undefined;
let parseCanvasContext: CanvasRenderingContext2D | null = null;

// Lets the browser evaluate syntaxes the scanner doesn't cover (color-mix,
// oklch, relative colors) by painting one pixel and reading it back. The
// round-trip through rgba text quantizes alpha to two decimals.
function parseColorViaCanvas(colorText: string): RGBA | null {
  if (!parseCanvasContext) {
    parseCanvas = document.createElement("canvas");
    parseCanvas.width = 1;
    parseCanvas.height = 1;
    parseCanvasContext = parseCanvas.getContext("2d", { willReadFrequently: true });
  }

  if (!parseCanvasContext) {
    return null;
  }

  parseCanvasContext.fillStyle = colorText;
  parseCanvasContext.fillRect(0, 0, 1, 1);

  const [red = 0, green = 0, blue = 0, alpha = 0] = parseCanvasContext.getImageData(
    0,
    0,
    1,
    1,
  ).data;

  return parseRgbFunction(`rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(2)})`);
}

export function parse(colorText: string): RGBA | null {
  const color = colorText.trim().toLowerCase();

  if (color.includes("(from ")) {
    if (color.indexOf("(from") !== color.lastIndexOf("(from")) {
      return null;
    }

    return parseColorViaCanvas(color);
  }

  const rgbBody = readSimpleFunctionBody(color, "rgb") ?? readSimpleFunctionBody(color, "rgba");

  if (rgbBody != null) {
    if (rgbBody.charCodeAt(0) === CHAR_CODE_HASH) {
      if (color.lastIndexOf("rgb") > 0) {
        return null;
      }

      return parseColorViaCanvas(color);
    }

    return parseRgbFunction(color);
  }

  if (
    readSimpleFunctionBody(color, "hsl") != null ||
    readSimpleFunctionBody(color, "hsla") != null
  ) {
    return parseHslFunction(color);
  }

  if (isHexColorText(color)) {
    return parseHexColor(color);
  }

  const namedColorValue = namedColorValues.get(color);

  if (namedColorValue != null) {
    return rgbaFromNumber(namedColorValue);
  }

  const systemColorValue = systemColorValues.get(color);

  if (systemColorValue != null) {
    return rgbaFromNumber(systemColorValue);
  }

  if (color === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (isCssWideColorFunction(color)) {
    return parseColorViaCanvas(color);
  }

  return null;
}

// Bounded so a long-lived document cycling through unique color strings can't
// grow the caches forever; parsing is pure, so dropping entries is invisible.
const PARSE_CACHE_MAX_ENTRIES = 4096;

const rgbaParseCache = new Map<string, RGBA | null>();
const hslaParseCache = new Map<string, HSLA>();

export function parseColorWithCache(colorText: string): RGBA | null {
  const cacheKey = colorText.trim();
  const cached = rgbaParseCache.get(cacheKey);

  if (cached !== undefined || rgbaParseCache.has(cacheKey)) {
    return cached ?? null;
  }

  if (rgbaParseCache.size >= PARSE_CACHE_MAX_ENTRIES) {
    rgbaParseCache.clear();
  }

  const color = parse(cacheKey);
  rgbaParseCache.set(cacheKey, color);

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

  if (hslaParseCache.size >= PARSE_CACHE_MAX_ENTRIES) {
    hslaParseCache.clear();
  }

  const hsl = rgbToHSL(rgb);
  hslaParseCache.set(colorText, hsl);

  return hsl;
}
