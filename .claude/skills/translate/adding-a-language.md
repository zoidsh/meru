# Adding a language

A language ships once it is in seven places:

1. `SHIPPED_CATALOG_TAGS` in `packages/shared/i18n/tags.ts`, which `lingui.config.ts` reads as its locales.
2. The `catalogLoaders` record in `packages/shared/i18n/index.ts`, `<tag>: () => import("./locales/<tag>")`, so the catalog is a chunk of its own that only a start in that language loads.
3. The dayjs locale import in `packages/renderer/lib/date.ts`, `dayjs/locale/<name>` with the name `getDayjsLocale` gives the tag, such as `es-mx` for `es-419`.
4. The `gmailCatalogLoaders` record in `packages/app/i18n.ts`, importing the Gmail preload's own `@meru/preload-gmail/locales/<tag>`. Main loads it and hands its messages to the sandboxed preload, which bundles English alone.
5. The style sheet `.claude/skills/translate/languages/<tag>.md`, its words taken by the [source order](source-order.md), and the language's line in every glossary entry.
6. The sidecar `languages/<tag>.json`, which `check.ts` needs to run at all: the platform words' rows, each word with its source and the entries it settles, the banned words, the pinned terms and the access-key style. `bun .claude/skills/translate/platform-table.ts <tag>` writes the style sheet's Platform words table from those rows, between its two markers, and `scripts/translate-rules.test.ts` fails while the two differ.
7. The fixtures `fixtures/<tag>-clean.po`, the wording the bans, platform words, access keys and families allow, and `fixtures/<tag>-faults.po`, a planted fault for each ban, marked `# fault: <rule>:<id>`. A pin carries its own `example` in the sidecar instead: the entry it picks, the wording it allows, unless its `expect` is a single literal word, and a `fault` it catches. `scripts/translate-check.test.ts` fails for a sidecar with rules and no fixtures, for a fixture whose findings differ from what it plants, and for a pin whose allowed wording any rule rejects or whose fault it misses.

Edit the tags first and run `bun run i18n:extract` before adding the two catalog imports: `i18n:compile` makes the `.ts` modules those imports name from the locale's `.po` files, and only extract creates those. Run `bun test --isolate scripts/translate-*.test.ts` once the sidecar and fixtures are in. Then run [`/translate`](SKILL.md) to translate the new catalogs.
