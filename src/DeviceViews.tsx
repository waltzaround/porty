import { useEffect, useRef, useState } from 'react';
import { deviceTopology, type InventoryDevice, type TopologyNode } from '../shared/topology';
import type { Port } from '../shared/types';

export function DeviceViews({ ports, devices }: { ports: Port[]; devices: InventoryDevice[] }) {
  const [tab, setTab] = useState('List');
  const [selection, setSelection] = useState<{ id: string; cable: boolean } | null>(null);
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => { if (selection) inspector.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [selection]);
  const nodes = deviceTopology(ports, devices);
  const selected = nodes.find(n => n.id === selection?.id);
  const positioned: (TopologyNode & { x: number; y: number })[] = [];
  function place(id: string, depth: number) {
    const node = nodes.find(n => n.id === id)!;
    positioned.push({ ...node, x: 24 + depth * 290, y: 24 + positioned.length * 100 });
    nodes.filter(n => n.parent === id).forEach(n => place(n.id, depth + 1));
  }
  place('computer', 0);
  const parent = nodes.find(n => n.id === selected?.parent);
  const cable = selection?.cable && selected?.device && !selected.uncertain && parent?.port ? parent.port.connection?.cable : undefined;
  return <section className="device-views">
    <div className="detail-tabs" role="tablist" aria-label="Connected device views">
      {['List', 'Node view'].map(name => <button key={name} role="tab" id={`devices-${name === 'List' ? 'list' : 'nodes'}-tab`} aria-selected={tab === name} aria-controls="device-view-panel" onClick={() => setTab(name)}>{name}</button>)}
    </div>
    <div id="device-view-panel" role="tabpanel" aria-labelledby={`devices-${tab === 'List' ? 'list' : 'nodes'}-tab`}>
    {!devices.length && <p className="section-note">No connected devices detected. Refresh after connecting a device.</p>}
    {tab === 'List' ? <div className="settings-group">{nodes.filter(n => n.device).map(node => <button className="inventory-device" key={node.id} onClick={() => setSelection({ id: node.id, cable: false })}>
      <span><strong>{node.name}</strong><small>{node.device!.detail}</small>{node.device!.parentName && <small>Via {node.device!.parentName}</small>}</span><span>{node.device!.port}</span>
    </button>)}</div> : <>
      <p className="section-note">Select a node for device details or a line for cable details. Dashed lines indicate an unknown upstream mapping. USB branches may share a physical socket.</p>
      <div className="topology-scroll"><div className="topology-canvas" style={{ width: Math.max(850, ...positioned.map(n => n.x + 260)), height: Math.max(320, positioned.length * 100 + 24) }}>
        <svg aria-label="Connection links" className="topology-links" width="100%" height="100%">
          {positioned.filter(n => n.parent).map(node => {
            const from = positioned.find(n => n.id === node.parent)!;
            const d = `M ${from.x + 230} ${from.y + 34} C ${from.x + 260} ${from.y + 34}, ${node.x - 30} ${node.y + 34}, ${node.x} ${node.y + 34}`;
            return <g key={node.id} role="button" tabIndex={0} aria-label={`Cable: ${from.name} to ${node.name}`} onClick={() => setSelection({ id: node.id, cable: true })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelection({ id: node.id, cable: true }); } }}>
              <path d={d} className="link-hit"/><path d={d} className={`link-line ${node.uncertain ? 'uncertain' : ''} ${selection?.cable && selection.id === node.id ? 'selected' : ''}`}/>
              <title>{from.name} → {node.name}</title>
            </g>;
          })}
        </svg>
        {positioned.map(node => <button key={node.id} className={`topology-node ${node.device?.kind === 'hub' ? 'hub' : ''} ${!selection?.cable && selection?.id === node.id ? 'selected' : ''}`} style={{ left: node.x, top: node.y }} onClick={() => setSelection({ id: node.id, cable: false })}><strong>{node.name}</strong><small>{node.detail}</small></button>)}
      </div></div>
    </>}
    </div>
    {selected && <section ref={inspector} className="topology-inspector" aria-label={selection?.cable ? 'Cable details' : 'Device details'} aria-live="polite">
      <button className="button inspector-close" onClick={() => setSelection(null)}>Close details</button>
      <h3>{selection?.cable ? 'Cable details' : selected.device?.kind === 'hub' ? 'Hub details' : 'Device details'}</h3>
      <h4>{selection?.cable ? `${parent?.name} → ${selected.name}` : selected.name}</h4>
      {selection?.cable ? <>
        {selected.uncertain && <p>Upstream mapping is not reported. This line does not establish a physical cable.</p>}
        {cable?.length ? <dl>{cable.map(c => <div key={c.label}><dt>{c.label}</dt><dd>{c.value}<small>{c.detail}</small></dd></div>)}</dl> : <p>Cable identity and ratings are not reported for this connection. It may be internal wiring or an adapter connection.</p>}
        {selected.device?.linkSpeed && <p>Negotiated device link: {selected.device.linkSpeed}. This is not a cable rating.</p>}
      </> : <>
        <p>{selected.device?.detail || selected.port?.protocol || 'This computer is the host for the detected connections.'}</p>
        {selected.device && <dl>
          <div><dt>Connected through</dt><dd>{selected.device.parentName || selected.device.port}</dd></div>
          <div><dt>Current link</dt><dd>{selected.device.linkSpeed || 'Not reported'}</dd></div>
          {selected.device.portMapping && <div><dt>Port mapping</dt><dd>{selected.device.portMapping}</dd></div>}
        </dl>}
        {selected.device?.hubPorts && <><h4>Reported hub paths</h4><dl>{selected.device.hubPorts.map((p, i) => <div key={i}><dt>{p.internal ? 'Internal link' : 'Port'} {p.number || i + 1} · {p.connector}</dt><dd>{p.devices.join(', ') || 'No data device'}<small>{p.internal ? 'Fixed internal connection' : p.status}</small></dd></div>)}</dl></>}
        {selected.port && <p>{selected.port.location} · {selected.port.status}</p>}
      </>}
    </section>}
  </section>;
}
