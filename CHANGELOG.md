# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A stable release's version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Added

- **Meru Pro:** Bitwarden can be installed from `Settings… → Extensions`. It fills and generates passwords and passkeys on Google's sign-in and account pages, offers to save and update logins, and **Open Bitwarden** under its description opens Bitwarden to sign in. Unlocking with biometrics needs the Bitwarden desktop app.

### Changed

- **Meru Pro:** `Settings… → Workspace Apps → Windows → Show account label` is gone, because a Workspace apps window always names its account when you have more than one, in its titlebar and in the window title
- **Meru Pro:** `Settings… → Workspace Apps → Windows → Show account color` is gone, because a Workspace apps window's titlebar names the account and shows its color, which is what the setting's colored bar was for

### Fixed

- **Meru Pro:** During a Pro trial, the saved searches button appears in the titlebar, instead of staying hidden until a license key is activated
- **Meru Pro:** A saved search whose query holds a quote, a backslash or a slash, such as `subject:"out of office"`, opens in Gmail instead of doing nothing
- `Notify when updates are available` in `Settings… → Updates` takes effect as soon as it is switched, instead of at the next start
- The notification sound volume slider stops at 5%, the quietest volume Meru plays, instead of reaching a 0% that was ignored
- Back and forward buttons on a mouse set up with Logi Options+ go back and forward in Gmail and Google apps, as does a three-finger swipe between pages on a trackpad.
