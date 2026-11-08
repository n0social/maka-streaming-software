import type { SceneLayout, StreamProfile } from './tabcast'
import { canvasForEncodeProfile } from './stream-encode-profiles'

export type SceneTemplate = {
  id: string
  name: string
  description: string
  build: (opts: { profile: StreamProfile; hasWebcam: boolean }) => SceneLayout
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
    description: 'Holding card before the stream starts.',
    build: ({ profile }) => ({
      canvas: canvasFor(profile),
      sources: [],
    }),
  },
  {
    id: 'intermission',
    name: 'Intermission',
    description: 'Break card between segments.',
    build: ({ profile }) => ({
      canvas: canvasFor(profile),
      sources: [],
    }),
  },
  {
    id: 'ending',
    name: 'Ending Scene',
    description: 'Sign-off card.',
    build: ({ profile }) => ({
      canvas: canvasFor(profile),
      sources: [],
    }),
  },
]

const SCENE_STUB_IDS = new Set(['starting-soon', 'intermission', 'ending'])

export function isSceneStubId(id: string): boolean {
  return SCENE_STUB_IDS.has(id)
}
