import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const RELAY_ENCODE_PATCH_MARKER = 'MAKA_ENCODE_HONOR_V1'

const PROFILE_SETTINGS_OLD = `function profileSettings(profile) {
    return profile === '1080p' ? RELAY_PROFILE_1080P : RELAY_PROFILE_720P;
}`

const PROFILE_SETTINGS_NEW = `function profileSettings(profile) {
    const base = profile === '1080p' ? RELAY_PROFILE_1080P : RELAY_PROFILE_720P;
    const over = globalThis.__MAKA_ENCODE;
    if (!over || typeof over !== 'object') return base;
    return { ...base, ...over };
}`

const ENCODER_RUNNING_OLD = `if (encoder.running) {
        if (encoderMode === nextMode) {`

const ENCODER_RUNNING_NEW = `if (encoder.running && globalThis.__MAKA_ENCODE_DIRTY) {
        globalThis.__MAKA_ENCODE_DIRTY = false;
        resetEncoderState();
    }
    else {
        globalThis.__MAKA_ENCODE_DIRTY = false;
    }
    if (encoder.running) {
        if (encoderMode === nextMode /* maka-encode */) {`

const VIDEO_CODEC_OLD = `args.push('-c:v', 'libx264', '-preset', settings.preset, '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-tune', 'zerolatency', '-b:v'`

const VIDEO_CODEC_NEW = `const makaCodec = settings.videoCodec === 'h264_nvenc' ? 'h264_nvenc' : 'libx264';
    args.push('-c:v', makaCodec, '-preset', makaCodec === 'h264_nvenc' ? 'p4' : settings.preset, '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-tune', makaCodec === 'h264_nvenc' ? 'll' : 'zerolatency', '-b:v'`

const BFRAMES_OLD = `'-sc_threshold', '0', '-r', String(fps)`
const BFRAMES_NEW = `'-sc_threshold', '0', '-bf', String(settings.bFrames ?? 2), '-r', String(fps)`

const APPLY_CONFIG_OLD = `this.runtime = {
            profile: body.profile ?? DEFAULT_STREAM_PROFILE,`

const APPLY_CONFIG_NEW = `const makaId = String(body.profile ?? DEFAULT_STREAM_PROFILE);
        const makaHi = makaId === '1080p' || makaId.startsWith('1080') || makaId.startsWith('2k') || makaId.startsWith('4k');
        const makaFps = makaId.includes('60') ? 60 : 30;
        const makaMbps = Number(body.bitrateMbps);
        const makaMic = Number(body.audioMicBitrateKbps);
        const makaDesk = Number(body.audioDesktopBitrateKbps);
        const makaAudio = Number.isFinite(makaMic) && Number.isFinite(makaDesk)
            ? Math.max(makaMic, makaDesk)
            : (Number.isFinite(makaMic) ? makaMic : 160);
        const makaGop = Number(body.keyframeIntervalSec);
        const makaB = Number(body.bFrames);
        globalThis.__MAKA_ENCODE = {
            width: makaHi ? 1920 : 1280,
            height: makaHi ? 1080 : 720,
            fps: makaFps,
            videoBitrateKbps: Number.isFinite(makaMbps) && makaMbps > 0 ? Math.round(makaMbps * 1000) : (makaHi ? 6000 : 3000),
            audioBitrateKbps: Math.max(64, Math.min(320, Math.round(makaAudio))),
            keyframeIntervalSec: Number.isFinite(makaGop) && makaGop > 0 ? makaGop : 2,
            preset: typeof body.encoderPreset === 'string' && body.encoderPreset ? body.encoderPreset : 'veryfast',
            bFrames: Number.isFinite(makaB) ? makaB : 2,
            videoCodec: body.videoEncoderPreference === 'hardware' ? 'h264_nvenc' : 'libx264',
        };
        globalThis.__MAKA_ENCODE_DIRTY = true;
        this.runtime = {
            profile: makaHi ? '1080p' : '720p',`

const STREAM_ACTIVE_OLD = `if (relayState.status === 'live' || relayState.status === 'starting') {
            return reply.code(409).send({
                error: 'STREAM_ACTIVE',
                message: 'Stream already running in Tabcast Relay.',
            });
        }
        const body = request.body;`

const STREAM_ACTIVE_NEW = `const body = request.body;`

const AFTER_APPLY_OLD = `relayState.applyConfig(body);
        relayState.status = 'idle';`

const AFTER_APPLY_NEW = `relayState.applyConfig(body);
        if (relayState.whipSession?.tracks?.length) {
            const { queueEnsureEncoder } = await import('./session.js');
            void queueEnsureEncoder(relayState.whipSession.tracks);
        }
        relayState.status = relayState.whipSession ? 'live' : 'idle';`

export type RelayPatchResult = {
  patched: string[]
  skipped: string[]
}

function patchFile(path: string, replacements: Array<[string, string]>, result: RelayPatchResult): void {
  if (!existsSync(path)) {
    result.skipped.push(path)
    return
  }
  let source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  if (source.includes(RELAY_ENCODE_PATCH_MARKER) && replacements.every(([from]) => !source.includes(from))) {
    result.skipped.push(path)
    return
  }
  let changed = false
  for (const [from, to] of replacements) {
    if (!source.includes(from)) continue
    source = source.replace(from, to)
    changed = true
  }
  if (!changed) {
    result.skipped.push(path)
    return
  }
  if (!source.includes(RELAY_ENCODE_PATCH_MARKER)) {
    source = `/* ${RELAY_ENCODE_PATCH_MARKER} */\n${source}`
  }
  writeFileSync(path, source, 'utf8')
  result.patched.push(path)
}

/** Teach the unpacked MAKArelay v0.1.0 Node build to honor studio encode fields. */
export function patchInstalledRelayDist(relayDistDir: string): RelayPatchResult {
  const result: RelayPatchResult = { patched: [], skipped: [] }
  patchFile(join(relayDistDir, 'encoder.js'), [
    [PROFILE_SETTINGS_OLD, PROFILE_SETTINGS_NEW],
    [ENCODER_RUNNING_OLD, ENCODER_RUNNING_NEW],
    [VIDEO_CODEC_OLD, VIDEO_CODEC_NEW],
    [BFRAMES_OLD, BFRAMES_NEW],
  ], result)
  patchFile(join(relayDistDir, 'state.js'), [[APPLY_CONFIG_OLD, APPLY_CONFIG_NEW]], result)
  patchFile(join(relayDistDir, 'server.js'), [
    [STREAM_ACTIVE_OLD, STREAM_ACTIVE_NEW],
    [AFTER_APPLY_OLD, AFTER_APPLY_NEW],
  ], result)
  return result
}
