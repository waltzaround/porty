import type { PhysicalDeviceGroup } from "../shared/device-groups";
import { displayReadings } from "../shared/current";

export function DeviceGroupSummary({
  group,
  onDisplay,
}: {
  group: PhysicalDeviceGroup;
  onDisplay?: (id: string) => void;
}) {
  const readings = displayReadings(group.displays.map((d) => d.device));
  const power = group.powerPort?.connection?.power;
  const measured = power?.find(
    (p) => p.label === "Current power input" && p.evidence === "detected",
  );
  const negotiated = power?.find(
    (p) => p.label === "Selected power input" && p.evidence === "detected",
  );
  const maximum = power?.find(p => p.label === "Charger advertised maximum" && p.evidence === "detected");
  return (
    <div className="device-group-summary settings-group">
      <div className="dock-displays">
        <h3>
          Displays <span>{readings.length}</span>
        </h3>
        {readings.length ? (
          readings.map((reading, index) => {
            const connection = group.displays[index];
            const content = (
              <>
                <span className="dock-display-name">
                  {reading.label}
                  {connection.evidence === "inferred" && (
                    <small className="association-note">Inferred</small>
                  )}
                </span>
                <span>{reading.value}</span>
              </>
            );
            return onDisplay ? (
              <button
                key={reading.id}
                className="dock-display"
                title={connection.reason}
                onClick={() => onDisplay(reading.id)}
              >
                {content}
              </button>
            ) : (
              <div
                key={reading.id}
                className="dock-display"
                title={connection.reason}
              >
                {content}
              </div>
            );
          })
        ) : (
          <p className="secondary-text">None mapped</p>
        )}
        {group.displays.some((d) => d.evidence === "inferred") && (
          <p className="dock-mapping-note">
            Display routing inferred from the available connections.
          </p>
        )}
      </div>
      <div>
        <h3>USB data link</h3>
        <p title="Negotiated upstream USB link; not measured transfer throughput or Thunderbolt bandwidth.">
          {group.linkSpeed?.split(" + ").map((value) => (
            <span className="current-reading" key={value}>
              {value}
            </span>
          )) ?? "Not reported"}
        </p>
      </div>
      <div>
        <h3>Current power input</h3>
        <p title={measured?.detail}>
          {measured ? measured.value : "Not reported"}
        </p>
        {maximum && <small className="current-reading" title={maximum.detail}>{maximum.value} advertised maximum</small>}
        {negotiated && (
          <small title={negotiated.detail}>{negotiated.value} negotiated limit</small>
        )}
      </div>
    </div>
  );
}
