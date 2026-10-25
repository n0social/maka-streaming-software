import { isCustomSceneId } from './custom-scenes'

/** Built-in scene template ids that accept a per-scene PNG/JPG background. */
export const SCENE_IMAGE_SCENE_IDS = [
  'desk-only',
  'starting-soon',
  'intermission',
  'ending',
] as const

export type SceneImageSceneId = (typeof SCENE_IMAGE_SCENE_IDS)[number]

export type SceneImageMaskMode = 'game-mask-only' | 'full-mask-except-chat'

export function sceneSupportsImageUpload(sceneId: string): boolean {
  return (SCENE_IMAGE_SCENE_IDS as readonly string[]).includes(sceneId) || isCustomSceneId(sceneId)
}

export function sceneImageMaskMode(sceneId: string): SceneImageMaskMode | null {
  if (sceneId === 'desk-only' || isCustomSceneId(sceneId)) return 'game-mask-only'
  if (sceneId === 'starting-soon' || sceneId === 'intermission' || sceneId === 'ending') {
    return 'full-mask-except-chat'
  }
  return null
}

export function isSceneImageSceneId(id: string): id is SceneImageSceneId {
  return (SCENE_IMAGE_SCENE_IDS as readonly string[]).includes(id)
}

/** Keys allowed in persisted `sceneImages` (built-in upload scenes + custom slots). */
export function isSceneImageStorageKey(id: string): boolean {
  return isSceneImageSceneId(id) || isCustomSceneId(id)
}
