import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'
import { copyFileSync } from 'node:fs'

// Plugin to copy phone-cam-qrcode.bundle.js after build
const copyBundlePlugin = () => ({
  name: 'copy-phone-cam-bundle',
  closeBundle() {
    const src = resolve('src/shared/phone-cam-qrcode.bundle.js')
    const dest = resolve('out/main/phone-cam-qrcode.bundle.js')
    try {
      copyFileSync(src, dest)
      console.log('✓ Copied phone-cam-qrcode.bundle.js')
    } catch (err) {
      console.error('Failed to copy phone-cam-qrcode.bundle.js:', err)
    }
  }
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyBundlePlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          'addon-bridge': resolve('src/preload/addon-bridge.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          app: resolve('src/renderer/app.html'),
        },
      },
    },
  },
})
