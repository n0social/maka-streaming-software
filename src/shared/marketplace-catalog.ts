import type { CatalogEntry } from './addon-types'
import { HELLO_TABCAST_FILES } from './hello-tabcast-files'
import { PHONE_CAM_FILES } from './phone-cam-files'

/** Curated marketplace catalog (bundled with the app). Remote feed can replace this in 0.4+. */
export const MARKETPLACE_CATALOG: CatalogEntry[] = [
  {
    catalogId: 'tabcast.scene-templates',
    featured: true,
    manifest: {
      id: 'tabcast.scene-templates',
      name: 'Scene templates',
      version: '1.0.0',
      apiVersion: 1,
      author: 'Maka',
      category: 'builtin',
      description: 'One-click encoder layouts: gaming + cam, desk, browse showcase.',
      permissions: ['scene.layout'],
      hooks: ['studio.sidebar.panel'],
      builtin: true,
    },
  },
  {
    catalogId: 'com.tabcast.custom-rtmp',
    featured: true,
    manifest: {
      id: 'com.tabcast.custom-rtmp',
      name: 'Custom RTMP / Kick',
      version: '0.1.0',
      apiVersion: 1,
      author: 'Maka (example)',
      category: 'platform',
      description:
        'Stream to Kick, Facebook Live, or any RTMP endpoint — adds a Custom RTMP destination row.',
      permissions: ['relay.config.write', 'ui.toast', 'ui.external'],
      hooks: ['live.start', 'studio.sidebar.panel'],
      contributes: {
        sidebarPanels: [
          {
            id: 'main',
            title: 'Custom RTMP',
            description: 'Configure Kick or any RTMP ingest URL + stream key.',
            actions: [
              {
                id: 'configure-kick',
                label: 'Use Kick preset',
                type: 'message',
                message: 'Kick ingest URL applied — paste your Kick stream key in Destinations → Custom RTMP.',
              },
              {
                id: 'configure-rtmp',
                label: 'Set RTMP URL + key',
                type: 'message',
                message: 'Opens prompts for ingest URL and stream key.',
              },
              {
                id: 'docs',
                label: 'Kick stream key help',
                type: 'open-url',
                url: 'https://help.kick.com/en/articles/7123456-how-to-stream-on-kick',
              },
            ],
          },
        ],
      },
    },
  },
  {
    catalogId: 'com.tabcast.lower-thirds',
    manifest: {
      id: 'com.tabcast.lower-thirds',
      name: 'Lower thirds',
      version: '0.1.0',
      apiVersion: 1,
      author: 'Maka',
      category: 'production',
      description: 'Quick lower-third style layouts for name/title overlays via scene API.',
      permissions: ['scene.layout'],
      hooks: ['scene.layout', 'studio.sidebar.panel'],
      contributes: {
        sidebarPanels: [
          {
            id: 'main',
            title: 'Lower thirds',
            actions: [
              {
                id: 'desk',
                label: 'Desk layout',
                type: 'scene-template',
                templateId: 'desk-only',
                description: 'Full-frame webcam / talking head',
              },
              {
                id: 'gaming',
                label: 'Gaming + cam',
                type: 'scene-template',
                templateId: 'gaming-cam',
              },
            ],
          },
        ],
      },
    },
  },
  {
    catalogId: 'com.tabcast.phone-cam',
    featured: true,
    manifest: {
      id: 'com.tabcast.phone-cam',
      name: 'Phone camera',
      version: '0.1.0',
      apiVersion: 1,
      author: 'Maka',
      category: 'utility',
      description:
        'Pair a phone on the same Wi‑Fi via QR — camera preview on the device (LAN only; does not feed the program monitor).',
      entry: 'index.html',
      permissions: ['device.phone-pair'],
      hooks: [],
    },
    files: PHONE_CAM_FILES,
  },
  {
    catalogId: 'com.example.hello-tabcast',
    featured: true,
    manifest: {
      id: 'com.example.hello-tabcast',
      name: 'Hello Maka',
      version: '0.1.0',
      apiVersion: 1,
      author: 'Maka',
      category: 'utility',
      description: 'Sandboxed addon runtime demo — webview panel with tabcast.addons API.',
      entry: 'index.html',
      permissions: ['ui.toast', 'live.events'],
      hooks: ['app.ready', 'live.start', 'live.end', 'studio.sidebar.panel'],
    },
    files: HELLO_TABCAST_FILES,
  },
]

export function getCatalogEntry(catalogId: string): CatalogEntry | undefined {
  return MARKETPLACE_CATALOG.find((e) => e.catalogId === catalogId)
}
