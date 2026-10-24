import type { SceneLayout, SceneSource, StreamProfile } from './tabcast'
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
  },
): SceneLayout {
  const canvas = canvasFor(profile)
  const sources: SceneSource[] = [gameplaySource(parts.gameplay)]
  if (parts.chat) sources.push(chatPlaceholder(parts.chat, 1))
  if (parts.notifications) sources.push(notificationsPlaceholder(parts.notifications, 1))
  if (parts.hasWebcam && parts.webcam) {
    sources.push(webcamSource(parts.webcam, 3))
  }
  return { canvas, sources }
}

/** Default overlay composition when the user has not picked another preset. */
export const DEFAULT_OVERLAY_PRESET_ID = 'classic-gaming'

export const OVERLAY_LAYOUT_PRESETS: OverlayLayoutPreset[] = [
  {
    id: 'classic-gaming',
    name: 'Classic gaming',
    description:
      'Full-frame gameplay; webcam top-right; chat lower-left; notifications center-right (chat/notifications are labeled placeholders until wired).',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.74, 0.04, 0.22),
        chat: box(canvas, 0.02, 0.68, 0.28, 0.28),
        notifications: box(canvas, 0.62, 0.38, 0.34, 0.22),
        hasWebcam,
      })
    },
  },
  {
    id: 'webcam-focus',
    name: 'Webcam focus',
    description:
      'Webcam full center; gameplay PiP bottom-right; chat centered-left; notifications centered (placeholders).',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      const sources: SceneSource[] = [
        gameplaySource(box(canvas, 0.62, 0.58, 0.34, 0.34), 0),
        chatPlaceholder(box(canvas, 0.04, 0.36, 0.26, 0.28), 1),
        notificationsPlaceholder(box(canvas, 0.37, 0.04, 0.26, 0.18), 1),
      ]
      if (hasWebcam) {
        const w = Math.round(canvas.width * 0.76)
        const h = Math.round(w * (9 / 16))
        sources.push(
          webcamSource(
            {
              x: Math.round(canvas.width * 0.12),
              y: Math.round(canvas.height * 0.1),
              width: w,
              height: h,
            },
            3,
          ),
        )
      }
      return { canvas, sources }
    },
  },
  {
    id: 'notifications-stack',
    name: 'Notifications stack',
    description:
      'Gameplay full frame; notifications upper center-right; chat lower-left; webcam bottom-right.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.72, 0.7, 0.24),
        chat: box(canvas, 0.03, 0.7, 0.3, 0.26),
        notifications: box(canvas, 0.55, 0.05, 0.4, 0.2),
        hasWebcam,
      })
    },
  },
  {
    id: 'chat-corner',
    name: 'Chat corner',
    description:
      'Gameplay centered with margin; chat large lower-right; notifications center-left; webcam top-left.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0.06, 0.08, 0.88, 0.72),
        webcam: camBox(canvas, 0.03, 0.03, 0.2),
        chat: box(canvas, 0.58, 0.72, 0.38, 0.24),
        notifications: box(canvas, 0.04, 0.42, 0.22, 0.2),
        hasWebcam,
      })
    },
  },
  {
    id: 'balanced-triple',
    name: 'Balanced triple',
    description:
      'Gameplay inset center; webcam top-right; chat lower-left; notifications lower-center (placeholders).',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0.1, 0.12, 0.8, 0.62),
        webcam: camBox(canvas, 0.76, 0.04, 0.2),
        chat: box(canvas, 0.04, 0.76, 0.3, 0.2),
        notifications: box(canvas, 0.36, 0.78, 0.28, 0.18),
        hasWebcam,
      })
    },
  },
  {
    id: 'pip-left',
    name: 'Gameplay PiP left',
    description:
      'Webcam-forward layout: large webcam right; gameplay PiP bottom-left; chat top-left; notifications top-center.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      const sources: SceneSource[] = [
        gameplaySource(box(canvas, 0.04, 0.62, 0.32, 0.32), 0),
        chatPlaceholder(box(canvas, 0.04, 0.06, 0.28, 0.24), 1),
        notificationsPlaceholder(box(canvas, 0.34, 0.06, 0.3, 0.16), 1),
      ]
      if (hasWebcam) {
        const w = Math.round(canvas.width * 0.58)
        const h = Math.round(w * (9 / 16))
        sources.push(
          webcamSource(
            {
              x: Math.round(canvas.width * 0.38),
              y: Math.round(canvas.height * 0.12),
              width: w,
              height: h,
            },
            3,
          ),
        )
      }
      return { canvas, sources }
    },
  },
  {
    id: 'minimal-cam',
    name: 'Minimal cam',
    description: 'Full gameplay with a small webcam bottom-left only (no chat/notification slots).',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      const sources: SceneSource[] = [gameplaySource(box(canvas, 0, 0, 1, 1))]
      if (hasWebcam) {
        sources.push(webcamSource(camBox(canvas, 0.03, 0.72, 0.18), 2))
      }
      return { canvas, sources }
    },
  },
  {
    id: 'broadcast-lower-third',
    name: 'Broadcast lower third',
    description:
      'Gameplay full; notifications strip center-top; chat wide lower-third; webcam upper-right.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.78, 0.05, 0.18),
        chat: box(canvas, 0.08, 0.78, 0.84, 0.18),
        notifications: box(canvas, 0.25, 0.04, 0.5, 0.12),
        hasWebcam,
      })
    },
  },
  {
    id: 'symmetric-pip',
    name: 'Symmetric PiP',
    description:
      'Gameplay large center; webcam and notification tiles on opposite corners; chat between them.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0.08, 0.1, 0.84, 0.58),
        webcam: camBox(canvas, 0.04, 0.72, 0.22),
        chat: box(canvas, 0.38, 0.72, 0.24, 0.22),
        notifications: box(canvas, 0.74, 0.72, 0.22, 0.22),
        hasWebcam,
      })
    },
  },
]

export function overlayPresetById(id: string): OverlayLayoutPreset | undefined {
  return OVERLAY_LAYOUT_PRESETS.find((p) => p.id === id)
}
