/**
 * Addon id compatibility.
 * Current ids use the `com.maka.` prefix. Builds through 0.2.5 saved `com.tabcast.*`
 * (including `com.tabcast.phone-cam`). Loaders map those onto the current ids.
 */

export const LEGACY_PHONE_CAM_ADDON_ID = 'com.tabcast.phone-cam'

const LEGACY_EXACT: Record<string, string> = {
  'com.tabcast.phone-cam': 'com.maka.phone-cam',
  'tabcast.scene-templates': 'maka.scene-templates',
  'com.example.hello-tabcast': 'com.example.hello-maka',
}

const CURRENT_TO_LEGACY: Record<string, string> = {
  'com.maka.phone-cam': 'com.tabcast.phone-cam',
  'maka.scene-templates': 'tabcast.scene-templates',
  'com.example.hello-maka': 'com.example.hello-tabcast',
}

/** Map a saved or remote addon id onto the id this build installs and runs. */
export function canonicalAddonId(id: string): string {
  const exact = LEGACY_EXACT[id]
  if (exact) return exact
  if (id.startsWith('com.tabcast.')) return `com.maka.${id.slice('com.tabcast.'.length)}`
  return id
}

/** Previous id for an addon, when one exists. */
export function legacyAddonId(id: string): string | null {
  const canon = canonicalAddonId(id)
  const exact = CURRENT_TO_LEGACY[canon]
  if (exact) return exact
  if (canon.startsWith('com.maka.')) return `com.tabcast.${canon.slice('com.maka.'.length)}`
  return null
}
