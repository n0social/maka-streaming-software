# Web studio client function notes

Studied `origin/cursor/web-studio-port-dc6d` at `2f9b464` (`site/stream`). Compared with the desktop studio on `origin/cursor/exe-studio-model-bc04` at `2cfbaf4`. These notes describe what the web page actually runs. The Electron tree on the web branch is not the web client.

## 1. Add Scene and the … buttons on each scene row

The page boots with four scene rows in `site/stream/index.html`: Gameplay (`gaming-cam`), Starting Soon, Intermission, and Ending. Each row’s `⋯` is a static `span.studio-list-menu.studio-list-menu--static` with `aria-hidden`. It does nothing.

`initScenes` in `site/stream/js/scenes.js` then calls `renderSceneList`, which replaces that list.

**Add scene is a real in-page control.** When fewer than `MAX_CUSTOM_SCENES` (5) custom rows exist, `renderSceneList` appends `#btn-add-scene` labeled “Add scene”. The click handler takes the first free id `custom-1` … `custom-5`, stores `{ id, name: "Custom Scene N", builtin: false }` on `customScenes`, selects it, and calls `emitAll`. The program card for that id uses the scene name as the title and the subtitle `Custom scene`. The name is an input (max 80 characters) on the row. `writeStorage` / `loadState` persist `customScenes` under `localStorage` key `maka.stream.scenes.v1`, along with `activeSceneId`, layer flags, and the overlay preset.

The public methods `MakaScenes.addScene` and `MakaScenes.deleteScene` are deprecated no-ops (`null` and `false`). The file header that says custom scenes are dropped on write does not match `writeStorage`. CSS hides only the legacy ids `#btn-add-scene-alt` and `#studio-add-scene-row`. It does not hide `#btn-add-scene`.

**Row `⋯` buttons:**

- Gameplay, Starting Soon, and Ending stay `studio-list-menu--static` after the rebuild. No menu.
- Intermission’s `⋯` is a real button (`aria-label` “Intermission timer”). It toggles `#intermission-timer-menu` with 5, 15, and 30 minutes. A choice calls `startIntermissionTimer`, which selects `intermission` and refreshes the card subtitle from `tickIntermission` every 250 ms.
- A custom row’s `⋯` (`aria-label` “Remove custom scene”) deletes that row. If it was active, the selection falls back to `gaming-cam`.

Clicking the row itself calls `selectScene` immediately. There is no scene-options dialog.

On the exe, `#btn-add-scene` and `#btn-add-scene-alt` only `console.log`. The exe row `…` buttons have no listeners. The web Add-scene row is the working one; `MakaScenes.addScene` is the stub.

## 2. Studio Mode (the output-mode control)

The web client has no output-mode `<select>` and does not show the words “Studio Mode”. `site/stream/index.html` has no `#program-output-mode`.

`initOutputMode` / `applyOutputMode` in `site/stream/js/shell.js` ignore the requested mode and always apply `"studio"`. That sets `documentElement.dataset.makaStartupMode`, `#studio-app` `dataset.outputMode` and `dataset.shell`, and `body.dataset.mode` (or `dataset.outputModePending` while Settings is open). It hides `#program-browser`, clears `#brand-tag`, and dispatches `maka:output-mode-change` with `{ mode: "studio" }`. `readStartupMode` always returns `"studio"`. The comment in that file says the web client has no Browser Mode.

This is a real layout lock, and it is not a user control. Nothing in `site/stream` switches to a browser shell.

The exe shows a disabled `#program-output-mode` whose only option is “Studio Mode” (`title`: “Studio Mode is the live output”). Ctrl+B in the exe still calls `setMode` between studio and browse. The web page has no equivalent key.

## 3. Viewers, latency, FPS, resolution, and dropped frames

| Readout | Element | What the web client does | Measured? |
| --- | --- | --- | --- |
| Viewers | `#stream-viewers` | `setLiveUi` in `site/stream/js/live.js` writes `Local relay` while a WHIP `RTCPeerConnection` exists, and `—` otherwise. The markup’s initial `Offline` is replaced on the first `updateButtons`. The title says this is not a CDN viewer count. | No. `refreshRelayStatus` polls `/status` every 2500 ms and only checks `status.status === "live"` for the relay chip. |
| Latency | `#stat-latency` | Stays `—` with `data-idle="1"`. No script writes it. | No. Not taken from the relay and not from the encode preset. |
| FPS | `#stat-fps` | Stays the markup string `FPS: 30`. No script writes it. | No. Not the encode preset. `ENCODE_PROFILE_MAP` includes 30 and 60 fps ids, and `#stat-encode` shows that id, but `#stat-fps` is not updated from it. Display capture asks for an ideal 60 fps and falls back to 30. The program canvas in `preview.js` `tickProgramFrame` draws at 30. None of those values move the label. |
| Resolution | none | There is no resolution stat. The related live label is `#stat-encode`. `syncEncodeSelects` copies the preset id (`720p30` by default) from `localStorage` `maka.stream.bitrateProfile`, `#go-live-wizard-quality`, or `#cfg-profile`. That id plus `bitrateMbps` is what `buildRelayConfigBody` posts to relay `/config`. | The encode preset id, not a measured frame size. `ensureProgramCanvas` is fixed at 1280×720. `getDisplayMedia` asks for an ideal 1920×1080. |
| Dropped frames | `#stat-dropped` | Stays `Dropped Frames: 0 (0.0%)`. No script writes it. No `getStats`, no `droppedFrames` read from `/status`. | No. Static markup. |

`#stat-bitrate` is the same kind of leftover: it stays `—`.

On the exe, `updateProgramStats` does fill FPS and `#stat-resolution` from the encode preset (`Auto (width×height)`) and dropped frames from relay `status.droppedFrames` (otherwise `0 (0.0%)`). Latency stays `—`, and `#stream-viewers` stays `—`. The web client does not do that preset/relay mapping except for `#stat-encode`.

## 4. Go Live on Just Chatting / desk-only and on card scenes

**Just Chatting is a category string, not a scene.** `DEFAULT_STREAM_GAME` in `live.js` is `Just Chatting`. The wizard and `buildRelayConfigBody` send it as `streamCategory` when the stored game name is empty. The web scene list has no `desk-only` id and no Just Chatting row. The exe scene `desk-only` (the Just Chatting row) does not exist here.

**Go Live does not require a gameplay capture.** `#btn-go-live-sidebar` calls `onGoLive`, which opens `#go-live-wizard-dialog` (or ends the WHIP session if one is already up). The wizard’s last step calls `startGoLive`. The gate is `hasCapture()`: a live video track on the preview screen stream **or** the webcam stream (also the copies kept on the live module). Either one is enough. If both are missing, `showRelayModal` uses the title `Preview required before Go Live` and tells the user to share a tab/window or add a webcam. A relay `/health` probe is the next gate. A missing stream key is logged and, for the platform chosen in the wizard, can still abort inside `startGoLive` when `buildRelayConfigBody` has an empty key. Armed chips without keys are only a log line when the wizard body has a key.

**Card scenes do not change that gate.** `selectScene` on `starting-soon`, `intermission`, or `ending` runs `applySceneLayerDefaults`, which sets `layers.game` and `layers.cam` to false (the source rows’ `data-enabled`). `previewSceneDetail` attaches `BUMPER_PRESETS` (title, subtitle, brand `MAKA`). `preview.js` `setSceneCard` shows `#program-scene-card`, a full-frame DOM overlay (`inset: 0` in `shell.css`, cream card in `preview-stage.css`). Intermission’s subtitle includes the countdown from the `⋯` timer. `drawProgramFrame` / `getProgramStream` paint the screen video and the webcam element onto a 1280×720 canvas. They do not paint the card. `postSceneLayout` always posts a full-frame `gameplay` rectangle and, if a webcam track exists, a bottom-right pip. The active scene id is not in that payload.

So a card with no screen and no webcam still cannot go live. A card shown on top of an existing capture can go live, and the WHIP video is the canvas (black bed and/or the video elements), not the bumper artwork.

A webcam-only capture is the closest thing to a desk shot. `hasCapture` passes. If the Webcam row is highlighted, the canvas draws the camera in its overlay slot on a black bed. `syncUi` says a hidden Game Capture leaves the black bed and does not promote the webcam to full frame. An Overlay preset such as `cam-main-game-top-right` can place the camera full frame; that is a layout preset, not a Just Chatting scene. If the webcam track exists but the row is hidden, `hasCapture` still passes and the published canvas can be black, because visibility and the track are separate.

## 5. Desktop audio and game audio on macOS and Linux versus Windows

`site/stream/js/audio.js` and `preview.js` do not branch on macOS, Linux, or Windows. The same path runs on every OS.

The mixer channels are `desktop`, `mic`, and `game` (`MakaStreamAudio`). Desktop and game start idle: meter width 0, fader disabled, `data-capture-unavailable="1"`, titles “Desktop Audio — no signal (share a screen/window with system audio)” and “Game Audio — no signal (share a browser tab with audio)”. There is no fake meter level.

Capture comes from `preview.startScreen` (`getDisplayMedia`). The first attempt sets `audio: true`, `systemAudio: "include"`, and a `displaySurface` hint (`browser`, `window`, or `monitor` from the Game Capture `⋯` picker). If the browser rejects those constraints, it retries with `audio: true` and an ideal 30 fps, without `systemAudio`. `routeDisplayAudioToMixer` reads the track’s `displaySurface`. A `browser` surface is assigned to the `game` channel. Any other surface (monitor, window, or unknown) is assigned to `desktop`. The function clears both channels first, so one share feeds one channel.

The microphone is separate: `pickMicDevice` in `scenes.js` calls `getUserMedia` and `MakaStreamAudio.setStream('mic', …)`.

Once a channel has a live audio track, mute and the −30…0 dB fader are real. The analyser is not connected to the speakers. The gear buttons dispatch `maka-stream-audio-settings`. Nothing in `site/stream` listens. `#desktop-audio-output` stays hidden and only contains “Default system output”. It does not enumerate loopback devices.

WHIP `buildPublishSources` adds microphone audio only. Desktop and game tracks are not added to the peer connection. Local recording (`buildRecordingStream`) adds the mic, and only when the mic is absent adds desktop, otherwise game.

If the browser returns no audio track, both meters stay at “No signal”. The page does not detect the OS and does not show a Windows-only message. That is the platform limit: Chromium may omit system audio on macOS and on many Linux sessions even when `systemAudio: "include"` is requested. Tab audio (`displaySurface === "browser"`) is the path that browsers usually allow on those systems, and the code files that track under Game Audio.

The exe is different and Windows-only. `systemAudioCaptureSupported` in `src/renderer/system-audio-capture.ts` is true only for `win32`. It uses WASAPI-style `chromeMediaSource: "desktop"` loopback. On darwin/linux the exe sets an explicit “this session cannot open it” title and does not start the capture.

## 6. Virtual camera as a selectable camera device

The web studio does not implement a virtual camera. `site/stream` has no virtual-camera button, no “OBS Virtual Camera” string, and no fallback download link.

The camera list is `renderWebcamPicker` in `scenes.js`. It calls `enumerateDevices`, keeps `videoinput`, and labels each entry with `device.label` or `Camera N`. Choosing one calls `pickWebcamDevice` → `MakaStreamPreview.startWebcam({ deviceId })` → `getUserMedia` with `video.deviceId.exact` and `audio: false`. An empty list shows the status `Not available`. If the operating system already exposes OBS Virtual Camera as an ordinary `videoinput`, it would appear under that device label with no extra fallback copy. The page never adds that device itself.

The sentence about OBS Virtual Camera lives in the desktop module `src/main/virtual-camera.ts` (`recommendedFallback.name` is `OBS Virtual Camera` on Windows, and `canOutputToDevice` is false). The web page does not import it. On the exe, Start Virtual Camera runs the local program compositor and shows `limitationMessage` in `#vcam-dialog`. That output is still not a camera other apps can select, and it is not in the web camera picker.

## 7. The webcam source row

Clicking `#studio-source-webcam` does not open a camera. `wireSourceToggle` in `scenes.js` flips `sourceHighlighted.webcam` and calls `applySourceVisibility` → `preview.setWebcamPipVisible`. The handler ignores the click when the target is `[data-source-menu]`. `preview.js` is explicit that `#studio-source-webcam` must not start `getUserMedia`.

With no camera open, highlighting the row shows `#program-cam` and the offline line `video is offline` (`WEBCAM_OFFLINE`). The `<video>` stays hidden. Opening a camera is the `⋯` menu (`aria-label` “Pick camera”): `toggleSourcePicker('webcam')` → `renderWebcamPicker` → `pickWebcamDevice` → `startWebcam`. The picker also offers “Stop webcam” once `sourceActive.webcam` is set. A failed `getUserMedia` leaves the previous track state and clears `selectedCameraId` when nothing is live.

Hiding the row sets `#program-cam` hidden and clears the element’s `srcObject`. The `MediaStreamTrack` keeps running until `stopWebcam`. Showing the row again reattaches the same stream.

The exe row click is the same split: `toggleWebcamLayer` only flips `layerEnabled.cam` and then focuses `#camera-select`. `applyCamera` is what calls `getUserMedia`, and it runs from the select, not from the row click.

## 8. The marketplace catalog

There is a visible button. The right sidebar block “Addon Marketplace” contains `#btn-open-marketplace`, labeled “Browse addons”, with `aria-controls="marketplace-dialog"`.

`initMarketplace` in `site/stream/js/shell.js` calls `load` on boot, so the sidebar preview fills without a click. The button calls `dialog.showModal()` and loads again only if the cache is empty. `#marketplace-refresh` loads again. `#marketplace-close` and a click on the dialog backdrop call `dialog.close()`.

`fetchMarketplaceCatalog` tries, in order, `/marketplace.json`, `https://makalive.stream.skydav.work/marketplace.json`, and `https://makalive.stream/marketplace.json`. `normalizeCatalogEntries` keeps `catalogId`, `featured`, and the manifest fields `name`, `version`, `author`, `category`, `description`, `permissions`, and `builtin`. The dialog (`#marketplace-list`) groups Featured and All extensions. The sidebar (`#marketplace-sidebar-list`) shows up to four cards, featured first. A remote hit appends a “Feed: ” note under the dialog list. A failed fetch says “Could not load marketplace catalog.”

Card actions are status text only. `builtin` items say “Built into core” (sidebar: “Core”). Everything else says “Desktop install only” (sidebar: “Browse”). The bundled `site/marketplace.json` entries (Discord Now Live, and the other catalog rows) do not set `builtin`, so they render as desktop-install-only. The dialog hint says install/enable requires the desktop app and that this catalog is browse-only. There is no install, enable, or uninstall handler.

This is a real catalog browser. It is not an installer, and the button is not a dead control.

On the exe, `marketplace.ts` can install, enable, disable, and uninstall, but `app.html` has no `#btn-open-marketplace`. `initMarketplace` returns immediately, so that install UI cannot be opened from the page. The web client is the one with a working open button, and it stops at browse.

## Port implications

1. Add Scene: copy the in-page `#btn-add-scene` list (max 5, persisted) and the Intermission timer menu; skip `MakaScenes.addScene`, which is a no-op, and skip the static `⋯` on the other built-in rows.
2. Studio Mode: no user control to copy; the web client only locks the layout to studio, and the exe select is a disabled label.
3. Viewers, latency, FPS, resolution, dropped frames: do not copy the web labels; viewers and the four stat strings are placeholders, and only `#stat-encode` follows the encode preset.
4. Go Live: copy the gate that accepts a webcam track or a display share, so gameplay capture is not required; do not copy card scenes as something the encoder publishes, and there is no desk-only or Just Chatting scene.
5. Desktop and game audio: copy the browser split (tab audio → game, window/screen audio → desktop) as far as `getDisplayMedia` goes; there is no macOS or Linux loopback function, and the exe WASAPI path is a different Windows-only mechanism.
6. Virtual camera: nothing to copy; the web camera list is generic `enumerateDevices`, with no OBS Virtual Camera fallback text.
7. Webcam row: copy the split where the row toggles the layer and the `⋯` picker calls `getUserMedia`; the row click does not open a camera.
8. Marketplace: copy the browse button and the JSON fetch if a read-only catalog is the goal; the web client does not install addons.
