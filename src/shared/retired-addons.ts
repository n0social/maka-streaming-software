/**
 * Addons that duplicated the Scenes list or existed only as a runtime demo.
 * Dropped from the catalog. A stale remote feed or an already installed folder
 * must not bring them back.
 */
export const RETIRED_ADDON_IDS = [
  'tabcast.scene-templates',
  'com.tabcast.lower-thirds',
  'com.example.hello-tabcast',
] as const

const RETIRED_ADDON_ID_SET = new Set<string>(RETIRED_ADDON_IDS)

export function isRetiredAddonId(id: string): boolean {
  return RETIRED_ADDON_ID_SET.has(id)
}

export function omitRetiredAddons<T extends { catalogId: string; manifest: { id: string } }>(
  entries: readonly T[],
): T[] {
  return entries.filter(
    (entry) => !isRetiredAddonId(entry.catalogId) && !isRetiredAddonId(entry.manifest.id),
  )
}
