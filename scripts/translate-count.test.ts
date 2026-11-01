import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  APPS,
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
import { banCount, citedCount, pinCount, withoutAnchors } from "../.claude/skills/translate/count";
import { loadSidecar } from "../.claude/skills/translate/rules";
import { CONCEPTS_PATH, conceptsSchema, pattern, vote } from "../.claude/skills/translate/vote";

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

  test("gives `\\b` the letters with accents as word characters", () => {
    expect(pattern("\\bavis\\b").test("Un avis")).toBe(true);
    expect(pattern("\\bavis\\b").test("Avisé")).toBe(false);
  });

  test("every concept names a candidate in a language it is voted in", () => {
    for (const concept of concepts) {
      for (const [tag, candidates] of Object.entries(concept.candidates)) {
        expect(Object.keys(candidates).length, `${concept.concept} ${tag}`).toBeGreaterThan(0);
      }
    }
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
