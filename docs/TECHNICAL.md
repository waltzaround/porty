# Porty technical documentation

[Back to Porty](../README.md) · Commands below run from the repository root unless noted otherwise.

A local Electron app for macOS and Windows that explains physical computer ports, grouped by connector shape. Built with React, TypeScript, Vite, and Electron.

## Landing page

The separate [landing page](../landing/README.md) uses Vite, React, shadcn/ui, and Tailwind. Run `npm ci` and `npm run dev` from `landing/` to preview it on port 5180. Its dependencies and static build are separate from the desktop app. Public download links are configured through the landing page's environment variables.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

`npm run dev` starts Vite and Electron together. Renderer changes reload automatically; restart the command after editing the Electron main process or native collectors.

```sh
npm run build       # Type check, build renderer/main/preload, generate native icons
npm start           # Launch the built desktop app
npm run dev:web     # Browser preview with clearly labeled sample data
npm run scan        # Print a real local scan as JSON, without opening a window
npm test            # Hardware parser and evidence-handling regression tests
```

## Features

- Physical connector groups: USB-C, USB-A, HDMI, DisplayPort, SD card, audio, MagSafe, Ethernet, and USB with an unreported shape.
- Compact System Settings-style layout, system light/dark appearance, native macOS window controls and sidebar vibrancy. Port details use a compact sheet with expandable explanations.
- The port list shows current negotiated data links, current display resolution and refresh rate, and current power. Empty ports show a dash; missing readings stay unreported. Power uses measured Mac input telemetry when available, with an explicitly labeled negotiated USB-PD limit as a fallback. Published display limits, common formats and the shared display budget remain in the detail sheet, with the five largest resolutions shown initially and See more to expand the catalog.
- SD card rows show inserted card type, capacity, volume format and current bus mode. Headphone rows show sample rate, channel count and default-output status. Their detail sheets use the same relevant stats. macOS matches volume formats by the SD slot’s disk identity and restricts headphone stats to the built-in audio endpoint; unrelated USB, Bluetooth and display audio settings are excluded.
- HDMI, DisplayPort and detected monitor inputs show current resolution, refresh rate and display audio format, with no charging-power column or Power tab. Display audio is matched only to a uniquely named HDMI/DisplayPort audio endpoint. MagSafe shows measured input, negotiated power, contract voltage and current limit. USB-A shows data and accessory power. Ethernet keeps the network link and duplex separate from its USB adapter link; network readings remain unreported when the collector cannot supply them. Detail tabs and capability rows follow each connector’s functions.
- USB-C detail panel separates data bandwidth, USB support, display output, charging input, accessory power output, and current device link.
- Every capability identifies its evidence: OS detection, a manufacturer specification, or unreported information.
- Connected device inventory, connector/status filters, capability search, keyboard search shortcut, manual refresh, and 15-second polling enabled by default in the desktop app.
- macOS physical connection records detect charging-only cables and named power adapters. Selected USB-PD input limits are separated from actual power draw and cable ratings. Hub details retain downstream port records and parent device names.
- Scan results omit machine serial numbers, platform UUIDs, USB instance IDs and raw USB container IDs. USB grouping uses scan-local container tokens and numeric port routes. JSON output remains available through `npm run scan`.
- macOS dock groups combine uniquely matched USB 2/3 companion hubs using container identity and upstream route. Captive/internal links remain inspectable but do not count as external sockets. A uniquely mapped USB-C monitor names the shared connection group; this does not assert that every downstream device is inside the monitor. USB interfaces and drivers are not counted as separate devices. Missing identities and ambiguous displays remain separate.
- Local processing; no telemetry, remote fonts, backend service, or network dependency for scanning. Source links open in the default browser when clicked.

## What can actually be detected

**macOS:** reads `system_profiler`, USB port subtrees and physical `IOPort` records with `ioreg`. Both registry queries include `-l` so descendant device properties are included, not just node names. USB 2 and USB 3 paths are merged by their USB-C receptacle number. Connected devices are attached to their parent connector when that relationship is reported. USB4/Thunderbolt receptacles supplement the registry. Physical connection state detects power-only connections; currently reported adapter identity and selected power options come from the active port's descendants. Stale identities on disconnected ports are ignored. Hub port records remain under the hub, since USB 2/3 branches may represent the same physical socket and do not reliably expose chassis shape.

Verified profiles for the **2024 14-inch and 16-inch MacBook Pro with M4 Pro/Max** (`Mac16,5`, `Mac16,6`, `Mac16,7`, `Mac16,8`) add the built-in HDMI, SDXC, audio, and MagSafe connectors plus published USB-C capabilities. Other Macs use live detection and explicitly report incomplete model coverage. Extend `shared/profiles.ts` using exact identifiers and source URLs; never copy a neighboring model’s specifications.

**Windows:** a bundled PowerShell script loads a helper DLL precompiled at build time using Windows .NET Framework. Source checkouts compile the C# helper on demand. It enumerates USB hubs with SetupAPI and makes read-only `DeviceIoControl` requests for connector properties, companion mappings, protocol flags, and connection speed. It merges companion paths, excludes known internal connections, and reads named non-USB connectors from firmware (`Win32_PortConnector`). No device reset, configuration change, driver install, or permanent PowerShell policy change is performed. Restricted enterprise policy may prevent the helper from running; failures appear in scan notes.

Windows monitors and USB hubs connected by separate cables are grouped automatically only when Windows reports the same valid physical-device Container ID for one display and one hub (or one verified USB 2/3 companion pair). Missing or ambiguous identities stay separate; names and product IDs are never used to guess enclosure ownership. The port inventory groups the matched monitor's display input and USB sockets, and device details identify the association. Each cable retains its actual upstream route. Raw Container IDs are replaced with scan-local tokens. This cross-cable association currently applies to Windows; macOS does not yet provide a verified matching identity in Porty's scan.

**Detection limits:** there is no universal OS API for a complete chassis connector inventory or every USB-C capability. Unused video/audio ports, per-port PD profiles, exact maximum speed, alternate modes, cable ratings, and physical left/right placement often cannot be read. Unknown means unreported, not unsupported. “No data device” means no USB/Thunderbolt device was enumerated; charging-only and display-only cables may still be attached. A non-Type-C Windows flag does not prove Type-A, so those connectors remain unclassified. Connected USB device names can be ambiguous for identical devices.

Thunderbolt 5’s 80 Gb/s bidirectional bandwidth is distinguished from its asymmetric 120 Gb/s display Bandwidth Boost. Neither is a measured file-transfer rate. Charging input is distinct from accessory power output.

**Display limits:** the bundled M4 Pro/Max profiles use Apple's March 2026 display-support guidance for Thunderbolt and HDMI. A supported port can carry up to 8K at 60 Hz, 5K at 120 Hz, or 4K at 240 Hz. Those limits describe alternative modes, not 8K at 240 Hz. Multiple displays share the computer's display budget: M4 Pro supports two at 6K 60 Hz or 4K 144 Hz; M4 Max supports four at those modes, with higher-mode configurations detailed in the app. The detected chip selects the budget. Display, cable and adapter support still matter. Other models and Windows ports explicitly show unreported maximums; a connected monitor's current resolution or a Thunderbolt bandwidth figure is not used to infer a port maximum. Non-video connectors show no native video output.

## Current readings

macOS USB speeds come from the devices directly attached to each connector; both active USB 2 and USB 3 companion links may appear. They describe negotiated link speeds, not measured file-transfer throughput. External display modes come from System Information. Monitor manufacturer/product IDs are matched to the active display identity on each physical port, allowing distinct monitors to show their current modes on separate USB-C and HDMI rows. Raw monitor identity data and serial bytes are not exported. If identity data is unavailable, a single monitor can be associated with the only active native video port when all other video ports report inactive; the detail sheet identifies this inference. Identical monitors and ambiguous routes remain in the system inventory without guessed per-port modes.

Current input power comes from `AppleSmartBattery.PowerTelemetryData.SystemPowerIn` (milliwatts). It is assigned only when one reported USB-PD input matches the active adapter’s voltage and current contract. Battery charging power alone and the adapter’s advertised maximum are not used as measured port power. Missing telemetry, multiple reported inputs and mismatched snapshots retain the labeled negotiated fallback. See this [power telemetry probe](https://gist.github.com/robzr/2abf9c7e7f576d8af00d90b671489b48) for the underlying fields and units. Windows current USB speeds use its hub queries. Active Windows monitors come from read-only QueryDisplayConfig and DisplayConfigGetDeviceInfo calls, with product names, current signal resolution and fractional refresh rates. Identical monitors remain separate by display target. HDMI/DisplayPort transport is shown without guessing which USB hub or chassis socket owns the display; port maximums and power stay unreported. See [Microsoft's active display query](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig).

## Package

See [release preparation](../RELEASING.md) for signing setup, package verification, automated smoke checks, and the remaining hardware/release checklist. Public Windows releases use `npm run release:win`; `dist:win` creates unsigned test builds.

```sh
npm run package    # Unpacked app for the current platform under release/
npm run dist:mac   # DMG and ZIP; run on macOS
npm run dist:win   # Windows installer and portable EXE; run on Windows
```

Build each platform on its native OS. Development builds are unsigned; configure Apple Developer signing/notarization or Windows code signing before distributing publicly. The GitHub Actions workflow builds on both platforms, tests the parsers, compiles the Windows helpers, verifies and smoke-tests packaged apps, and uploads unsigned test installers.

### Build on Windows

From PowerShell in the project folder, with Node.js 22.12+ installed:

```powershell
npm ci
npm test
npm run dist:win
```

The Windows build reuses the Electron runtime installed by `npm ci`, avoiding an archive-extraction folder rename that failed with `EPERM` on the tested Windows machine. The outputs are `release/Porty Setup 1.0.3.exe` (installer), `release/Porty 1.0.3.exe` (portable app), and `release/win-unpacked/Porty.exe` (unpacked app). These are unsigned development builds.

Validated on Windows 11 Pro x64 with Node.js 22.17.0: all 79 tests passed, both C# native helpers compiled, both Windows packages built, and the unpacked app passed launch, live scan, port details, search, connection filtering, device view, and manual refresh checks. The updated local scan returned 18 host connector entries and 16 physical USB devices, including six hub controllers, with no native-query failures. The C922 webcam was mapped to its exact downstream hub socket. Three DELL U2715H monitors were detected independently at 2560 × 1440 and 59.951 Hz (two DisplayPort, one HDMI). Counts reflect the connected hardware and firmware reports, not a verified count of chassis sockets. Dock ownership and physical unplug/replug behavior still require hands-on testing.

## Validation

Tested locally on an Apple M4 Max MacBook Pro: real scan, packaged Electron launch, connector grouping, capability inspection, search, and status filters. The live scan identified seven physical host ports, including three USB-C / Thunderbolt 5 ports. The 79 tests cover companion deduplication, unknown models, missing registry data, internal-port exclusion, unknown speed/power handling, firmware ports, report privacy, paired display modes, chip-specific display budgets, unknown display limits, sanitized live charger and Dell USB-tree fixtures, stale identity removal, downstream hub ports, current values, ambiguous monitor mapping, measured power validation, card formats, unplugged card state, headphone routing and connector-specific stats. Dock regressions cover interface deduplication, binary port properties, internal branches, USB 2 accessories on companion sockets, generic names, external hubs, missing identities and independent cables. Windows native hardware behavior requires a Windows machine; the included Windows CI step compiles the helper but cannot substitute for hardware tests.

### Windows hub grouping

The Windows collector uses SetupAPI device identities, Configuration Manager parent relationships and per-port driver-key queries to associate each connected device with its hub socket. Root-hub ports stay under the computer; external hub sockets appear under their owning hubs. Composite USB functions are collapsed into their physical device. Bus-reported product names replace generic driver names when available. USB 2/3 hub branches combine only with a shared container and an explicit companion upstream route; missing identities remain unpaired. Raw instance IDs, driver keys and container IDs are not exported. See [Microsoft's driver-key query](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/usbioctl/ns-usbioctl-_usb_node_connection_driverkey_name). Windows display-to-dock routing and physical unplug/replug still need hardware validation. A shared host cable alone is not proof of enclosure ownership.

## Design and security

The renderer is sandboxed, with Node integration disabled and context isolation enabled. A narrow preload bridge exposes only scanning and opening allowlisted source links. The main process validates IPC senders, denies permission requests and new windows, and blocks renderer navigation. OS probes use fixed executable paths and argument arrays, with timeouts and bounded output.

## Sources

- [Apple: identify MacBook Pro models](https://support.apple.com/en-us/108052)
- [Apple: 16-inch MacBook Pro, 2024](https://support.apple.com/en-us/121554)
- [Apple: 14-inch MacBook Pro with M4 Pro/Max, 2024](https://support.apple.com/en-us/121553)
- [Apple: MacBook Pro display modes and simultaneous display limits](https://support.apple.com/en-us/101571)
- [Intel: Thunderbolt 5 bandwidth](https://www.intel.com/content/www/us/en/newsroom/news/intel-introduces-thunderbolt-5-standard.html)
- [Microsoft: USB connector properties and companion ports](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/usbioctl/ns-usbioctl-_usb_port_connector_properties)
- [Microsoft: USB protocol and operating-speed query](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/usbioctl/ni-usbioctl-ioctl_usb_get_node_connection_information_ex_v2)
- [Windows SDK USB structure definitions](https://github.com/microsoft/win32metadata/blob/main/generation/WinSDK/RecompiledIdlHeaders/shared/usbioctl.h)
- [Electron: security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)

## Cable and power decoding

The macOS decoder adapts the MIT-licensed WhatCable implementation at commit `3810eda84e415ad76616d361bb7c4d4126fd1024`. It reads per-port advertised power profiles, the selected contract, SOP'/SOP'' e-marker identity and cable VDOs, and controller diagnostics. Profiles are grouped by USB-PD, Brick ID and TypeC. E-marker presence is distinguished from a readable identity. Cable limits remain separate from adapter capacity, selected input and actual draw. This backend is macOS-specific; Windows retains unreported fields where its collector cannot supply them. See [third-party notices](../THIRD_PARTY_NOTICES.md) and [WhatCable](https://github.com/darrylmorley/whatcable).
