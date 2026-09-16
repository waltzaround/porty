import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Cable,
  ChevronRight,
  CircleHelp,
  CornerUpLeft,
  Focus,
  HardDrive,
  Headphones,
  Keyboard,
  Laptop,
  List,
  Maximize,
  Minus,
  Monitor,
  Mouse,
  Network,
  Plus,
  Usb,
  Webcam,
  X,
  Zap,
} from "lucide-react";
import {
  deviceTopology,
  type InventoryDevice,
  type TopologyNode,
} from "../shared/topology";
import {
  connectionPath,
  layoutTopology,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "../shared/topology-layout";
import type { Port } from "../shared/types";
import { monitorAssociations } from "../shared/monitor-associations";
import type { PhysicalDeviceGroup } from '../shared/device-groups';
import { DeviceGroupSummary } from './DeviceGroupSummary';

function nodeIcon(node: TopologyNode) {
  if (node.id === "computer") return Laptop;
  if (node.group?.kind === 'monitor') return Monitor;
  if (node.group?.kind === 'dock') return Cable;
  if (node.device?.kind === "hub") return Network;
  if (node.device?.kind === "display") return Monitor;
  if (node.port)
    return /thunderbolt/i.test(node.port.protocol)
      ? Zap
      : node.port.connector === "Audio"
        ? AudioLines
        : /display|hdmi/i.test(node.port.connector)
          ? Monitor
          : Usb;
  // Icons are visual hints only; capability claims come from the scan.
  if (/webcam|camera|c922/i.test(node.name)) return Webcam;
  if (/headphone|headset|astro|a50/i.test(node.name)) return Headphones;
  if (/keyboard/i.test(node.name)) return Keyboard;
  if (/mouse|receiver/i.test(node.name)) return Mouse;
  if (/ssd|drive|storage/i.test(node.name)) return HardDrive;
  return Usb;
}
function nodeDetail(node: TopologyNode) {
  const mode = node.device?.displayMode;
  if (mode?.width && mode?.height)
    return `${mode.width} × ${mode.height}${mode.refreshHz ? ` · ${Number(mode.refreshHz.toFixed(2))} Hz` : ""}`;
  return node.detail;
}

export function DeviceViews({
  ports,
  devices,
  query = "",
  groups = [],
}: {
  ports: Port[];
  devices: InventoryDevice[];
  query?: string;
  groups?: PhysicalDeviceGroup[];
}) {
  const [tab, setTab] = useState("Node view");
  const [selection, setSelection] = useState<{
    id: string;
    cable: boolean;
  } | null>(null);
  const [branch, setBranch] = useState("computer");
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 500 });
  const inspector = useRef<HTMLDialogElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const nodes = useMemo(() => deviceTopology(ports, devices, groups), [ports, devices, groups]);
  const associations = useMemo(() => monitorAssociations(devices), [devices]);
  const root = nodes.find((node) => node.id === branch) ?? nodes[0];
  const search = query.trim().toLowerCase();
  const matches = new Set(
    nodes
      .filter((node) =>
        `${node.name} ${node.detail}`.toLowerCase().includes(search),
      )
      .map((node) => node.id),
  );
  const visibleNodes = useMemo(() => {
    if (!search) return nodes;
    const retained = new Set(["computer"]);
    for (const node of nodes) {
      if (!`${node.name} ${node.detail}`.toLowerCase().includes(search))
        continue;
      let current: TopologyNode | undefined = node;
      while (current && !retained.has(current.id)) {
        retained.add(current.id);
        current = nodes.find((item) => item.id === current?.parent);
      }
    }
    return nodes.filter((node) => retained.has(node.id));
  }, [nodes, search]);
  const layout = useMemo(
    () => layoutTopology(visibleNodes, search ? "computer" : root.id),
    [visibleNodes, root.id, search],
  );
  const fit = Math.min(
    1,
    (viewport.width - 20) / layout.width,
    (viewport.height - 20) / layout.height,
  );
  const zoom = manualZoom ?? Math.max(0.2, fit);
  const selected = nodes.find((node) => node.id === selection?.id);
  const parent = nodes.find((node) => node.id === selected?.parent);
  const cable =
    selection?.cable && selected?.device && !selected.uncertain && parent?.port
      ? parent.port.connection?.cable
      : undefined;
  const SelectedIcon = selected ? nodeIcon(selected) : Usb;
  const ancestorIds = new Set<string>();
  let ancestor = selected;
  while (ancestor && !ancestorIds.has(ancestor.id)) {
    ancestorIds.add(ancestor.id);
    ancestor = nodes.find((node) => node.id === ancestor?.parent);
  }
  useEffect(() => {
    if (selected && !inspector.current?.open) inspector.current?.showModal();
    if (!selected) inspector.current?.close();
  }, [selected?.id]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [tab]);
  useEffect(() => {
    setManualZoom(null);
    scroll.current?.scrollTo(0, 0);
  }, [branch, search]);
  const zoomBy = (delta: number) =>
    setManualZoom(Math.max(0.2, Math.min(1.5, zoom + delta)));
  function focusBranch(id: string) {
    setSelection(null);
    setBranch(id);
  }

  return (
    <section
      className={`device-views ${tab === "Node view" ? "node-mode" : ""}`}
    >
      <div className="device-view-toolbar">
        <div
          className="detail-tabs device-view-tabs"
          role="tablist"
          aria-label="Connected device views"
        >
          {["Node view", "List"].map((name, index) => (
            <button
              key={name}
              role="tab"
              tabIndex={tab === name ? 0 : -1}
              id={`devices-${name === "List" ? "list" : "nodes"}-tab`}
              aria-selected={tab === name}
              aria-controls="device-view-panel"
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                if (
                  ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "Node view"
                      : event.key === "End"
                        ? "List"
                        : index === 0
                          ? "List"
                          : "Node view";
                  setTab(next);
                  document
                    .getElementById(
                      `devices-${next === "List" ? "list" : "nodes"}-tab`,
                    )
                    ?.focus();
                }
              }}
            >
              {name === "List" ? <List size={14} /> : <Network size={14} />}
              {name === "Node view" ? "Connection map" : name}
            </button>
          ))}
        </div>
        <span className="view-toolbar-caption">Your setup, connected.</span>
        {tab === "Node view" && (
          <div className="graph-controls" aria-label="Map controls">
            <button
              aria-label="Zoom out"
              title="Zoom out"
              disabled={zoom <= 0.2}
              onClick={() => zoomBy(-0.1)}
            >
              <Minus size={15} />
            </button>
            <button
              className="zoom-value"
              aria-label="Reset zoom to 100 percent"
              onClick={() => setManualZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="Zoom in"
              title="Zoom in"
              disabled={zoom >= 1.5}
              onClick={() => zoomBy(0.1)}
            >
              <Plus size={15} />
            </button>
            <span />
            <button
              className="fit-view"
              onClick={() => {
                setManualZoom(null);
                scroll.current?.scrollTo(0, 0);
              }}
            >
              <Maximize size={14} />
              Fit view
            </button>
          </div>
        )}
      </div>
      <div
        id="device-view-panel"
        role="tabpanel"
        aria-labelledby={`devices-${tab === "List" ? "list" : "nodes"}-tab`}
      >
        {tab === "List" ? (
          <div className="settings-group device-list">
            {nodes
              .filter(
                (node) => node.device && (!search || matches.has(node.id)),
              )
              .map((node) => {
                const Icon = nodeIcon(node);
                return (
                  <button
                    className="inventory-device"
                    key={node.id}
                    onClick={() => setSelection({ id: node.id, cable: false })}
                  >
                    <span className="device-list-icon">
                      <Icon size={21} strokeWidth={1.5} />
                    </span>
                    <span>
                      <strong>{node.name}</strong>
                      <small>{node.device!.detail}</small>
                      {node.device!.parentName && (
                        <small>Via {node.device!.parentName}</small>
                      )}
                    </span>
                    <span>{node.device!.linkSpeed || node.device!.port}</span>
                    <ChevronRight size={14} />
                  </button>
                );
              })}
            {!nodes.some(
              (node) => node.device && (!search || matches.has(node.id)),
            ) && (
              <p className="section-note">
                {search
                  ? "No devices match your search."
                  : "No connected devices detected. Refresh after connecting a device."}
              </p>
            )}
          </div>
        ) : (
          <div className="topology-shell">
            <div className="map-context">
              <div>
                {root.id !== "computer" && !search ? (
                  <>
                    <button onClick={() => focusBranch("computer")}>
                      <CornerUpLeft size={13} />
                      All connections
                    </button>
                    <ChevronRight size={12} />
                    <span>{root.name}</span>
                  </>
                ) : (
                  <>
                    <Laptop size={14} />
                    <span>
                      {search ? `Search: ${query}` : "All connections"}
                    </span>
                  </>
                )}
                <span className="map-device-count">
                  {layout.nodes.filter((node) => node.device).length} devices
                </span>
              </div>
              <span>Drag to explore · select to inspect</span>
            </div>
            <div
              ref={scroll}
              className="topology-scroll"
              aria-label="Device connection map"
              onPointerDown={(event) => {
                if (
                  event.button !== 0 ||
                  (event.target as Element).closest("button, g[role=button]")
                )
                  return;
                const element = event.currentTarget;
                pan.current = {
                  x: event.clientX,
                  y: event.clientY,
                  left: element.scrollLeft,
                  top: element.scrollTop,
                };
                element.setPointerCapture(event.pointerId);
                element.classList.add("panning");
              }}
              onPointerMove={(event) => {
                if (pan.current) {
                  event.currentTarget.scrollLeft =
                    pan.current.left + pan.current.x - event.clientX;
                  event.currentTarget.scrollTop =
                    pan.current.top + pan.current.y - event.clientY;
                }
              }}
              onPointerUp={(event) => {
                pan.current = null;
                event.currentTarget.classList.remove("panning");
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onLostPointerCapture={(event) => {
                pan.current = null;
                event.currentTarget.classList.remove("panning");
              }}
            >
              <div
                className="topology-stage"
                style={{
                  width: Math.max(viewport.width, layout.width * zoom),
                  height: Math.max(viewport.height, layout.height * zoom),
                }}
              >
                <div
                  className="topology-canvas"
                  style={{
                    width: layout.width,
                    height: layout.height,
                    left: Math.max(
                      0,
                      (viewport.width - layout.width * zoom) / 2,
                    ),
                    top: Math.max(
                      0,
                      (viewport.height - layout.height * zoom) / 2,
                    ),
                    transform: `scale(${zoom})`,
                  }}
                >
                  <svg
                    aria-label="Connection links"
                    className="topology-links"
                    width="100%"
                    height="100%"
                  >
                    {layout.nodes
                      .filter((node) =>
                        layout.nodes.some((item) => item.id === node.parent),
                      )
                      .map((node) => {
                        const from = layout.nodes.find(
                            (item) => item.id === node.parent,
                          )!,
                          d = connectionPath(from, node);
                        return (
                          <g
                            key={node.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Cable: ${from.name} to ${node.name}`}
                            onClick={() =>
                              setSelection({ id: node.id, cable: true })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelection({ id: node.id, cable: true });
                              }
                            }}
                          >
                            <path d={d} className="link-hit" />
                            <path
                              d={d}
                              className={`link-line ${node.uncertain ? "uncertain" : ""} ${ancestorIds.has(node.id) ? "selected" : ""}`}
                            />
                            <circle
                              cx={from.x + NODE_WIDTH}
                              cy={from.y + NODE_HEIGHT / 2}
                              r="3"
                              className="link-socket"
                            />
                            <title>
                              {from.name} → {node.name}
                            </title>
                          </g>
                        );
                      })}
                  </svg>
                  {layout.nodes.map((node) => {
                    const Icon = nodeIcon(node);
                    return (
                      <button
                        key={node.id}
                        className={`topology-node ${node.device?.kind === "hub" ? "hub" : ""} ${node.id === "computer" ? "host" : ""} ${node.port ? "port-node" : ""} ${node.uncertain ? "unmapped" : ""} ${!selection?.cable && selection?.id === node.id ? "selected" : ""}`}
                        style={{ left: node.x, top: node.y }}
                        onClick={() =>
                          setSelection({ id: node.id, cable: false })
                        }
                        aria-label={`Inspect ${node.name}`}
                        title={`${node.name}\n${nodeDetail(node)}`}
                      >
                        <span className="node-icon">
                          <Icon size={23} strokeWidth={1.35} />
                        </span>
                        <span className="node-copy">
                          <strong>{node.name}</strong>
                          <small>{nodeDetail(node)}</small>
                        </span>
                        <span
                          className={`node-indicator ${node.uncertain ? "unknown" : ""}`}
                          title={
                            node.uncertain
                              ? "Connection inferred or upstream not reported"
                              : "System detected"
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="map-legend">
              <span>
                <i />
                Reported connection
              </span>
              <span>
                <i className="dashed" />
                Inferred or unreported
              </span>
              <span className="map-hint">
                <CircleHelp size={12} />
                USB branches may share a socket
              </span>
            </div>
          </div>
        )}
      </div>
      <dialog
        ref={inspector}
        className="topology-inspector"
        aria-labelledby="topology-detail-title"
        onCancel={() => setSelection(null)}
        onClose={() => setSelection(null)}
        onClick={(event) => {
          if (event.target === inspector.current) setSelection(null);
        }}
      >
        {selected && (
          <div className="inspector-content">
            <header className="inspector-header">
              <span className="inspector-eyebrow">A CLOSER LOOK</span>
              <button
                className="icon-button"
                autoFocus
                aria-label="Close details"
                onClick={() => setSelection(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="inspector-body">
              <span className="inspector-device-icon">
                {selection?.cable ? (
                  <Cable size={30} strokeWidth={1.3} />
                ) : (
                  <SelectedIcon size={30} strokeWidth={1.3} />
                )}
              </span>
              <h3 id="topology-detail-title">
                {selection?.cable
                  ? "Cable details"
                  : selected.device?.kind === "hub"
                    ? selected.group?.kind === 'dock' ? 'Dock details' : "Hub details"
                    : "Device details"}
              </h3>
              <h4 className="inspector-device-name">
                {selection?.cable
                  ? `${parent?.name} → ${selected.name}`
                  : selected.name}
              </h4>
              <span className="inspector-badge">
                <i />
                {selected.uncertain
                  ? selected.device?.portMapping?.startsWith('Inferred:') ? 'Inferred connection' : "Upstream not reported"
                  : "System detected"}
              </span>
              {selection?.cable ? (
                <>
                  {selected.uncertain && (
                    <p className="inspector-callout">
                      Upstream mapping is not reported. This line does not
                      establish a physical cable.
                    </p>
                  )}
                  {cable?.length ? (
                    <dl>
                      {cable.map((item) => (
                        <div key={item.label}>
                          <dt>{item.label}</dt>
                          <dd>
                            {item.value}
                            <small>{item.detail}</small>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>
                      Cable identity and ratings are not reported for this
                      connection. It may be internal wiring or an adapter
                      connection.
                    </p>
                  )}
                  {selected.device?.linkSpeed && (
                    <p className="inspector-callout">
                      Negotiated device link: {selected.device.linkSpeed}. This
                      is not a cable rating.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {selected.device?.detail ||
                      selected.port?.protocol ||
                      "This computer is the host for the detected connections."}
                  </p>
                  {selected.group && <>
                    <DeviceGroupSummary group={selected.group} />
                    <details className="integrated-components"><summary>Integrated components · {selected.group.members.length}</summary>
                      {selected.group.members.map(d => <div key={d.id}><strong>{d.name}</strong><small>{d.linkSpeed ?? d.detail}</small></div>)}
                    </details>
                  </>}
                  {selected.device?.id &&
                    associations.has(selected.device.id) && (
                      <p className="inspector-callout">
                        {selected.device.kind === "display"
                          ? "USB hub associated with this monitor"
                          : `Part of ${associations.get(selected.device.id)!.name}`}{" "}
                        · Matched by physical device identity.
                      </p>
                    )}
                  {selected.device && (
                    <dl>
                      <div>
                        <dt>Connected through</dt>
                        <dd>
                          {selected.device.parentName || selected.device.port}
                        </dd>
                      </div>
                      <div>
                        <dt>Current link</dt>
                        <dd>{selected.device.linkSpeed || "Not reported"}</dd>
                      </div>
                      {selected.device.displayMode && (
                        <div>
                          <dt>Display mode</dt>
                          <dd>{nodeDetail(selected)}</dd>
                        </div>
                      )}
                      {selected.device.portMapping && (
                        <div>
                          <dt>Port mapping</dt>
                          <dd>{selected.device.portMapping}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {nodes.some((node) => node.parent === selected.id) &&
                    selected.id !== "computer" && (
                      <button
                        className="focus-branch"
                        onClick={() => focusBranch(selected.id)}
                      >
                        <Focus size={15} />
                        Focus on this branch
                        <ChevronRight size={14} />
                      </button>
                    )}
                  {selected.device?.hubPorts && (
                    <>
                      <h4 className="inspector-section-heading">
                        Reported hub paths
                      </h4>
                      <div className="hub-path-list">
                        {selected.device.hubPorts.map((port, index) => (
                          <div key={index}>
                            <Usb size={16} />
                            <span>
                              <strong>
                                {port.internal ? "Internal link" : "Port"}{" "}
                                {port.number || index + 1}
                              </strong>
                              <small>
                                {port.connector === "USB (unclassified)"
                                  ? "Shape not reported"
                                  : port.connector}
                              </small>
                            </span>
                            <span>
                              {port.devices.join(", ") || "No data device"}
                              <small>
                                {port.internal
                                  ? "Fixed internal connection"
                                  : port.status}
                              </small>
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="inspector-callout">
                        USB 2 and USB 3 paths can describe the same physical
                        socket.
                      </p>
                    </>
                  )}
                  {selected.port && (
                    <dl>
                      <div>
                        <dt>Location</dt>
                        <dd>{selected.port.location}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{selected.port.status}</dd>
                      </div>
                    </dl>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
