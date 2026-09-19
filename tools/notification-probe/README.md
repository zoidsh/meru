# Meru notification sound probe

Answers one question per platform: can the OS play Meru's own notification sounds, so that Do Not Disturb silences them the way it silences the banner?

Everything else in the Focus/Do Not Disturb investigation hangs on that. If the OS will play a bundled sound, Meru needs no detection at all and inherits allow-list behaviour no detector can reproduce. If it will not, Meru needs a detector and has to pick between a coarse one and an entitlement.

**macOS is answered — see [Results](#results--macos).** Windows is not; see [Windows](#windows). Keep the probe either way: the next OS release will break something here, and re-running it beats re-deriving it.

## Results — macOS

macOS 27.0, Electron 44.4.3, packaged, signed `Developer ID Application: Tim Cheung`. Run 19 September 2026.

| Case                                      | No Focus           | Do Not Disturb on | DND, on its allow list |
| ----------------------------------------- | ------------------ | ----------------- | ---------------------- |
| no silent, no sound                       | system default     | silent            | system default         |
| `silent: false`                           | system default     | silent            | system default         |
| `silent: true`                            | silent             | silent            | silent                 |
| `sound: "Submarine"`                      | Submarine          | silent            | Submarine              |
| `sound: "chirp"`                          | **chirp**          | silent            | **chirp**              |
| `sound: "chirp.wav"`                      | **chirp**          | silent            | **chirp**              |
| `sound: "sounds/chirp.wav"`               | wrong system sound | silent            | wrong system sound     |
| absolute path                             | wrong system sound | silent            | wrong system sound     |
| `sound: "MeruProbe"` (`~/Library/Sounds`) | **chirp**          | silent            | **chirp**              |

`show` fired for every case in all three phases, which is why the renderer sound leaks: the event says nothing about whether anything was presented.

What this settles:

- **A bundled sound works**, by bare filename against `Contents/Resources`, extension optional. The 2020 and 2024 reports that Electron's `sound` option is broken are wrong on current versions.
- **Subdirectories and absolute paths do not work**, and they fail loudly rather than quietly — macOS substitutes an unrelated system sound. A missing file needs guarding.
- **A Focus suppresses notification-attached audio completely**, so handing the sound to the OS fixes the leak with no detection.
- **The Focus's per-app allow list is honoured.** Adding the app under Allowed Notifications brings every sound back, matching the no-Focus column exactly. No detector can reproduce this: reading "a Focus is on" says nothing about whether this app is exempt from it, which is the open complaint against the `defaults` approach in [stretchly#1549](https://github.com/hovancik/stretchly/issues/1549).

Neither detection signal works on macOS 27, in either phase:

| Signal                                       | No Focus   | Do Not Disturb on |
| -------------------------------------------- | ---------- | ----------------- |
| `Assertions.json`, `ModeConfigurations.json` | `EPERM`    | `EPERM`           |
| `NSStatusItem Visible FocusModes`            | key absent | key absent        |

The first needs Full Disk Access. The second is the no-permission fallback Mailspring and stretchly migrated to in 2025 and 2026, and it reads identically whether a Focus is on or off, so it cannot distinguish them — both of those apps are broken on 27.

## Run it — macOS

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

## Windows

A second probe, answering the two questions that decide whether Meru needs a native module on Windows: can an unpackaged build attach its own sound to a toast, and does `FocusSessionManager` see a manually toggled Do not disturb?

### Results — Windows

Windows 11 build 26100.9445, arm64 under UTM, Electron 44.4.3, packaged, unsigned. Run 19 September 2026.

**No to both.** Every custom-file spelling — `file:///`, a bare absolute path, `ms-appdata:///local/`, `ms-appx:///` — substituted a built-in sound rather than playing ours, matching Microsoft's documented restriction to `ms-appx:` and `ms-resource` inside an MSIX package. And with Do not disturb toggled on by hand, all nine cases fell silent while all three detection signals read exactly as they did with it off:

| Signal                              | Nothing on                   | Do not disturb on            |
| ----------------------------------- | ---------------------------- | ---------------------------- |
| `FocusSessionManager.IsFocusActive` | False                        | False                        |
| `SHQueryUserNotificationState`      | `QUNS_ACCEPTS_NOTIFICATIONS` | `QUNS_ACCEPTS_NOTIFICATIONS` |
| `quiethoursstate` registry `Data`   | key absent                   | key absent                   |

So Windows does gate toast audio correctly, and Meru simply cannot put its own sound there. `FocusSessionManager` covering only Clock-app focus sessions rather than the standalone toggle appears to be by design, and this is the only confirmation of it anywhere.

Not measured, and the one surface the ecosystem actually uses: the undocumented `IQuietHoursSettings` COM interface and the WNF state behind `windows-focus-assist`. Testing it needs that node-gyp addon built for arm64 in the VM. Meru's decision does not depend on it — see [decisions.md](../../../docs/meru/decisions.md) — but "detection is dead on Windows" is not proven, only "these three routes are".

The `session` and `priority` phases were not run.

Built for **arm64**, since the Windows this is tested on runs in UTM on an Apple Silicon Mac. Change `build.win.target.arch` for an x64 machine.

```sh
bun install
bun run probe:win     # builds the arm64 NSIS installer into dist/
```

Cross-building from the Mac works — electron-builder carries its own NSIS and needs no wine when nothing is being signed. Copy the installer from `dist/` into the VM. Building inside the VM instead works too, and needs no change.

Then **install it**. This is not optional and not the same as the macOS flow: Windows only delivers toasts to an app that has a Start Menu shortcut carrying an AppUserModelID, which the installer creates and a `--dir` build does not.

Being unsigned is fine here. Windows delivers toasts from an unsigned app, unlike macOS; SmartScreen will warn at install time and the `signing` line in the report will say `NotSigned`.

Run it once per phase, from anywhere:

```sh
"%LOCALAPPDATA%\Programs\meru-notification-probe\Meru Probe.exe" --phase=off
```

Phases are `off`, `dnd` (Do not disturb toggled on by hand), `session` (a focus session started from the Clock app) and `priority` (Do not disturb on, with Meru Probe added under Settings > System > Notifications > Set priority notifications — the Windows counterpart to a macOS Focus allow list).

**The run is unattended.** Electron builds a GUI-subsystem binary on Windows, so a packaged app has no console to print to and no stdin to read answers from. It fires nine notifications five seconds apart, each titled with its own case number, and writes a report to `%USERPROFILE%\meru-probe-<phase>.md`, then opens Explorer on it. Listen as they go, then fill in the Heard column — the toasts stay in the Action Center with their numbers if you need to check what was what.

### What the Windows cases are for

| Case                                 | Question it answers                                                       |
| ------------------------------------ | ------------------------------------------------------------------------- |
| no silent, no toastXml               | Baseline: does a plain toast make noise?                                  |
| `silent: true`                       | What Meru ships today. Expect silence everywhere.                         |
| `ms-winsoundevent:Notification.IM`   | The built-in catalogue, and what Signal ships on Windows.                 |
| `ms-winsoundevent:Notification.Mail` | Whether the mail-specific built-in differs.                               |
| `file:///` absolute path             | Microsoft documents this as unsupported. Does it fail in practice?        |
| bare absolute path                   | The other spelling of the same attempt.                                   |
| `ms-appdata:///local/`               | Documented unsupported outside a packaged app.                            |
| `ms-appx:///`                        | Documented supported, but only inside an MSIX package, which Meru is not. |
| `<audio silent="true" />`            | The toast-XML spelling of silence.                                        |

If every custom-file case is silent while the `ms-winsoundevent` ones play, Windows cannot carry Meru's own sounds and the choice is between losing them on Windows or detecting Focus.

### And the three detection signals

Printed before and after every run:

- **`FocusSessionManager`** — `IsSupported` and `IsFocusActive`, read through `powershell.exe`, which projects WinRT types (PowerShell 7 dropped that, so it must be `powershell.exe` and not `pwsh`). If `IsFocusActive` is true in the `dnd` phase, a manually toggled Do not disturb is visible to the documented API and a small C++/WinRT addon is worth writing. If it is only true in the `session` phase, the API covers Clock focus sessions alone.
- **`SHQueryUserNotificationState`** — what `windows-notification-state` wraps. `QUNS_QUIET_TIME` is documented as the first hour after a new user's first login rather than Do not disturb, and this checks whether that is still true in practice.
- **`quiethoursstate` registry blob** — the undocumented `CloudStore` value, kept as a fallback comparison. Watch whether its bytes change between phases.

## Still manual

Element's claim that macOS ignores `silent: true` and plays a coalesced banner sound on wake. Leave a `silent: true` notification pending, sleep the Mac, wake it, listen. If true, some Meru users hear two sounds today, independent of Focus.
