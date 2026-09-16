# Startup, macOS access, and connection history

## The reported blank-window incident

The report describes a distributed app running without a visible interface after an unknown permission prompt was dismissed. Reinstalling later restored it; a local build worked. The prompt, affected build, and startup logs were not captured, so the original cause is unconfirmed. This is not evidence that deleting an app resets permissions after a particular delay.

Code inspection found three separate gaps now addressed:

- Main-window load, preload, renderer-crash, and startup-timeout failures had no recovery UI or diagnostics. There is now a native reload/recovery dialog, a visible HTML startup fallback, a React error boundary, and a production Reload menu. Help offers a restart with basic graphics without deleting application data or changing macOS security policy.
- A failed combined System Information query discarded otherwise usable USB and physical-port readings. Queries are now separated, individually bounded, and missing sources are labelled. A later refresh retries them; no permission decision is cached by Porty. A total failure gives an actionable retry message, while previous successful results remain visible.
- The scanner bridge previously being absent selected sample data silently. A packaged app with a missing bridge now shows a startup failure instead.

Startup diagnostics are in the system's application logs directory (`~/Library/Logs/Porty` on macOS), accessible through Help → Troubleshooting even if the web interface is unavailable. The log records version/platform, startup stages, and error categories. It excludes hardware inventories, command output, serial numbers, and user paths. Files rotate at 200 KB and are never uploaded automatically.

A native UI startup timeout is separate from a slow scan: the interface signals readiness as soon as it renders, without waiting for hardware discovery. The whole scan is also bounded, aborts outstanding commands on timeout, and releases its pending request so Refresh can retry.

## Accessory approval is controlled by macOS

Apple silicon Mac laptops can ask whether a USB/Thunderbolt accessory or SD card may connect. A blocked accessory can still supply charging power. Unlock the Mac and reconnect the accessory to trigger a new approval opportunity. Administrators can manage this policy. [Apple's accessory approval guidance](https://support.apple.com/en-us/102282)

Porty reads System Information, IORegistry, and display/USB change notifications. It does not capture the screen, camera, microphone, keyboard, or mouse, and does not request full-disk access. Its Chromium permission handler rejects browser permission requests; that handler does not control macOS accessory authorization. Do not grant unrelated permissions or reset system privacy databases to troubleshoot an unknown prompt.

If the interface loads but a reading is missing, refresh and check Scan notes. A cable/device may simply omit capability information; a missing reading does not mean unsupported hardware, a disconnected cable, or a denied permission. If macOS explicitly reports an administrator restriction, ask the machine's administrator.

Developer ID signing and notarization are separate distribution work. This local build still uses an ad-hoc signature. These changes do not claim to notarize the app or bypass managed policy. Test the next distributed build on the affected managed Mac to confirm the incident is resolved.

## Event log

- macOS: a signed, bundled native helper listens for USB arrival/removal, display configuration, and power-source notifications. USB/display events are recorded immediately; expensive scans are coalesced afterward. A brief disconnect and reconnect can therefore be retained even if both happen between scans.
- Windows and unavailable native-listener fallback: scan comparisons run every 15 seconds. Short changes that happen entirely between scans may be missed. The UI identifies the monitoring mode.
- Scan comparisons include devices, display modes, link speeds, charging contracts, and reported endpoint statistics. Routine changes in measured watts are excluded. Failed/partial source reads never imply a disconnect. Repeated names are not treated as stable identity, and ambiguous registry-ID churn is omitted from scan diffs; native notifications preserve actual arrival/removal edges.
- USB notifications describe OS device functions, including internal dock components. Several entries from one dock do not necessarily mean several physical cables were unplugged. A display reconfiguration also does not establish the cause of the change.
- History contains the last 500 entries for this app session and survives an interface reload. Quit ends the session. Save log writes a local JSON file containing device names and observed timestamps; review it before sharing. No automatic telemetry is sent.
- Auto-refresh controls native monitoring and periodic scans together. Manual refreshes still record observed differences while auto-refresh is off. Sleep/wake creates a notice; Porty cannot guarantee events while the computer sleeps or the app is closed.

Native APIs: [IOServiceAddMatchingNotification](https://developer.apple.com/documentation/iokit/1514362-ioserviceaddmatchingnotification), [display reconfiguration callback](https://developer.apple.com/documentation/coregraphics/cgdisplayreconfigurationcallback). Interface recovery uses Electron's [webContents lifecycle events](https://www.electronjs.org/docs/latest/api/web-contents).
