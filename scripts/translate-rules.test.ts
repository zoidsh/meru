import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { type CompiledMessage, compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { compiledText } from "../.claude/skills/translate/check";
import {
  readGeneratedTable,
  renderPlatformTable,
  tableCells,
} from "../.claude/skills/translate/platform-table";
import {
  duplicateRuleIds,
  LANGUAGES_DIR,
  loadSidecar,
  PLATFORMS,
  platformEntries,
  sidecarPath,
  sidecarSchema,
  styleSheetPath,
} from "../.claude/skills/translate/rules";
import { type CatalogTag, SHIPPED_CATALOG_TAGS } from "../packages/shared/i18n/tags";
import { parseCatalog } from "./i18n-check";

/*
 * Lives here rather than beside the rules because `bun test` never looks inside
 * a dot directory such as `.claude`.
 */

const SOURCE_CATALOGS = [
  "packages/shared/i18n/locales/en.po",
  "packages/preload-gmail/locales/en.po",
].map((catalog) => path.join(import.meta.dir, "..", catalog));

const locales = (await readdir(LANGUAGES_DIR))
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.slice(0, -".md".length));

async function sourcePlatformEntries() {
  const keys: string[] = [];

  for (const catalogPath of SOURCE_CATALOGS) {
    const catalog = await parseCatalog(await Bun.file(catalogPath).text(), {
      locale: "en",
      sourceLocale: "en",
      filename: catalogPath,
    });

    for (const [id, entry] of Object.entries(catalog)) {
      if (entry.context && (PLATFORMS as readonly string[]).includes(entry.context)) {
        keys.push(`${entry.context} ${entry.message ?? id}`);
      }
    }
  }

  return keys.sort();
}

/** The kinds of label whose form a style sheet's Label forms section states, one `- **<kind>:**` line each. */
const LABEL_KINDS = [
  "Button",
  "Menu bar item",
  "Context or popup menu item",
  "Select option",
  "Checkbox or switch label",
  "Setting description",
  "OS label",
];

/** Each kind the style sheet's `## Label forms` section gives no form for, or the section itself. */
function missingLabelForms(markdown: string) {
  const section = /^## Label forms\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(markdown)?.[1];

  if (section === undefined) {
    return ["## Label forms"];
  }

  return LABEL_KINDS.filter(
    (kind) => !new RegExp(`^- \\*\\*${kind}:\\*\\* \\S`, "mu").test(section),
  );
}

/*
 * The list a style sheet's `- **<heading>**` line gives, past an optional
 * lead-in that runs to the list's first ": ", and the text after its
 * `Allowed: `, or undefined when the sheet has no such line. `Allowed:` is
 * split off first, so it is never read as a lead-in. A lead-in `item` matches
 * in, or a list it never matches in, means the line didn't parse as written,
 * so it throws rather than let the guard pass on nothing.
 */
function sheetList(markdown: string, heading: string, item: RegExp) {
  const body = new RegExp(`^- \\*\\*${heading}\\*\\* (.*)$`, "mu").exec(markdown)?.[1];

  if (body === undefined) {
    return undefined;
  }

  const allowedAt = /(?:^| )Allowed: /u.exec(body);

  const main = allowedAt ? body.slice(0, allowedAt.index) : body;

  const colon = main.indexOf(": ");

  const leadIn = colon === -1 ? "" : main.slice(0, colon);

  const list = colon === -1 ? main : main.slice(colon + 2);

  if (item.test(leadIn) || !item.test(list)) {
    throw new Error(`The style sheet's ${heading} line lists nothing it can read: ${body}`);
  }

  return {
    list,
    allowed: allowedAt ? body.slice(allowedAt.index + allowedAt[0].length) : "",
  };
}

/** An entry of a never-opens-with line: an English verb, then its imperatives. */
const OPENER_ITEM = /(?:^|; )(\p{Lu}\p{Ll}+)((?: _[^_]+_)+)/u;

/*
 * A sheet's `- **Setting description never opens with:**` line, as each
 * English verb it names with that verb's imperatives, lower-cased: its
 * entries read `Show _Zeige_ _Blende_; Hide _Blende_`, after an optional
 * lead-in ending in a colon.
 */
function bannedDescriptionOpeners(markdown: string) {
  const line = sheetList(markdown, "Setting description never opens with:", OPENER_ITEM);

  if (line?.allowed) {
    throw new Error("A never-opens-with line takes no Allowed: list");
  }

  const openers = new Map<string, string[]>();

  for (const [, verb, words] of (line?.list ?? "").matchAll(new RegExp(OPENER_ITEM.source, "gu"))) {
    openers.set(
      verb as string,
      [...(words as string).matchAll(/_([^_]+)_/gu)].map(([, word]) =>
        (word as string).toLocaleLowerCase(),
      ),
    );
  }

  return openers;
}

/** First words of a description's English that are no verb, so no imperative of theirs is listed. */
const NON_VERB_OPENERS = new Set([
  "A",
  "Extensions",
  "Gmail",
  "How",
  "Meru",
  "No",
  "Where",
  "With",
]);

/** The English verb a description opens with, past a leading adverb such as Automatically. */
function englishOpener(msgid: string) {
  const [first, second] = msgid.split(" ");

  const verb = first?.endsWith("ly") && second ? second[0]?.toUpperCase() + second.slice(1) : first;

  return verb === undefined || NON_VERB_OPENERS.has(verb) ? undefined : verb.replace(/\W+$/u, "");
}

/*
 * A message's text by branch: each branch's own when the whole message is a
 * select or plural, as `downloadNotificationAction` writes two descriptions in
 * one, else the message under the key "".
 */
function messageBranches(message: string) {
  let tokens: CompiledMessage;

  try {
    tokens = compileMessageOrThrow(message);
  } catch {
    return new Map([["", message]]);
  }

  const [only] = tokens;

  const format = tokens.length === 1 && Array.isArray(only) ? only[2] : undefined;

  return format && typeof format === "object"
    ? new Map(
        Object.entries(format as Record<string, unknown>).flatMap(([key, branch]) =>
          Array.isArray(branch) ? [[key, compiledText(branch as CompiledMessage)] as const] : [],
        ),
      )
    : new Map([["", message]]);
}

type Catalog = Awaited<ReturnType<typeof parseCatalog>>;

/*
 * Every branch of a catalog's messages whose English `keep` takes, a select
 * or plural read branch by branch: its whole English, its context, the
 * branch's English and the branch's translation.
 */
function branchesIn(catalog: Catalog, keep: (english: string) => boolean) {
  return Object.entries(catalog).flatMap(([id, entry]) => {
    const msgid = entry.message ?? id;

    const translation = entry.translation ?? "";

    const translated = messageBranches(translation);

    const source = messageBranches(msgid);

    // A plural can have branches the English lacks, as Polish's few and many, which render its other.
    const keys = new Set([...source.keys(), ...(translated.has("") ? [] : translated.keys())]);

    return [...keys].flatMap((key) => {
      const english = source.get(key) ?? source.get("other") ?? source.get("");

      return english !== undefined && keep(english)
        ? [
            {
              msgid,
              context: entry.context,
              english,
              translation: translated.get(key) ?? translation,
            },
          ]
        : [];
    });
  });
}

type Branch = ReturnType<typeof branchesIn>[number];

/** Every Settings description in a catalog, by branch. */
function descriptionsIn(catalog: Catalog, spans: string[]) {
  return branchesIn(catalog, (english) => {
    const wanted = letters(english);

    return english.endsWith(".") && wanted !== "" && spans.some((span) => span.includes(wanted));
  });
}

const appCatalogs = new Map<string, Promise<Catalog | undefined>>();

/** A locale's app catalog, parsed once for every test that reads it. */
function appCatalog(locale: string) {
  let catalog = appCatalogs.get(locale);

  if (catalog === undefined) {
    const file = Bun.file(
      path.join(import.meta.dir, `../packages/shared/i18n/locales/${locale}.po`),
    );

    catalog = file.exists().then(async (exists) =>
      exists
        ? parseCatalog(await file.text(), {
            locale,
            sourceLocale: "en",
            filename: file.name ?? "",
          })
        : undefined,
    );

    appCatalogs.set(locale, catalog);
  }

  return catalog;
}

async function catalogDescriptions(locale: string) {
  const catalog = await appCatalog(locale);

  return catalog && descriptionsIn(catalog, await descriptionSpans());
}

/** A finding on a branch, as `<context> <msgid> => <translation>`. */
function branchFinding({ msgid, context, translation }: Branch) {
  return `${context ?? "-"} ${msgid} => ${translation}`;
}

/** Each description whose translation opens with a word its sheet rules out. */
function bannedOpenings(descriptions: Branch[], banned: string[]) {
  return descriptions
    .filter(
      ({ msgid, translation }) =>
        !INSTRUCTION_DESCRIPTIONS.has(msgid) &&
        openingWords(translation).some((word) => banned.includes(word)),
    )
    .map(branchFinding);
}

test("a never-opens-with line reads as each verb with its imperatives", () => {
  expect(
    bannedDescriptionOpeners(
      "- **Setting description never opens with:** the _du_ imperative: Show _Zeige_ _Blende_; Hide _Blende_. Then more.",
    ),
  ).toEqual(
    new Map([
      ["Show", ["zeige", "blende"]],
      ["Hide", ["blende"]],
    ]),
  );
  expect(englishOpener("Automatically select the first account.")).toBe("Select");
  expect(englishOpener("How long a tab waits.")).toBeUndefined();
});

const RENDERER_DIR = path.join(import.meta.dir, "../packages/renderer");

/** The source from `start` to the `}` that closes the brace there, or to `close`. */
function spanFrom(source: string, start: number, close?: string) {
  if (close !== undefined) {
    return source.slice(start, Math.max(start, source.indexOf(close, start)));
  }

  for (let index = start, depth = 0; index < source.length; index++) {
    if (source[index] === "{") {
      depth++;
    } else if (source[index] === "}" && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  return "";
}

/** A message's letters alone, so `${appName}` meets `{appName}` and `<strong>` meets `<0>`. */
function letters(text: string) {
  return text.replace(/<[^>]*>/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** The renderer's `.tsx` sources, read once for every test that searches them. */
const rendererSources = (async () => {
  const files = (await readdir(RENDERER_DIR, { recursive: true })).filter(
    (file) => file.endsWith(".tsx") && !file.split(path.sep).includes("node_modules"),
  );

  return Promise.all(files.map((file) => Bun.file(path.join(RENDERER_DIR, file)).text()));
})();

/** The source of every `<prop>=` prop and `<component>` element's children in the renderer. */
async function rendererSpans(prop: string, component: string) {
  const pattern = new RegExp(`\\b${prop}=(?=\\{)|<${component}\\b[^>]*>`, "gu");

  return (await rendererSources).flatMap((source) =>
    [...source.matchAll(pattern)].map((match) => {
      const start = (match.index ?? 0) + match[0].length;

      return match[0].startsWith("<")
        ? spanFrom(source, start, `</${component}>`)
        : spanFrom(source, start);
    }),
  );
}

/** The source of every `description=` prop and `<FieldDescription>` in the renderer, as letters. */
async function descriptionSpans() {
  return (await rendererSpans("description", "FieldDescription")).map(letters);
}

/*
 * The letters of every string in a `label=` prop or a `<FieldLabel>`: its
 * quoted and template literals and its JSX text. A label is short, so it is
 * matched whole rather than found inside a span, where to would match Window
 * controls.
 */
async function labelStrings() {
  const strings = new Set<string>();

  for (const span of await rendererSpans("label", "FieldLabel")) {
    for (const [, quoted, template, text] of `>${span}<`.matchAll(
      /"((?:[^"\\]|\\.)*)"|`([^`]*)`|>([^<>{}]+)</gu,
    )) {
      const wanted = letters(quoted ?? template ?? text ?? "");

      if (wanted !== "") {
        strings.add(wanted);
      }
    }
  }

  return strings;
}

/** Every setting label in a catalog, by branch. */
function labelsIn(catalog: Catalog, strings: Set<string>) {
  return branchesIn(catalog, (english) => !english.endsWith(".") && strings.has(letters(english)));
}

async function catalogLabels(locale: string) {
  const catalog = await appCatalog(locale);

  return catalog && labelsIn(catalog, await labelStrings());
}

/*
 * A sheet's `- **Setting label never ends with:**` line: the prepositions
 * after an optional lead-in ending in a colon, `_bei_ _mit_`, and after
 * `Allowed:` each label that may end in one, by its English then the word,
 * `Notify for _für_, why; …`.
 */
function bannedLabelEndings(markdown: string) {
  const line = sheetList(markdown, "Setting label never ends with:", /_[^_]+_/u);

  if (line === undefined) {
    return undefined;
  }

  const allowed = new Map<string, string>();

  for (const item of line.allowed === "" ? [] : line.allowed.split("; ")) {
    const [, english, word] = /^(.+?) _([^_]+)_/u.exec(item) ?? [];

    if (english === undefined || word === undefined) {
      throw new Error(`An Allowed: entry names no label and word: ${item}`);
    }

    allowed.set(english, word.toLocaleLowerCase());
  }

  return {
    prepositions: [...line.list.matchAll(/_([^_]+)_/gu)].map(([, word]) =>
      (word as string).toLocaleLowerCase(),
    ),
    allowed,
  };
}

/** Each translated label whose last word is a preposition its sheet rules out. */
function prepositionEndings(
  labels: Branch[],
  { prepositions, allowed }: NonNullable<ReturnType<typeof bannedLabelEndings>>,
) {
  return labels
    .filter(({ english, translation }) => {
      const last = /(\p{L}+)\P{L}*$/u.exec(translation)?.[1]?.toLocaleLowerCase();

      return last !== undefined && prepositions.includes(last) && allowed.get(english) !== last;
    })
    .map(branchFinding);
}

/** Descriptions that tell the user to do something elsewhere, so they open with the imperative. */
const INSTRUCTION_DESCRIPTIONS = new Set([
  "Choose Meru as the default mail client in Windows Settings.",
  "Swipe left or right with two fingers on a trackpad to go back or forward. Swipe between pages must also be on in System Settings.",
]);

/*
 * The words a description is read by: its first, and the first after a
 * leading phrase's comma, such as Spanish's Con varias bandejas, elegir…
 */
function openingWords(translation: string) {
  const sentence = translation.replace(/^[^\p{L}]+/u, "").split(/(?<=\.)\s/u)[0] ?? "";

  const word = (text: string) => /^\p{L}+/u.exec(text.trim())?.[0]?.toLocaleLowerCase();

  return [word(sentence), word(sentence.split(",")[1] ?? "")].filter(
    (opener): opener is string => opener !== undefined,
  );
}

test("a description's opening words are its first and the one after a leading phrase", () => {
  expect(openingWords("Con varias bandejas, elige qué secciones cuentan. Deja, la lista")).toEqual([
    "con",
    "elige",
  ]);
  expect(openingWords("„Die Farbe“ auswählen.")).toEqual(["die"]);
});

test("an imperative planted in one branch of a select description is caught", async () => {
  const msgid =
    "{downloadNotificationAction, select, click {Choose what clicking the notification does.} other {Choose what the notification's button does.}}";

  const descriptions = descriptionsIn(
    {
      [msgid]: {
        message: msgid,
        translation:
          "{downloadNotificationAction, select, click {Elegir qué ocurre al hacer clic en la notificación.} other {Elige qué hace el botón de la notificación.}}",
      },
    } as unknown as Catalog,
    await descriptionSpans(),
  );

  expect(descriptions.map(({ english }) => englishOpener(english))).toEqual(["Choose", "Choose"]);
  expect(bannedOpenings(descriptions, ["elige"])).toEqual([
    `- ${msgid} => Elige qué hace el botón de la notificación.`,
  ]);
});

test("an imperative planted in a plural branch the English lacks is caught", () => {
  const msgid = "{count, plural, one {Choose # tab to keep.} other {Choose # tabs to keep.}}";

  const descriptions = descriptionsIn(
    {
      [msgid]: {
        message: msgid,
        translation:
          "{count, plural, one {Pytaj o # kartę.} few {Pytaj o # karty.} many {Wybierz # kart.} other {Pytaj o # karty.}}",
      },
    } as unknown as Catalog,
    [letters("Choose # tabs to keep.")],
  );

  expect(descriptions.map(({ translation }) => translation)).toEqual([
    "Pytaj o # karty.",
    "Pytaj o # karty.",
    "Wybierz # kart.",
  ]);
  expect(bannedOpenings(descriptions, ["wybierz"])).toEqual([`- ${msgid} => Wybierz # kart.`]);
});

test("a label planted ending in a preposition its sheet rules out is caught", async () => {
  const rule = bannedLabelEndings(await Bun.file(styleSheetPath("pl")).text());

  expect(rule).toBeDefined();

  const labels = labelsIn(
    {
      "Notify for": { message: "Notify for", translation: "Powiadamiaj o" },
      "Hibernate after": { message: "Hibernate after", translation: "" },
    } as unknown as Catalog,
    await labelStrings(),
  );

  expect(labels.map(({ english }) => english)).toEqual(["Notify for", "Hibernate after"]);
  expect(prepositionEndings(labels, rule ?? { prepositions: [], allowed: new Map() })).toEqual([
    "- Notify for => Powiadamiaj o",
  ]);
  expect(
    bannedLabelEndings(
      "- **Setting label never ends with:** a preposition: _für_ _bei_. Allowed: Notify for _für_, its options nominative; Hibernate after _nach_, dative.",
    ),
  ).toEqual({
    prepositions: ["für", "bei"],
    allowed: new Map([
      ["Notify for", "für"],
      ["Hibernate after", "nach"],
    ]),
  });
});

test("an untranslated catalog, as a language's first commit has, trips no catalog guard", async () => {
  const [catalogPath] = SOURCE_CATALOGS as [string];

  const source = await parseCatalog(await Bun.file(catalogPath).text(), {
    locale: "en",
    sourceLocale: "en",
    filename: catalogPath,
  });

  // Every word the English uses is banned, so only an empty translation can pass.
  const findings = async (translation: (msgid: string) => string) => {
    const catalog = Object.fromEntries(
      Object.entries(source).map(([id, entry]) => [
        id,
        { ...entry, translation: translation(entry.message ?? id) },
      ]),
    ) as Catalog;

    const labels = labelsIn(catalog, await labelStrings());

    const descriptions = descriptionsIn(catalog, await descriptionSpans());

    const words = [
      ...new Set(
        [...labels, ...descriptions].flatMap(({ english }) =>
          [...english.matchAll(/\p{L}+/gu)].map(([word]) => word.toLocaleLowerCase()),
        ),
      ),
    ];

    return [
      ...prepositionEndings(labels, { prepositions: words, allowed: new Map() }),
      ...bannedOpenings(descriptions, words),
    ];
  };

  expect((await findings((msgid) => msgid)).length).toBeGreaterThan(0);
  expect(await findings(() => "")).toEqual([]);
});

test("a ban line reads the same without its lead-in, and one that lists nothing throws", async () => {
  const deLine = /^- \*\*Setting label never ends with:\*\* .*$/mu.exec(
    await Bun.file(styleSheetPath("de")).text(),
  )?.[0];

  expect(deLine).toBeDefined();

  const withoutLeadIn = bannedLabelEndings((deLine ?? "").replace(/(?<=\*\* )[^:]*: /u, ""));

  expect(withoutLeadIn).toEqual(bannedLabelEndings(deLine ?? ""));
  expect(
    prepositionEndings(
      [
        {
          msgid: "Notify for",
          context: undefined,
          english: "Notify for",
          translation: "Benachrichtigen bei",
        },
      ],
      withoutLeadIn ?? { prepositions: [], allowed: new Map() },
    ),
  ).toEqual(["- Notify for => Benachrichtigen bei"]);
  expect(
    bannedDescriptionOpeners(
      "- **Setting description never opens with:** Show _Zeige_; Hide _Blende_.",
    ),
  ).toEqual(
    new Map([
      ["Show", ["zeige"]],
      ["Hide", ["blende"]],
    ]),
  );
  expect(() => bannedLabelEndings("- **Setting label never ends with:** prepositions.")).toThrow();
  expect(() =>
    bannedLabelEndings("- **Setting label never ends with:** Allowed: Notify for _für_, why."),
  ).toThrow();
  expect(() =>
    bannedDescriptionOpeners("- **Setting description never opens with:** imperatives."),
  ).toThrow();
});

test("a Label forms section missing a kind, or a stub, is caught", () => {
  const stated = LABEL_KINDS.map((kind) => `- **${kind}:** the infinitive.`);

  expect(missingLabelForms(["## Label forms", "", ...stated, "", "## Next"].join("\n"))).toEqual(
    [],
  );
  expect(
    missingLabelForms(["## Label forms", "", ...stated.slice(1), "## Next", stated[0]].join("\n")),
  ).toEqual(["Button"]);
  expect(missingLabelForms("## Label forms\n\nDecided before the run.\n")).toEqual(LABEL_KINDS);
  expect(missingLabelForms("## Buttons and menu items\n")).toEqual(["## Label forms"]);
});

describe("language sidecars", () => {
  test("every style sheet has a sidecar, and every sidecar a style sheet", async () => {
    const sidecars = (await readdir(LANGUAGES_DIR))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length));

    expect(sidecars.sort()).toEqual([...locales].sort());
  });

  test("a table that differs from its sidecar's rows by one word is caught", async () => {
    const sidecar = await loadSidecar("fr");

    const changed = {
      ...sidecar,
      platformWords: {
        ...sidecar.platformWords,
        rows: sidecar.platformWords.rows.map((row, index) =>
          index === 0 ? { ...row, Linux: [{ word: "Dossier", labels: ["File"] }] } : row,
        ),
      },
    };

    const table = readGeneratedTable(await Bun.file(styleSheetPath("fr")).text(), "fr") ?? [];

    expect(tableCells(table)).not.toEqual(tableCells(renderPlatformTable(changed)));
  });

  test("a sidecar that gives two rules one id does not load", async () => {
    const sidecar = await Bun.file(sidecarPath("fr")).json();

    const planted = { ...sidecar, pinned: [...sidecar.pinned, { ...sidecar.pinned[0] }] };

    expect(duplicateRuleIds(planted)).toEqual([sidecar.pinned[0].id]);
    expect(sidecarSchema.safeParse(planted).success).toBe(false);
  });

  test("a rule's call is a one-line reason with its date", async () => {
    const sidecar = await Bun.file(sidecarPath("fr")).json();

    const withCall = (call: unknown) => ({
      ...sidecar,
      pinned: [{ ...sidecar.pinned[0], call }, ...sidecar.pinned.slice(1)],
    });

    expect(
      sidecarSchema.safeParse(
        withCall({ reason: "Chrome's word is Width's own", date: "2026-11-01" }),
      ).success,
    ).toBe(true);
    expect(sidecarSchema.safeParse(withCall({ reason: "No date" })).success).toBe(false);
    expect(
      sidecarSchema.safeParse(withCall({ reason: "Two\nlines", date: "2026-11-01" })).success,
    ).toBe(false);
    expect(
      sidecarSchema.safeParse(withCall({ reason: "A date", date: "1 November" })).success,
    ).toBe(false);
  });

  for (const locale of locales) {
    describe(locale, () => {
      test("gives every rule an id of its own", async () => {
        expect(duplicateRuleIds(await Bun.file(sidecarPath(locale)).json())).toEqual([]);
      });

      test("a rule whose reason records a call or an exception carries a call", async () => {
        const sidecar = await loadSidecar(locale);

        expect(
          [...sidecar.banned, ...sidecar.pinned]
            .filter((rule) => /\b(?:call|exception)\b/iu.test(rule.reason) && !rule.call)
            .map((rule) => rule.id),
        ).toEqual([]);
      });

      test("the style sheet's Platform words table is the one its sidecar writes", async () => {
        const table = readGeneratedTable(await Bun.file(styleSheetPath(locale)).text(), locale);

        expect(table, "the table's markers").toBeDefined();
        expect(tableCells(table ?? [])).toEqual(
          tableCells(renderPlatformTable(await loadSidecar(locale))),
        );
      });

      test("a filled sidecar covers every platform entry in the source catalogs, and no other", async () => {
        const entries = platformEntries(await loadSidecar(locale));

        if (entries.length === 0) {
          return;
        }

        const covered = [...new Set(entries.map((word) => `${word.msgctxt} ${word.msgid}`))].sort();

        expect(covered).toEqual(await sourcePlatformEntries());
      });

      test.if(SHIPPED_CATALOG_TAGS.includes(locale as CatalogTag))(
        "a shipped language's style sheet states the form of each kind of label",
        async () => {
          expect(missingLabelForms(await Bun.file(styleSheetPath(locale)).text())).toEqual([]);
        },
      );

      test("no Settings description opens with an imperative its sheet rules out", async () => {
        const openers = bannedDescriptionOpeners(await Bun.file(styleSheetPath(locale)).text());

        const descriptions = await catalogDescriptions(locale);

        if (openers.size === 0 || descriptions === undefined) {
          return;
        }

        expect(bannedOpenings(descriptions, [...openers.values()].flat())).toEqual([]);
      });

      test("no setting label ends in a preposition its sheet rules out", async () => {
        const rule = bannedLabelEndings(await Bun.file(styleSheetPath(locale)).text());

        const labels = await catalogLabels(locale);

        if (rule === undefined || labels === undefined) {
          return;
        }

        expect(prepositionEndings(labels, rule)).toEqual([]);
      });

      test("the never-opens-with line names every English verb a description opens with", async () => {
        const openers = bannedDescriptionOpeners(await Bun.file(styleSheetPath(locale)).text());

        const descriptions = await catalogDescriptions(locale);

        if (openers.size === 0 || descriptions === undefined) {
          return;
        }

        const missing = descriptions.flatMap(({ msgid, english }) => {
          const verb = englishOpener(english);

          return verb === undefined || openers.has(verb) ? [] : [`${verb}: ${msgid}`];
        });

        expect(missing).toEqual([]);
      });

      // Polish's Edit-menu Copy is Kopiuj on Windows and Skopiuj on Linux, so no one word could serve the context menu on both.
      test("the page context menu's Copy takes the Edit menu's word for Copy on Windows and Linux", async () => {
        const rows = (await loadSidecar(locale)).platformWords.rows;

        const wordsFor = (msgid: string) =>
          rows.flatMap((row) =>
            (["Windows", "Linux"] as const).flatMap((platform) => {
              const cell = row[platform];

              return typeof cell === "string"
                ? []
                : cell
                    .filter(({ labels = [] }) => labels.includes(msgid))
                    .map(({ word }) => `${platform} ${word}`);
            }),
          );

        expect(wordsFor("&Copy")).toHaveLength(2);
        expect(wordsFor("&Copy")).toEqual(wordsFor("Copy"));
      });

      // A table row that settles a sentence is copied into one, where a menu's ellipsis never belongs.
      test("a platform word that settles a sentence has no menu ellipsis", async () => {
        const sidecar = await loadSidecar(locale);

        const withEllipsis = sidecar.platformWords.rows.flatMap((row) =>
          PLATFORMS.flatMap((platform) => {
            const cell = row[platform];

            return typeof cell === "string"
              ? []
              : cell
                  .filter(({ word, sentences = [] }) => sentences.length > 0 && word.endsWith("…"))
                  .map(({ word }) => `${row.row} (${platform}): ${word}`);
          }),
        );

        expect(withEllipsis).toEqual([]);
      });
    });
  }
});
