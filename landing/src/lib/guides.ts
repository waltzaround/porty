export type GuideSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
  figure?: { src: string; alt: string; caption: string; width: number; height: number };
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  platform: string;
  summary: string;
  sections: GuideSection[];
  sources: { title: string; url: string }[];
};

export const guidePath = (guide: Guide) => `/guides/${guide.slug}/`;

export const guides: Guide[] = [
  {
    slug: "check-usb-speed-mac",
    title: "How to check USB connection speed on Mac",
    description: "Check the USB speed your Mac reports, trace a device through its hub in Porty, and distinguish a negotiated link from actual file-transfer speed.",
    platform: "macOS",
    summary: "Start with the speed reported for the connected device. A port’s advertised maximum, a cable’s power rating, and the speed of a file copy describe different things.",
    sections: [
      {
        id: "system-information", heading: "Check the device in System Information",
        paragraphs: ["macOS includes a hardware report, so you can make an initial check without installing another app. Apple documents the Option-key shortcut for opening it."],
        steps: [
          "Connect the device using the cable and hub you want to check.",
          "Hold Option, open the Apple menu, and choose System Information. You can also open System Settings → General → About → System Report.",
          "Under Hardware, select USB and find the connected device. Expand the relevant bus or hub if needed.",
          "Look for the Speed field in the selected device’s details. If it is missing, that view has not provided a usable speed reading.",
          "For Thunderbolt or USB4 equipment, also inspect the Thunderbolt/USB4 section. A USB device attached to a dock can still appear in the USB tree.",
        ],
      },
      {
        id: "porty", heading: "Follow the connection in Porty",
        paragraphs: ["Porty puts the reported devices and their parent hubs in a connection map. This is useful when several accessories share a dock: start at the accessory and follow its branch back toward the computer."],
        steps: [
          "Open Porty and refresh the hardware scan after connecting your device.",
          "Find the device in the connection map or port inventory and select it.",
          "Read its current link and inspect any parent hub. Compare those readings with the port’s listed capability.",
          "If the current link is unreported, use the OS report and the device manufacturer’s specifications for more context. A missing reading does not prove a slow connection.",
        ],
        figure: { src: "/screenshots/hub-current.png", width: 380, height: 94, alt: "Porty current-link details showing a USB hub connected at 480 Mb/s.", caption: "The current-link field in a real Windows capture of Porty. macOS exposes different details depending on the hardware." },
      },
      {
        id: "interpret", heading: "Understand what the number measures",
        paragraphs: ["A reading such as 480 Mb/s describes a USB link rate. It is not a live measurement of bytes copied each second. File transfers also depend on the storage device, file sizes, protocol overhead, and other traffic.", "A port capable of 10 Gb/s can have a slower device attached. Likewise, a cable that can deliver substantial charging power may only support USB 2.0 data. Check its data specification separately from its wattage."],
      },
      {
        id: "compare", heading: "Compare one part of the setup at a time",
        steps: [
          "Record the current device and hub readings before changing the setup.",
          "Eject any mounted storage, then connect the same device directly to the Mac if possible. Refresh the scan.",
          "Try a cable with a documented data rating suitable for the device. Keep the device and computer port the same.",
          "Reconnect the hub and compare again. If the slower reading returns only through the hub, check its upstream cable and the specification of that particular downstream port.",
        ],
        paragraphs: ["Porty reads the operating system’s hardware information. It does not benchmark storage or change a device’s negotiated speed. Use a separate transfer test if your question is how quickly a workload actually completes."],
      },
    ],
    sources: [
      { title: "Apple: open a system report", url: "https://support.apple.com/guide/system-information/system-information-user-guide-syspr35536/mac" },
      { title: "USB-IF: USB Type-C cable and connector guidance", url: "https://www.usb.org/sites/default/files/usb_type-c_language_product_and_packaging_guidelines_20230320.pdf" },
    ],
  },
  {
    slug: "usb-device-tree-windows",
    title: "How to view a USB device tree on Windows",
    description: "Trace USB devices through hubs on Windows using Porty or Microsoft USBView. Understand parent hubs, internal devices, and the limits of physical-port mapping.",
    platform: "Windows",
    summary: "A USB device tree shows the path from a host controller, through hubs, to connected devices. It helps you work out which accessories share a connection.",
    sections: [
      {
        id: "map", heading: "Explore the tree in Porty",
        steps: [
          "Connect the accessories you want to inspect, open Porty, and refresh the scan.",
          "Open the connection map. Search for the device name, or select its node in the map.",
          "Follow the branch toward the computer to identify the parent hub. Open a hub branch to focus on its downstream devices.",
          "Select the device or hub to inspect the reported current link, connection path, and available details.",
        ],
        figure: { src: "/screenshots/branch.png", width: 1440, height: 900, alt: "Real Porty Windows connection map with an A50 X headset and C922 webcam beneath USB hub branches.", caption: "A real Windows capture: an A50 X and C922 webcam on branches beneath a USB2.0 Hub. These readings describe this setup, not every device with the same name." },
        paragraphs: ["Start with a device you can identify, such as your webcam. A dock can contain several hubs and built-in devices, so one physical box may occupy multiple nodes in the tree. The map is most useful when you follow one known accessory at a time."],
      },
      {
        id: "usbview", heading: "Use Microsoft USBView for another view",
        paragraphs: ["Microsoft provides USBView with the Windows SDK’s Debugging Tools for Windows. Its left pane displays the USB connection tree; its right pane shows information about the selected device. Follow Microsoft’s installation instructions linked below.", "Microsoft notes that USBView may not display newer USB information. Device Manager is also useful for status and problem codes: open the device’s Properties and check the Details tab. A controller name alone does not establish an attached device’s active speed."],
        steps: [
          "Launch USBView and expand the relevant controller and hub entries in the left pane.",
          "Select your device, then inspect its configuration and descriptors in the right pane.",
          "Compare the device’s position with the branch shown in Porty. Different tools may group or label the same hardware differently.",
        ],
      },
      {
        id: "read-tree", heading: "Read the tree without counting every node as a socket",
        bullets: [
          "A host controller manages a USB bus; it is not necessarily a single external connector.",
          "A hub creates downstream branches. Several of its devices may share the upstream connection.",
          "An internal webcam, Bluetooth device, or dock component may appear alongside external accessories.",
          "USB 2 and USB 3 companion branches can represent the same physical hub or socket. Do not add their counts together to infer chassis ports.",
          "An unreported parent or route means the available scan did not establish that relationship. It does not mean the device is disconnected.",
        ],
      },
      {
        id: "identify", heading: "Identify an ambiguous branch",
        paragraphs: ["If several devices have the same generic name, note the current tree, disconnect one nonessential accessory, and refresh. Reconnect it and refresh again to see which branch changed. Eject storage before unplugging it, and avoid disconnecting the keyboard or mouse you need to control the computer.", "Porty uses read-only hardware queries. Managed Windows policies can restrict the helper or hide information. When that happens, keep the missing fields unreported and use the device’s documentation to fill in the context."],
      },
    ],
    sources: [
      { title: "Microsoft: USBView and Device Manager", url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/usbview" },
      { title: "Microsoft: USB host-side drivers and hubs", url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/usb-3-0-driver-stack-architecture" },
      { title: "Microsoft: USB Type-C interoperability and companion hubs", url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/type" },
    ],
  },
  {
    slug: "usb-3-hub-480-mbps",
    title: "Why does a USB 3 hub show 480 Mb/s?",
    description: "A 480 Mb/s reading can describe a USB 2 companion branch or a slower negotiated link. Learn which device to inspect and how to check the cable and hub path.",
    platform: "macOS & Windows",
    summary: "480 Mb/s is the USB 2.0 high-speed rate. Seeing it on one hub entry does not, by itself, prove that every port on your USB 3 dock is limited to that speed.",
    sections: [
      {
        id: "reading", heading: "First, check which node has the reading",
        paragraphs: ["A USB 3 hub can expose USB 2 and USB 3 companion branches. A keyboard or another USB 2 accessory can use the slower branch while a compatible device uses a faster one. A generic hub entry is not a complete summary of the dock’s capabilities.", "In Porty, select the actual accessory and inspect its current link, then follow its parent hubs. Treat a 480 Mb/s reading on that accessory differently from a reading on a separate hub branch."],
        figure: { src: "/screenshots/details.png", width: 1440, height: 900, alt: "Porty Windows device drawer for USB2.0 Hub showing a current link of 480 Mb/s and reported hub paths.", caption: "This real Windows capture shows a USB2.0 Hub at 480 Mb/s. The selected node’s reading does not establish the maximum of every socket on the computer." },
      },
      {
        id: "causes", heading: "Common reasons for a slower link",
        bullets: [
          "The selected device only supports USB 2.0. A faster computer port cannot add a faster protocol to it.",
          "The cable carries USB 2.0 data. A USB-C connector and a high charging wattage do not establish USB 3 data support.",
          "The accessory is connected through a USB 2-only port or intermediate hub. Check the specification of the particular downstream port.",
          "You selected a USB 2 companion branch rather than the faster device’s branch.",
          "A cable, adapter, or connection problem prevents the expected link. Compare known compatible parts to isolate the change.",
        ],
      },
      {
        id: "test", heading: "Try a controlled comparison",
        steps: [
          "Confirm the accessory itself supports a faster USB data rate using its manufacturer’s specifications.",
          "Record the current link and parent hub in Porty. A missing reading is not a 480 Mb/s result.",
          "Eject mounted storage, then connect the accessory directly to a suitable computer port with a known USB 3-capable data cable.",
          "Refresh the scan and check the same accessory. If it now reports a faster rate, reintroduce the hub and adapters one at a time.",
          "If it remains at 480 Mb/s, try another documented compatible cable and port. Recheck device settings and manufacturer support information before concluding that the hub is faulty.",
        ],
        paragraphs: ["Change one part at a time and write down the result. Swapping the device, cable, and port together makes it difficult to tell which change helped."],
      },
      {
        id: "throughput", heading: "A link rate is not a file-copy speed",
        paragraphs: ["480 megabits per second is 60 megabytes per second before overhead. Real transfers are lower and depend on the workload. A slow file copy therefore cannot tell you the negotiated link rate on its own.", "Porty displays reported links and capabilities; it does not increase bandwidth or run a transfer benchmark. Use the connection map to establish the path, then measure a real workload separately if you need to evaluate performance."],
      },
    ],
    sources: [
      { title: "USB-IF: the 480 Mb/s high-speed rate", url: "https://www.usb.org/node/214" },
      { title: "USB-IF: USB Type-C cable data capabilities", url: "https://www.usb.org/sites/default/files/usb_type-c_language_product_and_packaging_guidelines_20230320.pdf" },
      { title: "Microsoft: USB Type-C interoperability and companion hubs", url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/type" },
    ],
  },
];

export function guideForPath(path: string) {
  return guides.find((guide) => guidePath(guide) === `${path.replace(/\/$/, "")}/`);
}
