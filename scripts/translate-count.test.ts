import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  androidPairs,
  APPS,
  CORPUS_DIR,
  electronChromium,
  HttpError,
  type Pair,
  parseAndroidStrings,
  parseDtd,
  parseFluent,
  parsePo,
  parseProperties,
  parseTbx,
  parseXtb,
  readCorpus,
  unpseudo,
} from "../.claude/skills/translate/corpus";
import {
  banCount,
  citedCount,
  countLines,
  pinCount,
  withoutAnchors,
} from "../.claude/skills/translate/count";
import { loadSidecar } from "../.claude/skills/translate/rules";
import {
  type Concept,
  CONCEPTS_PATH,
  conceptsLacking,
  conceptsSchema,
  formatMatched,
  pattern,
  vote,
} from "../.claude/skills/translate/vote";

/*
 * Lives here rather than beside the scripts because `bun test` never looks
 * inside a dot directory such as `.claude`. The fixture corpora are made up,
 * never copied from Chromium or the apps, and stand in for what corpus.ts
 * fetches, so nothing here reaches the network.
 */

const TRANSLATE_DIR = path.join(import.meta.dir, "../.claude/skills/translate");

const FIXTURES = path.join(TRANSLATE_DIR, "fixtures/corpus");

const glossary = await Bun.file(path.join(TRANSLATE_DIR, "glossary.md")).text();

async function frenchPin(id: string) {
  const rule = (await loadSidecar("fr")).pinned.find((candidate) => candidate.id === id);

  if (!rule) {
    throw new Error(`fr.json has no ${id} pin`);
  }

  return rule;
}

// The real corpus is in .cache only once corpus.ts has fetched it, which CI never does.
const cachedCorpora = await Promise.all(
  (await readdir(path.join(TRANSLATE_DIR, "languages")))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/u, ""))
    .map(
      async (tag) =>
        [tag, await Bun.file(path.join(CORPUS_DIR, `chrome.${tag}.jsonl`)).exists()] as const,
    ),
);

describe("count.ts", () => {
  test("reproduces the French release channel's recorded Chrome count from a fixture corpus", async () => {
    const rule = await frenchPin("release-channel");

    const count = pinCount(rule, await readCorpus(FIXTURES, "chrome", "fr"));

    expect([count.n, count.total]).toEqual([10, 11]);
    expect(citedCount(rule.reason)).toEqual({ n: 10, total: 11 });
    expect(glossary).toMatch(/^- fr: version de mise à jour;.*\(Chrome 10\/11\)$/mu);
  });

  test("a corpus with one more message whose English has the term counts it", async () => {
    const pairs: Pair[] = [
      ...(await readCorpus(FIXTURES, "chrome", "fr")),
      ["Leave the channel", "Quitter le canal"],
    ];

    const count = pinCount(await frenchPin("release-channel"), pairs);

    expect([count.n, count.total]).toEqual([10, 12]);
  });

  test("reads Chrome's straight apostrophe as the pin's curly one", async () => {
    const count = pinCount(await frenchPin("tab-strip"), [
      ["Collapse tab strip", "Réduire la barre d'onglets"],
      ["Tab strip", "Barre d’onglets"],
    ]);

    expect([count.n, count.total]).toEqual([2, 2]);
  });

  test("counts a pin by its msgid as a whole word, and by another Chrome term when told", async () => {
    const rule = await frenchPin("settings");

    const pairs: Pair[] = [
      ["Settings", "Paramètres"],
      ["Open settings", "Ouvrir les paramètres"],
      ["Settingsless", "Sans paramètres"],
      ["Site settings", "Réglages du site"],
    ];

    expect(pinCount(rule, pairs).total).toBe(3);
    expect(pinCount(rule, pairs).n).toBe(2);
    expect(pinCount(rule, pairs, { english: "^Site" }).total).toBe(1);
  });

  test("counts a pin by its countEnglish, an exact Chrome message, in place of its msgid", async () => {
    const rule = { ...(await frenchPin("settings")), countEnglish: "^Settings$" };

    const pairs: Pair[] = [
      ["Settings", "Paramètres"],
      ["&Settings", "&Paramètres"],
      ["Open settings", "Ouvrir les paramètres"],
    ];

    expect([pinCount(rule, pairs).n, pinCount(rule, pairs).total]).toEqual([2, 2]);
    expect(pinCount(rule, pairs, { english: "settings" }).total).toBe(3);
  });

  test("reads a single access key off both sides, and a doubled one as a literal ampersand", async () => {
    const rule = await frenchPin("settings");

    const pairs: Pair[] = [
      ["Setti&ngs", "Param&ètres"],
      ["Settings(&S)", "Paramètres(&P)"],
      ["Settings && more", "Paramètres && plus"],
    ];

    expect(pinCount({ ...rule, countEnglish: "^Settings$" }, pairs)).toMatchObject({
      n: 2,
      total: 2,
    });
    expect(pinCount({ ...rule, countEnglish: "^Settings & more$" }, pairs).total).toBe(1);
  });

  test("keeps the access keys, by the pin or when told, to tell a menu item from a plain label", async () => {
    const rule = { ...(await frenchPin("settings")), countEnglish: "^&Edit$" };

    const pairs: Pair[] = [
      ["&Edit", "&Édition"],
      ["Edit", "Modifier"],
    ];

    expect(pinCount(rule, pairs).total).toBe(0);
    expect(pinCount(rule, pairs, { keepAccessKeys: true }).total).toBe(1);
    expect(pinCount({ ...rule, countKeepAccessKeys: true }, pairs).total).toBe(1);
  });

  test("counts case-sensitively when told", async () => {
    const rule = { ...(await frenchPin("settings")), countEnglish: "^Settings$" };

    const pairs: Pair[] = [
      ["Settings", "Paramètres"],
      ["settings", "paramètres"],
    ];

    expect(pinCount(rule, pairs).total).toBe(2);
    expect(pinCount(rule, pairs, { caseSensitive: true })).toMatchObject({ n: 1, total: 1 });
  });

  for (const [tag, cached] of cachedCorpora) {
    test.skipIf(!cached)(
      `${tag}: a pin's countEnglish or countExpect reproduces the count its reason cites`,
      async () => {
        const pairs = await readCorpus(CORPUS_DIR, "chrome", tag);

        for (const rule of (await loadSidecar(tag)).pinned) {
          if (rule.countEnglish !== undefined || rule.countExpect !== undefined) {
            const count = pinCount(rule, pairs);

            expect({ n: count.n, total: count.total }, rule.id).toEqual(
              citedCount(rule.reason) as { n: number; total: number },
            );
          }
        }
      },
    );
  }

  test("counts a ban by the messages whose translation has the banned form", async () => {
    const rule = (await loadSidecar("fr")).banned.find((candidate) => candidate.id === "signet");

    if (!rule) {
      throw new Error("fr.json has no signet ban");
    }

    expect(
      banCount(rule, [
        ["Bookmarks", "Signets"],
        ["Bookmark", "Favori"],
      ]),
    ).toBe(1);
  });

  // A citation count.ts can't read prints "cites none", so --check would pass it unchecked.
  test("reads every Chrome count a sidecar's reason cites", async () => {
    const citesACount = /\(Chrome\b[^)]*\d|\bChrome:? (?:in )?\d+ ?(?:of|\/) ?\d+|banned form in/u;

    const unread: string[] = [];

    for (const [tag] of cachedCorpora) {
      const sidecar = await loadSidecar(tag);

      for (const rule of [...sidecar.pinned, ...sidecar.banned]) {
        if (citesACount.test(rule.reason) && citedCount(rule.reason) === undefined) {
          unread.push(`${tag} ${rule.id}: ${rule.reason}`);
        }
      }
    }

    expect(unread).toEqual([]);
  });

  test("reads a cited count in each form the sidecars write it", () => {
    expect(citedCount("as Chrome writes it (Chrome: 415 of 436 messages).")).toEqual({
      n: 415,
      total: 436,
    });
    expect(citedCount("(Chrome 21/21 in its macOS locale.pak)")).toEqual({ n: 21, total: 21 });
    expect(citedCount("and Chrome in 56 of 68 messages")).toEqual({ n: 56, total: 68 });
    expect(citedCount("(Chrome writes the banned form in none of its messages)")).toEqual({ n: 0 });
    expect(citedCount("(Chrome writes the banned form in 1 message)")).toEqual({ n: 1 });
    expect(citedCount("Glossary, agent-chosen.")).toBeUndefined();
  });

  test("marks a pin or ban whose count differs from the one its reason cites, for --check", async () => {
    const sidecar = await loadSidecar("fr");

    const pin = await frenchPin("release-channel");

    const pairs = await readCorpus(FIXTURES, "chrome", "fr");

    const lines = (rule: typeof pin) => countLines("fr", { pinned: [rule], banned: [] }, pairs);

    expect(lines(pin).map(({ differs }) => differs)).toEqual([false]);
    expect(lines({ ...pin, reason: "Glossary (Chrome: 9 of 11 messages)." })[0]?.text).toEndWith(
      "(differs)",
    );
    expect(lines({ ...pin, reason: "Glossary, agent-chosen." })[0]).toMatchObject({
      differs: false,
    });

    const ban = sidecar.banned.find((candidate) => candidate.id === "signet");

    if (!ban) {
      throw new Error("fr.json has no signet ban");
    }

    expect(
      countLines("fr", { pinned: [], banned: [ban] }, [["Bookmarks", "Signets"]])[0],
    ).toMatchObject({ differs: true });
  });

  test("takes only the anchors off an expect", () => {
    expect(withoutAnchors("^Paramètres$")).toBe("Paramètres");
    expect(withoutAnchors("costs \\$")).toBe("costs \\$");
  });
});

const concepts = conceptsSchema.parse(await Bun.file(CONCEPTS_PATH).json());

describe("vote.ts", () => {
  const notify = concepts.find((concept) => concept.concept === "notify");

  test("reproduces French notify's recorded seven-app vote from fixture corpora", async () => {
    if (!notify) {
      throw new Error("vote-concepts.json has no notify concept");
    }

    const corpora = Object.fromEntries(
      await Promise.all(
        APPS.map(async (app) => [app, await readCorpus(FIXTURES, app, "fr")] as const),
      ),
    );

    const result = vote(notify, "fr", corpora);

    expect(result.status).toBe("ok");
    expect(result.cite).toBe("notifier: 3 of 7 (VS Code, Android, Microsoft)");
    expect(result.votes.firefox).toEqual({ tie: ["informer", "avertir"] });
    expect(glossary).toContain("(agent-chosen: notifier: 3 of 7 (VS Code, Android, Microsoft);");
  });

  test("leaves a word another concept uses out, and a message it matches longest with it", () => {
    const concept = {
      concept: "toast",
      english: "\\btoasts?\\b",
      candidates: { fr: { toast: "toast", notification: "notification" } },
      exclude: { fr: ["notification"] },
    };

    const result = vote(concept, "fr", {
      microsoft: [
        ["toast notification", "notification toast"],
        ["toast", "toast"],
      ],
      vscode: [["toast", "notification"]],
    });

    expect(result.votes).toEqual({ microsoft: { word: "toast" } });
    expect(result.status).toBe("fewer than 3 apps");
  });

  test("keeps each app's messages under the candidate each counted for", () => {
    const concept = {
      concept: "toast",
      english: "\\btoasts?\\b",
      candidates: { fr: { toast: "toast", notification: "notification" } },
      exclude: { fr: ["notification"] },
    };

    const result = vote(concept, "fr", {
      microsoft: [
        ["toast notification", "notification toast"],
        ["toast", "toast"],
        ["toast", "toast"],
      ],
    });

    expect(result.matched).toEqual({
      microsoft: {
        notification: [["toast notification", "notification toast"]],
        toast: [["toast", "toast"]],
      },
    });
    expect(formatMatched(result.matched, ["notification"])).toEqual([
      "    Microsoft:",
      "      toast (1):",
      "        toast => toast",
      "      notification (1, excluded):",
      "        toast notification => notification toast",
    ]);
  });

  test("gives `\\b` the letters with accents as word characters", () => {
    expect(pattern("\\bavis\\b").test("Un avis")).toBe(true);
    expect(pattern("\\bavis\\b").test("Avisé")).toBe(false);
  });

  test("lists the concepts that have no candidate words for a language", () => {
    const sample: Concept[] = [
      { concept: "notify", english: "notif", candidates: { fr: { notifier: "notifi" } } },
      { concept: "toast", english: "toast", candidates: { de: { Hinweis: "hinweis" } } },
    ];

    expect(conceptsLacking(sample, "fr")).toEqual(["toast"]);
    expect(conceptsLacking(sample, "sv")).toEqual(["notify", "toast"]);
  });

  test("every concept names a candidate in a language it is voted in", () => {
    for (const concept of concepts) {
      for (const [tag, candidates] of Object.entries(concept.candidates)) {
        expect(Object.keys(candidates).length, `${concept.concept} ${tag}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("corpus.ts", () => {
  const run = (exitCode: number | null, stdout = "", signalCode: string | null = null) => ({
    exitCode,
    signalCode,
    stdout,
    stderr: "",
  });

  test("reads Electron's Chromium version again when the first read fails", () => {
    const results = [run(null, "", "SIGKILL"), run(0, "156.0.8078.49\n")];

    expect(electronChromium(() => results.shift() ?? run(1))).toBe("156.0.8078.49");
    expect(results).toEqual([]);
  });

  test("names each failed read's exit code or signal", () => {
    const results = [run(null, "", "SIGKILL"), run(1)];

    expect(() => electronChromium(() => results.shift() ?? run(1))).toThrow(
      /signal SIGKILL.*exit code 1/su,
    );
  });
});

describe("corpus.ts android", () => {
  const strings = (value: string) => `<string name="remove">${value}</string>`;

  /** AOSP as a map of repository and path to file, every other file a 404. */
  const reader = (files: Record<string, string>) => async (repo: string, file: string) => {
    const text = files[`${repo} ${file}`];

    if (text === undefined) {
      throw new HttpError(`${repo}/${file}`, 404);
    }

    return text;
  };

  const english = {
    "platform/packages/apps/Settings res/values/strings.xml": strings("Remove"),
    "platform/packages/apps/Messaging res/values/strings.xml": strings("Remove"),
  };

  test("reads Brazilian Portuguese from values-pt where an app has no values-pt-rBR", async () => {
    const pairs = await androidPairs(
      "pt-BR",
      reader({
        ...english,
        "platform/packages/apps/Settings res/values-pt-rBR/strings.xml": strings('"Remover"'),
        "platform/packages/apps/Settings res/values-pt/strings.xml": strings('"Excluir"'),
        "platform/packages/apps/Messaging res/values-pt/strings.xml": strings('"Remover"'),
      }),
      () => undefined,
    );

    expect(pairs).toEqual([
      ["Remove", "Remover"],
      ["Remove", "Remover"],
    ]);
  });

  test("skips an app without the language, with a warning, and keeps the others", async () => {
    const warnings: string[] = [];

    const pairs = await androidPairs(
      "pt-BR",
      reader({
        ...english,
        "platform/packages/apps/Settings res/values-pt/strings.xml": strings('"Remover"'),
      }),
      (message) => warnings.push(message),
    );

    expect(pairs).toEqual([["Remove", "Remover"]]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        "android pt-BR: platform/packages/apps/Messaging has no res/values-pt-rBR/strings.xml or res/values-pt/strings.xml; skipping it",
      ]),
    );
  });

  test("still fails on an error other than a missing file", async () => {
    const failing = async () => {
      throw new HttpError("android.googlesource.com", 503);
    };

    await expect(androidPairs("de", failing, () => undefined)).rejects.toThrow("HTTP 503");
  });
});

describe("corpus.ts parsers", () => {
  test("an .xtb file's translations, placeholders as {}", () => {
    expect([
      ...parseXtb(
        '<translationbundle><translation id="1">Ouvrir <ph name="NAME" /> &amp; fermer</translation><translation id="2">Oui</translation></translationbundle>',
      ),
    ]).toEqual([
      ["1", "Ouvrir {} & fermer"],
      ["2", "Oui"],
    ]);
  });

  test("Fluent messages, attributes and continued lines", () => {
    expect([
      ...parseFluent(
        "# comment\nopen = Open\n    the window\nmenu =\n    .label = Menu\n    .accesskey = M\n",
      ),
    ]).toEqual([
      ["open", "Open the window"],
      ["menu", ""],
      ["menu.label", "Menu"],
      ["menu.accesskey", "M"],
    ]);
  });

  test("properties, DTD entities and Android strings by key", () => {
    expect([...parseProperties("# c\nclose.label = Close\n")]).toEqual([["close.label", "Close"]]);
    expect([...parseDtd('<!ENTITY close.label "Close">')]).toEqual([["close.label", "Close"]]);
    expect([
      ...parseAndroidStrings(
        '<string name="open" translatable="true">Open <b>it</b>, don\\\'t &amp; go</string>',
      ),
    ]).toEqual([["open", "Open it, don't & go"]]);
  });

  test("Android strings without the pair of quotes a translation is wrapped in", () => {
    expect([
      ...parseAndroidStrings(
        [
          '<string name="remove" msgid="1">"Quitar"</string>',
          '<string name="quoted">"\\"Sí\\""</string>',
          '<string name="apostrophe">"l\\\'app"</string>',
          '<string name="inner">Say \\"hi\\"</string>',
        ].join("\n"),
      ),
    ]).toEqual([
      ["remove", "Quitar"],
      ["quoted", '"Sí"'],
      ["apostrophe", "l'app"],
      ["inner", 'Say "hi"'],
    ]);
  });

  test("PO pairs with continued lines and escapes", () => {
    expect(
      parsePo(
        'msgid ""\nmsgstr "header"\n\nmsgid "Save "\n"as"\nmsgstr "Enregistrer \\"sous\\""\n',
      ),
    ).toEqual([
      ["", "header"],
      ["Save as", 'Enregistrer "sous"'],
    ]);
  });

  test("each English TBX term with each translation", () => {
    expect(
      parseTbx(
        '<termEntry id="1"><langSet xml:lang="en-US"><tig><term id="1">toast</term></tig></langSet><langSet xml:lang="fr-fr"><tig><term id="2">toast</term></tig><tig><term id="3">notification</term></tig></langSet></termEntry>',
      ),
    ).toEqual([
      ["toast", "toast"],
      ["toast", "notification"],
    ]);
  });

  test("VS Code's pseudo-locale read back as English", () => {
    expect(unpseudo("§ëttïñgs Ëðïtør")).toBe("Settings Editor");
    expect(unpseudo("Æççëssïþïlïtÿ £æst µsëð")).toBe("Accessibility Last used");
  });
});
