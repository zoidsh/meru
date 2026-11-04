# Changelog

This file is the draft of the next release, written one line at a time as work lands, in the section layout of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A stable release's version commit empties the section and its lines become the notes on the GitHub Release, so released versions are never listed here; see https://github.com/zoidsh/meru/releases for those.

## [Unreleased]

### Fixed

- Clicking a link in `Settings… → What's new` opens it in your browser, instead of replacing Meru's window with the page.
- **Copy Link Address**, **Copy Image Address** and **Copy Email Address** in the right-click menu copy again, where they had stopped doing anything
- **Save Image As…** in the right-click menu always asks where to save, starting in your download location, where it could save without asking or start in your Downloads folder
- The download notification shows a file name with text like `\x41` in it as saved, where it decoded that text into another character
