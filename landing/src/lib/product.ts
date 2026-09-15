export const product = {
  name: "Porty",
  title: "Porty — Hardware Connection Explorer for Mac and Windows",
  description:
    "Explore your hardware connections on Mac and Windows. Inspect USB, Thunderbolt, displays, network adapters, hubs, and connected devices.",
  summary:
    "See your devices, displays, and network connections in one place. Inspect USB, Thunderbolt, hubs, and docks on Mac and Windows.",
  features: [
    "USB connection map with hub branches, zoom, and device search",
    "USB and Thunderbolt ports, displays, and network adapters",
    "Reported link speeds, network status, and downstream hub ports",
    "Active display resolution and refresh rate",
    "Local, read-only hardware scans without an account or remote telemetry",
  ],
};

export const questions = [
  [
    "What exactly does Porty do?",
    "Porty brings your computer’s hardware connections into one view. Inspect USB and Thunderbolt devices, displays, and network adapters, then follow connected devices through hubs and docks.",
  ],
  [
    "Does it work with my computer?",
    "Porty is built for macOS and Windows. Both platforms use live hardware detection. Selected MacBook Pro models also have verified built-in connector profiles. The detail available depends on your computer, operating system, and connected hardware.",
  ],
  [
    "Can it tell me everything about every port?",
    "Some details simply aren’t exposed by the operating system. Porty leaves missing readings unreported instead of guessing. USB-C shape alone does not prove Thunderbolt, charging, or video support. Exact cable ratings and display-to-dock routes may also be unavailable.",
  ],
  [
    "Is my hardware information private?",
    "Yes. Hardware scans run locally on your computer. Porty has no account system, remote telemetry, or uploaded crash reporting. Raw hardware serials and machine identifiers are excluded from scan reports.",
  ],
  [
    "Will Porty change my devices or drivers?",
    "Porty uses read-only hardware queries. It does not install drivers, reset devices, or change their configuration. Windows hardware probing uses a bundled PowerShell helper and may be limited by managed-device policies.",
  ],
  [
    "How do I get the app?",
    "Choose Get Porty to download the current preview for macOS Apple Silicon, macOS Intel, or Windows 64-bit. Mac builds require macOS 12 or later. These previews are unsigned; publisher signing and wider hardware validation are still in progress. Check the download options for the current release and platform requirements.",
  ],
] as const;
