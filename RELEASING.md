# Release preparation

## Test builds

Use Node.js 22.12+ and `npm ci`. On Windows:

```powershell
npm test
npm run dist:win
npm run verify:package
npm run test:packaged
npm run size:report
```

These produce unsigned test installers. The standard CI workflow builds actual Windows installers and macOS DMG/ZIP packages, verifies package contents and security settings, and smoke-tests the packaged app. CI smoke checks permit unavailable hardware queries on hosted runners; local smoke checks require successful hardware queries. CI does not replace physical hardware testing.

## Signed Windows release

Configure a Windows code-signing certificate in the `production` GitHub environment:

- `WINDOWS_CSC_LINK`: certificate file encoded for electron-builder (for example, base64 PFX).
- `WINDOWS_CSC_KEY_PASSWORD`: its password.

Keep credentials in the secret store. Do not commit them. Alternatively, provide `CSC_LINK`/`CSC_KEY_PASSWORD` (or `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) locally and run `npm run release:win`.

The release command refuses to run without signing credentials, forces signing, checks Authenticode validity on the app, installer and portable EXE, verifies package contents and fuses, and smoke-tests the app. The `Signed Windows release candidate` workflow runs on a `v*` tag or manual dispatch. Tags must match the package version. It uploads artifacts only; publishing is a separate action. Signing-service integrations need their own configuration; no service credentials are configured in this repository.

Increment the version with `npm version patch --no-git-tag-version` (or minor/major), review the package/lockfile changes, commit, then tag the matching version. The UI reads its version from package.json. Version 1.0.1 contains the Windows hardware, node-view and production-hardening updates.

## Package guarantees

Version 1.0.3 refines the connection map with dark node cards, device icons, centered branches, zoom, fit-to-view, branch focus, and search that keeps upstream ancestry. `npm run test:ui` checks those interactions against local Windows hardware after a build. `npm run capture:product` captures the actual app for the landing page; screenshot assets are outside the desktop package. The packaged smoke check remains suitable for hosted CI without attached peripherals.

- Renderer source maps are disabled. Main/preload maps are stored privately in `.artifacts/sourcemaps/<version>/`; they are excluded from packages and CI uploads. Retain these privately with the corresponding release/commit if needed for debugging.
- The build bundles dependencies, excludes duplicate `node_modules`, and collects their licence texts into `licenses/dependencies/DEPENDENCIES.txt`. Existing WhatCable notices and Electron's runtime licence files remain included.
- Packaged DevTools and development menu entries are disabled. The production renderer has `connect-src 'none'`; the local WebSocket exception exists only in Vite's development server.
- Node-as-runtime mode, Node environment options and Node CLI inspection are disabled. Archive integrity validation and loading only from `app.asar` are enabled. These protect the application archive, not every external resource.
- Windows C# helpers compile into `Porty.Native.dll` at build time; C# source is excluded from packages. Hardware probing still runs through PowerShell and remains subject to Windows policy.
- `verify:package` checks these archive, policy, version, licence, native-resource and fuse invariants. `test:packaged` uses a temporary loopback Chromium debugging connection to exercise the real hardened executable; it does not re-enable Node inspection or change fuses.

## Size policy

- Chromium UI resources are restricted to English (US/UK). Porty currently has an English-only UI. This does not remove Unicode support or hardware names in other languages. Add locales explicitly when localizing the app.
- Main/preload code is minified, with `process.platform` resolved for the build host so unused platform branches can be removed. Build each OS on its native runner; do not reuse one OS's compiled JavaScript for another OS.
- Maximum compression is enabled. Windows NSIS differential packaging is disabled because there is no updater: full-download compression takes priority. Re-evaluate this when adding differential updates.
- macOS maximum compression selects a bzip2-compressed DMG and stronger ZIP compression. Intel and Apple Silicon builds run separately in CI, with architecture-labelled filenames; no universal binary is generated. These settings require validation on the Mac runners.
- Graphics/software-rendering fallbacks, ICU Unicode data, and Chromium/Electron licence notices remain intact. Removing them risks compatibility or missing notices.
- `npm run size:report` writes `release/size-report.json`. CI enforces a 1 MiB application-archive budget, and Windows budgets of 320 MiB unpacked and 95 MiB per download. Budget failures require investigation rather than silently raising limits.

## Remaining release checks

Before public distribution, test clean install, upgrade from an earlier build, uninstall, standard-user launch, sleep/wake, device/display unplug-replug, identical accessories, and representative docks. Test enterprise PowerShell restrictions and graceful missing readings. Verify downloaded signed artifacts on a clean Windows machine. macOS signing and notarization also need credentials and separate validation before a macOS public release.

There is no automatic updater, remote telemetry, or uploaded crash reporting. For now distribute updates manually through a trusted release location. Choose an update host and signing policy before implementing automatic updates. Privacy-safe diagnostic export and broader hardware coverage remain follow-up work.
