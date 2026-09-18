# Grouping docks, DisplayLink, and multiple displays

Implemented: 16 September 2026. The investigation below records the evidence and remaining platform limitations.

## Implemented behavior

- `shared/device-groups.ts` builds a shared presentation model for Port Explorer and the connection map/list. It folds unique USB 2/3 companions and captive internal functions into one device, retains the useful dock product name, and keeps removable accessories separate.
- Dock summaries stack monitor names with resolution and refresh rate. Duplicate names receive display labels, not invented socket numbers. Missing modes remain visible. Connections can be collapsed and the map inspector retains integrated component details.
- Host input power and the negotiated charging limit are shown separately, only for a uniquely identified direct upstream connection. Downstream ports do not inherit these readings.
- Reported monitor enclosure identity and Windows display-adapter USB ancestry take priority. A shared host route or a sole possible display connection is explicitly labelled **Inferred**. Missing host state, multiple possible docks, virtual displays, and conflicting identities prevent the fallback. Membership is recalculated on every scan.
- macOS matches native displays independently of explicit USB/virtual graphics. USB graphics never use the native one-monitor fallback. The DX3's three displays currently use the visible inference because their exact per-output routes are unavailable.
- Windows now queries the display adapter interface and walks its PnP parents to a physical USB device, emitting only the same opaque ID used by the USB inventory. Real Windows driver behavior and native helper execution still need validation on Windows hardware. Thunderbolt devices also depend on the available host/USB ancestry; missing enclosure boundaries are not treated as proven membership.
- Regression tests cover the sanitized DX3 setup, native USB-C/Thunderbolt routes, two docks, identical monitors, removable graphics adapters, missing modes, virtual/conflicting routes, privacy, and unplugging.

## Finding

Porty can present one dock with its displays, USB connections, and charging information. The model needs to distinguish a physical device from its functions and downstream accessories. A monitor's identity is not the identity of the dock driving it.

The current Mac provided a useful real example:

- ALOGIC DX3 Docking Station, USB vendor `0x17e9`, is a non-removable child of the USB 3 hub on USB-C 1.
- The root USB 2/3 branches share a container and upstream route. Their internal sub-hubs also form a companion pair.
- Sennheiser Profile and Logitech StreamCam appear as removable downstream accessories.
- Three active displays are reported: MSI MD272QXP and two Q27B3M monitors, all at 2560 × 1440 and 60 Hz.
- USB-C 1 reports USB 2, USB 3, native DisplayPort, and a 100 W negotiated charging contract. Measured power input was 3.4 W in this scan; these are different readings.

ALOGIC documents two DisplayLink outputs plus one native DisplayPort Alt Mode output on the DX3. Thus a dock can mix display transports over one upstream cable. This hardware description corroborates the setup but is not proof of an individual monitor's active route. [ALOGIC DX3](https://business.alogic.co/products/dx3-triple-4k-display-universal-docking-station-aeu-with-100w-power-delivery)

## Why the current presentation splits it

Replaying the live scan through `portInventory()` produced the host, one `USB2.1 Hub` group, and three separate monitor groups.

- `shared/port-inventory.ts` already collapses internal sub-hubs and unambiguous USB 2/3 companion pairs. It names the resulting group after its first hub and skips the dock's internal DisplayLink function as a standalone row, losing the useful dock name.
- `shared/monitor-associations.ts` deliberately accepts only a single monitor sharing an enclosure identity with one hub or one companion pair. Removing the single-monitor guard alone would incorrectly treat dock outputs as one monitor enclosure.
- `electron/collectors/mac-current.ts` matches native displays using manufacturer/product identity. The two Q27B3M displays have the same identity, so the native match is correctly left unresolved.
- In this live System Information report, all three monitors appear under `Apple M4 Max`; no `DisplayLink` GPU name is present. GPU-name checks cannot reliably identify DisplayLink outputs.
- `shared/current.ts` flattens multiple resolutions and refresh rates into separate slash-separated strings. This loses useful per-display alignment and makes identical monitors hard to distinguish.
- `shared/port-inventory.ts` omits power devices from external groups; current charging data remains on the host connector.

## Proposed presentation

One expandable **ALOGIC DX3 Docking Station** entry, connected through **USB-C 1**. Its summary has columns for **Displays**, **USB link**, and **Power to computer**.

The Displays column stacks one entry per active display, keeping its resolution and refresh rate together:

```text
MSI MD272QXP   2560 × 1440 · 60 Hz
Q27B3M 1      2560 × 1440 · 60 Hz
Q27B3M 2      2560 × 1440 · 60 Hz
```

These are the modes observed in the scan, not a verified assignment of all three outputs to the dock. Show the association status when routing evidence is incomplete. Number identical display names for readability without assigning unreported physical socket numbers. Preserve separate identities even if names and modes match. A missing mode stays visible as “Not reported.”

Expanding the dock reveals downstream sockets and attached accessories. Internal hub chips, composite interfaces, and companion paths stay available in technical details without becoming extra physical devices or sockets. A separately plugged-in hub remains an expandable child device.

Show measured power to the computer when its host route is known; show the negotiated charging limit separately. Do not describe laptop power input as total dock consumption or copy it to every downstream port. Network speed, audio formats, and storage capacity need their own mapped endpoint readings.

## Evidence and data model

Add a shared presentation model used by Port Explorer and Connected Devices:

```ts
interface PhysicalDeviceGroup {
  id: string;
  name: string;
  kind: 'dock' | 'hub' | 'monitor';
  memberIds: string[];          // Integrated functions, not every descendant.
  upstreamPortId?: string;
  displayConnections: {
    displayId: string;
    evidence: 'reported' | 'inferred';
    reason: string;
  }[];
}
```

Keep reported USB parentage and raw display identities separate from presentation membership. A display driven by a dock is an attached display, not an integrated dock component. Keep the existing single-monitor enclosure association for monitors with built-in USB hubs.

Resolve grouping in this order:

1. Use exact device identity and driver/USB parent relationships.
2. Collapse only confirmed companion paths and non-removable internal links. Choose the meaningful product name from a confirmed integrated function, such as the DX3's DisplayLink function. Do not use names as the matching key.
3. Associate native and USB display routes independently, then collect both under their common dock.
4. When the available routes leave exactly one plausible dock, an explicitly labelled inference may be useful. One connected cable or simultaneous appearance alone is not universal physical-identity proof.
5. With multiple plausible docks, remote/virtual displays, conflicting identities, or missing evidence, retain unassigned displays. A user-confirmed association can be a later fallback; refresh and unplug must invalidate stale associations.

DisplayLink's USB vendor ID identifies the technology, not a unique dock or its monitor connections. [DisplayLink identification](https://support.displaylink.com/knowledgebase/articles/618597-my-displaylink-device-does-not-work-at-all-when-co)

## Platform collection

### macOS

The USB parent tree, non-removable flags, companion metadata, physical port state, display modes, and charging telemetry already provide most of the inputs for this DX3. Retain the dock identity during grouping.

Exact DisplayLink output ownership remains the missing input. DisplayLink Manager sends rendered display content over USB; native DisplayPort EDIDs cannot describe those USB graphics routes. Investigate per-display OS/driver identity and compare it with the USB function. No documented public DisplayLink-to-USB mapping API was established by this investigation. Do not assume a GPU called DisplayLink exists, use display names as identity, or infer routes from display ID ranges. [DisplayLink Manager architecture](https://support.displaylink.com/knowledgebase/articles/2024872-displaylink-manager-first-time-configuration)

If using stronger EDID/serial identity to disambiguate native monitors, compare internally and emit only opaque scan-local association tokens. Raw serials and EDIDs should remain outside exported scans. A dock profile can document supported outputs, but must not invent current connections.

### Windows

The native collector currently reads active display targets and the monitor's container ID. Extend it to query `DISPLAYCONFIG_ADAPTER_NAME`, resolve that adapter interface through SetupAPI, and inspect PnP ancestors for the USB graphics function. Match the resulting identity to the USB inventory, then group confirmed captive components beneath the owning dock.

This is a documented API route to investigate and test on real Windows hardware, not a guarantee that every DisplayLink driver exposes a usable parent chain. Monitor containers may represent the external monitor itself, and a display-adapter identity alone does not identify a physical dock.

References: [Adapter device path](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-displayconfig_adapter_name), [PnP parent lookup](https://learn.microsoft.com/en-us/windows/win32/api/cfgmgr32/nf-cfgmgr32-cm_get_parent), [Monitor container identity](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/container-id-support-for-displays-), [Indirect display adapters and multifunction devices](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/iddcx-objects).

## Implementation and validation order

1. Introduce the shared device-group model and retain the real dock name using confirmed USB ancestry.
2. Represent current displays as structured entries and render stacked `resolution · Hz` values, including missing readings.
3. Add display ownership evidence to each platform collector. Keep native display matching independent of USB/virtual graphics detection.
4. Add the dock summary, USB children, and host charging summary without duplicating power or counting internal chips as physical ports.
5. Capture sanitized fixtures from the DX3 and a Windows machine. Test two identical monitors, mixed native/DisplayLink outputs, two identical docks, independent cables, external hubs, missing containers, unavailable driver relations, and unplug/replug. Existing monitor-enclosure and power-attribution tests should remain valid.

The initial investigation used a read-only scan and replay. The implementation above changes presentation and collection without changing hardware configuration. Private diagnostic captures remain in ignored `.tmp/`; the committed DX3 regression fixture contains only selected, sanitized fields.

## Monitor hubs, scaling, and transport (September 2026 feedback)

- A monitor hub may own USB ports, charging, its own panel, and downstream displays. Existing OS identity/ancestry and unique active-route rules establish the group. An exact monitor/component name match may label an already established group; it never merges devices. Multiple possible upstream connections remain unresolved.
- USB link speed belongs to the data branch. It is not the display link speed. Native display transport is retained when reported by System Information or matched against an active port EDID, in both the port and inventory views. An Apple GPU name alone cannot identify a physical transport.
- macOS may report a scaled desktop size alongside a larger backing pixel size. Keep both; mark the desktop HiDPI when both axes have larger backing dimensions. Neither is verified wire timing. Never unconditionally divide a resolution by two. The supplied U4025QW example becomes 3840 × 1620 at 60 Hz (HiDPI), with 7680 × 3240 backing pixels.
- Current input watts, the selected USB-PD contract limit, and the source's advertised maximum are separate readings. Low current input does not imply a low-power charger.
- BetterDisplay supports flexible HiDPI scaling, virtual displays, and EDID overrides. That can affect reported modes/identities; the transcript alone does not establish that it caused a fault. See [BetterDisplay](https://github.com/waydabber/BetterDisplay) and [Apple display mode properties](https://developer.apple.com/documentation/coregraphics/cgdisplaymode).
- Dell documents the U4025QW's Thunderbolt upstream carrying video/data/power and downstream supporting display daisy chaining. See [Dell specifications](https://www.delltechnologies.com/asset/en-us/products/electronics-and-accessories/technical-support/dell-ultrasharp-40-curved-thunderbolt-hub-monitor-u4025qw-cvaa-datasheet.pdf).

The transcript did not include the referenced scan attachments. The monitor-hub regression is synthetic; actual U4025QW/U27 ancestry, Billboard placement, BetterDisplay virtual records, and the 120 Hz constraint still need a scan from that machine. Do not attribute that refresh limit to a cable, macOS, or BetterDisplay without evidence.
