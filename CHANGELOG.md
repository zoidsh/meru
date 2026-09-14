# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Added

- Settings → Extensions lets you add sites where 1Password runs, such as your company's single sign-on provider, beside Google's sign-in pages
- **Linux:** AppImageLauncher, AppImageUpdate, AM and other AppImage tools can now update the AppImage in place, downloading only the parts that changed

### Changed

- **Linux:** the AppImage for Intel and AMD machines is now named `Meru-<version>-x86_64.AppImage`, matching the arm64 one
- The 1Password extension's description in Settings → Extensions now says it needs the 1Password desktop app, and is no longer cut off after two lines
- Hide Gmail unread badge when active in Settings → Workspace apps is now Show Gmail unread badge, with a Never choice that hides the unread count on the Gmail tab altogether
- The Show extensions button setting and the titlebar button it showed are gone: the 1Password popup that button opened isn't fully supported in Meru, and 1Password is meant to be used on the Google sign-in pages, through its inline menu and the prompts it shows there
- On macOS 12 and earlier, this is the last version of Meru: it stops checking for updates there and gets no further fixes, security fixes included, so continued use on those Macs is at your own risk
- Upgraded Electron from 43.5.1 to 43.7.0, picking up the matching Chromium security and performance fixes

### Fixed

- On Windows, Meru can now be made the default mail client: it never appeared under Settings → Default apps, and the switch in Settings → General said Meru was the default while another app kept opening email links. The row now opens Meru's page in Windows Settings to choose it there
- With Extend dark theme on, mail composed in Gmail no longer carries the dark theme's light text colors into drafts and sent messages, which made them unreadable in light-themed mail clients
- Help → Report Issue, Ask Question and Request Feature open a compose window that follows Extend dark theme and Close compose window after send
- New mail notifications, verification codes included, no longer go missing for the first email after launch, for an email that arrives while another one is read, or for mail Gmail's feed reports late
