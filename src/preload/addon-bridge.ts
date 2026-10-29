import { contextBridge, ipcRenderer } from 'electron'
import type { AddonFetchInit, AddonFetchResult, AddonLiveEventPayload, AddonRuntimeInfo } from '../shared/addon-runtime'
import type { PhonePairSnapshot } from '../shared/phone-pair'

type LiveHandler = (payload: AddonLiveEventPayload) => void
type PhonePairHandler = (snapshot: PhonePairSnapshot) => void

const liveHandlers = new Set<LiveHandler>()
const phonePairHandlers = new Set<PhonePairHandler>()

ipcRenderer.on('addon-runtime:live-event', (_event, payload: AddonLiveEventPayload) => {
  for (const handler of liveHandlers) {
    try {
      handler(payload)
    } catch {
      // isolate addon handler failures
    }
  }
})

ipcRenderer.on('addon-runtime:phone-pair-update', (_event, snapshot: PhonePairSnapshot) => {
  for (const handler of phonePairHandlers) {
    try {
      handler(snapshot)
    } catch {
      // isolate addon handler failures
    }
  }
})

contextBridge.exposeInMainWorld('maka', {
  addons: {
    getInfo: (): Promise<AddonRuntimeInfo> => ipcRenderer.invoke('addon-runtime:get-info'),

    toast: (message: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('addon-runtime:toast', message),

    fetch: (url: string, init?: AddonFetchInit): Promise<AddonFetchResult> =>
      ipcRenderer.invoke('addon-runtime:fetch', url, init),

    getSettings: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('addon-runtime:get-settings'),

    setSettings: (partial: Record<string, unknown>): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('addon-runtime:set-settings', partial),

    openExternal: (url: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('addon-runtime:open-external', url),

    onLiveEvent: (handler: LiveHandler): (() => void) => {
      liveHandlers.add(handler)
      return () => liveHandlers.delete(handler)
    },

    getPhonePair: (): Promise<PhonePairSnapshot> =>
      ipcRenderer.invoke('addon-runtime:phone-pair:get'),

    refreshPhonePair: (): Promise<PhonePairSnapshot> =>
      ipcRenderer.invoke('addon-runtime:phone-pair:refresh'),

    unpairPhone: (): Promise<PhonePairSnapshot> =>
      ipcRenderer.invoke('addon-runtime:phone-pair:unpair'),

    onPhonePairUpdate: (handler: PhonePairHandler): (() => void) => {
      phonePairHandlers.add(handler)
      return () => phonePairHandlers.delete(handler)
    },
  },
})
