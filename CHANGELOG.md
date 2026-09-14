# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Changed

- **macOS:** Meru's titlebar, tabs and settings now take their colors from macOS, so they follow your appearance, accent color and contrast settings
- Updated to Electron 44, which brings Chrome 152 and its security fixes. Meru now needs macOS 13 (Ventura) or later, and Macs on macOS 12 are no longer offered updates

### Fixed

- With Theme set to Dark in Settings → Appearance, the titlebar, tabs and settings no longer sometimes launch light until you switch the setting back and forth
- **Linux and Windows:** Restart in Meru's restart prompts now brings Meru back on the AppImage and the portable build, which quit for good instead of restarting
