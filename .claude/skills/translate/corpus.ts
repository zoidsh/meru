import { readdirSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { CATALOG_TAGS } from "../../../packages/shared/i18n/tags";
import { LANGUAGES_DIR } from "./rules";

/*
 * Fetches the translations a Chrome count and the seven-app vote read, as
 * `counting.md` describes, into `.cache/translate`, which git ignores: nothing
 * of these texts is checked in, only the words and counts a rule cites. Each
 * source becomes `corpus/<app>.<tag>.jsonl`, one `[english, translation]` pair
 * per line, which `count.ts` and `vote.ts` read.
 */

export const ROOT = path.join(import.meta.dir, "../../..");

export const CACHE_DIR = path.join(ROOT, ".cache/translate");

export const CORPUS_DIR = path.join(CACHE_DIR, "corpus");

const RAW_DIR = path.join(CACHE_DIR, "raw");

/** The seven apps of the source order's step 4c, in the order a tally names them. */
export const APPS = [
  "thunderbird",
  "firefox",
  "vscode",
  "android",
  "libreoffice",
  "microsoft",
  "apple",
] as const;

export type App = (typeof APPS)[number];

export const APP_NAMES: Record<App, string> = {
  thunderbird: "Thunderbird",
  firefox: "Firefox",
  vscode: "VS Code",
  android: "Android",
  libreoffice: "LibreOffice",
  microsoft: "Microsoft",
  apple: "Apple",
};

/*
 * GNOME is the operating system's own words on Linux, the source order's step
 * 1, so it is counted like Chrome but never votes.
 */
export const SOURCES = ["chrome", ...APPS, "gnome"] as const;

export type Source = (typeof SOURCES)[number];

export type Pair = [english: string, translation: string];

/*
 * Each source's name for a Meru tag. A source without the language, such as
 * VS Code without Dutch or Swedish, has none, and votes for nothing there;
 * Microsoft's one Spanish stands for both of Meru's.
 */
const CODES: Record<Exclude<Source, "apple">, Record<string, string>> = {
  chrome: {
    de: "de",
    fr: "fr",
    it: "it",
    es: "es",
    "es-419": "es-419",
    "pt-BR": "pt-BR",
    nl: "nl",
    pl: "pl",
    sv: "sv",
    ja: "ja",
  },
  firefox: {
    de: "de",
    fr: "fr",
    it: "it",
    es: "es-ES",
    "es-419": "es-MX",
    "pt-BR": "pt-BR",
    nl: "nl",
    pl: "pl",
    sv: "sv-SE",
    ja: "ja",
  },
  thunderbird: {
    de: "de",
    fr: "fr",
    it: "it",
    es: "es-ES",
    "es-419": "es-AR",
    "pt-BR": "pt-BR",
    nl: "nl",
    pl: "pl",
    sv: "sv-SE",
    ja: "ja",
  },
  vscode: {
    de: "de",
    fr: "fr",
    it: "it",
    es: "es",
    "es-419": "es",
    "pt-BR": "pt-BR",
    pl: "pl",
    ja: "ja",
  },
  android: {
    de: "-de",
    fr: "-fr",
    it: "-it",
    es: "-es",
    "es-419": "-es-rUS",
    "pt-BR": "-pt-rBR",
    nl: "-nl",
    pl: "-pl",
    sv: "-sv",
    ja: "-ja",
  },
  libreoffice: {
    de: "de",
    fr: "fr",
    it: "it",
    es: "es",
    "es-419": "es",
    "pt-BR": "pt-BR",
    nl: "nl",
    pl: "pl",
    sv: "sv",
    ja: "ja",
  },
  microsoft: {
    de: "GERMAN",
    fr: "FRENCH",
    it: "ITALIAN",
    es: "SPANISH",
    "es-419": "SPANISH",
    "pt-BR": "PORTUGUESE (BRAZIL)",
    nl: "DUTCH",
    pl: "POLISH",
    sv: "SWEDISH",
    ja: "JAPANESE",
  },
  gnome: {
    de: "de",
    fr: "fr",
    it: "it",
    es: "es",
    "es-419": "es",
    "pt-BR": "pt_BR",
    nl: "nl",
    pl: "pl",
    sv: "sv",
    ja: "ja",
  },
};

const APPLE_CODES: Record<string, string> = { "es-419": "es_419", "pt-BR": "pt_BR" };

/** Every tag Meru has a catalog or a sidecar for, English, the source, aside. */
export const TAGS = [
  ...new Set([
    ...CATALOG_TAGS,
    ...readdirSync(LANGUAGES_DIR)
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length)),
  ]),
].filter((tag) => tag !== "en");

/** The tags of `tags` that aren't Meru's, which a caller refuses rather than read as empty. */
export function unknownTags(tags: string[]) {
  return tags.filter((tag) => !TAGS.includes(tag));
}

/** A source's name for a Meru tag, or undefined when it lacks the language. */
export function sourceCode(source: Exclude<Source, "apple">, tag: string): string | undefined {
  return CODES[source][tag];
}

/** Whether a source has the language at all, so a missing corpus is never one to build. */
export function hasLanguage(source: Source, tag: string) {
  return source === "apple" ? TAGS.includes(tag) : CODES[source][tag] !== undefined;
}

export const SOURCE_NAMES: Record<Source, string> = {
  chrome: "Chrome",
  ...APP_NAMES,
  gnome: "GNOME",
};

export async function readCorpus(dir: string, source: Source, tag: string): Promise<Pair[]> {
  const file = Bun.file(path.join(dir, `${source}.${tag}.jsonl`));

  if (!(await file.exists())) {
    return [];
  }

  return (await file.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Pair);
}

function unescapeXml(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

/** An `.xtb` file's translations by message id, each placeholder as `{}`. */
export function parseXtb(text: string) {
  const out = new Map<string, string>();

  for (const [, id, body] of text.matchAll(
    /<translation id="(\d+)"[^>]*>(.*?)<\/translation>/gsu,
  )) {
    out.set(id as string, unescapeXml((body as string).replace(/<ph[^>]*\/>/gu, "{}")));
  }

  return out;
}

/** A Fluent file's messages and attributes, a multiline value joined by spaces. */
export function parseFluent(text: string) {
  const out = new Map<string, string>();

  let message: string | undefined;

  let key: string | undefined;

  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const head = /^(-?[A-Za-z][\w-]*)\s*=\s?(.*)$/u.exec(line);

    if (head) {
      message = key = head[1] as string;
      out.set(key, head[2] as string);

      continue;
    }

    const attribute = /^\s+\.([\w-]+)\s*=\s?(.*)$/u.exec(line);

    if (attribute && message) {
      key = `${message}.${attribute[1]}`;
      out.set(key, attribute[2] as string);

      continue;
    }

    if (/^[ \t]/u.test(line) && key) {
      out.set(key, `${out.get(key) ?? ""} ${line.trim()}`.trim());
    }
  }

  return out;
}

export function parseProperties(text: string) {
  const out = new Map<string, string>();

  for (const line of text.split("\n")) {
    const match = /^\s*([^#!=\s][^=]*?)\s*=\s*(.*)$/u.exec(line);

    if (match) {
      out.set(match[1] as string, match[2] as string);
    }
  }

  return out;
}

export function parseDtd(text: string) {
  return new Map(
    [...text.matchAll(/<!ENTITY\s+([\w.-]+)\s+"([^"]*)"/gu)].map(
      ([, key, value]) => [key, value] as [string, string],
    ),
  );
}

const ANDROID_ESCAPES: Record<string, string> = { n: "\n", t: "\t" };

/*
 * An Android `strings.xml`'s strings by name, markup and escapes taken out.
 * AOSP's translations wrap every string in a pair of unescaped quotes, which
 * Android drops, and a candidate anchored to the whole message never matches
 * a translation that still has them.
 */
export function parseAndroidStrings(text: string) {
  const out = new Map<string, string>();

  for (const [, name, value] of text.matchAll(/<string name="([^"]+)"[^>]*>(.*?)<\/string>/gsu)) {
    out.set(
      name as string,
      unescapeXml((value as string).replace(/<[^>]+>/gu, ""))
        .trim()
        .replace(/^"(.*)(?<!\\)"$/su, "$1")
        .replace(/\\(u[\dA-Fa-f]{4}|.)/gsu, (_, escape: string) =>
          escape.length === 5
            ? String.fromCodePoint(Number.parseInt(escape.slice(1), 16))
            : (ANDROID_ESCAPES[escape] ?? escape),
        ),
    );
  }

  return out;
}

/** One PO entry, its `msgctxt` kept, as `platform-word.ts` cites a GNOME message by it. */
export type PoEntry = { msgctxt?: string; msgid: string; msgstr: string };

/*
 * A PO file's entries, header and empty translations included. A fuzzy entry
 * is left out: it is a guess no translator has reviewed, which the app never
 * shows, so it has no vote.
 */
export function parsePoEntries(text: string): PoEntry[] {
  const unquote = (lines: string) =>
    [...lines.matchAll(/"((?:[^"\\]|\\.)*)"/gu)]
      .map(([, part]) =>
        (part as string).replace(/\\(.)/gu, (_, char: string) =>
          char === "n" ? "\n" : char === "t" ? "\t" : char,
        ),
      )
      .join("");

  const field = (block: string, name: string) =>
    new RegExp(`^${name} ("(?:[^"\\\\]|\\\\.)*"(?:\\n"(?:[^"\\\\]|\\\\.)*")*)`, "mu").exec(
      block,
    )?.[1];

  return text.split("\n\n").flatMap((block): PoEntry[] => {
    if (/^#,.*\bfuzzy\b/mu.test(block)) {
      return [];
    }

    const id = field(block, "msgid");

    const str = field(block, "msgstr");

    if (id === undefined || str === undefined) {
      return [];
    }

    const context = field(block, "msgctxt");

    return [
      {
        ...(context === undefined ? {} : { msgctxt: unquote(context) }),
        msgid: unquote(id),
        msgstr: unquote(str),
      },
    ];
  });
}

/** A PO file's msgid and msgstr pairs. */
export function parsePo(text: string): Pair[] {
  return parsePoEntries(text).map(({ msgid, msgstr }): Pair => [msgid, msgstr]);
}

/** One concept of a Microsoft TBX: its id, its English definition, and its terms. */
export type TbxEntry = { id: string; definition?: string; english: string[]; translated: string[] };

export function parseTbxEntries(text: string): TbxEntry[] {
  const entries: TbxEntry[] = [];

  for (const [, id, body] of text.matchAll(/<termEntry id="([^"]*)"[^>]*>(.*?)<\/termEntry>/gsu)) {
    const sets = [...(body as string).matchAll(/<langSet xml:lang="([^"]+)">(.*?)<\/langSet>/gsu)];

    const termsOf = (set: string) =>
      [...set.matchAll(/<term id="\d+">(.*?)<\/term>/gu)].map(([, term]) =>
        unescapeXml(term as string),
      );

    const english = sets.filter(([, lang]) => lang === "en-US");

    const definition = english
      .map(([, , set]) => /<descrip type="definition">(.*?)<\/descrip>/su.exec(set as string)?.[1])
      .find((text) => text !== undefined);

    entries.push({
      id: id as string,
      ...(definition === undefined ? {} : { definition: unescapeXml(definition) }),
      english: english.flatMap(([, , set]) => termsOf(set as string)),
      translated: sets
        .filter(([, lang]) => lang !== "en-US")
        .flatMap(([, , set]) => termsOf(set as string)),
    });
  }

  return entries;
}

/** Every English term of a Microsoft TBX with each of its translations. */
export function parseTbx(text: string): Pair[] {
  return parseTbxEntries(text).flatMap(({ english, translated }) =>
    english.flatMap((term) => translated.map((translation): Pair => [term, translation])),
  );
}

/*
 * The letters VS Code's pseudo-locale writes for others, besides the accented
 * ones NFD takes apart: Keyboard is Këÿþøærð, Settings §ëttïñgs, Last £æst.
 */
const PSEUDO_LETTERS: Record<string, string> = {
  æ: "a",
  Æ: "A",
  ø: "o",
  Ø: "O",
  ð: "d",
  Ð: "D",
  þ: "b",
  ß: "B",
  µ: "u",
  "§": "S",
  "£": "L",
};

/** VS Code's pseudo-locale read back as English, which vscode-loc has no file of. */
export function unpseudo(text: string) {
  return text
    .replace(/[æÆøØðÐþßµ§£]/gu, (char) => PSEUDO_LETTERS[char] ?? char)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
}

function aligned(english: Map<string, string>, translated: Map<string, string>): Pair[] {
  return [...english].flatMap(([key, value]): Pair[] => {
    const translation = translated.get(key);

    return translation === undefined ? [] : [[value, translation]];
  });
}

export class HttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`${url}: HTTP ${status}`);
  }
}

async function fetchText(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new HttpError(url, response.status);
  }

  return response.text();
}

/** Downloads once, into the raw cache, and reads it from there afterwards. */
async function cached(
  name: string,
  url: string,
  decode: (text: string) => string = (text) => text,
) {
  const file = Bun.file(path.join(RAW_DIR, name));

  if (await file.exists()) {
    return file.text();
  }

  const text = decode(await fetchText(url));

  await Bun.write(file, text);

  return text;
}

function run(command: string[], cwd: string) {
  const result = Bun.spawnSync(command, { cwd, stdout: "ignore", stderr: "pipe" });

  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")}: ${result.stderr.toString().trim()}`);
  }
}

/** A shallow clone holding only `paths`, made once and widened when a later run needs more. */
async function sparseClone(url: string, name: string, paths: string[]) {
  const dir = path.join(RAW_DIR, name);

  if (!(await Bun.file(path.join(dir, ".git/HEAD")).exists())) {
    await mkdir(RAW_DIR, { recursive: true });
    run(
      ["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", url, name],
      RAW_DIR,
    );
  }

  run(["git", "sparse-checkout", "add", ...paths], dir);

  return dir;
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

const MOZILLA_PARSERS: [string, (text: string) => Map<string, string>][] = [
  [".ftl", parseFluent],
  [".properties", parseProperties],
  [".dtd", parseDtd],
];

/** Mozilla's files aligned by path and key with the English source. */
async function mozillaPairs(sourceDir: string, localeDir: string) {
  const pairs: Pair[] = [];

  for (const file of await filesUnder(sourceDir)) {
    const parser = MOZILLA_PARSERS.find(([extension]) => file.endsWith(extension))?.[1];

    const translated = Bun.file(path.join(localeDir, file));

    if (!parser || file.startsWith(".git") || !(await translated.exists())) {
      continue;
    }

    pairs.push(
      ...aligned(
        parser(await readFile(path.join(sourceDir, file), "utf8")),
        parser(await translated.text()),
      ),
    );
  }

  return pairs;
}

async function chrome(tag: string, chromium: string) {
  const host = `https://raw.githubusercontent.com/chromium/chromium/${chromium}`;

  const read = async (lang: string) => {
    const out = new Map<string, string>();

    for (const file of [
      "chrome/app/resources/generated_resources",
      "components/strings/components_strings",
      "ui/strings/translations/ui_strings",
    ]) {
      const name = `chromium-${chromium}/${path.basename(file)}_${lang}.xtb`;

      for (const [id, text] of parseXtb(await cached(name, `${host}/${file}_${lang}.xtb`))) {
        out.set(`${file}:${id}`, text);
      }
    }

    return out;
  };

  const code = CODES.chrome[tag];

  return code ? aligned(await read("en-GB"), await read(code)) : [];
}

async function mozilla(app: "firefox" | "thunderbird", tag: string) {
  const code = CODES[app][tag];

  if (!code) {
    return [];
  }

  const [sourceRepo, localeRepo, sourcePaths] =
    app === "firefox"
      ? [
          "mozilla-l10n/firefox-l10n-source",
          "mozilla-l10n/firefox-l10n",
          ["browser", "toolkit", "dom", "netwerk", "devtools/client", "services"],
        ]
      : [
          "thunderbird/thunderbird-l10n-source",
          "thunderbird/thunderbird-l10n",
          ["mail", "chat", "calendar"],
        ];

  const source = await sparseClone(
    `https://github.com/${sourceRepo}.git`,
    `${app}-source`,
    sourcePaths,
  );

  const locales = await sparseClone(`https://github.com/${localeRepo}.git`, `${app}-l10n`, [code]);

  return mozillaPairs(source, path.join(locales, code));
}

async function vscode(tag: string) {
  const code = CODES.vscode[tag];

  if (!code) {
    return [];
  }

  const dir = await sparseClone("https://github.com/microsoft/vscode-loc.git", "vscode-loc", [
    "i18n/vscode-language-pack-qps-ploc",
    `i18n/vscode-language-pack-${code}`,
  ]);

  const read = async (pack: string) => {
    const out = new Map<string, string>();

    const packDir = path.join(dir, "i18n", pack);

    for (const file of (await filesUnder(packDir)).filter((name) => name.endsWith(".json"))) {
      const contents: Record<string, Record<string, unknown>> = (
        await Bun.file(path.join(packDir, file)).json()
      ).contents ?? {};

      for (const [module, entries] of Object.entries(contents)) {
        for (const [key, value] of Object.entries(entries)) {
          if (typeof value === "string") {
            out.set(`${file}\u0000${module}\u0000${key}`, value);
          }
        }
      }
    }

    return out;
  };

  const english = new Map(
    [...(await read("vscode-language-pack-qps-ploc"))].map(([key, value]) => [
      key,
      unpseudo(value),
    ]),
  );

  return aligned(english, await read(`vscode-language-pack-${code}`));
}

const ANDROID_FILES: [string, string][] = [
  ["platform/packages/apps/Settings", "res/values{}/strings.xml"],
  ["platform/frameworks/base", "packages/SystemUI/res/values{}/strings.xml"],
  ["platform/frameworks/base", "core/res/res/values{}/strings.xml"],
  ["platform/packages/apps/Messaging", "res/values{}/strings.xml"],
  ["platform/packages/apps/Email", "res/values{}/strings.xml"],
];

/*
 * AOSP keeps Brazilian Portuguese in `values-pt`, European in `values-pt-rPT`,
 * and only some apps have a `values-pt-rBR` besides.
 */
const ANDROID_FALLBACKS: Record<string, string[]> = { "-pt-rBR": ["-pt"] };

/** The text `read` gives, or undefined when its file is missing. */
async function unlessMissing(read: () => Promise<string>) {
  try {
    return await read();
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

/** Reads one of AOSP's files by repository and path, throwing an `HttpError` when it has none. */
export type AndroidReader = (repo: string, file: string) => Promise<string>;

/*
 * Every AOSP app's strings for a tag. An app without the language, under its
 * own suffix or a fallback, is skipped with a warning rather than failing the
 * whole corpus, so one missing file never costs the other apps their vote.
 */
export async function androidPairs(
  tag: string,
  read: AndroidReader,
  warn: (message: string) => void = console.warn,
) {
  const suffix = CODES.android[tag];

  if (!suffix) {
    return [];
  }

  const suffixes = [suffix, ...(ANDROID_FALLBACKS[suffix] ?? [])];

  // The first of the paths that exists, or undefined when AOSP has none of them.
  const first = async (repo: string, files: string[]) => {
    for (const file of files) {
      const text = await unlessMissing(() => read(repo, file));

      if (text !== undefined) {
        return text;
      }
    }

    return undefined;
  };

  const pairs: Pair[] = [];

  for (const [repo, file] of ANDROID_FILES) {
    const englishFile = file.replace("{}", "");

    const translatedFiles = suffixes.map((candidate) => file.replace("{}", candidate));

    const english = await first(repo, [englishFile]);

    const translated = english === undefined ? undefined : await first(repo, translatedFiles);

    if (english === undefined || translated === undefined) {
      warn(
        `android ${tag}: ${repo} has no ${english === undefined ? englishFile : translatedFiles.join(" or ")}; skipping it`,
      );

      continue;
    }

    pairs.push(...aligned(parseAndroidStrings(english), parseAndroidStrings(translated)));
  }

  return pairs;
}

function android(tag: string) {
  return androidPairs(tag, (repo, file) =>
    cached(
      `android/${repo.replaceAll("/", "_")}/${file.replaceAll("/", "_")}`,
      `https://android.googlesource.com/${repo}/+/refs/heads/main/${file}?format=TEXT`,
      (base64) => Buffer.from(base64, "base64").toString("utf8"),
    ),
  );
}

async function libreoffice(tag: string) {
  const code = CODES.libreoffice[tag];

  if (!code) {
    return [];
  }

  const dir = await sparseClone("https://github.com/LibreOffice/translations.git", "libreoffice", [
    `source/${code}`,
  ]);

  const pairs: Pair[] = [];

  for (const file of (await filesUnder(path.join(dir, "source", code))).filter((name) =>
    name.endsWith(".po"),
  )) {
    pairs.push(...parsePo(await readFile(path.join(dir, "source", code, file), "utf8")));
  }

  return pairs;
}

/** GNOME's toolkit and the core apps whose words Linux users see around Meru. */
export const GNOME_PROJECTS = ["gtk", "nautilus", "gnome-text-editor", "gnome-control-center"];

/** Reads one GNOME project's PO file for a GNOME language code, throwing an `HttpError` when it has none. */
export type GnomeReader = (project: string, code: string) => Promise<string>;

/*
 * Every GNOME project's translations for a tag. A project without the
 * language is skipped with a warning, as an Android app is.
 */
export async function gnomePairs(
  tag: string,
  read: GnomeReader,
  warn: (message: string) => void = console.warn,
) {
  const code = CODES.gnome[tag];

  if (!code) {
    return [];
  }

  const pairs: Pair[] = [];

  for (const project of GNOME_PROJECTS) {
    const text = await unlessMissing(() => read(project, code));

    if (text === undefined) {
      warn(`gnome ${tag}: ${project} has no po/${code}.po; skipping it`);

      continue;
    }

    pairs.push(...parsePo(text).filter(([english]) => english !== ""));
  }

  return pairs;
}

/** GNOME's PO file for a project, downloaded once into the raw cache. */
export const readGnomePo: GnomeReader = (project, code) =>
  cached(
    `gnome/${project}.${code}.po`,
    `https://gitlab.gnome.org/GNOME/${project}/-/raw/main/po/${code}.po`,
  );

function gnome(tag: string) {
  return gnomePairs(tag, readGnomePo);
}

const TBX_ZIP =
  "https://download.microsoft.com/download/b/2/d/b2db7a7c-8d33-47f3-b2c1-ee5e6445cf45/MicrosoftTermCollection.zip";

/*
 * The path of a tag's TBX, or undefined when Microsoft has no such language.
 * Every language Meru has is unpacked at once, so a later lookup in another
 * one finds it already there.
 */
export async function tbxPath(tag: string) {
  const name = CODES.microsoft[tag];

  if (!name) {
    return undefined;
  }

  const dir = path.join(RAW_DIR, "microsoft");

  const zip = path.join(dir, "MicrosoftTermCollection.zip");

  const missing: string[] = [];

  for (const file of new Set(Object.values(CODES.microsoft).map((code) => `${code}.tbx`))) {
    if (!(await Bun.file(path.join(dir, file)).exists())) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    if (!(await Bun.file(zip).exists())) {
      const response = await fetch(TBX_ZIP);

      if (!response.ok) {
        throw new Error(`${TBX_ZIP}: HTTP ${response.status}`);
      }

      await Bun.write(zip, response);
    }

    run(["unzip", "-o", "-q", zip, ...missing, "-d", dir], dir);
  }

  return path.join(dir, `${name}.tbx`);
}

async function microsoft(tag: string) {
  const tbx = await tbxPath(tag);

  return tbx === undefined ? [] : parseTbx(await Bun.file(tbx).text());
}

type Plist = Record<string, Record<string, unknown>>;

/** A property list as JSON, or undefined when `plutil` can't read it. */
function readPlist(file: string): Plist | undefined {
  const result = Bun.spawnSync(["plutil", "-convert", "json", "-o", "-", file], {
    stdout: "pipe",
    stderr: "ignore",
  });

  return result.exitCode === 0 ? JSON.parse(result.stdout.toString()) : undefined;
}

/** This Mac's own `.loctable`s, its apps' and settings', which only macOS has. */
async function apple(tag: string) {
  if (process.platform !== "darwin") {
    console.error("apple: skipped, since only macOS has its .loctable files");

    return [];
  }

  const code = APPLE_CODES[tag] ?? tag;

  const roots = ["/System/Applications", "/System/Library/ExtensionKit/Extensions"];

  const pairs: Pair[] = [];

  for (const root of roots) {
    for (const file of (await filesUnder(root)).filter((name) => name.endsWith(".loctable"))) {
      const tables = readPlist(path.join(root, file));

      if (tables === undefined) {
        continue;
      }

      const english = tables.en ?? tables.Base ?? {};

      const translated = tables[code] ?? {};

      for (const [key, value] of Object.entries(english)) {
        const translation = translated[key];

        if (typeof value === "string" && typeof translation === "string") {
          pairs.push([value, translation]);
        }
      }
    }
  }

  return pairs;
}

/** One string of an Apple bundle, by the bundle, table and key a style sheet cites it with. */
export type AppleString = {
  bundle: string;
  table: string;
  key: string;
  english: string;
  translation: string;
};

/*
 * The bundles a platform row takes its macOS words from, by the names the
 * style sheets cite. AppKit and Mail keep every language of a table in one
 * `.loctable`; WebKit's page context menu is WebCore's `Localizable.strings`,
 * one `<language>.lproj` each.
 */
export const APPLE_BUNDLES = [
  {
    name: "AppKit",
    dir: "/System/Library/Frameworks/AppKit.framework/Versions/C/Resources",
    layout: "loctable",
  },
  { name: "Mail", dir: "/System/Applications/Mail.app/Contents/Resources", layout: "loctable" },
  {
    name: "WebKit",
    dir: "/System/Library/Frameworks/WebKit.framework/Versions/A/Frameworks/WebCore.framework/Versions/A/Resources",
    layout: "lproj",
  },
] as const;

// An `.lproj` names Brazilian Portuguese `pt`, and Portugal's `pt_PT`.
const APPLE_LPROJ_CODES: Record<string, string> = { "es-419": "es_419", "pt-BR": "pt" };

function appleBundleStrings(bundle: (typeof APPLE_BUNDLES)[number], tag: string): AppleString[] {
  const strings: AppleString[] = [];

  const add = (table: string, english: object, translated: object) => {
    for (const [key, value] of Object.entries(english)) {
      const translation: unknown = (translated as Record<string, unknown>)[key];

      if (typeof value === "string" && typeof translation === "string") {
        strings.push({ bundle: bundle.name, table, key, english: value, translation });
      }
    }
  };

  if (bundle.layout === "loctable") {
    const code = APPLE_CODES[tag] ?? tag;

    for (const file of readdirSync(bundle.dir).filter((name) => name.endsWith(".loctable"))) {
      const tables = readPlist(path.join(bundle.dir, file));

      add(
        file.slice(0, -".loctable".length),
        tables?.en ?? tables?.Base ?? {},
        tables?.[code] ?? {},
      );
    }

    return strings;
  }

  const code = APPLE_LPROJ_CODES[tag] ?? tag;

  const englishDir = path.join(bundle.dir, "en.lproj");

  for (const file of readdirSync(englishDir).filter((name) => name.endsWith(".strings"))) {
    add(
      file.slice(0, -".strings".length),
      readPlist(path.join(englishDir, file)) ?? {},
      readPlist(path.join(bundle.dir, `${code}.lproj`, file)) ?? {},
    );
  }

  return strings;
}

/*
 * The strings of `APPLE_BUNDLES` in a tag's language, read from this Mac once
 * and kept in the raw cache, where a lookup on another machine finds them
 * once the cache is copied there.
 */
export async function appleStrings(tag: string): Promise<AppleString[]> {
  const cache = path.join(RAW_DIR, "apple", `${tag}.jsonl`);

  const file = Bun.file(cache);

  if (await file.exists()) {
    return (await file.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AppleString);
  }

  if (process.platform !== "darwin") {
    throw new Error(
      `only macOS has Apple's tables, and ${path.relative(ROOT, cache)} isn't in the cache`,
    );
  }

  const strings = APPLE_BUNDLES.flatMap((bundle) => appleBundleStrings(bundle, tag));

  await Bun.write(file, strings.map((string) => JSON.stringify(string)).join("\n") + "\n");

  return strings;
}

type ElectronRun = {
  exitCode: number | null;
  signalCode: string | null;
  stdout: string;
  stderr: string;
};

function askElectron(): ElectronRun {
  const result = Bun.spawnSync(
    [path.join(ROOT, "node_modules/.bin/electron"), "-p", "process.versions.chrome"],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdout: "pipe", stderr: "pipe" },
  );

  return {
    exitCode: result.exitCode,
    signalCode: result.signalCode ?? null,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/*
 * The Chromium version of the Electron in `node_modules`, which the counts are
 * pinned to. The first launch after an install has failed with nothing on
 * stderr and the next succeeded, so a failed read is tried once more.
 */
export function electronChromium(ask: () => ElectronRun = askElectron) {
  const failures: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = ask();

    const version = result.stdout.trim();

    if (result.exitCode === 0 && /^\d+\.\d+\.\d+\.\d+$/u.test(version)) {
      return version;
    }

    const how =
      result.signalCode === null ? `exit code ${result.exitCode}` : `signal ${result.signalCode}`;

    failures.push(`${how}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`);
  }

  throw new Error(
    `Couldn't read Electron's Chromium version (${failures.join("; then ")}); run bun install first.`,
  );
}

export async function buildCorpus(source: Source, tag: string, chromium: string) {
  switch (source) {
    case "chrome":
      return chrome(tag, chromium);
    case "firefox":
    case "thunderbird":
      return mozilla(source, tag);
    case "vscode":
      return vscode(tag);
    case "android":
      return android(tag);
    case "libreoffice":
      return libreoffice(tag);
    case "microsoft":
      return microsoft(tag);
    case "apple":
      return apple(tag);
    case "gnome":
      return gnome(tag);
  }
}

const USAGE = `Usage: bun .claude/skills/translate/corpus.ts [--source <name>]… [--refresh] <tag>…

Fetches what a Chrome count, a GNOME count and the seven-app vote read into
.cache/translate, and writes corpus/<source>.<tag>.jsonl for each: chrome, at
the Chromium version of node_modules' Electron, ${APPS.join(", ")}, and gnome,
GNOME's ${GNOME_PROJECTS.join(", ")} translations. Without --source it
builds them all. A corpus already built is kept unless --refresh is given; the
downloads behind it are kept either way. A source that fails is skipped with a
warning, the others still built, and the run exits 1.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: "string", multiple: true },
      refresh: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(USAGE);

    process.exit(values.help ? 0 : 2);
  }

  const strangers = unknownTags(positionals);

  if (strangers.length > 0) {
    console.error(`Unknown tag ${strangers.join(", ")}; use ${TAGS.join(", ")}.`);

    process.exit(2);
  }

  const sources = (values.source ?? SOURCES) as Source[];

  const unknown = sources.filter((source) => !SOURCES.includes(source));

  if (unknown.length > 0) {
    console.error(`Unknown source ${unknown.join(", ")}; use ${SOURCES.join(", ")}.`);

    process.exit(2);
  }

  const chromium = electronChromium();

  console.error(`Chromium ${chromium}, from node_modules' Electron`);

  await mkdir(CORPUS_DIR, { recursive: true });

  // A source that fails is skipped so the rest still build, and the exit code says so.
  const failed: string[] = [];

  for (const tag of positionals) {
    for (const source of sources) {
      const out = path.join(CORPUS_DIR, `${source}.${tag}.jsonl`);

      // The Chrome corpus belongs to one Chromium version, so a new one is built afresh.
      const stamp = path.join(CORPUS_DIR, `${source}.${tag}.version`);

      const built =
        (await Bun.file(out).exists()) &&
        (source !== "chrome" ||
          (await Bun.file(stamp)
            .text()
            .catch(() => undefined)) === chromium);

      if (!hasLanguage(source, tag)) {
        console.log(`${source} ${tag}: no ${SOURCE_NAMES[source]} translation for ${tag}`);

        continue;
      }

      if (built && !values.refresh) {
        console.log(`${source} ${tag}: kept ${out} (${(await stat(out)).size} bytes)`);

        continue;
      }

      let fetched: Pair[];

      try {
        fetched = await buildCorpus(source, tag, chromium);
      } catch (error) {
        failed.push(`${source} ${tag}`);

        console.warn(
          `${source} ${tag}: skipped, ${error instanceof Error ? error.message : String(error)}`,
        );

        continue;
      }

      const pairs = fetched
        .map(([english, translation]): Pair => [english.trim(), translation.trim()])
        .filter(([english, translation]) => english && translation);

      await Bun.write(
        out,
        pairs.map((pair) => JSON.stringify(pair)).join("\n") + (pairs.length ? "\n" : ""),
      );

      if (source === "chrome") {
        await Bun.write(stamp, chromium);
      }

      console.log(`${source} ${tag}: ${pairs.length} pairs in ${out}`);
    }
  }

  if (failed.length > 0) {
    console.error(`Not built: ${failed.join(", ")}`);

    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`corpus.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
