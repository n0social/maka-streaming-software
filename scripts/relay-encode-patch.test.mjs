import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { patchInstalledRelayDist, RELAY_ENCODE_PATCH_MARKER } from '../src/main/patch-installed-relay.ts'

const dir = mkdtempSync(join(tmpdir(), 'maka-relay-patch-'))
writeFileSync(
  join(dir, 'encoder.js'),
  `function profileSettings(profile) {
    return profile === '1080p' ? RELAY_PROFILE_1080P : RELAY_PROFILE_720P;
}
if (encoder.running) {
        if (encoderMode === nextMode) {
            keep();
        }
}
args.push('-c:v', 'libx264', '-preset', settings.preset, '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-tune', 'zerolatency', '-b:v', '1k');
args.push('-sc_threshold', '0', '-r', String(fps));
    const filterComplex = audioMixFilter ? \`\${filter};\${audioMixFilter}\` : filter;
    args.push('-filter_complex', filterComplex, '-map', '[outv]');
    if (audioMixFilter) {
        args.push('-map', '[outa]');
    }
    else if (displayAudioInputIndex !== undefined) {
        args.push('-map', \`\${displayAudioInputIndex}:a\`);
    }
    else if (micAudioInputIndex !== undefined) {
        args.push('-map', \`\${micAudioInputIndex}:a\`);
    }
    else if (silentAudioInputIndex !== undefined) {
        args.push('-map', \`\${silentAudioInputIndex}:a\`);
    }
    appendTwitchVideoEncodeArgs(args, settings, fps);
`,
)
writeFileSync(
  join(dir, 'state.js'),
  `this.runtime = {
            profile: body.profile ?? DEFAULT_STREAM_PROFILE,
            keys: true,
        };
`,
)
writeFileSync(
  join(dir, 'server.js'),
  `if (relayState.status === 'live' || relayState.status === 'starting') {
            return reply.code(409).send({
                error: 'STREAM_ACTIVE',
                message: 'Stream already running in Tabcast Relay.',
            });
        }
        const body = request.body;
        relayState.applyConfig(body);
        relayState.status = 'idle';
`,
)

const first = patchInstalledRelayDist(dir)
assert.equal(first.patched.length, 3)
const encoder = readFileSync(join(dir, 'encoder.js'), 'utf8')
const state = readFileSync(join(dir, 'state.js'), 'utf8')
const server = readFileSync(join(dir, 'server.js'), 'utf8')
assert.match(encoder, /__MAKA_ENCODE_DIRTY/)
assert.match(encoder, /resetEncoderState\(\)/)
assert.match(encoder, /h264_nvenc/)
assert.match(encoder, /-bf/)
assert.match(encoder, /makaPassthrough/)
assert.match(encoder, /-c:v', 'copy', '-c:a', 'aac'/)
assert.match(encoder, /appendTwitchVideoEncodeArgs\(args, settings, fps\)/)
assert.equal(encoder.includes("args.push('-c:v', 'libx264'"), false)
assert.match(state, /bitrateMbps/)
assert.match(state, /videoEncoderPreference/)
assert.equal(server.includes('STREAM_ACTIVE'), false)
assert.match(server, /queueEnsureEncoder/)
assert.match(encoder, new RegExp(RELAY_ENCODE_PATCH_MARKER))

const second = patchInstalledRelayDist(dir)
assert.equal(second.patched.length, 0)

const upgraded = mkdtempSync(join(tmpdir(), 'maka-relay-patch-up-'))
writeFileSync(
  join(upgraded, 'encoder.js'),
  `/* ${RELAY_ENCODE_PATCH_MARKER} */
function profileSettings(profile) {
    const base = profile === '1080p' ? RELAY_PROFILE_1080P : RELAY_PROFILE_720P;
    const over = globalThis.__MAKA_ENCODE;
    if (!over || typeof over !== 'object') return base;
    return { ...base, ...over };
}
if (encoder.running && globalThis.__MAKA_ENCODE_DIRTY) {
        globalThis.__MAKA_ENCODE_DIRTY = false;
        resetEncoderState();
    }
    else {
        globalThis.__MAKA_ENCODE_DIRTY = false;
    }
    if (encoder.running) {
        if (encoderMode === nextMode /* maka-encode */) {
            keep();
        }
}
const makaCodec = settings.videoCodec === 'h264_nvenc' ? 'h264_nvenc' : 'libx264';
    args.push('-c:v', makaCodec, '-preset', makaCodec === 'h264_nvenc' ? 'p4' : settings.preset, '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-tune', makaCodec === 'h264_nvenc' ? 'll' : 'zerolatency', '-b:v', '1k');
args.push('-sc_threshold', '0', '-bf', String(settings.bFrames ?? 2), '-r', String(fps));
    const filterComplex = audioMixFilter ? \`\${filter};\${audioMixFilter}\` : filter;
    args.push('-filter_complex', filterComplex, '-map', '[outv]');
    if (audioMixFilter) {
        args.push('-map', '[outa]');
    }
    else if (displayAudioInputIndex !== undefined) {
        args.push('-map', \`\${displayAudioInputIndex}:a\`);
    }
    else if (micAudioInputIndex !== undefined) {
        args.push('-map', \`\${micAudioInputIndex}:a\`);
    }
    else if (silentAudioInputIndex !== undefined) {
        args.push('-map', \`\${silentAudioInputIndex}:a\`);
    }
    appendTwitchVideoEncodeArgs(args, settings, fps);
`,
)
writeFileSync(
  join(upgraded, 'state.js'),
  `/* ${RELAY_ENCODE_PATCH_MARKER} */
const makaId = String(body.profile ?? DEFAULT_STREAM_PROFILE);
        globalThis.__MAKA_ENCODE = {
            videoCodec: body.videoEncoderPreference === 'hardware' ? 'h264_nvenc' : 'libx264',
        };
        this.runtime = {
            profile: makaHi ? '1080p' : '720p',
            keys: true,
        };
`,
)
writeFileSync(join(upgraded, 'server.js'), `/* ${RELAY_ENCODE_PATCH_MARKER} */\nconst body = request.body;\n`)
const upgrade = patchInstalledRelayDist(upgraded)
assert.equal(upgrade.patched.length, 1)
const upgradedEncoder = readFileSync(join(upgraded, 'encoder.js'), 'utf8')
const upgradedState = readFileSync(join(upgraded, 'state.js'), 'utf8')
assert.match(upgradedEncoder, /makaPassthrough/)
assert.match(upgradedEncoder, /-c:v', 'copy', '-c:a', 'aac'/)
assert.match(upgradedEncoder, /const makaCodec = settings.videoCodec/)
assert.match(upgradedState, /h264_nvenc/)
const upgradeAgain = patchInstalledRelayDist(upgraded)
assert.equal(upgradeAgain.patched.length, 0)

console.log('relay-encode-patch.test.mjs: ok')
