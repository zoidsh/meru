import { describe, expect, test } from "bun:test";
import {
  getSRGBLightness,
  hslToRGB,
  parse,
  parseColorWithCache,
  rgbToHexString,
  rgbToHSL,
  rgbToString,
} from "./color";

const namedColors: Record<string, number> = {
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
};

const systemColors: Record<string, number> = {
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
};

function rgbFromNumber(rgbNumber: number) {
  return {
    r: (rgbNumber >> 16) & 255,
    g: (rgbNumber >> 8) & 255,
    b: rgbNumber & 255,
    a: 1,
  };
}

describe("parse", () => {
  test("rgb() and rgba() syntaxes", () => {
    expect(parse("rgb(255, 128, 0)")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(parse("rgb(255 128 0)")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(parse("rgb(255 128 0 / 0.5)")).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
    expect(parse("rgba(255, 0, 0, 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parse("rgb(100%, 50%, 0%)")).toEqual({ r: 255, g: 127, b: 0, a: 1 });
    expect(parse("rgb(1e2 0 0)")).toEqual({ r: 100, g: 0, b: 0, a: 1 });
    expect(parse("rgb(2.55e2, 0, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  test("out-of-gamut rgb() components stay unclamped", () => {
    expect(parse("rgb(300, -10, 0)")).toEqual({ r: 300, g: -10, b: 0, a: 1 });
  });

  test("rgb() with missing components returns null", () => {
    expect(parse("rgb(255, 128)")).toBeNull();
    expect(parse("rgb(255)")).toBeNull();
  });

  test("hsl() and hsla() syntaxes", () => {
    expect(parse("hsl(180, 100%, 50%)")).toEqual({ r: 0, g: 255, b: 255, a: 1 });
    expect(parse("hsl(0.5turn, 100%, 50%)")).toEqual({ r: 0, g: 255, b: 255, a: 1 });
    expect(parse("hsl(3.141592653589793rad, 100%, 50%)")).toEqual({ r: 0, g: 255, b: 255, a: 1 });
    expect(parse("hsl(120deg 50% 50% / 25%)")).toEqual({ r: 64, g: 191, b: 64, a: 0.25 });
    expect(parse("hsla(240, 100%, 50%, 0.5)")).toEqual({ r: 0, g: 0, b: 255, a: 0.5 });
  });

  test("hsl() with an unknown unit ignores the unit", () => {
    expect(parse("hsl(100grad, 50%, 50%)")).toEqual({ r: 106, g: 191, b: 64, a: 1 });
  });

  test("hsl() with out-of-range saturation stays unclamped", () => {
    expect(parse("hsl(120, 200%, 50%)")).toEqual({ r: -127, g: 383, b: -127, a: 1 });
  });

  test("hex syntaxes", () => {
    expect(parse("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parse("#f80c")).toEqual({ r: 255, g: 136, b: 0, a: 0.8 });
    expect(parse("#ff8800")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parse("#ff8800cc")).toEqual({ r: 255, g: 136, b: 0, a: 0.8 });
    expect(parse("#FF8800")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
  });

  test("invalid hex digit counts return null", () => {
    expect(parse("#ff")).toBeNull();
    expect(parse("#fffff")).toBeNull();
    expect(parse("#ff880")).toBeNull();
  });

  test("every named color", () => {
    for (const [name, rgbNumber] of Object.entries(namedColors)) {
      expect(parse(name)).toEqual(rgbFromNumber(rgbNumber));
    }
  });

  test("every system color, case-insensitively", () => {
    for (const [name, rgbNumber] of Object.entries(systemColors)) {
      expect(parse(name)).toEqual(rgbFromNumber(rgbNumber));
      expect(parse(name.toLowerCase())).toEqual(rgbFromNumber(rgbNumber));
    }
  });

  test("transparent", () => {
    expect(parse("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test("surrounding whitespace is ignored", () => {
    expect(parse("  red  ")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  test("unsupported values return null", () => {
    expect(parse("rgb(var(--x))")).toBeNull();
    expect(parse("notacolor")).toBeNull();
    expect(parse("")).toBeNull();
    expect(parse("url(#gradient)")).toBeNull();
    expect(parse("currentcolor")).toBeNull();
  });
});

describe("parseColorWithCache", () => {
  test("returns the parsed color and caches nulls", () => {
    expect(parseColorWithCache("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColorWithCache("definitely-not-a-color")).toBeNull();
    expect(parseColorWithCache("definitely-not-a-color")).toBeNull();
  });

  test("trims before parsing", () => {
    expect(parseColorWithCache("  #fff ")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });
});

describe("rgbToHSL", () => {
  test("exact conversions", () => {
    expect(rgbToHSL({ r: 255, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 1, l: 0.5, a: 1 });
    expect(rgbToHSL({ r: 0, g: 255, b: 255, a: 1 })).toEqual({ h: 180, s: 1, l: 0.5, a: 1 });
    expect(rgbToHSL({ r: 24, g: 26, b: 27, a: 1 })).toEqual({
      h: 200,
      s: 0.05882352941176472,
      l: 0.1,
      a: 1,
    });
    expect(rgbToHSL({ r: 232, g: 230, b: 227, a: 1 })).toEqual({
      h: 36.00000000000014,
      s: 0.09803921568627463,
      l: 0.8999999999999999,
      a: 1,
    });
    expect(rgbToHSL({ r: 66, g: 133, b: 244, a: 0.5 })).toEqual({
      h: 217.41573033707866,
      s: 0.8900000000000001,
      l: 0.607843137254902,
      a: 0.5,
    });
    expect(rgbToHSL({ r: 250, g: 235, b: 215, a: 1 })).toEqual({
      h: 34.28571428571427,
      s: 0.7777777777777773,
      l: 0.9117647058823529,
      a: 1,
    });
    expect(rgbToHSL({ r: 128, g: 128, b: 128, a: 1 })).toEqual({
      h: 0,
      s: 0,
      l: 0.5019607843137255,
      a: 1,
    });
  });

  test("alpha defaults to 1", () => {
    expect(rgbToHSL({ r: 128, g: 128, b: 128 })).toEqual({
      h: 0,
      s: 0,
      l: 0.5019607843137255,
      a: 1,
    });
  });
});

describe("hslToRGB", () => {
  test("exact conversions across sextant boundaries", () => {
    expect(hslToRGB({ h: 0, s: 1, l: 0.5, a: 1 })).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hslToRGB({ h: 59.999, s: 1, l: 0.5, a: 1 })).toEqual({ r: 255, g: 255, b: 0, a: 1 });
    expect(hslToRGB({ h: 60, s: 1, l: 0.5, a: 1 })).toEqual({ r: 255, g: 255, b: 0, a: 1 });
    expect(hslToRGB({ h: 119.999, s: 1, l: 0.5, a: 1 })).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(hslToRGB({ h: 180, s: 0.5, l: 0.3, a: 1 })).toEqual({ r: 38, g: 115, b: 115, a: 1 });
    expect(hslToRGB({ h: 239.999, s: 0.7, l: 0.6, a: 1 })).toEqual({ r: 82, g: 82, b: 224, a: 1 });
    expect(hslToRGB({ h: 240, s: 0.7, l: 0.6, a: 1 })).toEqual({ r: 82, g: 82, b: 224, a: 1 });
    expect(hslToRGB({ h: 299.999, s: 0.3, l: 0.7, a: 0.5 })).toEqual({
      r: 201,
      g: 156,
      b: 201,
      a: 0.5,
    });
    expect(hslToRGB({ h: 359.999, s: 1, l: 0.5, a: 1 })).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  test("out-of-range hues fall into the edge sextants unclamped", () => {
    expect(hslToRGB({ h: -30, s: 1, l: 0.5, a: 1 })).toEqual({ r: 255, g: -127, b: 0, a: 1 });
    expect(hslToRGB({ h: 360, s: 1, l: 0.5, a: 1 })).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hslToRGB({ h: 420, s: 1, l: 0.5, a: 1 })).toEqual({ r: 255, g: 0, b: 255, a: 1 });
  });

  test("zero saturation is a straight gray", () => {
    expect(hslToRGB({ h: 210, s: 0, l: 0.42, a: 1 })).toEqual({ r: 107, g: 107, b: 107, a: 1 });
  });
});

describe("rgbToString", () => {
  test("alpha formatting", () => {
    expect(rgbToString({ r: 1, g: 2, b: 3, a: 0.5049 })).toBe("rgba(1, 2, 3, 0.5)");
    expect(rgbToString({ r: 1, g: 2, b: 3, a: 0.505 })).toBe("rgba(1, 2, 3, 0.51)");
    expect(rgbToString({ r: 1, g: 2, b: 3, a: 0.999 })).toBe("rgba(1, 2, 3, 1)");
    expect(rgbToString({ r: 1, g: 2, b: 3, a: 1 })).toBe("rgb(1, 2, 3)");
    expect(rgbToString({ r: 1, g: 2, b: 3, a: 0 })).toBe("rgba(1, 2, 3, 0)");
    expect(rgbToString({ r: 1, g: 2, b: 3 })).toBe("rgb(1, 2, 3)");
    expect(rgbToString({ r: 255.4, g: 0, b: 0, a: 0.25 })).toBe("rgba(255, 0, 0, 0.25)");
  });
});

describe("rgbToHexString", () => {
  test("hex formatting with and without alpha", () => {
    expect(rgbToHexString({ r: 255, g: 0, b: 17, a: 0.5 })).toBe("#ff001180");
    expect(rgbToHexString({ r: 5, g: 10, b: 15, a: 1 })).toBe("#050a0f");
    expect(rgbToHexString({ r: 5, g: 10, b: 15 })).toBe("#050a0f");
    expect(rgbToHexString({ r: 255, g: 255, b: 255, a: 0.999 })).toBe("#ffffffff");
  });
});

describe("getSRGBLightness", () => {
  test("exact values", () => {
    expect(getSRGBLightness(255, 255, 255)).toBe(0.9999999999999999);
    expect(getSRGBLightness(0, 0, 0)).toBe(0);
    expect(getSRGBLightness(255, 0, 0)).toBe(0.2126);
    expect(getSRGBLightness(24, 26, 27)).toBe(0.1005764705882353);
  });
});
