import { parse } from "./color";
import { modifyBackgroundColor } from "./modify-colors";
import type { Theme } from "./theme";

const colorTokenRegex = /rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]+/gi;

// Replaces every color token in a CSS value (gradient stops, shadow colors)
// with its dark-theme background equivalent, leaving positions and lengths
// intact. Dark Reader remaps both gradients and shadows through the background
// color math (modifyGradientColor and modifyShadowColor both delegate to it).
export function replaceColorTokens(value: string, theme: Theme): string {
  return value.replace(colorTokenRegex, (token) => {
    const rgb = parse(token);

    return rgb ? modifyBackgroundColor(rgb, theme) : token;
  });
}
