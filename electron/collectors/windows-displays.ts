import type { ConnectedDevice } from '../../shared/types';
import { createHash } from 'node:crypto';

export interface WindowsDisplay {
  Id: string;
  Name?: string;
  Technology?: number;
  Width?: number;
  Height?: number;
  RefreshNumerator?: number;
  RefreshDenominator?: number;
  Internal?: boolean;
  ContainerId?: string;
}
export function parseWindowsDisplays(displays: WindowsDisplay[] = [], containerFor?: (value?: string) => string | undefined): ConnectedDevice[] {
  const seen = new Set<string>();
  return displays.flatMap((d, index) => {
    // A source can drive two cloned monitors; identify targets, not source modes or names.
    if (d.Id && seen.has(d.Id)) return [];
    if (d.Id) seen.add(d.Id);
    const width = d.Width, height = d.Height;
    const validSize = Number.isInteger(width) && width! > 0 && Number.isInteger(height) && height! > 0;
    const rate = d.RefreshNumerator! / d.RefreshDenominator!;
    const refreshHz = d.RefreshNumerator! > 0 && d.RefreshDenominator! > 0 && Number.isFinite(rate) ? Math.round(rate * 1000) / 1000 : undefined;
    const transport: Record<number, string> = { 0: 'VGA', 4: 'DVI', 5: 'HDMI', 6: 'Internal display', 10: 'DisplayPort', 11: 'Embedded DisplayPort', 12: 'UDI', 13: 'Embedded UDI', 15: 'Miracast', 16: 'Indirect wired display', 17: 'Indirect virtual display', 18: 'DisplayPort over USB tunnel', [-2147483648]: 'Internal display' };
    const connection = transport[d.Technology ?? -1] ?? 'Display';
    const resolution = validSize ? `${width} × ${height}` : undefined;
    return [{
      id: `win-display-${d.Id ? createHash('sha256').update(d.Id).digest('hex').slice(0, 16) : index + 1}`, name: d.Name?.trim() || `Display ${index + 1}`, kind: 'display' as const,
      physicalDeviceId: d.Id && !d.Internal && ![6, 11, 13, -2147483648].includes(d.Technology ?? -1) ? containerFor?.(d.ContainerId) : undefined,
      detail: [connection, resolution, refreshHz === undefined ? undefined : `${refreshHz} Hz`, d.Internal ? 'Built-in panel' : undefined].filter(Boolean).join(' · '),
      ...(validSize ? { displayMode: { resolution: resolution!, width: width!, height: height!, ...(refreshHz === undefined ? {} : { refreshHz }) } } : {}),
    }];
  });
}
