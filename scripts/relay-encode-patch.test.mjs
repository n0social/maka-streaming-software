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
assert.match(state, /bitrateMbps/)
assert.match(state, /videoEncoderPreference/)
assert.equal(server.includes('STREAM_ACTIVE'), false)
assert.match(server, /queueEnsureEncoder/)
assert.match(encoder, new RegExp(RELAY_ENCODE_PATCH_MARKER))

const second = patchInstalledRelayDist(dir)
assert.equal(second.patched.length, 0)

console.log('relay-encode-patch.test.mjs: ok')
