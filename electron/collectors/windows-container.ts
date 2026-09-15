// Reject missing, malformed, empty and system-container identities.
export function windowsContainer(value?: string): string | undefined {
  const id = value?.trim().replace(/^\{(.*)\}$/, '$1').toLowerCase();
  return id && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
    && id !== '00000000-0000-0000-0000-000000000000'
    && id !== '00000000-0000-0000-ffff-ffffffffffff' ? id : undefined;
}
