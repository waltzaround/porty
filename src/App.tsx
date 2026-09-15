import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Gauge,
  Info,
  Laptop,
  LayoutGrid,
  LoaderCircle,
  Monitor,
  Plug,
  RefreshCw,
  Search,
  X,
  Zap,
} from "lucide-react";
import type {
  Capability,
  ConnectedDevice,
  Connector,
  Evidence,
  DisplaySupport,
  Port,
  PortyAPI,
  Scan,
} from "../shared/types";
import { CONNECTORS } from "../shared/types";
import {
  displayLimits,
  displayResolutions,
  getDisplaySupport,
} from "../shared/display";
import { demoScan } from "../shared/demo";
import { currentPortValues, type CurrentValue } from "../shared/current";
import { displayAudioValue, portCapabilities, portSections, portStatLabels, portStats } from "../shared/port-stats";
import { portInventory } from "../shared/port-inventory";
import { DeviceViews } from "./DeviceViews";
import { PortGlyph } from "./PortGlyph";

declare global {
  interface Window {
    porty?: PortyAPI;
  }
}
const evidenceLabel: Record<Evidence, string> = {
  detected: "System detected",
  specification: "Manufacturer specification",
  unknown: "Not reported",
};
const statusLabel = {
  connected: "Connected",
  available: "No data device",
  unknown: "Status unknown",
};
const connectorLabel = (type: Connector) =>
  type === "Audio"
    ? "3.5 mm audio"
    : type === "USB (unclassified)"
      ? "Other USB"
      : type;

function DeviceHeader({ name, detail, kind, summary }: { name: string; detail: string; kind: "computer" | "display" | "device"; summary?: string }) {
  const Icon = kind === "computer" ? Laptop : kind === "display" ? Monitor : Plug;
  return <header className="machine-summary" aria-label={`${name} summary`}>
    <Icon size={34} strokeWidth={1.25} aria-hidden="true" />
    <div><h2>{name}</h2><p>{detail}</p></div>
    {summary && <span>{summary}</span>}
  </header>;
}

function EvidenceIcon({ evidence }: { evidence: Evidence }) {
  const Icon =
    evidence === "detected"
      ? CheckCheck
      : evidence === "specification"
        ? BookOpen
        : CircleHelp;
  return (
    <Icon
      size={12}
      className="evidence-icon"
      aria-label={evidenceLabel[evidence]}
    />
  );
}
function Status({ port }: { port: Port }) {
  return (
    <span className={`status ${port.status}`}>
      <i />
      {port.status === "available" && port.connection?.active === false
        ? "Not connected"
        : statusLabel[port.status]}
    </span>
  );
}
function HubPorts({ device }: { device: ConnectedDevice }) {
  if (device.kind !== "hub") return null;
  return (
    <div className="hub-ports">
      <strong>Reported hub ports</strong>
      {device.hubPorts?.length ? (
        device.hubPorts.map((port, i) => (
          <div key={i} className="hub-port-row">
            <span>{port.internal ? "Internal link" : "Port"} {port.number || i + 1}</span>
            <span>
              {port.connector === "USB (unclassified)"
                ? "Connector not reported"
                : port.connector}
            </span>
            <span>{port.devices.join(", ") || "No data device"}</span>
          </div>
        ))
      ) : (
        <p>Downstream port records were not exposed by this hub.</p>
      )}
      <p>USB 2 and USB 3 branches may describe the same physical socket.</p>
    </div>
  );
}
function CurrentCell({ metric, className = "" }: { metric: CurrentValue; className?: string }) {
  return <span className={`current-cell ${className} ${metric.reported ? "" : "secondary-text"}`} title={metric.detail}>
    {metric.value.split(" + ").map((value) => <span className="current-reading" key={value}>{value}</span>)}
    {metric.note && <small>{metric.note}</small>}
  </span>;
}
function PortRow({ port, onSelect }: { port: Port; onSelect: () => void }) {
  const stats = portStats(port);
  const monitor = port.devices.find(d => d.kind === "display" && d.portMapping);
  return (
    <button
      className={`port-row port-columns stats-columns-${stats.length}`}
      onClick={onSelect}
      aria-label={`Inspect ${port.name}`}
    >
      <span className="port-identity">
        <PortGlyph type={port.connector} />
        <span>
          <strong>{port.name}</strong>
          <small>
            {monitor?.name ?? port.devices[0]?.name ??
              (port.connection?.active ? port.connector === "SD card" ? "Card inserted" : "Cable connected" : port.protocol)}
            {!monitor && port.devices.length > 1 ? ` +${port.devices.length - 1}` : ""}
          </small>
        </span>
      </span>
      {stats.map(({ label, metric }) => <CurrentCell key={label} metric={metric} />)}
      <Status port={port} />
      <ChevronRight size={13} className="row-chevron" />
    </button>
  );
}
function CapabilityRow({ capability }: { capability: Capability }) {
  return (
    <details className="capability-row">
      <summary>
        <span>{capability.label}</span>
        <strong
          className={capability.evidence === "unknown" ? "secondary-text" : ""}
        >
          {capability.value}
        </strong>
        <EvidenceIcon evidence={capability.evidence} />
        <ChevronRight size={12} />
      </summary>
      <div className="capability-explanation">
        <p>{capability.detail}</p>
        <small>{evidenceLabel[capability.evidence]}</small>
      </div>
    </details>
  );
}
function ResolutionTable({ display }: { display: DisplaySupport }) {
  const [expanded, setExpanded] = useState(false);
  const resolutions = displayResolutions(display);
  const visible = expanded ? resolutions : resolutions.slice(0, 5);
  return (
    <div className="settings-group mode-group">
      <table className="mode-table" id="display-resolutions">
        <caption>Supported resolutions</caption>
        <thead>
          <tr>
            <th scope="col">Resolution</th>
            <th scope="col">Pixels</th>
            <th scope="col">Refresh rate</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((mode) => (
            <tr key={`${mode.width}-${mode.height}`}>
              <th scope="row">{mode.resolution}</th>
              <td>
                {mode.width.toLocaleString()} × {mode.height.toLocaleString()}
              </td>
              <td className={mode.refreshHz == null ? "secondary-text" : ""}>
                {mode.refreshHz == null
                  ? "Display-dependent"
                  : `${mode.refreshHz} Hz`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {resolutions.length > 5 && (
        <button
          type="button"
          className="mode-toggle"
          aria-expanded={expanded}
          aria-controls="display-resolutions"
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "See less" : "See more"}</span>
          <span className="mode-count">
            {visible.length} of {resolutions.length}
          </span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
function DetailPanel({
  port,
  onClose,
  openSource,
  demo,
}: {
  port: Port | null;
  onClose: () => void;
  openSource: (url: string) => void;
  demo: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState("Overview");
  const mediaPort = port?.connector === "SD card" || port?.connector === "Audio";
  const sections = portSections(port?.connector ?? "USB-C");
  const allTabs = ["Overview", "Power", sections.dataTab, "Other devices"];
  const tabs = allTabs.filter((_, i) => i === 0 || i === 3 || (i === 1 ? sections.power : sections.data || sections.display));
  useEffect(() => { setTab("Overview"); }, [port?.id]);
  const isPower = (label: string) => /charging|power/i.test(label);
  useEffect(() => {
    if (port && !ref.current?.open) ref.current?.showModal();
    if (!port) ref.current?.close();
  }, [port]);
  const display = port ? getDisplaySupport(port) : null;
  const current = port ? currentPortValues(port) : null;
  const displayAudio = port ? displayAudioValue(port) : null;
  const attachedMonitors = port?.devices.filter((d) => d.kind === "display") ?? [];
  const visibleMonitors = attachedMonitors;
  const showMonitors = display?.status !== "unsupported" || !!port?.devices.some((d) => d.kind === "hub" || d.kind === "display");
  const limits = display ? displayLimits(display) : {};
  const sources = port
    ? [
        ...new Set([
          ...(display?.status === "supported" ? [display.source] : []),
          ...port.capabilities.flatMap((c) => (c.source ? [c.source] : [])),
          ...(port.connection?.cable ?? []).flatMap((c) =>
            c.source ? [c.source] : [],
          ),
        ]),
      ]
    : [];
  return (
    <dialog
      ref={ref}
      className="detail-panel"
      aria-labelledby="detail-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {port && display && (
        <div className="sheet-content" key={port.id}>
          <header className="sheet-header">
            <span>Port details{demo ? " · Sample" : ""}</span>
            <button
              className="icon-button"
              autoFocus
              onClick={onClose}
              aria-label="Close port details"
            >
              <X size={16} />
            </button>
          </header>
          <div className="sheet-navigation">
            <div className="port-hero">
              <PortGlyph type={port.connector} />
              <div>
                <h2 id="detail-title">{port.name}</h2>
                <p>
                  {port.protocol} · {port.location}
                </p>
              </div>
              <Status port={port} />
            </div>
            <div className="detail-tabs" role="tablist" aria-label="Port details sections">
              {tabs.map((name, index) => (
                <button key={name} id={`port-tab-${allTabs.indexOf(name)}`} role="tab"
                  aria-selected={tab === name} aria-controls={`port-panel-${allTabs.indexOf(name)}`}
                  tabIndex={tab === name ? 0 : -1}
                  onClick={() => setTab(name)}
                  onKeyDown={(event) => {
                    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
                    if (next < 0) return;
                    event.preventDefault(); setTab(tabs[next]);
                    document.getElementById(`port-tab-${allTabs.indexOf(tabs[next])}`)?.focus();
                  }}>{name}</button>
              ))}
            </div>
          </div>
          <div className="sheet-scroll" key={tab}>
            <div role="tabpanel" id="port-panel-0" aria-labelledby="port-tab-0" hidden={tab !== "Overview"}>
              <section className="detail-section">
                <h3>Connection summary</h3>
                <dl className="settings-group overview-summary">
                  {portStats(port).map(({ label, metric }) => <div key={label}><dt>{label}</dt><dd title={metric.detail}>{metric.value}{metric.note ? ` · ${metric.note}` : ""}</dd></div>)}
                  {sections.display && displayAudio?.reported && !portStatLabels(port.connector).includes("Audio output") && <div><dt>Audio output</dt><dd title={displayAudio.detail}>{displayAudio.value}</dd></div>}
                  {!mediaPort && !!port.connection?.transports.length && <div><dt>Active transports</dt><dd>{port.connection.transports.join(" · ")}</dd></div>}
                  {showMonitors && (visibleMonitors.length ? visibleMonitors.map((monitor, index) => (
                    <div key={monitor.id ?? `monitor-${index}`}>
                      <dt>{visibleMonitors.length === 1 ? "Connected monitor" : `Monitor ${index + 1}`}</dt>
                      <dd className="monitor-summary"><strong>{monitor.name}</strong><span>{monitor.detail.replace(/\s*x\s*/g, " × ").replace(/\s*@\s*/g, " · ").replace(/(\d)Hz/g, "$1 Hz")}</span></dd>
                    </div>
                  )) : <div><dt>Connected monitors</dt><dd>None detected</dd></div>)}
                </dl>
                {attachedMonitors.some((d) => d.portMapping) && <p className="section-note">{attachedMonitors.find((d) => d.portMapping)!.portMapping}</p>}
              </section>
              {!!portCapabilities(port).length && <section className="detail-section">
                <h3>{port.connector === "SD card" ? "Card reader capabilities" : port.connector === "Audio" ? "Headphone jack capabilities" : "Port capabilities"}</h3>
                <div className="settings-group">{portCapabilities(port).map((capability, i) => <CapabilityRow key={`${capability.label}-${i}`} capability={capability} />)}</div>
              </section>}
            </div>
            <div role="tabpanel" id="port-panel-1" aria-labelledby="port-tab-1" hidden={tab !== "Power"}>
              <section className="detail-section">
                <h3>{port.connector === "USB-A" ? "Accessory power" : "Current & negotiated power"}</h3>
                <div className="settings-group">
                  {(port.connector === "USB-A" ? ["Current power output"] : ["Current power input", "Selected power input"]).map((label) => (
                    <CapabilityRow key={label} capability={port.connection?.active ? port.connection.power.find((c) => c.label === label) ?? { label, value: "Not reported", detail: "No current value reported for this port.", evidence: "unknown" } : { label, value: "Not reported", detail: "No power connection reported.", evidence: "unknown" }} />
                  ))}
                </div>
              </section>
            {port.connection?.active &&
              !!(
                port.connection.cable.length + port.connection.power.length
              ) && (
                <section className="detail-section">
                  <h3>Cable & charger capabilities</h3>
                  <div className="settings-group">
                    {[...port.connection.power.filter((c) => !["Current power input", "Selected power input"].includes(c.label)), ...port.connection.cable].map(
                      (c) => (
                        <CapabilityRow key={c.label} capability={c} />
                      ),
                    )}
                  </div>
                  {port.connection.powerSources?.map((source) => (
                    <div className="power-profile-group" key={source.name}>
                      <h4>{source.name} profiles</h4>
                      <div className="settings-group">
                        <table className="mode-table">
                          <thead>
                            <tr>
                              <th>Voltage</th>
                              <th>Current</th>
                              <th>Power</th>
                              <th>Contract</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...source.profiles].sort((a, b) => Number(b.selected) - Number(a.selected)).map((profile, i) => (
                              <tr
                                key={i}
                                className={
                                  profile.selected ? "selected-power" : ""
                                }
                              >
                                <th>{profile.volts} V</th>
                                <td>{profile.amps.toFixed(2)} A</td>
                                <td>{profile.watts} W</td>
                                <td>{profile.selected ? "Selected" : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  {!!port.connection.diagnostics?.length && (
                    <details className="connection-diagnostics">
                      <summary>
                        Connection diagnostics
                        <ChevronRight size={12} />
                      </summary>
                      <div className="settings-group">
                        {port.connection.diagnostics.map((c) => (
                          <CapabilityRow key={c.label} capability={c} />
                        ))}
                      </div>
                    </details>
                  )}
                </section>
              )}
              <section className="detail-section">
                <h3>Port power capabilities</h3>
                <div className="settings-group">
                  {portCapabilities(port).filter((c) => isPower(c.label)).map((c) => <CapabilityRow key={c.label} capability={c} />)}
                </div>
                {!port.connection?.power.length && <p className="section-note">No power connection reported.</p>}
              </section>
            </div>
            <div hidden={tab !== "Overview"}>
            {!!port.connection?.iokitProperties?.length && (
              <details className="connection-diagnostics raw-iokit">
                <summary>
                  Raw IOKit properties ({port.connection.iokitProperties.length})
                  <ChevronRight size={12} />
                </summary>
                <div className="settings-group">
                  <table aria-label="Raw IOKit properties">
                    <tbody>
                      {port.connection.iokitProperties.map(({ key, value }) => (
                        <tr key={key}><th scope="row">{key}</th><td>{value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            </div>
            <div role="tabpanel" id="port-panel-2" aria-labelledby="port-tab-2" hidden={tab !== sections.dataTab}>
            <section className="detail-section">
              <h3>{sections.dataTab === "Network" ? "Current network connection" : sections.display ? sections.data ? "Current data & display" : "Current display & audio" : "Current data"}</h3>
              <dl className="settings-group overview-summary">
                {portStats(port).filter(({ label }) => !/power|voltage|current limit/i.test(label)).map(({ label, metric }) => (
                  <div key={label}><dt>{label}</dt><dd title={metric.detail}>{metric.value}</dd></div>
                ))}
                {!!port.connection?.transports.length && <div><dt>Active transports</dt><dd>{port.connection.transports.join(" · ")}</dd></div>}
              </dl>
              {sections.display && current?.resolution.detail && <p className="section-note">{current.resolution.detail}</p>}
            </section>
            {sections.display && <section className="detail-section">
              <h3>Display capabilities</h3>
              {display.status === "supported" &&
              limits.resolution &&
              limits.refresh ? (
                <>
                  <div className="display-highlights">
                    <div>
                      <span>Maximum resolution</span>
                      <strong>
                        {limits.resolution.resolution}
                        <small> at {limits.resolution.refreshHz} Hz</small>
                      </strong>
                      <span>
                        {limits.resolution.width.toLocaleString()} ×{" "}
                        {limits.resolution.height.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span>Maximum refresh rate</span>
                      <strong>
                        {limits.refresh.refreshHz} Hz
                        <small> at {limits.refresh.resolution}</small>
                      </strong>
                      <span>
                        {limits.refresh.width.toLocaleString()} ×{" "}
                        {limits.refresh.height.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <ResolutionTable display={display} />
                  <p className="section-note">{display.note}</p>
                  {!!display.configurations.length && (
                    <details className="settings-group display-configurations">
                      <summary>
                        <Monitor size={14} />
                        <span>Multiple displays</span>
                        <span className="secondary-text">
                          Up to{" "}
                          {Math.max(
                            ...display.configurations.map((c) => c.displays),
                          )}{" "}
                          total
                        </span>
                        <ChevronRight size={12} />
                      </summary>
                      <div>
                        {display.configurations.map((config) => (
                          <p key={config.displays}>
                            <strong>
                              {config.displays}{" "}
                              {config.displays === 1 ? "display" : "displays"}
                            </strong>
                            <span>{config.detail}</span>
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <div className="settings-group display-unavailable">
                  <Monitor size={22} />
                  <div>
                    <strong>
                      {display.status === "unsupported"
                        ? "No native video output"
                        : "Resolution and refresh rate not reported"}
                    </strong>
                    <p>{display.note}</p>
                  </div>
                </div>
              )}
            </section>}
            {sections.data && !!portCapabilities(port).filter((c) => !isPower(c.label)).length && <section className="detail-section">
              <h3>{port.connector === "Ethernet" ? "Network capabilities" : "Port data capabilities"}</h3>
              <div className="settings-group">
                {portCapabilities(port).filter((c) => !isPower(c.label)).map((c, i) => (
                  <CapabilityRow key={`${c.label}-${i}`} capability={c} />
                ))}
              </div>
            </section>}
            </div>
            <div role="tabpanel" id="port-panel-3" aria-labelledby="port-tab-3" hidden={tab !== "Other devices"}>
            {!port.devices.length && <p className="section-note">No connected devices detected.</p>}
            {!!port.devices.length && (
              <section className="detail-section">
                <h3>Connected devices</h3>
                <div className="settings-group">
                  {port.devices.map((device, i) => (
                    <div className="attached-device" key={i}>
                      <Plug size={15} />
                      <div>
                        <strong>{device.name}</strong>
                        <p>{device.detail}</p>
                        {device.parentName && <p>Via {device.parentName}</p>}
                        <HubPorts device={device} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            </div>
            <details className="scan-details">
              <summary>
                Detection & sources
                <ChevronRight size={12} />
              </summary>
              <div>
                {port.note && <p>{port.note}</p>}
                <p>
                  {port.source.startsWith("https:")
                    ? "Matched to manufacturer specifications."
                    : port.source}
                </p>
              </div>
            </details>
            <div className="source-links">
              {sources.map((source, i) => (
                <button key={source} onClick={() => openSource(source)}>
                  {source.endsWith("101571")
                    ? "Apple display limits"
                    : source.includes("apple.com")
                      ? "Apple technical specifications"
                      : source.includes("github.com/darrylmorley/whatcable")
                        ? "WhatCable · MIT"
                        : "Thunderbolt specifications"}
                  <ExternalLink size={11} />
                  <span className="sr-only">Source {i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
function Guide() {
  return (
    <div className="guide">
      {[
        {
          icon: Plug,
          title: "Connector type",
          text: "USB-C describes the connector’s shape. Data, display and charging support vary by port and computer.",
        },
        {
          icon: Monitor,
          title: "Resolution & refresh rate",
          text: "Read each pair together: 8K at 60 Hz and 4K at 240 Hz are different modes. The display, cable, adapter and total display configuration can lower these limits. Unknown limits need the computer manufacturer’s specifications.",
        },
        {
          icon: Gauge,
          title: "Data transfer",
          text: "The port, cable and device determine your connection speed. A negotiated device link can be slower than the port’s maximum. Thunderbolt Bandwidth Boost describes asymmetric display bandwidth.",
        },
        {
          icon: Zap,
          title: "Power & charging",
          text: "Charging a computer and powering accessories are different capabilities. A charger’s wattage is not the port’s power output.",
        },
        {
          icon: Info,
          title: "Connection status",
          text: "“No data device” means no USB or Thunderbolt device was enumerated. Charging-only and display-only connections may still occupy the port. “Status unknown” means the scan could not determine whether the connector is in use.",
        },
      ].map(({ icon: Icon, title, text }) => (
        <section key={title}>
          <h2>{title}</h2>
          <div className="settings-group guide-item">
            <Icon size={21} />
            <p>{text}</p>
          </div>
        </section>
      ))}
      <section>
        <h2>Sources</h2>
        <div className="settings-group">
          {(["detected", "specification", "unknown"] as Evidence[]).map((e) => (
            <div className="guide-evidence" key={e}>
              <EvidenceIcon evidence={e} />
              <strong>{evidenceLabel[e]}</strong>
              <span>
                {e === "detected"
                  ? "Read from the operating system."
                  : e === "specification"
                    ? "Matched to a verified computer model."
                    : "Unavailable information; not necessarily unsupported."}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
export default function App() {
  const [scan, setScan] = useState<Scan | null>(() =>
    window.porty ? null : demoScan(),
  );
  const [loading, setLoading] = useState(!!window.porty);
  const [error, setError] = useState("");
  const [view, setView] = useState<"ports" | "devices" | "guide">("ports");
  const [connector, setConnector] = useState<Connector | "all">("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Port | null>(null);
  const [auto, setAuto] = useState(!!window.porty);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const rescan = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError("");
    try {
      const result = window.porty ? await window.porty.scan() : demoScan();
      setScan(result);
      setSelected((old) =>
        old ? (portInventory(result).flatMap(g => g.ports).find((p) => p.id === old.id) ?? null) : null,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The scan could not complete. Try again.",
      );
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }, []);
  useEffect(() => {
    if (window.porty) void rescan();
  }, [rescan]);
  useEffect(() => {
    if (!auto || !window.porty || scan?.demo) return;
    const timer = window.setInterval(() => void rescan(), 15000);
    return () => clearInterval(timer);
  }, [auto, rescan, scan?.demo]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        setView("ports");
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const hostPorts = scan?.ports ?? [];
  const devicePortGroups = useMemo(() => scan ? portInventory(scan) : [], [scan]);
  const ports = useMemo(() => devicePortGroups.flatMap(g => g.ports), [devicePortGroups]);
  const types = CONNECTORS.filter((type) =>
    ports.some((p) => p.connector === type),
  );
  const filtered = useMemo(
    () =>
      ports.filter((p) => {
        const display = getDisplaySupport(p);
        const modes = displayResolutions(display)
          .map(
            (mode) =>
              `${mode.resolution}${mode.refreshHz == null ? "" : ` at ${mode.refreshHz} Hz`} ${mode.width}x${mode.height}`,
          )
          .join(" ");
        return (
          (connector === "all" || p.connector === connector) &&
          (status === "all" || p.status === status) &&
          `${p.name} ${devicePortGroups.find(g => g.ports.includes(p))?.name ?? ""} ${p.protocol} ${p.connector} ${p.devices.map((d) => d.name).join(" ")} ${p.capabilities.map((c) => `${c.label} ${c.value}`).join(" ")} ${modes}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        );
      }),
    [ports, devicePortGroups, connector, status, query],
  );
  const devices = [
    ...hostPorts.flatMap((p) => p.devices.map((d) => ({ ...d, port: p.name, portId: p.id }))),
    ...(scan?.devices ?? [])
      .filter(
        (d) =>
          !hostPorts.some((p) =>
            p.devices.some((attached) =>
              d.id ? attached.id === d.id : attached.name === d.name,
            ),
          ),
      )
      .map((d) => ({ ...d, port: "System inventory" })),
  ].filter((d, i, all) => !d.id || all.findIndex((x) => x.id === d.id) === i);
  function navigate(type: Connector | "all") {
    setView("ports");
    setConnector(type);
    setQuery("");
    setStatus("all");
  }
  async function openSource(url: string) {
    try {
      if (window.porty) await window.porty.openExternal(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setToast("Could not open the source link.");
    }
  }
  const title =
    view === "guide"
      ? "Connection guide"
      : view === "devices"
        ? "Connected devices"
        : connector === "all"
          ? "All ports"
          : connectorLabel(connector);
  return (
    <div className={`app ${window.porty?.platform ?? "browser"}`}>
      <header className="app-titlebar" aria-label="Application title bar">
        {!window.porty && (
          <span className="traffic-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        <span>Porty</span>
      </header>
      <aside className="sidebar">
        <div className="search-field">
          <Search size={14} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setView("ports");
            }}
            placeholder="Search"
            aria-label="Search ports"
          />
          {query ? (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={12} />
            </button>
          ) : (
            <kbd>{window.porty?.platform === "win32" ? "Ctrl K" : "⌘K"}</kbd>
          )}
        </div>
        <nav aria-label="Port navigation">
          <h2>Hardware</h2>
          <button
            className={`nav-item ${view === "ports" && connector === "all" ? "active" : ""}`}
            aria-current={
              view === "ports" && connector === "all" ? "page" : undefined
            }
            onClick={() => navigate("all")}
          >
            <span className="nav-icon blue">
              <LayoutGrid size={14} />
            </span>
            <span>All ports</span>
            <b>{ports.length || "—"}</b>
          </button>
          <button
            className={`nav-item ${view === "devices" ? "active" : ""}`}
            aria-current={view === "devices" ? "page" : undefined}
            onClick={() => setView("devices")}
          >
            <span className="nav-icon green">
              <Plug size={14} />
            </span>
            <span>Connected devices</span>
          </button>
          <h2>Connector types</h2>
          {types.map((type) => (
            <button
              key={type}
              className={`nav-item ${view === "ports" && connector === type ? "active" : ""}`}
              aria-current={
                view === "ports" && connector === type ? "page" : undefined
              }
              onClick={() => navigate(type)}
            >
              <PortGlyph type={type} small />
              <span>{connectorLabel(type)}</span>
              <b>{ports.filter((p) => p.connector === type).length}</b>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === "guide" ? "active" : ""}`}
            aria-current={view === "guide" ? "page" : undefined}
            onClick={() => setView("guide")}
          >
            <span className="nav-icon gray">
              <BookOpen size={14} />
            </span>
            <span>Connection guide</span>
          </button>
          <span className="version">Porty 1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="toolbar">
          <h1>{title}</h1>
          <button
            className="toolbar-refresh"
            onClick={() => void rescan()}
            disabled={loading}
            aria-label={loading ? "Scanning ports" : "Refresh ports"}
            title="Refresh ports"
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            <span>{loading ? "Scanning…" : "Refresh"}</span>
          </button>
        </header>
        <main>
          {scan?.demo && (
            <div className="notice">
              <Info size={14} />
              <span>
                Sample hardware. Open the desktop app to scan your computer.
              </span>
              {window.porty && (
                <button onClick={() => void rescan()}>
                  Scan this computer
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              <Info size={16} />
              <span>
                {error}
                {scan && " Previous results are shown."}
              </span>
              <button
                onClick={() => {
                  setScan(demoScan());
                  setError("");
                  setAuto(false);
                }}
              >
                View sample
              </button>
            </div>
          )}
          {view === "guide" ? (
            <Guide />
          ) : loading && !scan ? (
            <div className="empty-state" role="status">
              <LoaderCircle size={25} className="spin" />
              <h2>Scanning ports…</h2>
            </div>
          ) : (
            scan && (
              <>
                {view === "devices" ? (
                  <>
                    <DeviceHeader name={scan.machine.name} detail={`${scan.machine.chip || scan.machine.model} · ${scan.machine.os}`} kind="computer" summary={`${ports.length} ports · ${devices.length} devices`} />
                    <DeviceViews ports={hostPorts} devices={devices} />
                  </>
                ) : (
                  <>
                    <div className="filter-bar">
                      <div
                        className="segmented-control"
                        role="group"
                        aria-label="Connection status"
                      >
                        {[
                          ["all", "All"],
                          ["connected", "Connected"],
                          ["available", "No data device"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            aria-pressed={status === value}
                            className={status === value ? "selected" : ""}
                            onClick={() => setStatus(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <span>
                        {filtered.length}{" "}
                        {filtered.length === 1 ? "port" : "ports"}
                      </span>
                    </div>
                    <div className="port-groups">
                      {devicePortGroups.map((owner) => {
                      const visible = owner.ports.filter(p => filtered.includes(p));
                      if (!visible.length && (owner.ports.length || connector !== "all" || status !== "all" || query)) return null;
                      return <section className="device-port-group" key={owner.id} aria-label={`${owner.name} ports`}>
                        <DeviceHeader
                          name={owner.name}
                          detail={owner.id === "host" ? `${scan.machine.chip || scan.machine.model} · ${scan.machine.os}` : owner.detail}
                          kind={owner.id === "host" ? "computer" : owner.ports.some(p => p.devices.some(d => d.kind === "display")) ? "display" : "device"}
                        />
                        {CONNECTORS.map((type) => {
                        const group = visible.filter(
                          (p) => p.connector === type,
                        );
                        if (!group.length) return null;
                        return (
                          <section
                            className="port-group"
                            key={type}
                            aria-label={`${connectorLabel(type)} ports`}
                          >
                            <div className={`group-heading port-columns stats-columns-${portStatLabels(type).length}`}>
                              <h2>
                                {connectorLabel(type)}
                                <span>{group.length}</span>
                              </h2>
                              {portStatLabels(type).map((label) => <span key={label}>{label}</span>)}
                              <span className="status-heading">Status</span>
                              <span />
                            </div>
                            <div className="settings-group">
                              {group.map((port) => (
                                <PortRow
                                  port={port}
                                  key={port.id}
                                  onSelect={() => setSelected(port)}
                                />
                              ))}
                            </div>
                          </section>
                        );
                      })}
                      </section>;
                      })}
                    </div>
                    {!filtered.length && (
                      <div className="empty-state">
                        <Search size={25} />
                        <h2>No matching ports</h2>
                        <button
                          className="button"
                          onClick={() => navigate("all")}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                    {!!scan.warnings.length && (
                      <details className="scan-details">
                        <summary>
                          <Info size={13} />
                          Scan notes<span>{scan.warnings.length}</span>
                          <ChevronRight size={12} />
                        </summary>
                        <div>
                          {scan.warnings.map((warning) => (
                            <p key={warning}>{warning}</p>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </>
            )
          )}
        </main>
        <footer>
          <span className="scan-status" role="status">
            <i className={error ? "failed" : loading ? "scanning" : ""} />
            {loading
              ? "Scanning…"
              : error
                ? "Scan incomplete"
                : scan?.demo
                  ? "Sample data"
                  : scan
                    ? "Scan complete"
                    : "Ready"}
          </span>
          {scan && (
            <time dateTime={scan.scannedAt}>
              {new Date(scan.scannedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          )}
          <label className="auto-refresh">
            <span>Auto-refresh · 15s</span>
            <input
              type="checkbox"
              role="switch"
              checked={auto}
              disabled={!window.porty || !!scan?.demo}
              onChange={(e) => setAuto(e.target.checked)}
              aria-label="Auto-refresh every 15 seconds"
            />
          </label>
        </footer>
      </div>
      <DetailPanel
        port={selected}
        onClose={() => setSelected(null)}
        openSource={(url) => void openSource(url)}
        demo={!!scan?.demo}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
