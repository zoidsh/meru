# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A stable release's version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Added

- **Meru Pro:** Bitwarden can be installed from `Settings… → Extensions`. It fills and generates passwords and passkeys on Google's sign-in and account pages, offers to save and update logins, and **Open Bitwarden** under its description opens Bitwarden to sign in. Unlocking with biometrics needs the Bitwarden desktop app.

### Changed

- **Meru Pro:** `Settings… → Workspace Apps → Windows → Show account label` is gone, because a Workspace apps window always names its account when you have more than one, in its titlebar and in the window title
- **Meru Pro:** `Settings… → Workspace Apps → Windows → Show account color` is gone, because a Workspace apps window's titlebar names the account and shows its color, which is what the setting's colored bar was for
- The `Update available` button in the titlebar drops its icon, so it takes less room

### Fixed

- **Meru Pro:** During a Pro trial, the days left in the titlebar count down while Meru stays open, and a trial that ends while Meru is open says so in a dialog and in the titlebar, instead of waiting for the next start
- **Windows:** When an update can't be verified, the titlebar says so and offers to download it, so you can install it yourself instead of being left on a version that never updates
- **Meru Pro:** During a Pro trial, the saved searches button appears in the titlebar, instead of staying hidden until a license key is activated
- **Meru Pro:** A saved search whose query holds a quote, a backslash or a slash, such as `subject:"out of office"`, opens in Gmail instead of doing nothing
- `Notify when updates are available` in `Settings… → Updates` takes effect as soon as it is switched, instead of at the next start
- **macOS:** A downloaded file is marked as coming from the internet, so macOS checks an app, installer or script before it opens, the way it does for a browser download
- The notification sound volume slider stops at 5%, the quietest volume Meru plays, instead of reaching a 0% that was ignored
- The close button on the unified inbox and the download history says what it closes, instead of offering to close settings that are not open
- Keyboard focus is visible again in Meru's own interface: buttons, switches, checkboxes, tabs and sliders draw a focus ring when you tab to them, instead of leaving you to guess where you are
- Tab walks the page you are on rather than the titlebar and the tab strip around it, the way it already does in Gmail
- **Windows and Linux:** F10, and a tap of Alt, open the app menu from anywhere in the window, so it no longer takes a click
- Closing Settings, the unified inbox or the download history puts the keyboard back in your mail, so you can type straight away instead of first clicking the page
- **Meru Pro:** Changing label colors in quick succession leaves only the latest colors in Gmail, instead of sometimes keeping earlier colors applied alongside them
- Restarting to install an update reopens the tabs you had open, the way any other quit does, instead of losing recent changes to them
- Back and forward buttons on a mouse set up with Logi Options+ go back and forward in Gmail and Google apps, as does a three-finger swipe between pages on a trackpad.
