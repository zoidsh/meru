import { parseColorWithCache, type RGBA } from "./color";
import {
  forEachVariableReference,
  modifyColorTokens,
  replaceColorTokens,
  substituteVarFallbacks,
} from "./css-value";
import { modifyBackgroundColor, modifyBorderColor, modifyForegroundColor } from "./modify-colors";
import { getDeclarationRoute } from "./modify-declaration";
import { getThemeValueKey, type Theme } from "./theme";

const BACKGROUND_TYPE_BIT = 1;
const TEXT_TYPE_BIT = 2;
const BORDER_TYPE_BIT = 4;
const BACKGROUND_IMAGE_TYPE_BIT = 8;

type VariableDefinition = {
  selectorText: string;
  groupChain: string[];
  variableName: string;
  value: string;
  important: boolean;
};

export type DarkenedVariableDefinition = {
  selectorText: string;
  groupChain: string[];
  declarationText: string;
};

const DARKENED_VALUE_CACHE_MAX_ENTRIES = 4096;

// Darkening a definition value is pure given the flattened value, the type
// bits, and the theme, so results are shared across walks and store instances.
const darkenedValuesByThemeKey = new Map<string, Map<string, string>>();

function darkenFlattenedDefinitionValue(value: string, typeBits: number, theme: Theme): string {
  const themeValueKey = getThemeValueKey(theme);
  let darkenedValues = darkenedValuesByThemeKey.get(themeValueKey);

  if (!darkenedValues) {
    darkenedValues = new Map();
    darkenedValuesByThemeKey.set(themeValueKey, darkenedValues);
  }

  const cacheKey = `${typeBits}|${value}`;
  const cachedValue = darkenedValues.get(cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue;
  }

  let darkenedValue: string;

  if (typeBits & BACKGROUND_IMAGE_TYPE_BIT) {
    darkenedValue = replaceColorTokens(value, theme);
  } else {
    const modifyVariableColor =
      typeBits & BACKGROUND_TYPE_BIT
        ? modifyBackgroundColor
        : typeBits & TEXT_TYPE_BIT
          ? modifyForegroundColor
          : modifyBorderColor;

    const wholeValueColor = parseColorWithCache(value);

    if (wholeValueColor != null) {
      darkenedValue = wholeValueColor.a === 0 ? value : modifyVariableColor(wholeValueColor, theme);
    } else {
      darkenedValue = modifyColorTokens(value, (rgb: RGBA) =>
        rgb.a === 0 ? null : modifyVariableColor(rgb, theme),
      );
    }
  }

  if (darkenedValues.size >= DARKENED_VALUE_CACHE_MAX_ENTRIES) {
    darkenedValues.clear();
  }

  darkenedValues.set(cacheKey, darkenedValue);

  return darkenedValue;
}

// A slim take on Dark Reader's variable solver: custom properties are typed by
// the color-bearing properties that consume them (with one hop of var-to-var
// propagation, no fixpoint), and only typed, same-origin-defined variables get
// a darkened re-declaration — emitted at the definition's own selector so
// cascade and inheritance mirror the original. Untyped variables are left
// alone, so a light-valued token consumed as a text color is never darkened
// toward the background pole.
export function createVariableStore() {
  let definitions: VariableDefinition[] = [];
  let typeBitsByName = new Map<string, number>();
  let referencedNamesByDefiner = new Map<string, Set<string>>();
  let definedNames = new Set<string>();
  let darkenedNames = new Set<string>();
  let darkenedNamesKey = "";

  const addTypeBits = (variableName: string, typeBits: number) => {
    typeBitsByName.set(variableName, (typeBitsByName.get(variableName) ?? 0) | typeBits);
  };

  const isVariableDarkened = (variableName: string) => darkenedNames.has(variableName);

  const flattenUnknownReferences = (value: string) => {
    if (!value.includes("var(")) {
      return value;
    }

    let hasUnknownVariable = false;

    forEachVariableReference(value, (variableName) => {
      if (!isVariableDarkened(variableName)) {
        hasUnknownVariable = true;
      }
    });

    return hasUnknownVariable ? substituteVarFallbacks(value) : value;
  };

  return {
    beginCollection: () => {
      definitions = [];
      typeBitsByName = new Map();
      referencedNamesByDefiner = new Map();
      definedNames = new Set();
    },

    collectDefinition: (
      selectorText: string,
      groupChain: string[],
      variableName: string,
      value: string,
      important: boolean,
    ) => {
      definitions.push({ selectorText, groupChain, variableName, value, important });
      definedNames.add(variableName);

      if (value.includes("var(")) {
        let referencedNames = referencedNamesByDefiner.get(variableName);

        if (!referencedNames) {
          referencedNames = new Set();
          referencedNamesByDefiner.set(variableName, referencedNames);
        }

        forEachVariableReference(value, (referencedName) => {
          referencedNames.add(referencedName);
        });
      }
    },

    collectConsumer: (property: string, value: string) => {
      if (!value.includes("var(")) {
        return;
      }

      const route = getDeclarationRoute(property);

      if (!route) {
        return;
      }

      const typeBits =
        route === "foreground"
          ? TEXT_TYPE_BIT
          : route === "border"
            ? BORDER_TYPE_BIT
            : route === "image"
              ? BACKGROUND_IMAGE_TYPE_BIT
              : route === "background" && value.includes("gradient(")
                ? BACKGROUND_IMAGE_TYPE_BIT
                : BACKGROUND_TYPE_BIT;

      forEachVariableReference(value, (variableName) => {
        addTypeBits(variableName, typeBits);
      });
    },

    // Returns whether the darkened-variable set changed since the previous
    // walk, so the caller knows its cached darkened rules — built against the
    // old set's pinning decisions — are stale.
    finalizeCollection: () => {
      for (const [definerName, referencedNames] of referencedNamesByDefiner) {
        const definerTypeBits = typeBitsByName.get(definerName) ?? 0;

        if (definerTypeBits === 0) {
          continue;
        }

        for (const referencedName of referencedNames) {
          addTypeBits(referencedName, definerTypeBits);
        }
      }

      darkenedNames = new Set(
        [...definedNames].filter((variableName) => (typeBitsByName.get(variableName) ?? 0) !== 0),
      );

      const nextDarkenedNamesKey = [...darkenedNames].sort().join(" ");
      const hasChanged = nextDarkenedNamesKey !== darkenedNamesKey;
      darkenedNamesKey = nextDarkenedNamesKey;

      return hasChanged;
    },

    isVariableDarkened,

    buildDarkenedDefinitions: (theme: Theme) => {
      const darkenedDefinitions: DarkenedVariableDefinition[] = [];

      for (const definition of definitions) {
        if (!darkenedNames.has(definition.variableName)) {
          continue;
        }

        const typeBits = typeBitsByName.get(definition.variableName) ?? 0;
        const flattenedValue = flattenUnknownReferences(definition.value);
        const darkenedValue = darkenFlattenedDefinitionValue(flattenedValue, typeBits, theme);

        if (darkenedValue === definition.value) {
          continue;
        }

        darkenedDefinitions.push({
          selectorText: definition.selectorText,
          groupChain: definition.groupChain,
          declarationText: `${definition.variableName}: ${darkenedValue}${
            definition.important ? " !important" : ""
          }`,
        });
      }

      return darkenedDefinitions;
    },
  };
}
