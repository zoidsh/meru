# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Added

- **Meru Pro:** Meru links can now open a Google link in Meru: `meru://open?url=<link>` asks which account should open it when you have more than one, and `meru://<email>/open?url=<link>` opens it in that account

### Changed

- Updated to Electron 44, which brings Chrome 152 and its security fixes. Meru now needs macOS 13 (Ventura) or later, and Macs on macOS 12 are no longer offered updates

### Fixed

- **macOS:** the close, minimize and zoom buttons now sit centered in the titlebar instead of a few pixels too high
- With Theme set to Dark in Settings → Appearance, the titlebar, tabs and settings no longer sometimes launch light until you switch the setting back and forth
- **Windows:** The passkey note in Settings → Extensions and the prompt at Google's passkey sign-in now say that only a passkey added to your Google account from inside Meru works, and that passkeys from Chrome, Google Password Manager or your phone don't
- **Linux and Windows:** Restart in Meru's restart prompts now brings Meru back on the AppImage and the portable build, which quit for good instead of restarting
- After choosing Later on an update, the restart prompt no longer returns every few hours for the same version
- **Linux:** Window controls no longer appear over Meru's titlebar buttons on window managers without decorations, such as dwm, i3 and sway. A new Window controls setting in Settings → Appearance overrides the detection
