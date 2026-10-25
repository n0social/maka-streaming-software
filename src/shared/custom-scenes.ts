/** Max user-defined scenes beyond the five built-in rows. */
export const MAX_CUSTOM_SCENES = 3

const CUSTOM_SCENE_ID_RE = /^custom-[1-3]$/

export type CustomScene = {
  id: string
  name: string
}

export function isCustomSceneId(id: string): boolean {
  return CUSTOM_SCENE_ID_RE.test(id)
}

/** Scene template used for layout when a custom scene is active (Just Chatting rules). */
export const CUSTOM_SCENE_LAYOUT_TEMPLATE_ID = 'desk-only'

export function resolveSceneLayoutTemplateId(sceneId: string): string {
  if (isCustomSceneId(sceneId)) return CUSTOM_SCENE_LAYOUT_TEMPLATE_ID
  return sceneId
}

export function isDeskOnlyLikeScene(sceneId: string): boolean {
  return sceneId === CUSTOM_SCENE_LAYOUT_TEMPLATE_ID || isCustomSceneId(sceneId)
}

export function nextCustomSceneId(existing: readonly CustomScene[]): string | null {
  for (let i = 1; i <= MAX_CUSTOM_SCENES; i++) {
    const id = `custom-${i}`
    if (!existing.some((s) => s.id === id)) return id
  }
  return null
}

export function defaultCustomSceneName(id: string): string {
  const slot = id.replace('custom-', '')
  return `Custom Scene ${slot}`
}

export function coerceCustomScenes(raw: unknown): CustomScene[] {
  if (!Array.isArray(raw)) return []
  const out: CustomScene[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = typeof (item as CustomScene).id === 'string' ? (item as CustomScene).id.trim() : ''
    if (!isCustomSceneId(id)) continue
    const nameRaw = typeof (item as CustomScene).name === 'string' ? (item as CustomScene).name : ''
    const name = nameRaw.trim().slice(0, 80) || defaultCustomSceneName(id)
    if (out.some((s) => s.id === id)) continue
    out.push({ id, name })
    if (out.length >= MAX_CUSTOM_SCENES) break
  }
  return out
}
