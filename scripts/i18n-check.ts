import path from "node:path";
import { getConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";
import {
  type CompiledMessage,
  type CompiledMessageToken,
  compileMessageOrThrow,
} from "@lingui/message-utils/compileMessage";

/*
 * What `lingui compile --strict` does not catch: a plural whose translation is
 * missing a CLDR category for its locale, which compiles and silently falls
 * back to `other` at runtime, a placeholder dropped or renamed in a
 * translation, and entries left fuzzy or obsolete. `--strict` itself reports
 * only a count, so the missing translations are named here as well.
 */

type Problem = {
  locale: string;
  id: string;
  source: string;
  origin: string;
  kind: string;
  detail: string;
};

type PluralArg = {
  name: string;
  type: "plural" | "selectordinal";
  categories: string[];
};

const EXACT_CATEGORY_PREFIX = "=";

function isPlaceholderToken(
  token: CompiledMessageToken,
): token is [string, string?, unknown?] & string[] {
  return Array.isArray(token);
}

function walkMessage(
  tokens: CompiledMessage,
  onPlaceholder: (name: string) => void,
  onPluralArg: (arg: PluralArg) => void,
) {
  for (const token of tokens) {
    if (!isPlaceholderToken(token)) {
      continue;
    }

    const [name, type, format] = token as [string, string | undefined, unknown];

    onPlaceholder(name);

    if (!format || typeof format !== "object") {
      continue;
    }

    const choices = format as Record<string, CompiledMessage | number | undefined>;

    if (type === "plural" || type === "selectordinal") {
      onPluralArg({
        name,
        type,
        categories: Object.keys(choices).filter(
          (category) => category !== "offset" && !category.startsWith(EXACT_CATEGORY_PREFIX),
        ),
      });
    }

    for (const [category, choice] of Object.entries(choices)) {
      if (category !== "offset" && Array.isArray(choice)) {
        walkMessage(choice, onPlaceholder, onPluralArg);
      }
    }
  }
}

function inspectMessage(message: string) {
  const placeholders = new Set<string>();

  const pluralArgs: PluralArg[] = [];

  walkMessage(
    compileMessageOrThrow(message),
    (name) => placeholders.add(name),
    (arg) => pluralArgs.push(arg),
  );

  return { placeholders, pluralArgs };
}

function requiredCategories(locale: string, type: PluralArg["type"]) {
  return new Intl.PluralRules(locale, {
    type: type === "selectordinal" ? "ordinal" : "cardinal",
  }).resolvedOptions().pluralCategories;
}

const config = getConfig();

const problems: Problem[] = [];

const po = formatter({ lineNumbers: true });

for (const catalogConfig of config.catalogs) {
  for (const locale of config.locales) {
    if (locale === config.sourceLocale) {
      continue;
    }

    const catalogPath = `${catalogConfig.path.replace("{locale}", locale)}${po.catalogExtension}`;

    const file = Bun.file(path.join(config.rootDir, path.relative(config.rootDir, catalogPath)));

    if (!(await file.exists())) {
      problems.push({
        locale,
        id: "-",
        source: "-",
        origin: catalogPath,
        kind: "missing catalog",
        detail: "run `bun run i18n:extract`",
      });

      continue;
    }

    const catalog = await po.parse(await file.text(), {
      locale,
      sourceLocale: config.sourceLocale,
      filename: catalogPath,
    });

    for (const [id, entry] of Object.entries(catalog)) {
      const source = entry.message ?? id;

      const [originFile, originLine] = entry.origin?.[0] ?? [catalogPath];

      const origin = originLine ? `${originFile}:${originLine}` : originFile;

      const report = (kind: string, detail: string) => {
        problems.push({ locale, id, source, origin, kind, detail });
      };

      if (entry.obsolete) {
        report("obsolete", "no longer in the source; run `bun run i18n:extract --clean`");

        continue;
      }

      const flags = (entry.extra as { flags?: string[] } | undefined)?.flags ?? [];

      if (flags.includes("fuzzy")) {
        report("fuzzy", "the source changed; retranslate and drop the flag");
      }

      if (!entry.translation) {
        report("untranslated", "empty msgstr");

        continue;
      }

      let sourceInspection: ReturnType<typeof inspectMessage>;

      try {
        sourceInspection = inspectMessage(source);
      } catch (error) {
        report("invalid ICU in source", (error as Error).message);

        continue;
      }

      let translationInspection: ReturnType<typeof inspectMessage>;

      try {
        translationInspection = inspectMessage(entry.translation);
      } catch (error) {
        report("invalid ICU", (error as Error).message);

        continue;
      }

      for (const placeholder of sourceInspection.placeholders) {
        if (!translationInspection.placeholders.has(placeholder)) {
          report("placeholder dropped", `{${placeholder}} is missing from the translation`);
        }
      }

      for (const placeholder of translationInspection.placeholders) {
        if (!sourceInspection.placeholders.has(placeholder)) {
          report("placeholder invented", `{${placeholder}} is not in the source`);
        }
      }

      for (const pluralArg of translationInspection.pluralArgs) {
        const required = requiredCategories(locale, pluralArg.type);

        const missing = required.filter((category) => !pluralArg.categories.includes(category));

        if (missing.length > 0) {
          report(
            "plural category missing",
            `{${pluralArg.name}} needs ${required.join(", ")}; missing ${missing.join(", ")}`,
          );
        }

        const unused = pluralArg.categories.filter(
          (category) => !(required as string[]).includes(category),
        );

        if (unused.length > 0) {
          report("plural category unused", `${unused.join(", ")} is never selected in ${locale}`);
        }
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`No catalog problems in ${config.locales.join(", ")}.`);

  process.exit(0);
}

for (const problem of problems) {
  console.log(`${problem.locale}  ${problem.kind}: ${problem.detail}`);
  console.log(`  ${problem.origin}  “${problem.source}”`);
}

console.log(`\n${problems.length} catalog problem(s).`);

process.exit(1);
