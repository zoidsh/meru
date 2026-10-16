import path from "node:path";
import config from "../i18next.config";

/*
 * What `i18next-cli` does not catch: a placeholder dropped or invented in a
 * translation, which renders the raw `{{name}}` or silently loses the value,
 * and a plural category a locale never selects. `status` also exits 0 on a
 * catalog it cannot parse, printing a stack trace, so a malformed file reads as
 * a pass. Every problem is named with its locale, key and detail, which is what
 * a translating agent needs to fix its own work.
 */

type Problem = {
  locale: string;
  key: string;
  kind: string;
  detail: string;
};

const PLURAL_SEPARATOR = config.extract?.pluralSeparator ?? "_";

const KEY_SEPARATOR = config.extract?.keySeparator ?? ".";

const ORDINAL_SUFFIX = "ordinal";

const EXACT_CATEGORY = /^=\d+$/;

const locales = config.locales as string[];

const primaryLocale = config.extract?.primaryLanguage ?? locales[0] ?? "en";

const outputTemplate = config.extract?.output;

if (typeof outputTemplate !== "string") {
  throw new Error("`extract.output` has to be a path template for this check to find the catalogs");
}

const output = outputTemplate;

function catalogPath(locale: string) {
  return path.join(process.cwd(), output.replaceAll("{{language}}", locale));
}

/** `{ a: { b: "c" } }` to `{ "a.b": "c" }`, the shape i18next looks keys up in. */
function flatten(value: unknown, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();

  if (typeof value !== "object" || value === null) {
    return entries;
  }

  for (const [segment, child] of Object.entries(value)) {
    const key = prefix ? `${prefix}${KEY_SEPARATOR}${segment}` : segment;

    if (typeof child === "string") {
      entries.set(key, child);
    } else {
      for (const [nestedKey, nestedValue] of flatten(child, key)) {
        entries.set(nestedKey, nestedValue);
      }
    }
  }

  return entries;
}

const PLACEHOLDER = new RegExp(
  `${escape(config.extract?.interpolationPrefix ?? "{{")}\\s*([\\w.-]+)\\s*(?:,[^}]*)?${escape(
    config.extract?.interpolationSuffix ?? "}}",
  )}`,
  "g",
);

function escape(pattern: string) {
  return pattern.replaceAll(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function placeholders(message: string) {
  return new Set(
    Array.from(message.matchAll(PLACEHOLDER), ([, name]) => (name ?? "").split(".")[0] ?? ""),
  );
}

/**
 * Splits `trialDaysLeft_one` into its key and its category. A key can carry a
 * context suffix of its own (`friend_male_one`), so only a trailing CLDR
 * category or an `=0` exact match counts, and `_ordinal_one` is one suffix.
 */
function splitPluralSuffix(key: string) {
  const segments = key.split(PLURAL_SEPARATOR);

  const category = segments.at(-1);

  if (!category) {
    return undefined;
  }

  const isOrdinal = segments.at(-2) === ORDINAL_SUFFIX;

  const base = segments.slice(0, isOrdinal ? -2 : -1).join(PLURAL_SEPARATOR);

  if (!base) {
    return undefined;
  }

  return { base, category, isOrdinal };
}

function requiredCategories(locale: string, isOrdinal: boolean) {
  return new Intl.PluralRules(locale, {
    type: isOrdinal ? "ordinal" : "cardinal",
  }).resolvedOptions().pluralCategories as string[];
}

function readCatalog(locale: string) {
  const file = Bun.file(catalogPath(locale));

  return file
    .json()
    .then((json: unknown) => ({ catalog: flatten(json) }))
    .catch((error: Error) => ({ error }));
}

const problems: Problem[] = [];

const primary = await readCatalog(primaryLocale);

if ("error" in primary) {
  problems.push({
    locale: primaryLocale,
    key: "-",
    kind: "unreadable catalog",
    detail: primary.error.message,
  });
} else {
  for (const locale of locales) {
    if (locale === primaryLocale) {
      continue;
    }

    const result = await readCatalog(locale);

    if ("error" in result) {
      problems.push({
        locale,
        key: "-",
        kind: "unreadable catalog",
        detail: result.error.message,
      });

      continue;
    }

    const { catalog } = result;

    const report = (key: string, kind: string, detail: string) => {
      problems.push({ locale, key, kind, detail });
    };

    const categoriesByBase = new Map<string, { categories: Set<string>; isOrdinal: boolean }>();

    for (const [key, translation] of catalog) {
      if (!translation) {
        report(key, "untranslated", "empty value; run `bun run i18n:status <locale>` for the list");

        continue;
      }

      const plural = splitPluralSuffix(key);

      const source = primary.catalog.get(key) ?? primary.catalog.get(`${plural?.base ?? key}`);

      if (plural && !EXACT_CATEGORY.test(plural.category)) {
        const entry = categoriesByBase.get(plural.base) ?? {
          categories: new Set<string>(),
          isOrdinal: plural.isOrdinal,
        };

        entry.categories.add(plural.category);

        categoriesByBase.set(plural.base, entry);
      }

      if (source === undefined) {
        continue;
      }

      const expected = placeholders(source);

      const actual = placeholders(translation);

      for (const name of expected) {
        if (!actual.has(name)) {
          report(key, "placeholder dropped", `{{${name}}} is missing from the translation`);
        }
      }

      for (const name of actual) {
        if (!expected.has(name)) {
          report(key, "placeholder invented", `{{${name}}} is not in the ${primaryLocale} value`);
        }
      }
    }

    for (const [base, { categories, isOrdinal }] of categoriesByBase) {
      const required = requiredCategories(locale, isOrdinal);

      const missing = required.filter((category) => !categories.has(category));

      if (missing.length > 0) {
        report(
          base,
          "plural category missing",
          `${locale} needs ${required.join(", ")}; missing ${missing.join(", ")}`,
        );
      }

      const unused = Array.from(categories).filter((category) => !required.includes(category));

      if (unused.length > 0) {
        report(
          base,
          "plural category unused",
          `${unused.join(", ")} is never selected in ${locale}`,
        );
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`No catalog problems in ${locales.join(", ")}.`);

  process.exit(0);
}

for (const problem of problems) {
  console.log(`${problem.locale}  ${problem.kind}: ${problem.detail}`);
  console.log(`  ${problem.key}`);
}

console.log(`\n${problems.length} catalog problem(s).`);

process.exit(1);
