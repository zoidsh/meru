# Meru

Gmail and Google Workspace as a desktop app for macOS, Windows and Linux. This branch is Meru 4, a rewrite in progress; the released app is on `main`.

## Development

With [mise](https://mise.jdx.dev):

```sh
mise install
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm check` lints, checks formatting and typechecks; `pnpm test` runs the unit tests; `pnpm build` then `pnpm start` runs the built app. `CLAUDE.md` has the rest.

## License

[AGPL-3.0](LICENSE)
