import type { SceneLayout, StreamProfile } from './tabcast'
import { canvasForEncodeProfile } from './stream-encode-profiles'

export type SceneTemplate = {
  id: string
  name: string
  description: string
  build: (opts: { profile: StreamProfile; hasWebcam: boolean }) => SceneLayout
}

export type SceneStubPreset = {
  id: string
  title: string
  subtitle: string
}

/** Branded holding screens — preview card only; relay gets an empty source list. */
export const SCENE_STUB_PRESETS: Record<string, SceneStubPreset> = {
  'starting-soon': {
    id: 'starting-soon',
    title: 'Starting Soon',
    subtitle: 'Hang tight — we’ll be live in a moment',
  },
  intermission: {
    id: 'intermission',
    title: 'Intermission',
    subtitle: 'Short break — back shortly',
  },
  ending: {
    id: 'ending',
    title: 'Ending Scene',
    subtitle: 'Thanks for watching',
  },
}

export function isSceneStubId(id: string): boolean {
  return id in SCENE_STUB_PRESETS
}

export function sceneStubPreset(id: string): SceneStubPreset | undefined {
  return SCENE_STUB_PRESETS[id]
}

function canvasFor(profile: StreamProfile) {
  return canvasForEncodeProfile(profile)
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'gaming-cam',
    name: 'Gaming + cam',
    description: 'Full-frame gameplay with webcam bottom-right.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      const sources: SceneLayout['sources'] = [
        {
          id: 'gameplay',
          type: 'video',
          label: 'Gameplay',
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          zIndex: 0,
        },
      ]
      if (hasWebcam) {
        const w = Math.round(canvas.width * 0.22)
        const h = Math.round(w * (9 / 16))
        sources.push({
          id: 'webcam',
          type: 'video',
          label: 'Webcam',
          x: canvas.width - w - 24,
          y: canvas.height - h - 24,
          width: w,
          height: h,
          zIndex: 1,
        })
      }
      return { canvas, sources }
    },
  },
  {
    id: 'desk-only',
    name: 'Desk / talking head',
    description: 'Webcam full frame — no gameplay layer.',
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile)
      if (!hasWebcam) {
        return {
          canvas,
          sources: [
            {
              id: 'gameplay',
              type: 'video',
              label: 'Program',
              x: 0,
              y: 0,
              width: canvas.width,
              height: canvas.height,
              zIndex: 0,
            },
          ],
        }
      }
      return {
        canvas,
        sources: [
          {
            id: 'webcam',
            type: 'video',
            label: 'Webcam',
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            zIndex: 0,
          },
        ],
      }
    },
  },
  {
    id: 'browse-showcase',
    name: 'Browse showcase',
    description: 'Large program frame tuned for browser tab capture.',
    build: ({ profile }) => {
      const canvas = canvasFor(profile)
      return {
        canvas,
        sources: [
          {
            id: 'gameplay',
            type: 'video',
            label: 'Browse',
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            zIndex: 0,
          },
        ],
      }
    },
  },
  {
    id: 'starting-soon',
    name: 'Starting Soon',
    description: 'Branded holding card before the stream starts.',
    build: ({ profile }) => ({
      canvas: canvasFor(profile),
      sources: [],
    }),
  },
  {
    id: 'intermission',
    name: 'Intermission',
    description: 'Branded break card between segments.',
    build: ({ profile }) => ({
      canvas: canvasFor(profile),
      sources: [],
    }),
  },
  {
    id: 'ending',
    name: 'Ending Scene',
    description: 'Branded sign-off card.',
    build: ({ profile }) => ({
      canvas: canvasFor(profile),
      sources: [],
    }),
  },
]
