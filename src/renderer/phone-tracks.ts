import type { TabcastBridge } from '../preload/index'
import {
  PHONE_CAM_STREAM_ID,
  PHONE_CAMERA_DEVICE_VALUE,
  PHONE_MIC_DEVICE_VALUE,
  PHONE_MIC_STREAM_ID,
  type PhonePairSnapshot,
  type PhoneWebRtcSessionDescription,
} from '../shared/phone-pair'

export type PhoneTracksSnapshot = {
  videoTrack: MediaStreamTrack | null
  audioTrack: MediaStreamTrack | null
  pairStatus: PhonePairSnapshot['status']
}

type Listener = (snap: PhoneTracksSnapshot) => void

let pc: RTCPeerConnection | null = null
let videoTrack: MediaStreamTrack | null = null
let audioTrack: MediaStreamTrack | null = null
let pairStatus: PhonePairSnapshot['status'] = 'waiting'
const listeners = new Set<Listener>()

function emit(): void {
  const snap: PhoneTracksSnapshot = {
    videoTrack,
    audioTrack,
    pairStatus,
  }
  for (const listener of listeners) listener(snap)
}

function clearTracks(): void {
  videoTrack = null
  audioTrack = null
}

function closePeer(): void {
  if (pc) {
    pc.close()
    pc = null
  }
}

function resetWebrtc(): void {
  closePeer()
  clearTracks()
  emit()
}

function peerConnectionLost(): void {
  closePeer()
  clearTracks()
  emit()
}

function waitForIceGathering(peer: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      peer.removeEventListener('icegatheringstatechange', onChange)
      clearTimeout(timer)
      resolve()
    }
    const onChange = () => {
      if (peer.iceGatheringState === 'complete') done()
    }
    peer.addEventListener('icegatheringstatechange', onChange)
    const timer = setTimeout(done, timeoutMs)
  })
}

function bindTrack(track: MediaStreamTrack, kind: 'video' | 'audio'): void {
  track.addEventListener('ended', () => {
    if (kind === 'video' && videoTrack === track) videoTrack = null
    if (kind === 'audio' && audioTrack === track) audioTrack = null
    emit()
  })
  if (kind === 'video') videoTrack = track
  else audioTrack = track
  emit()
}

async function handleOffer(
  tabcast: TabcastBridge,
  offer: PhoneWebRtcSessionDescription,
): Promise<void> {
  closePeer()
  clearTracks()

  const peer = new RTCPeerConnection({ iceServers: [] })
  pc = peer

  peer.ontrack = (event) => {
    const stream = event.streams[0]
    const streamId = stream?.id ?? ''
    const track = event.track
    if (streamId === PHONE_CAM_STREAM_ID || track.kind === 'video') {
      bindTrack(track, 'video')
      return
    }
    if (streamId === PHONE_MIC_STREAM_ID || track.kind === 'audio') {
      bindTrack(track, 'audio')
    }
  }

  peer.onconnectionstatechange = () => {
    const state = peer.connectionState
    if (state === 'failed' || state === 'closed') {
      peerConnectionLost()
    } else if (state === 'disconnected') {
      clearTracks()
      emit()
    }
  }

  await peer.setRemoteDescription(offer)
  const answer = await peer.createAnswer()
  await peer.setLocalDescription(answer)
  await waitForIceGathering(peer)

  const local = peer.localDescription
  if (!local) throw new Error('Missing local WebRTC answer')

  await tabcast.submitPhoneWebrtcAnswer({ type: 'answer', sdp: local.sdp })
}

export function getPhoneTracksSnapshot(): PhoneTracksSnapshot {
  return { videoTrack, audioTrack, pairStatus }
}

function trackLive(track: MediaStreamTrack | null): boolean {
  return Boolean(track && track.readyState === 'live')
}

export function phoneHasVideoTrack(snap: PhoneTracksSnapshot): boolean {
  return snap.pairStatus === 'connected' && trackLive(snap.videoTrack)
}

export function phoneHasAudioTrack(snap: PhoneTracksSnapshot): boolean {
  return snap.pairStatus === 'connected' && trackLive(snap.audioTrack)
}

/** @deprecated Use phoneHasVideoTrack / phoneHasAudioTrack independently. */
export function phoneTracksReady(snap: PhoneTracksSnapshot): boolean {
  return phoneHasVideoTrack(snap) && phoneHasAudioTrack(snap)
}

export function subscribePhoneTracks(listener: Listener): () => void {
  listeners.add(listener)
  listener(getPhoneTracksSnapshot())
  return () => listeners.delete(listener)
}

export function initPhoneTracks(tabcast: TabcastBridge): void {
  tabcast.onPhoneWebrtcOffer((offer) => {
    void handleOffer(tabcast, offer).catch(() => {
      resetWebrtc()
    })
  })

  tabcast.onPhoneWebrtcReset(() => {
    resetWebrtc()
  })

  tabcast.onPhonePairUpdate((snap) => {
    pairStatus = snap.status
    if (snap.status !== 'connected') {
      resetWebrtc()
      return
    }
    emit()
  })

  void tabcast.getPhonePair().then((snap) => {
    pairStatus = snap.status
    emit()
  })
}

export { PHONE_CAMERA_DEVICE_VALUE, PHONE_MIC_DEVICE_VALUE }
