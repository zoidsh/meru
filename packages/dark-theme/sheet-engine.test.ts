import { describe, expect, test } from "bun:test";
import {
  buildIgnoreCounterRules,
  buildInstanceSheetText,
  buildInvertFilterRules,
  buildScopedSheetText,
  isFullyRootLevelSelector,
  rewriteRootLevelSelectors,
  scopeSelectorText,
  type SheetRule,
} from "./sheet-engine";

function createSheetRule(overrides: Partial<SheetRule>): SheetRule {
  return {
    selectorText: ".surface",
    groupChain: [],
    declarations: [],
    imageValues: [],
    backgroundRepeat: undefined,
    backgroundSize: undefined,
    ...overrides,
  };
}

describe("isFullyRootLevelSelector", () => {
  test("detects selectors that can never match inside a body-level root", () => {
    expect(isFullyRootLevelSelector("html")).toBe(true);
    expect(isFullyRootLevelSelector("body.dark")).toBe(true);
    expect(isFullyRootLevelSelector(':root[dir="rtl"]')).toBe(true);
    expect(isFullyRootLevelSelector("html, body")).toBe(true);
    expect(isFullyRootLevelSelector("body .message")).toBe(false);
    expect(isFullyRootLevelSelector(".message, body")).toBe(false);
    expect(isFullyRootLevelSelector(".body-copy")).toBe(false);
  });
});

describe("rewriteRootLevelSelectors", () => {
  test("rewrites root-level parts to :scope and dedupes them", () => {
    expect(rewriteRootLevelSelectors(":root")).toBe(":scope");
    expect(rewriteRootLevelSelectors("html, body")).toBe(":scope");
    expect(rewriteRootLevelSelectors(":root, .theme")).toBe(":scope, .theme");
    expect(rewriteRootLevelSelectors(".panel")).toBe(".panel");
  });
});

describe("scopeSelectorText", () => {
  test("anchors each part's subject to the themed subtree", () => {
    expect(scopeSelectorText(".pane .subject, .badge", "[data-x]", [])).toBe(
      ".pane .subject:is([data-x], [data-x] *), .badge:is([data-x], [data-x] *)",
    );
  });

  test("resolves the :scope marker to the scope selector itself", () => {
    expect(scopeSelectorText(":scope", "[data-x]", [])).toBe("[data-x]");
  });

  test("inserts the suffix before a trailing pseudo-element", () => {
    expect(scopeSelectorText(".marker::before", "[data-x]", [])).toBe(
      ".marker:is([data-x], [data-x] *)::before",
    );
  });

  test("excludes ignored subtrees via :not", () => {
    expect(scopeSelectorText(".row", "[data-x]", [".chip", ".badge"])).toBe(
      ".row:is([data-x], [data-x] *):not(.chip, .chip *, .badge, .badge *)",
    );
  });
});

describe("buildScopedSheetText", () => {
  test("emits variable definitions before rules, both anchored to the scope", () => {
    const sheetText = buildScopedSheetText({
      scopeSelector: '[data-dark-theme-root^="0-"]',
      limitSelectors: [],
      variableDefinitions: [
        { selectorText: ":root", groupChain: [], declarationText: "--surface: #181a1b" },
      ],
      rules: [
        createSheetRule({
          declarations: [
            {
              property: "background-color",
              value: "#181a1b",
              sourceValue: "#ffffff",
              important: false,
            },
          ],
        }),
      ],
    });

    expect(sheetText).toBe(
      [
        '[data-dark-theme-root^="0-"] { --surface: #181a1b; }',
        '.surface:is([data-dark-theme-root^="0-"], [data-dark-theme-root^="0-"] *) { background-color: #181a1b; }',
      ].join("\n"),
    );
  });

  test("adds the ignore exclusion and mirrors importance", () => {
    const sheetText = buildScopedSheetText({
      scopeSelector: "[data-x]",
      limitSelectors: [".chip"],
      variableDefinitions: [],
      rules: [
        createSheetRule({
          declarations: [
            { property: "color", value: "#e8e6e3", sourceValue: "#111", important: true },
          ],
        }),
      ],
    });

    expect(sheetText).toBe(
      ".surface:is([data-x], [data-x] *):not(.chip, .chip *) { color: #e8e6e3 !important; }",
    );
  });

  test("wraps rules in their group chains and reuses open blocks", () => {
    const sheetText = buildScopedSheetText({
      scopeSelector: "[data-x]",
      limitSelectors: [],
      variableDefinitions: [],
      rules: [
        createSheetRule({
          selectorText: ".a",
          groupChain: ["@media (min-width: 100px)"],
          declarations: [
            { property: "color", value: "#e8e6e3", sourceValue: "#111", important: false },
          ],
        }),
        createSheetRule({
          selectorText: ".b",
          groupChain: ["@media (min-width: 100px)", "@supports (display: grid)"],
          declarations: [
            { property: "color", value: "#e8e6e3", sourceValue: "#222", important: false },
          ],
        }),
        createSheetRule({
          selectorText: ".c",
          groupChain: [],
          declarations: [
            { property: "color", value: "#e8e6e3", sourceValue: "#333", important: false },
          ],
        }),
      ],
    });

    expect(sheetText).toBe(
      [
        "@media (min-width: 100px) {",
        ".a:is([data-x], [data-x] *) { color: #e8e6e3; }",
        "@supports (display: grid) {",
        ".b:is([data-x], [data-x] *) { color: #e8e6e3; }",
        "}",
        "}",
        ".c:is([data-x], [data-x] *) { color: #e8e6e3; }",
      ].join("\n"),
    );
  });

  test("dedupes identical generated rules and skips declaration-less rules", () => {
    const darkenedDeclaration = {
      property: "color",
      value: "#e8e6e3",
      sourceValue: "#111",
      important: false,
    };

    const sheetText = buildScopedSheetText({
      scopeSelector: "[data-x]",
      limitSelectors: [],
      variableDefinitions: [],
      rules: [
        createSheetRule({ declarations: [darkenedDeclaration] }),
        createSheetRule({ declarations: [darkenedDeclaration] }),
        createSheetRule({ selectorText: ".icon-only", imageValues: ["url(icon.png)"] }),
      ],
    });

    expect(sheetText).toBe(".surface:is([data-x], [data-x] *) { color: #e8e6e3; }");
  });

  test("returns null when nothing is emitted", () => {
    expect(
      buildScopedSheetText({
        scopeSelector: "[data-x]",
        limitSelectors: [],
        variableDefinitions: [],
        rules: [],
      }),
    ).toBeNull();
  });
});

describe("buildInvertFilterRules", () => {
  const matchesGstatic = (cssValue: string) => cssValue.includes("gstatic.com/icons/");

  test("emits a filter rule for matching icon rules and dedupes selectors", () => {
    const iconRule = createSheetRule({
      selectorText: ".icon",
      imageValues: ['url("https://gstatic.com/icons/star.png")'],
    });

    expect(buildInvertFilterRules([iconRule, iconRule], matchesGstatic)).toEqual([
      { selectorText: ".icon", groupChain: [] },
    ]);
  });

  test("skips non-matching, tiled, and stretched image rules", () => {
    expect(
      buildInvertFilterRules(
        [
          createSheetRule({ imageValues: ["url(https://example.com/photo.jpg)"] }),
          createSheetRule({
            imageValues: ["url(https://gstatic.com/icons/star.png)"],
            backgroundRepeat: "repeat",
          }),
          createSheetRule({
            imageValues: ["url(https://gstatic.com/icons/star.png)"],
            backgroundSize: "cover",
          }),
        ],
        matchesGstatic,
      ),
    ).toEqual([]);
  });

  test("covers pseudo-element content icons via their own selector", () => {
    expect(
      buildInvertFilterRules(
        [
          createSheetRule({
            selectorText: ".star::before",
            groupChain: ["@media (min-width: 100px)"],
            imageValues: ['url("https://gstatic.com/icons/star.png")'],
          }),
        ],
        matchesGstatic,
      ),
    ).toEqual([{ selectorText: ".star::before", groupChain: ["@media (min-width: 100px)"] }]);
  });
});

describe("buildIgnoreCounterRules", () => {
  const sendButtonRule = createSheetRule({
    selectorText: ".dC:hover, .other",
    declarations: [
      {
        property: "background-color",
        value: "#1b3541",
        sourceValue: "rgb(194, 231, 255)",
        important: false,
      },
      { property: "color", value: "#e8e6e3", sourceValue: "#111", important: true },
    ],
  });

  test("re-emits covered source declarations for matching ignored elements", () => {
    const counterRules = buildIgnoreCounterRules(
      [sendButtonRule],
      [{ selector: ".dC", properties: ["background-color"] }],
      (_ignoreRule, baseSelector) => baseSelector === ".dC",
    );

    expect(counterRules).toEqual([
      {
        selectorText: ":is(.dC:hover):is(.dC)",
        groupChain: [],
        declarationTexts: ["background-color: rgb(194, 231, 255)"],
      },
    ]);
  });

  test("emits nothing when no ignored element matches the rule", () => {
    expect(
      buildIgnoreCounterRules(
        [sendButtonRule],
        [{ selector: ".dC", properties: ["background-color"] }],
        () => false,
      ),
    ).toEqual([]);
  });

  test("border-color shorthand covers side longhands and keeps pseudo-elements", () => {
    const replyRule = createSheetRule({
      selectorText: ".HM .I5::before",
      declarations: [
        {
          property: "border-top-color",
          value: "#736b5e",
          sourceValue: "rgb(200, 200, 200)",
          important: true,
        },
      ],
    });

    const counterRules = buildIgnoreCounterRules(
      [replyRule],
      [{ selector: ".I5", properties: ["border-color"] }],
      (_ignoreRule, baseSelector) => baseSelector === ".HM .I5",
    );

    expect(counterRules).toEqual([
      {
        selectorText: ":is(.HM .I5):is(.I5)::before",
        groupChain: [],
        declarationTexts: ["border-top-color: rgb(200, 200, 200) !important"],
      },
    ]);
  });
});

describe("buildInstanceSheetText", () => {
  test("combines root background, invert rules, and counter rules", () => {
    const instanceSheetText = buildInstanceSheetText({
      scopeSelector: '[data-dark-theme-root="0-1"]',
      limitSelectors: [".edeTZ"],
      rootBackgroundColor: "rgb(19, 19, 19)",
      invertFilterRules: [{ selectorText: ".icon", groupChain: [] }],
      counterRules: [
        {
          selectorText: ":is(.dC):is(.dC)",
          groupChain: [],
          declarationTexts: ["background-color: rgb(194, 231, 255)"],
        },
      ],
    });

    expect(instanceSheetText).toBe(
      [
        '[data-dark-theme-root="0-1"] { background-color: rgb(19, 19, 19); }',
        '.icon:is([data-dark-theme-root="0-1"], [data-dark-theme-root="0-1"] *):not(.edeTZ, .edeTZ *) { filter: invert(1); }',
        ':is(.dC):is(.dC):is([data-dark-theme-root="0-1"], [data-dark-theme-root="0-1"] *):not(.edeTZ, .edeTZ *) { background-color: rgb(194, 231, 255); }',
      ].join("\n"),
    );
  });

  test("returns null when the instance needs no rules", () => {
    expect(
      buildInstanceSheetText({
        scopeSelector: '[data-dark-theme-root="0-1"]',
        limitSelectors: [],
        rootBackgroundColor: null,
        invertFilterRules: [],
        counterRules: [],
      }),
    ).toBeNull();
  });
});
