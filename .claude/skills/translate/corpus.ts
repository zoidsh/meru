import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

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

export const SOURCES = ["chrome", ...APPS] as const;

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
};

const APPLE_CODES: Record<string, string> = { "es-419": "es_419", "pt-BR": "pt_BR" };

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

/** An Android `strings.xml`'s strings by name, markup and escapes taken out. */
export function parseAndroidStrings(text: string) {
  const out = new Map<string, string>();

  for (const [, name, value] of text.matchAll(/<string name="([^"]+)"[^>]*>(.*?)<\/string>/gsu)) {
    out.set(
      name as string,
      unescapeXml((value as string).replace(/<[^>]+>/gu, ""))
        .replace(/\\'/gu, "'")
        .replace(/\\"/gu, '"'),
    );
  }

  return out;
}

/** A PO file's msgid and msgstr pairs, header and empty translations included. */
export function parsePo(text: string): Pair[] {
  const unquote = (lines: string) =>
    [...lines.matchAll(/"((?:[^"\\]|\\.)*)"/gu)]
      .map(([, part]) =>
        (part as string).replace(/\\(.)/gu, (_, char: string) =>
          char === "n" ? "\n" : char === "t" ? "\t" : char,
        ),
      )
      .join("");

  return text.split("\n\n").flatMap((block): Pair[] => {
    const id = /^msgid ("(?:[^"\\]|\\.)*"(?:\n"(?:[^"\\]|\\.)*")*)/mu.exec(block)?.[1];

    const str = /^msgstr ("(?:[^"\\]|\\.)*"(?:\n"(?:[^"\\]|\\.)*")*)/mu.exec(block)?.[1];

    return id === undefined || str === undefined ? [] : [[unquote(id), unquote(str)]];
  });
}

/** Every English term of a Microsoft TBX with each of its translations. */
export function parseTbx(text: string): Pair[] {
  const pairs: Pair[] = [];

  for (const [, body] of text.matchAll(/<termEntry [^>]*>(.*?)<\/termEntry>/gsu)) {
    const sets = [...(body as string).matchAll(/<langSet xml:lang="([^"]+)">(.*?)<\/langSet>/gsu)];

    const termsOf = (set: string) =>
      [...set.matchAll(/<term id="\d+">(.*?)<\/term>/gu)].map(([, term]) =>
        unescapeXml(term as string),
      );

    const english = sets
      .filter(([, lang]) => lang === "en-US")
      .flatMap(([, , set]) => termsOf(set as string));

    const translated = sets
      .filter(([, lang]) => lang !== "en-US")
      .flatMap(([, , set]) => termsOf(set as string));

    for (const term of english) {
      pairs.push(...translated.map((translation): Pair => [term, translation]));
    }
  }

  return pairs;
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

async function fetchText(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
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
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
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

async function android(tag: string) {
  const suffix = CODES.android[tag];

  if (!suffix) {
    return [];
  }

  const pairs: Pair[] = [];

  for (const [repo, file] of ANDROID_FILES) {
    const read = (values: string) =>
      cached(
        `android/${repo.replaceAll("/", "_")}/${file.replace("{}", values).replaceAll("/", "_")}`,
        `https://android.googlesource.com/${repo}/+/refs/heads/main/${file.replace("{}", values)}?format=TEXT`,
        (base64) => Buffer.from(base64, "base64").toString("utf8"),
      );

    pairs.push(
      ...aligned(parseAndroidStrings(await read("")), parseAndroidStrings(await read(suffix))),
    );
  }

  return pairs;
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

const TBX_ZIP =
  "https://download.microsoft.com/download/b/2/d/b2db7a7c-8d33-47f3-b2c1-ee5e6445cf45/MicrosoftTermCollection.zip";

async function microsoft(tag: string) {
  const name = CODES.microsoft[tag];

  if (!name) {
    return [];
  }

  const dir = path.join(RAW_DIR, "microsoft");

  const zip = path.join(dir, "MicrosoftTermCollection.zip");

  const tbx = path.join(dir, `${name}.tbx`);

  if (!(await Bun.file(tbx).exists())) {
    if (!(await Bun.file(zip).exists())) {
      const response = await fetch(TBX_ZIP);

      if (!response.ok) {
        throw new Error(`${TBX_ZIP}: HTTP ${response.status}`);
      }

      await Bun.write(zip, response);
    }

    run(["unzip", "-o", "-q", zip, `${name}.tbx`, "-d", dir], dir);
  }

  return parseTbx(await Bun.file(tbx).text());
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
      const result = Bun.spawnSync(
        ["plutil", "-convert", "json", "-o", "-", path.join(root, file)],
        {
          stdout: "pipe",
          stderr: "ignore",
        },
      );

      if (result.exitCode !== 0) {
        continue;
      }

      const tables: Record<string, Record<string, unknown>> = JSON.parse(result.stdout.toString());

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
  }
}

const USAGE = `Usage: bun .claude/skills/translate/corpus.ts [--source <name>]… [--refresh] <tag>…

Fetches what a Chrome count and the seven-app vote read into .cache/translate,
and writes corpus/<source>.<tag>.jsonl for each: chrome, at the Chromium version
of node_modules' Electron, and ${APPS.join(", ")}. Without --source it
builds them all. A corpus already built is kept unless --refresh is given; the
downloads behind it are kept either way.`;

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

  const sources = (values.source ?? SOURCES) as Source[];

  const unknown = sources.filter((source) => !SOURCES.includes(source));

  if (unknown.length > 0) {
    console.error(`Unknown source ${unknown.join(", ")}; use ${SOURCES.join(", ")}.`);

    process.exit(2);
  }

  const chromium = electronChromium();

  console.error(`Chromium ${chromium}, from node_modules' Electron`);

  await mkdir(CORPUS_DIR, { recursive: true });

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

      if (built && !values.refresh) {
        console.log(`${source} ${tag}: kept ${out} (${(await stat(out)).size} bytes)`);

        continue;
      }

      const pairs = (await buildCorpus(source, tag, chromium))
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
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`corpus.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
