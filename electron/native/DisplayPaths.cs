using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

// Read-only CCD queries. Monitor device paths and EDID identifiers stay inside this helper.
public static class PortyDisplays {
    [StructLayout(LayoutKind.Sequential)] struct Luid { public uint Low; public int High; }
    [StructLayout(LayoutKind.Sequential)] struct Rational { public uint Numerator, Denominator; }
    [StructLayout(LayoutKind.Sequential)] struct Region { public uint Width, Height; }
    [StructLayout(LayoutKind.Sequential)] struct Source {
        public Luid Adapter; public uint Id, ModeIndex, Status;
    }
    [StructLayout(LayoutKind.Sequential)] struct Target {
        public Luid Adapter; public uint Id, ModeIndex; public int Technology;
        public uint Rotation, Scaling; public Rational Refresh;
        public uint Scanline; public int Available; public uint Status;
    }
    [StructLayout(LayoutKind.Sequential)] struct DisplayPath { public Source Source; public Target Target; public uint Flags; }
    [StructLayout(LayoutKind.Sequential)] struct Signal {
        public ulong PixelRate; public Rational HSync, VSync; public Region Active, Total;
        public uint Standard, Scanline;
    }
    [StructLayout(LayoutKind.Explicit, Size = 64)] struct Mode {
        [FieldOffset(0)] public uint Type;
        [FieldOffset(4)] public uint Id;
        [FieldOffset(8)] public Luid Adapter;
        [FieldOffset(16)] public Signal Signal;
    }
    [StructLayout(LayoutKind.Sequential)] struct Header {
        public uint Type, Size; public Luid Adapter; public uint Id;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct TargetName {
        public Header Header; public uint Flags; public int Technology;
        public ushort Manufacturer, Product; public uint ConnectorInstance;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string FriendlyName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DevicePath;
    }
    [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
    [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint paths, [Out] DisplayPath[] pathArray, ref uint modes, [Out] Mode[] modeArray, IntPtr topology);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int DisplayConfigGetDeviceInfo(ref TargetName name);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct AdapterName {
        public Header Header;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DevicePath;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int DisplayConfigGetDeviceInfo(ref AdapterName name);
    [DllImport("cfgmgr32.dll")] static extern uint CM_Get_Parent(out uint parent, uint device, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)] static extern uint CM_Get_Device_ID(uint device, StringBuilder id, uint length, uint flags);

    [StructLayout(LayoutKind.Sequential)] struct DeviceInfo { public uint Size; public Guid Class; public uint DevInst; public IntPtr Reserved; }
    [StructLayout(LayoutKind.Sequential)] struct InterfaceData { public uint Size; public Guid Class; public uint Flags; public IntPtr Reserved; }
    [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid Format; public uint Id; }
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern IntPtr SetupDiCreateDeviceInfoList(IntPtr classGuid, IntPtr window);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern bool SetupDiOpenDeviceInterface(IntPtr set, string path, uint flags, ref InterfaceData data);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref InterfaceData data, IntPtr detail, uint size, out uint required, ref DeviceInfo device);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceProperty(IntPtr set, ref DeviceInfo data, ref PropertyKey key, out uint type, byte[] buffer, uint size, out uint required, uint flags);
    [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);

    static string ContainerId(string path) {
        if (String.IsNullOrWhiteSpace(path)) return null;
        var set = SetupDiCreateDeviceInfoList(IntPtr.Zero, IntPtr.Zero);
        if (set == IntPtr.Zero || set == new IntPtr(-1)) return null;
        try {
            var iface = new InterfaceData { Size = (uint)Marshal.SizeOf(typeof(InterfaceData)) };
            if (!SetupDiOpenDeviceInterface(set, path, 0, ref iface)) return null;
            var device = new DeviceInfo { Size = (uint)Marshal.SizeOf(typeof(DeviceInfo)) };
            uint required;
            // A size-only query also resolves the devnode for this exact interface.
            bool resolved = SetupDiGetDeviceInterfaceDetail(set, ref iface, IntPtr.Zero, 0, out required, ref device);
            if (!resolved && Marshal.GetLastWin32Error() != 122) return null;
            if (device.DevInst == 0) return null;
            var property = new PropertyKey { Format = new Guid("8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c"), Id = 2 };
            var bytes = new byte[16]; uint type;
            if (!SetupDiGetDeviceProperty(set, ref device, ref property, out type, bytes, 16, out required, 0) || type != 13 || required != 16) return null;
            var guid = new Guid(bytes);
            return guid == Guid.Empty ? null : guid.ToString();
        } finally { SetupDiDestroyDeviceInfoList(set); }
    }

    // Resolve the display adapter interface, then walk actual PnP parents to
    // the physical USB device. A monitor container is not its dock's identity.
    static string AdapterUsbInstanceId(Luid adapter) {
        var name = new AdapterName { Header = new Header { Type = 4, Size = (uint)Marshal.SizeOf(typeof(AdapterName)), Adapter = adapter } };
        if (DisplayConfigGetDeviceInfo(ref name) != 0 || String.IsNullOrWhiteSpace(name.DevicePath)) return null;
        var set = SetupDiCreateDeviceInfoList(IntPtr.Zero, IntPtr.Zero);
        if (set == IntPtr.Zero || set == new IntPtr(-1)) return null;
        try {
            var iface = new InterfaceData { Size = (uint)Marshal.SizeOf(typeof(InterfaceData)) };
            if (!SetupDiOpenDeviceInterface(set, name.DevicePath, 0, ref iface)) return null;
            var device = new DeviceInfo { Size = (uint)Marshal.SizeOf(typeof(DeviceInfo)) };
            uint required;
            bool resolved = SetupDiGetDeviceInterfaceDetail(set, ref iface, IntPtr.Zero, 0, out required, ref device);
            if ((!resolved && Marshal.GetLastWin32Error() != 122) || device.DevInst == 0) return null;
            uint cursor = device.DevInst;
            var seen = new HashSet<uint>();
            for (int depth = 0; depth < 64 && seen.Add(cursor); depth++) {
                var id = new StringBuilder(512);
                if (CM_Get_Device_ID(cursor, id, 512, 0) == 0) {
                    string instance = id.ToString();
                    if (instance.StartsWith("USB\\VID_", StringComparison.OrdinalIgnoreCase) && instance.IndexOf("&MI_", StringComparison.OrdinalIgnoreCase) < 0) return instance;
                }
                uint parent;
                if (CM_Get_Parent(out parent, cursor, 0) != 0) break;
                cursor = parent;
            }
            return null;
        } finally { SetupDiDestroyDeviceInfoList(set); }
    }

    public class Display {
        public string Id, Name, ContainerId, AdapterUsbInstanceId; public int Technology; public uint Width, Height;
        public uint RefreshNumerator, RefreshDenominator; public bool Internal;
    }
    public class Result { public List<Display> Displays = new List<Display>(); public List<string> Warnings = new List<string>(); }
    public static Result Scan() {
        var result = new Result();
        // Hotplug can change the required buffer size between these two calls.
        for (int attempt = 0; attempt < 3; attempt++) {
            uint pathCount, modeCount;
            int error = GetDisplayConfigBufferSizes(2, out pathCount, out modeCount);
            if (error != 0) throw new InvalidOperationException("Active display paths are unavailable (Windows error " + error + ").");
            if (pathCount > 4096 || modeCount > 16384) throw new InvalidOperationException("Unexpected display inventory size.");
            var paths = new DisplayPath[pathCount]; var modes = new Mode[modeCount];
            error = QueryDisplayConfig(2, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero);
            if (error == 122) continue;
            if (error != 0) throw new InvalidOperationException("Active display query failed (Windows error " + error + ").");
            for (int i = 0; i < pathCount; i++) {
                var target = paths[i].Target;
                if ((paths[i].Flags & 1) == 0 || target.Available == 0) continue;
                var name = new TargetName { Header = new Header {
                    Type = 2, Size = (uint)Marshal.SizeOf(typeof(TargetName)), Adapter = target.Adapter, Id = target.Id
                } };
                bool named = DisplayConfigGetDeviceInfo(ref name) == 0;
                var display = new Display {
                    Id = target.Adapter.High.ToString("X8") + target.Adapter.Low.ToString("X8") + ":" + target.Id,
                    Name = named && !String.IsNullOrWhiteSpace(name.FriendlyName) ? name.FriendlyName : "Display " + (i + 1),
                    ContainerId = named ? ContainerId(name.DevicePath) : null,
                    AdapterUsbInstanceId = AdapterUsbInstanceId(target.Adapter),
                    Technology = target.Technology,
                    RefreshNumerator = target.Refresh.Numerator, RefreshDenominator = target.Refresh.Denominator,
                    Internal = target.Technology == unchecked((int)0x80000000) || target.Technology == 6 || target.Technology == 11 || target.Technology == 13
                };
                if (target.ModeIndex < modeCount) {
                    var mode = modes[target.ModeIndex];
                    if (mode.Type == 2 && mode.Id == target.Id && mode.Adapter.Low == target.Adapter.Low && mode.Adapter.High == target.Adapter.High) {
                        display.Width = mode.Signal.Active.Width; display.Height = mode.Signal.Active.Height;
                        // Signal timing gives the physical refresh, including fractional rates.
                        if (mode.Signal.VSync.Denominator != 0 && mode.Signal.VSync.Numerator != 0) {
                            display.RefreshNumerator = mode.Signal.VSync.Numerator;
                            display.RefreshDenominator = mode.Signal.VSync.Denominator;
                        }
                    }
                }
                result.Displays.Add(display);
            }
            return result;
        }
        throw new InvalidOperationException("Display configuration changed repeatedly during the scan. Refresh to try again.");
    }
}
