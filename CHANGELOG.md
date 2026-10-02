# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Fixed

- **Linux:** Gmail no longer stays blank or black, shows another account's email, or ignores clicks and typing after Meru starts, after switching accounts or after reopening the window.

### Internal Changes

- Moved Electron back from 44.5.1 to 43.7.7, which brings Chrome 150, until Electron 44 fixes the Linux bug above.
