# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A stable release's version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Added

- Delete one account's cookies, its cache or both with **Delete browsing data…** in the account's menu in `Settings… → Accounts`, which now also holds **Edit account…** and **Remove account…**. Only the cache is selected by default. Deleting cookies signs you out of that account and closes its tabs other than Gmail, and pinned tabs stay in place and load again when you open them

### Changed

- Settings opens in its own window, so your inbox stays in view while you change them

### Fixed

- Closing the screen share picker without choosing a screen no longer shows an error
- Windows opened from a workspace app, such as a compose window or a pop-out, now follow a theme change in their title bar
