# Security Policy

## Supported Versions

Only the latest release gets security fixes, on both the stable and the beta channel. Meru updates itself, so a fix ships as a new release rather than a patch to an older one.

## Reporting a Vulnerability

Please don't report a vulnerability in a public issue, discussion or pull request.

Report it privately through [GitHub's security advisories](https://github.com/zoidsh/meru/security/advisories/new), or by email to tim@meru.so. Include the Meru version, your operating system, steps to reproduce, and what an attacker could do with it.

You'll get a reply within a week. Once a fix is released, the advisory is published with credit to you, unless you'd rather stay anonymous.

## Scope

In scope is Meru itself: the app, its updater, and how it handles Gmail, Google Workspace apps and browser extensions.

Out of scope:

- Vulnerabilities in Gmail or other Google services, which go to the [Google Bug Hunters](https://bughunters.google.com) program.
- Vulnerabilities in a third-party browser extension, which go to that extension's developer.
- Vulnerabilities in Electron or Chromium that Meru doesn't make worse, which go to [Electron](https://github.com/electron/electron/security/policy). Meru picks up their fixes with its Electron updates.
