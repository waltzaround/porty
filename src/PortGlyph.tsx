import type { Connector } from "../shared/types";

export function PortGlyph({
  type,
  small = false,
}: {
  type: Connector;
  small?: boolean;
}) {
  return (
    <span
      className={`port-glyph ${small ? "small" : ""} connector-${type.replace(/[^a-z]/gi, "").toLowerCase()}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 44" fill="none">
        {type === "USB-C" ? (
          <>
            <rect
              x="9"
              y="11"
              width="46"
              height="23"
              rx="11.5"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <rect
              x="13"
              y="15"
              width="38"
              height="15"
              rx="7.5"
              fill="currentColor"
              opacity=".07"
            />
            <path
              d="M23 22.5h18"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </>
        ) : type === "USB-A" || type === "USB (unclassified)" ? (
          <>
            <rect
              x="10"
              y="10"
              width="44"
              height="25"
              rx="3"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path d="M19 18h26" stroke="currentColor" strokeWidth="5" />
            <path d="M24 16v4m8-4v4m8-4v4" stroke="white" strokeWidth="2" />
          </>
        ) : type === "HDMI" || type === "DisplayPort" ? (
          <>
            <path
              d="M10 12h44v13l-8 8H18l-8-8V12Z"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path d="M20 19h24v7H20z" fill="currentColor" opacity=".17" />
            <path
              d="M23 21h18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="2 2"
            />
          </>
        ) : type === "Display (unclassified)" ? (
          <>
            <rect
              x="10"
              y="6"
              width="44"
              height="27"
              rx="3"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path
              d="M32 33v6m-9 0h18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </>
        ) : type === "SD card" ? (
          <>
            <rect
              x="9"
              y="16"
              width="46"
              height="12"
              rx="2"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path d="M16 22h32" stroke="currentColor" strokeWidth="2" />
            <path
              d="M17 17v5m5-5v5m5-5v5m5-5v5m5-5v5m5-5v5m5-5v5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </>
        ) : type === "Audio" ? (
          <>
            <circle
              cx="32"
              cy="22"
              r="14"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <circle
              cx="32"
              cy="22"
              r="7"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <circle cx="32" cy="22" r="3" fill="currentColor" opacity=".15" />
          </>
        ) : type === "MagSafe" ? (
          <>
            <rect
              x="9"
              y="13"
              width="46"
              height="18"
              rx="9"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            {[20, 26, 32, 38, 44].map((x) => (
              <circle key={x} cx={x} cy="22" r="2" fill="currentColor" />
            ))}
          </>
        ) : (
          <>
            <path
              d="M12 10h40v22H41v5H23v-5H12V10Z"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path
              d="M20 12v7m6-7v7m6-7v7m6-7v7m6-7v7"
              stroke="currentColor"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    </span>
  );
}
