# Meru macOS notification sound probe

Answers one question: can macOS play Meru's own notification sounds, so that a Focus suppresses them the way it suppresses the banner?

Everything else in the Focus/Do Not Disturb investigation hangs on the answer. If the OS will play a bundled `.wav`, Meru needs no Focus detection at all and gets per-app allow-list behaviour no detector can reproduce. If it will not, Meru needs a detector and has to pick between a coarse one and an entitlement.

## Run it

Needs a Mac. Three runs, one per phase.

```sh
bun install          # pulls electron + electron-builder only
bun run probe        # builds the .app and runs it attached to the terminal
```

`tools/` is deliberately outside the root `workspaces` glob. Bun installs here into a local `node_modules` and lockfile and leaves the root alone, whereas a workspace member would join `bun run --filter='*'` on every repo-wide script and put electron-builder in the root lockfile for every CI install — a permanent cost for a probe that is meant to be deleted.

It must run **packaged**, and it must run from a terminal rather than by double-clicking, because it reads answers from stdin. `bun run run` re-runs without rebuilding.

Signing: electron-builder signs with whatever identity is in the keychain. `Notification.isSupported()` and the `failed` event in the output say whether signing was good enough — an unsigned binary emits `failed` and proves nothing.

## The three phases

Run the whole sequence once per phase, and keep each results table.

1. **off** — no Focus active. Establishes which options produce a sound at all.
2. **focus** — turn on any Focus, with Meru Probe _not_ on its allow list. Any case that still makes noise here is a case where the OS is not in control of the sound.
3. **allowlist** — System Settings > Focus > (that mode) > Allowed Notifications, add **Meru Probe**. A case that goes quiet in phase 2 and audible again here is the OS honouring the allow list, which is the behaviour worth having.

Each case asks whether you heard anything and which sound it was. The chirp is a rising tone the probe generates itself, so it is unmistakable against any macOS sound.

## What each case is for

| Case                             | Question it answers                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| no silent, no sound              | The baseline: does a plain notification make noise?                                                       |
| `silent: false`                  | Does the OS default sound play and get suppressed by Focus?                                               |
| `silent: true`                   | What Meru ships today for custom sounds. Expect silence in every phase.                                   |
| `sound: "Submarine"`             | Does a name from `/System/Library/Sounds` work? This is the one form Electron maintainers have confirmed. |
| `sound: "chirp"` / `"chirp.wav"` | Does a bundled file in `Contents/Resources` work, and does the extension matter?                          |
| `sound: "sounds/chirp.wav"`      | Can the file sit in a subdirectory?                                                                       |
| absolute path                    | Does a full path work, which the docs imply it should not?                                                |
| `~/Library/Sounds/MeruProbe.wav` | The other documented lookup location. Opt-in, and removed at the end of the run.                          |

## It also prints the detection signals

Before every case it reads the two things a detector would rely on:

- `defaults read com.apple.controlcenter "NSStatusItem Visible FocusModes"` — what Mailspring and stretchly moved to in 2025/26. Watch whether it flips promptly when you change Focus, and what the millisecond figure does.
- `~/Library/DoNotDisturb/DB/Assertions.json` and `ModeConfigurations.json` — whether a packaged GUI app can read them at all without Full Disk Access. `EPERM` here settles that route.

## Still manual

Element's claim that macOS ignores `silent: true` and plays a coalesced banner sound on wake. Leave a `silent: true` notification pending, sleep the Mac, wake it, listen. If true, some Meru users hear two sounds today, independent of Focus.
