import type { SceneLayout, SceneSource, StreamProfile } from './maka-constants'
import { canvasForEncodeProfile } from './stream-encode-profiles'

export type OverlayLayoutPreset = {
  id: string
  name: string
  /** Notes which slots are placeholders until chat/notifications are wired to real feeds. */
  description: string
  build: (opts: { profile: StreamProfile; hasWebcam: boolean }) => SceneLayout
}

function canvasFor(profile: StreamProfile) {
  return canvasForEncodeProfile(profile)
}

type Rect = { x: number; y: number; width: number; height: number }

function box(
  canvas: { width: number; height: number },
  xFrac: number,
  yFrac: number,
  wFrac: number,
  hFrac: number,
): Rect {
  return {
    x: Math.round(canvas.width * xFrac),
    y: Math.round(canvas.height * yFrac),
    width: Math.round(canvas.width * wFrac),
    height: Math.round(canvas.height * hFrac),
  }
}

/** 16:9 webcam tile sized by width fraction of canvas. */
function camBox(
  canvas: { width: number; height: number },
  xFrac: number,
  yFrac: number,
  widthFrac: number,
): Rect {
  const width = Math.round(canvas.width * widthFrac)
  const height = Math.round(width * (9 / 16))
  return {
    x: Math.round(canvas.width * xFrac),
    y: Math.round(canvas.height * yFrac),
    width,
    height,
  }
}

function gameplaySource(r: Rect, zIndex = 0): SceneSource {
  return {
    id: 'gameplay',
    type: 'video',
    label: 'Gameplay',
    ...r,
    zIndex,
  }
}

function webcamSource(r: Rect, zIndex = 2): SceneSource {
  return {
    id: 'webcam',
    type: 'video',
    label: 'Webcam',
    ...r,
    zIndex,
  }
}

function chatPlaceholder(r: Rect, zIndex = 1): SceneSource {
  return {
    id: 'chat',
    type: 'overlay',
    label: 'Chat (placeholder)',
    ...r,
    zIndex,
  }
}

function notificationsPlaceholder(r: Rect, zIndex = 1): SceneSource {
  return {
    id: 'notifications',
    type: 'overlay',
    label: 'Notifications (placeholder)',
    ...r,
    zIndex,
  }
}

function layoutFromParts(
  profile: StreamProfile,
  parts: {
    gameplay: Rect
    webcam?: Rect | null
    chat?: Rect | null
    notifications?: Rect | null
    hasWebcam: boolean
    gameplayZ?: number
    webcamZ?: number
  },
): SceneLayout {
  const canvas = canvasFor(profile)
  const sources: SceneSource[] = [gameplaySource(parts.gameplay, parts.gameplayZ ?? 0)]
  if (parts.chat) sources.push(chatPlaceholder(parts.chat, 4))
  if (parts.notifications) sources.push(notificationsPlaceholder(parts.notifications, 5))
  if (parts.hasWebcam && parts.webcam) {
    sources.push(webcamSource(parts.webcam, parts.webcamZ ?? 3))
  }
  return { canvas, sources }
}

/** Tall chat column along the lower left. */
function chatTallLeft(canvas: { width: number; height: number }): Rect {
  return box(canvas, 0.02, 0.28, 0.26, 0.68)
}

/** Tall chat sitting above a bottom-left webcam. */
function chatAboveBottomLeftCam(canvas: { width: number; height: number }): Rect {
  return box(canvas, 0.02, 0.04, 0.24, 0.62)
}

/** Tall chat column on the right, vertically centered. */
function chatCenterRight(canvas: { width: number; height: number }): Rect {
  return box(canvas, 0.7, 0.12, 0.26, 0.52)
}

function notesCenter(canvas: { width: number; height: number }): Rect {
  return box(canvas, 0.34, 0.4, 0.32, 0.16)
}

/** Default overlay composition when the user has not picked another preset. */
export const DEFAULT_OVERLAY_PRESET_ID = 'classic-gaming'

export const OVERLAY_LAYOUT_PRESETS: OverlayLayoutPreset[] = [
  {
    id: 'classic-gaming',
    name: 'Game full, cam top-right',
    description:
      'Gameplay fills the frame. Webcam sits top-right. Tall chat log is bottom-left. Notifications sit in the center.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.74, 0.04, 0.22),
        chat: chatTallLeft(canvas),
        notifications: notesCenter(canvas),
        hasWebcam,
      })
    },
  },
  {
    id: 'game-cam-bottom-left',
    name: 'Game full, cam bottom-left',
    description:
      'Gameplay fills the frame. Webcam sits bottom-left. Tall chat log is on the left above the webcam. Notifications sit in the center.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.02, 0.74, 0.22),
        chat: chatAboveBottomLeftCam(canvas),
        notifications: notesCenter(canvas),
        hasWebcam,
      })
    },
  },
  {
    id: 'game-cam-bottom-right',
    name: 'Game full, cam bottom-right',
    description:
      'Gameplay fills the frame. Webcam sits bottom-right. Tall chat log is bottom-left. Notifications sit in the center.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.74, 0.74, 0.22),
        chat: chatTallLeft(canvas),
        notifications: notesCenter(canvas),
        hasWebcam,
      })
    },
  },
  {
    id: 'cam-main-game-top-right',
    name: 'Cam full, game top-right',
    description:
      'Webcam fills the frame where gameplay usually sits. Game capture is a top-right PiP. Tall chat log is bottom-left. Notifications sit in the center.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: camBox(canvas, 0.74, 0.04, 0.22),
        webcam: box(canvas, 0, 0, 1, 1),
        chat: chatTallLeft(canvas),
        notifications: notesCenter(canvas),
        hasWebcam,
        gameplayZ: 3,
        webcamZ: 1,
      })
    },
  },
  {
    id: 'cam-main-game-bottom-right',
    name: 'Cam full, game bottom-right',
    description:
      'Webcam fills the frame. Game capture is a bottom-right PiP. Tall chat log is bottom-left. Notifications sit in the center.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: camBox(canvas, 0.74, 0.74, 0.22),
        webcam: box(canvas, 0, 0, 1, 1),
        chat: chatTallLeft(canvas),
        notifications: notesCenter(canvas),
        hasWebcam,
        gameplayZ: 3,
        webcamZ: 1,
      })
    },
  },
  {
    id: 'cam-full-chat-right',
    name: 'Cam full, chat right',
    description:
      'Webcam fills the frame. Tall chat log is centered on the right. Game capture is bottom-right. Notifications sit in the center.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: camBox(canvas, 0.74, 0.74, 0.22),
        webcam: box(canvas, 0, 0, 1, 1),
        chat: chatCenterRight(canvas),
        notifications: notesCenter(canvas),
        hasWebcam,
        gameplayZ: 3,
        webcamZ: 1,
      })
    },
  },
]

/** Default chat placeholder when the user enables Chat without an overlay preset. */
export function defaultChatOverlaySlot(canvas: { width: number; height: number }): SceneSource {
  return chatPlaceholder(chatTallLeft(canvas), 4)
}

/** Default notifications placeholder when the user enables Notifications without an overlay preset. */
export function defaultNotificationsOverlaySlot(
  canvas: { width: number; height: number },
): SceneSource {
  return notificationsPlaceholder(notesCenter(canvas), 5)
}

export function overlayPresetById(id: string): OverlayLayoutPreset | undefined {
  return OVERLAY_LAYOUT_PRESETS.find((p) => p.id === id)
}
