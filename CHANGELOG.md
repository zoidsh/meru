# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A stable release's version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Added

- **Meru Pro:** Bitwarden can be installed from `Settings… → Extensions`. It fills and generates passwords and passkeys on Google's sign-in and account pages, offers to save and update logins, and **Open Bitwarden** under its description opens Bitwarden to sign in. Unlocking with biometrics needs the Bitwarden desktop app.
- **Windows and Linux:** Hold <kbd>Ctrl</kbd> and scroll the mouse wheel to zoom Gmail and Workspace apps in and out, as in Chrome
- **Linux:** Notifications have buttons, as on macOS and Windows: **Archive**, **Mark as Read**, **Delete** and **Mark as Spam** on new email, of which GNOME shows the first three, **Open** or **Show in your file manager** on a finished download, and **Copy** on a verification code

### Changed

- Updated to Electron 45, which brings Chrome 156 and its security fixes
- **Meru Pro:** `Settings… → Workspace Apps → Windows → Show account label` is gone, because a Workspace apps window always names its account when you have more than one, in its titlebar and in the window title
- **Meru Pro:** `Settings… → Workspace Apps → Windows → Show account color` is gone, because a Workspace apps window's titlebar names the account and shows its color, which is what the setting's colored bar was for
- The `Update available` button in the titlebar drops its icon, so it takes less room
- Meru presents itself to websites as Chromium, the open-source browser Chrome is built on, instead of naming Meru and Electron. To go back, switch on `Settings… → Advanced → Miscellaneous → Use default user agent`
- **macOS:** `Settings… → Advanced → Miscellaneous → Use custom user agent` is gone, because Google Chat huddles, which it was for, now work without it
- `Settings… → License` says Upgrade rather than Purchase, like the rest of Meru
- `View → Zoom In` and `View → Zoom Out` step through the same zoom levels as Chrome, from 25% to 500%
- When Meru can't check an account for new email, it tries again less and less often, down to every five minutes, and goes back to every 30 seconds as soon as a check works or your computer wakes up or comes back online

### Fixed

- Starting a huddle in Google Chat keeps it going, instead of ending it at once with "Huddle ended"
- Several new emails arriving at once play the notification sound once, instead of overlapping copies of it
- **Meru Pro:** During a Pro trial, the days left in the titlebar count down while Meru stays open, and a trial that ends while Meru is open says so in a dialog and in the titlebar, instead of waiting for the next start
- **Windows:** When an update can't be verified, the titlebar says so and offers to download it, so you can install it yourself instead of being left on a version that never updates
- `Check for Updates…` says what it found — that Meru is up to date, that an update is available, or that the check couldn't be made — instead of leaving you without an answer
- **Meru Pro:** During a Pro trial, the saved searches button appears in the titlebar, instead of staying hidden until a license key is activated
- **Meru Pro:** A saved search whose query holds a quote, a backslash or a slash, such as `subject:"out of office"`, opens in Gmail instead of doing nothing
- `Notify when updates are available` in `Settings… → Updates` takes effect as soon as it is switched, instead of at the next start
- **Meru Pro:** When a Pro trial has ended, pointing at `Pro trial ended` in the titlebar shows `Upgrade to Meru Pro` in full, instead of cutting off its ends
- Right-clicking a link in a Workspace app offers `Copy Link Address` for the link and `Copy URL` for the page you're on, instead of two items both named `Copy Link`, and a tab's menu says `Copy URL` too
- **macOS:** A downloaded file is marked as coming from the internet, so macOS checks an app, installer or script before it opens, the way it does for a browser download
- The notification sound volume slider stops at 5%, the quietest volume Meru plays, instead of reaching a 0% that was ignored
- **Windows and Linux:** The Edit menu no longer shows a Speech submenu, whose items did nothing there
- The close button on the unified inbox and the download history says what it closes, instead of offering to close settings that are not open
- **Meru Pro:** The Pro trial's days left show as whole days, or less than a day, in the titlebar and in `Settings… → License`, instead of fractions like 1.5 day
- Keyboard focus is visible again in Meru's own interface: buttons, switches, checkboxes, tabs and sliders draw a focus ring when you tab to them, instead of leaving you to guess where you are
- Tab walks the page you are on rather than the titlebar and the tab strip around it, the way it already does in Gmail
- **Windows and Linux:** F10, and a tap of Alt, open the app menu from anywhere in the window, so it no longer takes a click
- Closing Settings, the unified inbox or the download history puts the keyboard back in your mail, so you can type straight away instead of first clicking the page
- **Meru Pro:** Changing label colors in quick succession leaves only the latest colors in Gmail, instead of sometimes keeping earlier colors applied alongside them
- Restarting to install an update reopens the tabs you had open, the way any other quit does, instead of losing recent changes to them
- Back and forward buttons on a mouse set up with Logi Options+ go back and forward in Gmail and Google apps, as does a three-finger swipe between pages on a trackpad.
- An account that needs attention at launch, such as one signed out, shows its attention icon, instead of leaving it off until something else about the accounts changed
- <kbd>Shift</kbd>-clicking a link to a Gmail page opens it in a new window, instead of showing an error and an empty window
- **Linux:** On Wayland, Meru's window appears when it starts, instead of only when it is opened a second time
- **Windows and Linux:** In the context menu, `Paste and Match Style` has its own access key, M, instead of sharing P with `Paste`
- **Meru Pro:** A Workspace apps window that closes itself closes cleanly, instead of showing an error that keeps coming back
- **Meru Pro:** A pinned Workspace app tab whose page closes itself stays in the tab strip, ready to open again, instead of disappearing for good; an unpinned one comes back with `Reopen Closed Tab`
- **Meru Pro:** When the Workspace app tab in front closes itself, Gmail comes to the front, instead of another tab's page showing while Gmail is selected
- Settings and the unified inbox fit a narrow window, instead of cutting off their switches, buttons and close button at the right edge
