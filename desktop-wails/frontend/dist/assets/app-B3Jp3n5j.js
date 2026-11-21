const ENCODE_PROFILE_ORDER = [
  "cloud720p30",
  "720p30",
  "720p60",
  "1080p30",
  "1080p60",
  "2k60",
  "4k60"
];
const STANDARD_GOP = {
  rateControl: "cbr",
  keyframeIntervalSec: 2,
  bFrames: 2,
  encoderPreset: "veryfast"
};
const ENCODE_PROFILES = {
  cloud720p30: {
    id: "cloud720p30",
    menuLabel: "Cloud gaming · 720p30",
    sidebarLabel: "Cloud · 2.5 Mbps",
    width: 1280,
    height: 720,
    fps: 30,
    bitrateMbps: 2.5,
    maxBitrateMbps: 2.5,
    rateControl: "cbr",
    keyframeIntervalSec: 2,
    bFrames: 0,
    encoderPreset: "ultrafast"
  },
  "720p30": {
    id: "720p30",
    menuLabel: "720p @ 30fps",
    sidebarLabel: "720p30 · 3 Mbps",
    width: 1280,
    height: 720,
    fps: 30,
    bitrateMbps: 3,
    maxBitrateMbps: 3,
    ...STANDARD_GOP
  },
  "720p60": {
    id: "720p60",
    menuLabel: "720p @ 60fps",
    sidebarLabel: "720p60 · 4.5 Mbps",
    width: 1280,
    height: 720,
    fps: 60,
    bitrateMbps: 4.5,
    maxBitrateMbps: 4.5,
    ...STANDARD_GOP
  },
  "1080p30": {
    id: "1080p30",
    menuLabel: "1080p @ 30fps",
    sidebarLabel: "1080p30 · 4.5 Mbps",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateMbps: 4.5,
    maxBitrateMbps: 4.5,
    ...STANDARD_GOP
  },
  "1080p60": {
    id: "1080p60",
    menuLabel: "1080p @ 60fps",
    sidebarLabel: "1080p60 · 6 Mbps",
    width: 1920,
    height: 1080,
    fps: 60,
    bitrateMbps: 6,
    maxBitrateMbps: 6,
    ...STANDARD_GOP
  },
  "2k60": {
    id: "2k60",
    menuLabel: "2K @ 60fps",
    sidebarLabel: "2K60 · 10 Mbps",
    width: 2560,
    height: 1440,
    fps: 60,
    bitrateMbps: 10,
    maxBitrateMbps: 10,
    ...STANDARD_GOP
  },
  "4k60": {
    id: "4k60",
    menuLabel: "4K @ 60fps",
    sidebarLabel: "4K60 · 16 Mbps",
    width: 3840,
    height: 2160,
    fps: 60,
    bitrateMbps: 16,
    maxBitrateMbps: 16,
    ...STANDARD_GOP
  }
};
const DEFAULT_ENCODE_PROFILE = "720p30";
const LEGACY_PROFILE_MAP = {
  "720p": "720p30",
  "1080p": "1080p60"
};
function isEncodeProfileId(value) {
  return value in ENCODE_PROFILES;
}
function normalizeEncodeProfileId(stored) {
  if (!stored) return DEFAULT_ENCODE_PROFILE;
  if (isEncodeProfileId(stored)) return stored;
  return LEGACY_PROFILE_MAP[stored] ?? DEFAULT_ENCODE_PROFILE;
}
function encodeProfileSpec(id) {
  return ENCODE_PROFILES[id];
}
function canvasForEncodeProfile(id) {
  const spec = ENCODE_PROFILES[id];
  return { width: spec.width, height: spec.height };
}
function formatAutoEncodeLabel(id) {
  if (id === "cloud720p30") return "Cloud (1280×720)";
  const { width, height } = ENCODE_PROFILES[id];
  return `Auto (${width}×${height})`;
}
const MAX_CUSTOM_SCENES = 3;
const CUSTOM_SCENE_ID_RE = /^custom-[1-3]$/;
function isCustomSceneId(id) {
  return CUSTOM_SCENE_ID_RE.test(id);
}
const CUSTOM_SCENE_LAYOUT_TEMPLATE_ID = "desk-only";
function resolveSceneLayoutTemplateId(sceneId) {
  if (isCustomSceneId(sceneId)) return CUSTOM_SCENE_LAYOUT_TEMPLATE_ID;
  return sceneId;
}
function isDeskOnlyLikeScene(sceneId) {
  return sceneId === CUSTOM_SCENE_LAYOUT_TEMPLATE_ID || isCustomSceneId(sceneId);
}
function removeCustomScene(existing, id) {
  if (!isCustomSceneId(id)) return existing.slice();
  return existing.filter((scene) => scene.id !== id);
}
function nextCustomSceneId(existing) {
  for (let i = 1; i <= MAX_CUSTOM_SCENES; i++) {
    const id = `custom-${i}`;
    if (!existing.some((s) => s.id === id)) return id;
  }
  return null;
}
function defaultCustomSceneName(id) {
  const slot = id.replace("custom-", "");
  return `Custom Scene ${slot}`;
}
function coerceCustomScenes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!isCustomSceneId(id)) continue;
    const nameRaw = typeof item.name === "string" ? item.name : "";
    const name = nameRaw.trim().slice(0, 80) || defaultCustomSceneName(id);
    if (out.some((s) => s.id === id)) continue;
    out.push({ id, name });
    if (out.length >= MAX_CUSTOM_SCENES) break;
  }
  return out;
}
const INTERMISSION_TIMER_MINUTES = [5, 15, 30];
function isIntermissionMinutes(value) {
  return INTERMISSION_TIMER_MINUTES.includes(value);
}
function intermissionEndsAt(nowMs, minutes) {
  return nowMs + minutes * 6e4;
}
function formatClockSeconds(totalSec) {
  const safe = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function intermissionSubtitle(nowMs, endsAt, fallback) {
  if (endsAt == null) return fallback;
  const leftMs = endsAt - nowMs;
  if (leftMs <= 0) return "Intermission over";
  return `Back in ${formatClockSeconds(Math.ceil(leftMs / 1e3))}`;
}
function measuredFps(frameCount, elapsedMs) {
  if (elapsedMs < 250 || frameCount < 1) return null;
  const fps = frameCount * 1e3 / elapsedMs;
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return Math.round(fps);
}
function frameIntervalMs(fps) {
  if (fps == null || fps <= 0) return null;
  return Math.round(1e3 / fps);
}
function dropPercentLabel(dropped, total) {
  if (total == null || total <= 0) return dropped === 0 ? "0.0" : "—";
  return (dropped / total * 100).toFixed(1);
}
function mbpsFromByteDelta(byteDelta, elapsedMs) {
  if (elapsedMs <= 0 || byteDelta <= 0) return null;
  const mbps = byteDelta * 8 / elapsedMs / 1e3;
  if (!Number.isFinite(mbps) || mbps <= 0) return null;
  return Math.round(mbps * 10) / 10;
}
function viewerStatusLabel(isLive, count) {
  if (!isLive) {
    return { text: "Offline", title: "Viewer count when you go live" };
  }
  if (count != null) {
    return {
      text: `Viewers: ${count.toLocaleString(void 0, { maximumFractionDigits: 0 })}`,
      title: "Live viewer count from the relay"
    };
  }
  return {
    text: "Viewers: local",
    title: "This session is live on this machine. The relay has not reported a platform viewer count."
  };
}
const TWITCH_LOGIN$1 = /^[a-zA-Z0-9_]{2,25}$/;
const YOUTUBE_VIDEO_ID$1 = /^[A-Za-z0-9_-]{11}$/;
const ALERT_HOLD_MS = 3500;
function alertBoxPageUrl(raw) {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
function streamChatUrl(platform, channel) {
  const name = channel.trim().replace(/^@/, "");
  if (!name) return null;
  if (platform === "twitch" && TWITCH_LOGIN$1.test(name)) {
    return `https://www.twitch.tv/popout/${name.toLowerCase()}/chat?popout=`;
  }
  if (platform === "youtube" && YOUTUBE_VIDEO_ID$1.test(name)) {
    return `https://www.youtube.com/live_chat?is_popout=1&v=${name}`;
  }
  return null;
}
function alertCard(alert) {
  if (alert.kind === "cheer") {
    return { kicker: "Cheer", headline: `${alert.name} cheered ${alert.amount}`, detail: alert.message };
  }
  if (alert.kind === "subscription") {
    return { kicker: "Subscription", headline: `${alert.name} subscribed`, detail: alert.message };
  }
  if (alert.kind === "gift") {
    return { kicker: "Gifted sub", headline: `${alert.name} gifted ${alert.amount}`, detail: alert.message };
  }
  return { kicker: "Raid", headline: `${alert.name} is raiding with ${alert.amount}`, detail: alert.message };
}
function unescapeIrcTag(value) {
  return value.replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\\\/g, "\\").replace(/\\r/g, " ").replace(/\\n/g, " ");
}
function ircTags(source) {
  const out = {};
  for (const part of source.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out[part.slice(0, eq)] = unescapeIrcTag(part.slice(eq + 1));
  }
  return out;
}
function trailingMessage(rest) {
  const idx = rest.indexOf(" :");
  return idx >= 0 ? rest.slice(idx + 2).trim() : "";
}
function parseIrcLine(rawLine) {
  const line = rawLine.trim();
  if (!line.startsWith("@")) return null;
  const space = line.indexOf(" ");
  if (space < 0) return null;
  return {
    tags: ircTags(line.slice(1, space)),
    rest: line.slice(space + 1),
    command: line.slice(space + 1).split(" ")[1] || ""
  };
}
function visibleChatMessage(message) {
  const action = message.match(/^\u0001ACTION ([\s\S]*?)\u0001?$/);
  return (action?.[1] ?? message).replace(/\u0001/g, "").trim();
}
function twitchNameColor(raw) {
  return raw && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : "";
}
function parseTwitchIrcChat(rawLine) {
  const parsed = parseIrcLine(rawLine);
  if (!parsed || parsed.command !== "PRIVMSG" || parsed.tags.bits) return null;
  const message = visibleChatMessage(trailingMessage(parsed.rest));
  if (!message) return null;
  const name = parsed.tags["display-name"] || "Someone";
  return {
    id: parsed.tags.id || `${name}-${message}`,
    name,
    message,
    color: twitchNameColor(parsed.tags.color)
  };
}
function parseTwitchIrcAlert(rawLine) {
  const parsed = parseIrcLine(rawLine);
  if (!parsed) return null;
  const { tags, command, rest } = parsed;
  const name = tags["display-name"] || "Someone";
  const id = tags.id || `${command}-${name}-${tags.bits || tags["msg-id"] || ""}`;
  if (command === "PRIVMSG" && tags.bits) {
    return {
      id,
      kind: "cheer",
      name,
      amount: `${tags.bits} bits`,
      message: trailingMessage(rest)
    };
  }
  if (command !== "USERNOTICE") return null;
  const msgId = tags["msg-id"] || "";
  if (msgId === "sub" || msgId === "resub") {
    const months = tags["msg-param-cumulative-months"];
    return {
      id,
      kind: "subscription",
      name,
      amount: months ? `${months} months` : tags["msg-param-sub-plan-name"] || "Tier 1",
      message: tags["system-msg"] || trailingMessage(rest)
    };
  }
  if (msgId === "subgift" || msgId === "submysterygift") {
    const count = tags["msg-param-mass-gift-count"] || tags["msg-param-sender-count"] || "1";
    return {
      id,
      kind: "gift",
      name,
      amount: `${count} subs`,
      message: tags["system-msg"] || trailingMessage(rest)
    };
  }
  if (msgId === "raid") {
    const viewers = tags["msg-param-viewerCount"];
    return {
      id,
      kind: "raid",
      name: tags["msg-param-displayName"] || name,
      amount: viewers ? `${viewers} viewers` : "Raid",
      message: tags["system-msg"] || ""
    };
  }
  return null;
}
const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
function startTwitchChatFeed(channel, handlers) {
  const login = channel.trim().replace(/^@/, "").toLowerCase();
  let socket = null;
  let stopped = false;
  let retryMs = 1e3;
  let retryTimer = null;
  if (!/^[a-z0-9_]{2,25}$/.test(login)) {
    return { stop() {
    } };
  }
  const schedule = () => {
    if (stopped || retryTimer) return;
    handlers.onStatus?.("connecting");
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryMs = Math.min(retryMs * 2, 15e3);
      connect();
    }, retryMs);
  };
  const connect = () => {
    if (stopped) return;
    handlers.onStatus?.("connecting");
    let current;
    try {
      current = new WebSocket(IRC_URL);
    } catch {
      schedule();
      return;
    }
    socket = current;
    current.addEventListener("open", () => {
      if (stopped || socket !== current) return;
      retryMs = 1e3;
      handlers.onStatus?.("open");
      const nick = `justinfan${Math.floor(1e4 + Math.random() * 89999)}`;
      current.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      current.send(`NICK ${nick}`);
      current.send(`JOIN #${login}`);
    });
    current.addEventListener("message", (event) => {
      if (stopped || socket !== current) return;
      const text = typeof event.data === "string" ? event.data : "";
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          current.send("PONG :tmi.twitch.tv");
          continue;
        }
        const alert = parseTwitchIrcAlert(line);
        if (alert) {
          handlers.onAlert(alert);
          continue;
        }
        const chat = parseTwitchIrcChat(line);
        if (chat) handlers.onChat(chat);
      }
    });
    current.addEventListener("close", () => {
      if (socket === current) socket = null;
      if (!stopped) schedule();
    });
    current.addEventListener("error", () => {
      current.close();
    });
  };
  connect();
  return {
    stop() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      socket?.close();
      socket = null;
    }
  };
}
const SCENE_STUB_PRESETS = {
  "starting-soon": {
    id: "starting-soon",
    title: "Starting Soon",
    subtitle: "Hang tight — we’ll be live in a moment"
  },
  intermission: {
    id: "intermission",
    title: "Intermission",
    subtitle: "Short break — back shortly"
  },
  ending: {
    id: "ending",
    title: "Ending Scene",
    subtitle: "Thanks for watching"
  }
};
function isSceneStubId(id) {
  return id in SCENE_STUB_PRESETS;
}
function sceneStubPreset(id) {
  return SCENE_STUB_PRESETS[id];
}
function canvasFor$1(profile) {
  return canvasForEncodeProfile(profile);
}
const SCENE_TEMPLATES = [
  {
    id: "gaming-cam",
    name: "Gaming + cam",
    description: "Full-frame gameplay with webcam bottom-right.",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor$1(profile);
      const sources = [
        {
          id: "gameplay",
          type: "video",
          label: "Gameplay",
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          zIndex: 0
        }
      ];
      if (hasWebcam) {
        const w = Math.round(canvas.width * 0.22);
        const h = Math.round(w * (9 / 16));
        sources.push({
          id: "webcam",
          type: "video",
          label: "Webcam",
          x: canvas.width - w - 24,
          y: canvas.height - h - 24,
          width: w,
          height: h,
          zIndex: 1
        });
      }
      return { canvas, sources };
    }
  },
  {
    id: "desk-only",
    name: "Desk / talking head",
    description: "Webcam full frame — no gameplay layer.",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor$1(profile);
      if (!hasWebcam) {
        return {
          canvas,
          sources: [
            {
              id: "gameplay",
              type: "video",
              label: "Program",
              x: 0,
              y: 0,
              width: canvas.width,
              height: canvas.height,
              zIndex: 0
            }
          ]
        };
      }
      return {
        canvas,
        sources: [
          {
            id: "webcam",
            type: "video",
            label: "Webcam",
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            zIndex: 0
          }
        ]
      };
    }
  },
  {
    id: "browse-showcase",
    name: "Browse showcase",
    description: "Large program frame tuned for browser tab capture.",
    build: ({ profile }) => {
      const canvas = canvasFor$1(profile);
      return {
        canvas,
        sources: [
          {
            id: "gameplay",
            type: "video",
            label: "Browse",
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            zIndex: 0
          }
        ]
      };
    }
  },
  {
    id: "starting-soon",
    name: "Starting Soon",
    description: "Branded holding card before the stream starts.",
    build: ({ profile }) => ({
      canvas: canvasFor$1(profile),
      sources: []
    })
  },
  {
    id: "intermission",
    name: "Intermission",
    description: "Branded break card between segments.",
    build: ({ profile }) => ({
      canvas: canvasFor$1(profile),
      sources: []
    })
  },
  {
    id: "ending",
    name: "Ending Scene",
    description: "Branded sign-off card.",
    build: ({ profile }) => ({
      canvas: canvasFor$1(profile),
      sources: []
    })
  }
];
const SCENE_IMAGE_SCENE_IDS = [
  "desk-only",
  "starting-soon",
  "intermission",
  "ending"
];
function sceneSupportsImageUpload(sceneId) {
  return SCENE_IMAGE_SCENE_IDS.includes(sceneId) || isCustomSceneId(sceneId);
}
function sceneImageMaskMode(sceneId) {
  if (sceneId === "desk-only" || isCustomSceneId(sceneId)) return "game-mask-only";
  if (sceneId === "starting-soon" || sceneId === "intermission" || sceneId === "ending") {
    return "full-mask-except-chat";
  }
  return null;
}
function canvasFor(profile) {
  return canvasForEncodeProfile(profile);
}
function box(canvas, xFrac, yFrac, wFrac, hFrac) {
  return {
    x: Math.round(canvas.width * xFrac),
    y: Math.round(canvas.height * yFrac),
    width: Math.round(canvas.width * wFrac),
    height: Math.round(canvas.height * hFrac)
  };
}
function camBox(canvas, xFrac, yFrac, widthFrac) {
  const width = Math.round(canvas.width * widthFrac);
  const height = Math.round(width * (9 / 16));
  return {
    x: Math.round(canvas.width * xFrac),
    y: Math.round(canvas.height * yFrac),
    width,
    height
  };
}
function gameplaySource(r, zIndex = 0) {
  return {
    id: "gameplay",
    type: "video",
    label: "Gameplay",
    ...r,
    zIndex
  };
}
function webcamSource(r, zIndex = 2) {
  return {
    id: "webcam",
    type: "video",
    label: "Webcam",
    ...r,
    zIndex
  };
}
function chatPlaceholder(r, zIndex = 1) {
  return {
    id: "chat",
    type: "overlay",
    label: "Chat (placeholder)",
    ...r,
    zIndex
  };
}
function notificationsPlaceholder(r, zIndex = 1) {
  return {
    id: "notifications",
    type: "overlay",
    label: "Notifications (placeholder)",
    ...r,
    zIndex
  };
}
function layoutFromParts(profile, parts) {
  const canvas = canvasFor(profile);
  const sources = [gameplaySource(parts.gameplay)];
  if (parts.chat) sources.push(chatPlaceholder(parts.chat, 1));
  if (parts.notifications) sources.push(notificationsPlaceholder(parts.notifications, 1));
  if (parts.hasWebcam && parts.webcam) {
    sources.push(webcamSource(parts.webcam, 3));
  }
  return { canvas, sources };
}
const OVERLAY_LAYOUT_PRESETS = [
  {
    id: "classic-gaming",
    name: "Classic gaming",
    description: "Full-frame gameplay; webcam top-right; chat lower-left; notifications center-right (chat/notifications are labeled placeholders until wired).",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.74, 0.04, 0.22),
        chat: box(canvas, 0.02, 0.68, 0.28, 0.28),
        notifications: box(canvas, 0.62, 0.38, 0.34, 0.22),
        hasWebcam
      });
    }
  },
  {
    id: "webcam-focus",
    name: "Webcam focus",
    description: "Webcam full center; gameplay PiP bottom-right; chat centered-left; notifications centered (placeholders).",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      const sources = [
        gameplaySource(box(canvas, 0.62, 0.58, 0.34, 0.34), 0),
        chatPlaceholder(box(canvas, 0.04, 0.36, 0.26, 0.28), 1),
        notificationsPlaceholder(box(canvas, 0.37, 0.04, 0.26, 0.18), 1)
      ];
      if (hasWebcam) {
        const w = Math.round(canvas.width * 0.76);
        const h = Math.round(w * (9 / 16));
        sources.push(
          webcamSource(
            {
              x: Math.round(canvas.width * 0.12),
              y: Math.round(canvas.height * 0.1),
              width: w,
              height: h
            },
            3
          )
        );
      }
      return { canvas, sources };
    }
  },
  {
    id: "notifications-stack",
    name: "Notifications stack",
    description: "Gameplay full frame; notifications upper center-right; chat lower-left; webcam bottom-right.",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.72, 0.7, 0.24),
        chat: box(canvas, 0.03, 0.7, 0.3, 0.26),
        notifications: box(canvas, 0.55, 0.05, 0.4, 0.2),
        hasWebcam
      });
    }
  },
  {
    id: "chat-corner",
    name: "Chat corner",
    description: "Gameplay centered with margin; chat large lower-right; notifications center-left; webcam top-left.",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0.06, 0.08, 0.88, 0.72),
        webcam: camBox(canvas, 0.03, 0.03, 0.2),
        chat: box(canvas, 0.58, 0.72, 0.38, 0.24),
        notifications: box(canvas, 0.04, 0.42, 0.22, 0.2),
        hasWebcam
      });
    }
  },
  {
    id: "balanced-triple",
    name: "Balanced triple",
    description: "Gameplay inset center; webcam top-right; chat lower-left; notifications lower-center (placeholders).",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0.1, 0.12, 0.8, 0.62),
        webcam: camBox(canvas, 0.76, 0.04, 0.2),
        chat: box(canvas, 0.04, 0.76, 0.3, 0.2),
        notifications: box(canvas, 0.36, 0.78, 0.28, 0.18),
        hasWebcam
      });
    }
  },
  {
    id: "pip-left",
    name: "Gameplay PiP left",
    description: "Webcam-forward layout: large webcam right; gameplay PiP bottom-left; chat top-left; notifications top-center.",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      const sources = [
        gameplaySource(box(canvas, 0.04, 0.62, 0.32, 0.32), 0),
        chatPlaceholder(box(canvas, 0.04, 0.06, 0.28, 0.24), 1),
        notificationsPlaceholder(box(canvas, 0.34, 0.06, 0.3, 0.16), 1)
      ];
      if (hasWebcam) {
        const w = Math.round(canvas.width * 0.58);
        const h = Math.round(w * (9 / 16));
        sources.push(
          webcamSource(
            {
              x: Math.round(canvas.width * 0.38),
              y: Math.round(canvas.height * 0.12),
              width: w,
              height: h
            },
            3
          )
        );
      }
      return { canvas, sources };
    }
  },
  {
    id: "minimal-cam",
    name: "Minimal cam",
    description: "Full gameplay with a small webcam bottom-left only (no chat/notification slots).",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      const sources = [gameplaySource(box(canvas, 0, 0, 1, 1))];
      if (hasWebcam) {
        sources.push(webcamSource(camBox(canvas, 0.03, 0.72, 0.18), 2));
      }
      return { canvas, sources };
    }
  },
  {
    id: "broadcast-lower-third",
    name: "Broadcast lower third",
    description: "Gameplay full; notifications strip center-top; chat wide lower-third; webcam upper-right.",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0, 0, 1, 1),
        webcam: camBox(canvas, 0.78, 0.05, 0.18),
        chat: box(canvas, 0.08, 0.78, 0.84, 0.18),
        notifications: box(canvas, 0.25, 0.04, 0.5, 0.12),
        hasWebcam
      });
    }
  },
  {
    id: "symmetric-pip",
    name: "Symmetric PiP",
    description: "Gameplay large center; webcam and notification tiles on opposite corners; chat between them.",
    build: ({ profile, hasWebcam }) => {
      const canvas = canvasFor(profile);
      return layoutFromParts(profile, {
        gameplay: box(canvas, 0.08, 0.1, 0.84, 0.58),
        webcam: camBox(canvas, 0.04, 0.72, 0.22),
        chat: box(canvas, 0.38, 0.72, 0.24, 0.22),
        notifications: box(canvas, 0.74, 0.72, 0.22, 0.22),
        hasWebcam
      });
    }
  }
];
function defaultChatOverlaySlot(canvas) {
  return chatPlaceholder(box(canvas, 0.02, 0.68, 0.28, 0.28), 1);
}
function defaultNotificationsOverlaySlot(canvas) {
  return notificationsPlaceholder(box(canvas, 0.62, 0.38, 0.34, 0.22), 1);
}
function overlayPresetById(id) {
  return OVERLAY_LAYOUT_PRESETS.find((p) => p.id === id);
}
const BROWSE_CAPTURE_SOURCE_ID = "maka:browse:active";
function backupIngestConfigured(backup) {
  return backup.url.trim().length > 0;
}
function isRtmpRecoveryReason(reason) {
  return reason.startsWith("rtmp:");
}
function nextIngestTargetAfterFailedRecovery(current, recoveryReason, backup) {
  if (current === "backup") return "backup";
  if (!backupIngestConfigured(backup)) return "primary";
  if (isRtmpRecoveryReason(recoveryReason)) return "backup";
  return "primary";
}
function resolveCustomRtmpForPost(ingestTarget, primary, backup) {
  if (ingestTarget === "backup" && backupIngestConfigured(backup)) {
    const url2 = backup.url.trim();
    const key2 = (backup.key ?? "").trim();
    if (url2 && key2) return { url: url2, key: key2 };
    if (url2 && !key2) return { url: url2 };
    return {};
  }
  if (!primary.enabled) return {};
  const url = primary.url.trim();
  const key = (primary.key ?? "").trim();
  if (url && key) return { url, key };
  if (url && !key) return { url };
  return {};
}
const BACKUP_INGEST_STATUS = "Backup ingest";
const TWITCH_STREAM_KEY_MIN_LENGTH = 15;
const TWITCH_STREAM_KEY_MAX_LENGTH = 128;
const YOUTUBE_STREAM_KEY_MIN_LENGTH = 16;
const YOUTUBE_STREAM_KEY_MAX_LENGTH = 64;
const TWITCH_STREAM_KEY_PATTERN = /^live_[a-zA-Z0-9_]+$/;
const YOUTUBE_STREAM_KEY_PATTERN = /^[a-z0-9-]{16,64}$/i;
function normalizeStreamKey(raw) {
  let key = raw.trim();
  const fromRtmpUrl = key.match(/rtmps?:\/\/[^/]+\/app\/([^/?#\s]+)/i);
  if (fromRtmpUrl?.[1]) return fromRtmpUrl[1];
  const fromAppPath = key.match(/\/app\/([^/?#\s]+)/i);
  if (fromAppPath?.[1]) return fromAppPath[1];
  return key;
}
function validateTwitchStreamKey(raw) {
  const key = normalizeStreamKey(raw);
  if (!key) {
    return { ok: false, message: "Enter your Twitch stream key (Dashboard → Settings → Stream)." };
  }
  if (key.length < TWITCH_STREAM_KEY_MIN_LENGTH || key.length > TWITCH_STREAM_KEY_MAX_LENGTH) {
    return {
      ok: false,
      message: `Twitch stream key must be ${TWITCH_STREAM_KEY_MIN_LENGTH}–${TWITCH_STREAM_KEY_MAX_LENGTH} characters.`
    };
  }
  if (!TWITCH_STREAM_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      message: "Twitch stream key must start with live_ and contain only letters, numbers, and underscores."
    };
  }
  return { ok: true };
}
function validateYoutubeStreamKey(raw) {
  const key = normalizeStreamKey(raw);
  if (!key) return { ok: true };
  if (key.length < YOUTUBE_STREAM_KEY_MIN_LENGTH || key.length > YOUTUBE_STREAM_KEY_MAX_LENGTH) {
    return {
      ok: false,
      message: `YouTube stream key must be ${YOUTUBE_STREAM_KEY_MIN_LENGTH}–${YOUTUBE_STREAM_KEY_MAX_LENGTH} characters.`
    };
  }
  if (!YOUTUBE_STREAM_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      message: "YouTube stream key may only contain letters, numbers, and dashes."
    };
  }
  return { ok: true };
}
const KICK_RTMP_URL = "rtmps://fa723fc1b171.global-contribute.live-video.net/app";
const CUSTOM_RTMP_URL_RE = /^rtmps?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[\w./-]*)?$/i;
function validateCustomRtmp(url, key) {
  const ingest = url.trim();
  const streamKey = normalizeStreamKey(key);
  if (!ingest || !streamKey) {
    return { ok: false, message: "Custom RTMP needs an ingest URL and stream key." };
  }
  if (!CUSTOM_RTMP_URL_RE.test(ingest)) {
    return { ok: false, message: "Custom RTMP URL must start with rtmp:// or rtmps://" };
  }
  if (streamKey.length < 8 || streamKey.length > 256) {
    return { ok: false, message: "Custom RTMP stream key must be 8–256 characters." };
  }
  return { ok: true };
}
function validateRelayStreamKeys(input) {
  const twitch = normalizeStreamKey(input.twitchKey ?? "");
  const youtube = normalizeStreamKey(input.youtubeKey ?? "");
  const customEnabled = Boolean(input.customEnabled);
  const customUrl = (input.customRtmpUrl ?? "").trim();
  const customKey = normalizeStreamKey(input.customRtmpKey ?? "");
  if (!twitch && !youtube && !(customEnabled && customUrl && customKey)) {
    return {
      ok: false,
      message: "Enable at least one destination (Twitch, YouTube, or Custom RTMP)."
    };
  }
  if (twitch) {
    const twitchResult = validateTwitchStreamKey(twitch);
    if (!twitchResult.ok) return twitchResult;
  }
  if (youtube) {
    const youtubeResult = validateYoutubeStreamKey(youtube);
    if (!youtubeResult.ok) return youtubeResult;
  }
  if (customEnabled && (customUrl || customKey)) {
    const customResult = validateCustomRtmp(customUrl, customKey);
    if (!customResult.ok) return customResult;
  }
  return { ok: true };
}
function sanitizeStreamTitle(raw) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 140);
}
function sanitizeStreamCategory(raw) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 100);
}
function buildRelayConfigRequest(ingest, profileRaw, studio) {
  const profile = normalizeEncodeProfileId(profileRaw);
  const spec = encodeProfileSpec(profile);
  const body2 = {
    profile,
    bitrateMbps: spec.bitrateMbps,
    maxBitrateMbps: spec.maxBitrateMbps,
    rateControl: spec.rateControl,
    keyframeIntervalSec: spec.keyframeIntervalSec,
    bFrames: spec.bFrames,
    encoderPreset: spec.encoderPreset
  };
  const twitch = normalizeStreamKey(ingest.twitchKey ?? "");
  const youtube = normalizeStreamKey(ingest.youtubeKey ?? "");
  const customKey = normalizeStreamKey(ingest.customRtmpKey ?? "");
  const customUrl = (ingest.customRtmpUrl ?? "").trim();
  if (twitch) body2.twitchKey = twitch;
  if (youtube) body2.youtubeKey = youtube;
  if (customUrl && customKey) {
    body2.customRtmpUrl = customUrl;
    body2.customRtmpKey = customKey;
  }
  const title = sanitizeStreamTitle(studio.streamTitle);
  const category = sanitizeStreamCategory(studio.streamCategory);
  const description = (studio.streamDescription ?? "").replace(/\r\n/g, "\n").slice(0, 200).trim();
  if (title) body2.streamTitle = title;
  if (category) body2.streamCategory = category;
  body2.streamDescription = youtube && description ? description : "";
  if (Number.isFinite(studio.audioMicBitrateKbps)) {
    body2.audioMicBitrateKbps = Math.round(studio.audioMicBitrateKbps);
  }
  if (Number.isFinite(studio.audioDesktopBitrateKbps)) {
    body2.audioDesktopBitrateKbps = Math.round(studio.audioDesktopBitrateKbps);
  }
  body2.videoEncoderPreference = studio.videoEncoderPreference;
  if (studio.gpuPreference) body2.gpuPreference = studio.gpuPreference;
  return body2;
}
const ENCODE_CONGESTION_LADDER = [
  "4k60",
  "2k60",
  "1080p60",
  "1080p30",
  "720p60",
  "720p30",
  "cloud720p30"
];
const ENCODE_ADAPT_BAD_SAMPLES = 3;
const ENCODE_ADAPT_MIN_SAMPLE_MS = 1500;
const ENCODE_ADAPT_COOLDOWN_MS = 12e3;
const ENCODE_ADAPT_DROP_PERCENT = 2;
const ENCODE_ADAPT_RTT_MS = 180;
const ENCODE_ADAPT_UNDERBITRATE_RATIO = 0.7;
const ENCODE_ADAPT_SEVERE_DROP_PERCENT = 8;
const ENCODE_ADAPT_SEVERE_RTT_MS = 400;
function emptyEncodeAdaptState() {
  return { badStreak: 0, lastSampleMs: 0, cooldownUntilMs: 0, bitrateWarm: false, underStreak: 0 };
}
const ENCODE_ADAPT_BITRATE_WARM_SAMPLES = 8;
function congestionLevel(sample) {
  const drop = sample.dropPercent;
  const rtt = sample.roundTripMs;
  const severeDrop = drop != null && drop >= ENCODE_ADAPT_SEVERE_DROP_PERCENT;
  const severeRtt = rtt != null && rtt >= ENCODE_ADAPT_SEVERE_RTT_MS;
  if (severeDrop || severeRtt) return "severe";
  const mildDrop = drop != null && drop >= ENCODE_ADAPT_DROP_PERCENT;
  const mildRtt = rtt != null && rtt >= ENCODE_ADAPT_RTT_MS;
  const underBitrate = sample.measuredMbps != null && sample.targetMbps > 0 && sample.measuredMbps < sample.targetMbps * ENCODE_ADAPT_UNDERBITRATE_RATIO;
  if (mildDrop || mildRtt || underBitrate) return "mild";
  return "ok";
}
function stepDownEncodeProfile(current, steps) {
  const index = ENCODE_CONGESTION_LADDER.indexOf(current);
  if (index < 0) return null;
  const nextIndex = Math.min(ENCODE_CONGESTION_LADDER.length - 1, index + Math.max(1, steps));
  if (nextIndex === index) return null;
  return ENCODE_CONGESTION_LADDER[nextIndex] ?? null;
}
function observeEncodeAdapt(state, current, sample, nowMs, enabled) {
  if (!enabled) {
    return { state: { ...state, badStreak: 0, underStreak: 0 }, next: null };
  }
  if (nowMs - state.lastSampleMs < ENCODE_ADAPT_MIN_SAMPLE_MS) {
    return { state, next: null };
  }
  const underNow = sample.measuredMbps != null && sample.targetMbps > 0 && sample.measuredMbps < sample.targetMbps * ENCODE_ADAPT_UNDERBITRATE_RATIO;
  const healthyNow = sample.measuredMbps != null && sample.targetMbps > 0 && sample.measuredMbps >= sample.targetMbps * 0.85;
  const bitrateWarm = state.bitrateWarm || healthyNow || state.underStreak + (underNow ? 1 : 0) >= ENCODE_ADAPT_BITRATE_WARM_SAMPLES;
  const underStreak = underNow ? state.underStreak + 1 : 0;
  const stamped = { ...state, lastSampleMs: nowMs, bitrateWarm, underStreak };
  if (nowMs < stamped.cooldownUntilMs) {
    return { state: stamped, next: null };
  }
  const level = congestionLevel({
    ...sample,
    measuredMbps: bitrateWarm ? sample.measuredMbps : null
  });
  if (level === "ok") {
    return { state: { ...stamped, badStreak: 0 }, next: null };
  }
  const badStreak = stamped.badStreak + 1;
  if (badStreak < ENCODE_ADAPT_BAD_SAMPLES) {
    return { state: { ...stamped, badStreak }, next: null };
  }
  const steps = level === "severe" ? 2 : 1;
  const next = stepDownEncodeProfile(current, steps);
  if (!next) {
    return { state: { ...stamped, badStreak: 0 }, next: null };
  }
  return {
    state: {
      badStreak: 0,
      lastSampleMs: nowMs,
      cooldownUntilMs: nowMs + ENCODE_ADAPT_COOLDOWN_MS,
      bitrateWarm,
      underStreak: 0
    },
    next
  };
}
const BACKPRESSURE_CONFIRM_SAMPLES = 3;
const MAX_COMPOSITOR_SKIP = 3;
function nextCompositorSkip(skip, drawMs, budgetMs) {
  const current = clampSkip(skip);
  if (!(budgetMs > 0) || !(drawMs >= 0)) return current;
  if (drawMs > budgetMs * 1.5) return clampSkip(current + 1);
  if (drawMs < budgetMs * 0.6 && current > 0) return current - 1;
  return current;
}
function clampSkip(skip) {
  if (!Number.isFinite(skip)) return 0;
  return Math.max(0, Math.min(MAX_COMPOSITOR_SKIP, Math.floor(skip)));
}
function whipLoadSample(input) {
  const slowCapture = input.captureFps != null && input.targetFps > 0 && input.captureFps < input.targetFps * 0.6;
  const heavyDrops = input.dropPercent != null && input.dropPercent >= 8;
  const mildDrops = input.dropPercent != null && input.dropPercent >= 3;
  if (heavyDrops || input.compositorSkip >= MAX_COMPOSITOR_SKIP || slowCapture && mildDrops) {
    return "shed-webcam";
  }
  if (mildDrops || input.compositorSkip >= 2) return "shed-browser";
  return "normal";
}
function emptyWhipLoadState() {
  return { pending: "normal", pendingCount: 0, applied: "normal" };
}
function observeWhipLoad(state, sample) {
  if (sample === state.applied) {
    return { pending: sample, pendingCount: 0, applied: state.applied };
  }
  const pendingCount = sample === state.pending ? state.pendingCount + 1 : 1;
  if (pendingCount >= BACKPRESSURE_CONFIRM_SAMPLES) {
    return { pending: sample, pendingCount: 0, applied: sample };
  }
  return { pending: sample, pendingCount, applied: state.applied };
}
const QOS_LOG_LIMIT = 40;
function pushQosEvent(log, event, limit = QOS_LOG_LIMIT) {
  const next = [...log, event];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}
function formatQosEvent(event) {
  const when = event.at.slice(11, 19);
  const extra = [
    event.attempt != null ? `attempt ${event.attempt}` : "",
    event.ingest ? `ingest ${event.ingest}` : "",
    event.detail?.trim() ?? ""
  ].filter(Boolean).join(" · ");
  return `${when}  ${event.kind}  ${event.label}${extra ? ` — ${extra}` : ""}`;
}
function formatQosLog(log) {
  if (!log.length) return "No connection events this session.";
  return log.map(formatQosEvent).join("\n");
}
function sumPlatformViewers(counts) {
  const parts = [counts.twitch, counts.youtube].filter((value) => value != null);
  if (!parts.length) return null;
  return parts.reduce((total, value) => total + value, 0);
}
function formatPlatformViewerTitle(counts) {
  const bits = [];
  if (counts.twitch != null) bits.push(`Twitch ${counts.twitch.toLocaleString()}`);
  if (counts.youtube != null) bits.push(`YouTube ${counts.youtube.toLocaleString()}`);
  return bits.length ? bits.join(" · ") : "Waiting for Twitch or YouTube viewer count";
}
function scoreQos(input) {
  let score = 100;
  const reasons = [];
  const rtt = input.rttMs;
  if (rtt == null) {
    score -= 5;
    reasons.push("No round-trip sample yet");
  } else if (rtt >= 400) {
    score -= 40;
    reasons.push(`Round-trip ${rtt} ms`);
  } else if (rtt >= 180) {
    score -= 15;
    reasons.push(`Round-trip ${rtt} ms`);
  }
  const drop = input.dropPercent;
  if (drop != null && drop >= 8) {
    score -= 40;
    reasons.push(`Dropped frames ${drop.toFixed(1)}%`);
  } else if (drop != null && drop >= 2) {
    score -= 20;
    reasons.push(`Dropped frames ${drop.toFixed(1)}%`);
  }
  if (input.relayError?.trim()) {
    score -= 25;
    reasons.push(input.relayError.trim().slice(0, 180));
  }
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? "good" : score >= 50 ? "fair" : "poor";
  if (!reasons.length) reasons.push("WHIP and relay look healthy");
  return { score, grade, reasons };
}
function dropPercentFromCounts(dropped, encoded) {
  if (dropped == null || encoded == null || encoded <= 0) return null;
  return Math.max(0, dropped) / encoded * 100;
}
const CAPTURE_STALL_SAMPLES = 6;
function emptyCaptureStallState() {
  return { lastFrames: null, stillSamples: 0, sawFrame: false };
}
function observeCaptureFrames(state, frames, trackLive2, stallSamples = CAPTURE_STALL_SAMPLES) {
  if (!trackLive2 || frames < 0) {
    return { state: emptyCaptureStallState(), stalled: false };
  }
  if (state.lastFrames === null || frames > state.lastFrames) {
    return {
      state: { lastFrames: frames, stillSamples: 0, sawFrame: state.sawFrame || frames > 0 },
      stalled: false
    };
  }
  const stillSamples = state.stillSamples + 1;
  const limit = state.sawFrame ? stallSamples : stallSamples * 3;
  return {
    state: { lastFrames: frames, stillSamples, sawFrame: state.sawFrame },
    stalled: stillSamples >= limit
  };
}
const BLACK_FRAME_SAMPLES = 4;
const SKIP_WINDOW_NAME = /^(maka|program manager|windows input experience|windows shell experience host|nvidia overlay|desktop|task view)$/i;
function frameLooksEmpty(rgba) {
  let max = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < rgba.length; i += 16 * 4) {
    const luma = rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722;
    sum += luma;
    if (luma > max) max = luma;
    count += 1;
  }
  if (!count) return false;
  return max < 12 && sum / count < 6;
}
function observeBlackFrames(stillBlack, empty, limit = BLACK_FRAME_SAMPLES) {
  if (!empty) return { stillBlack: 0, fallback: false };
  const next = stillBlack + 1;
  return { stillBlack: next, fallback: next >= limit };
}
function pickGameplayWindowFallback(sources, currentId) {
  for (const source of sources) {
    if (source.type !== "window") continue;
    if (source.id === currentId) continue;
    const name = source.name.trim();
    if (!name || SKIP_WINDOW_NAME.test(name)) continue;
    return source;
  }
  return null;
}
const TWITCH_LOGIN = /^[A-Za-z0-9_]{4,25}$/;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_DESCRIPTION_LIMIT = 200;
function sanitizeStreamWizardTitle(raw) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 140);
}
function sanitizeYouTubeDescription(raw) {
  return raw.replace(/\r\n/g, "\n").slice(0, YOUTUBE_DESCRIPTION_LIMIT);
}
function sanitizeStreamGame(raw) {
  const cleaned = raw.trim().replace(/\s+/g, " ").slice(0, 100);
  return cleaned || "Just Chatting";
}
function extractStreamKey(raw) {
  const key = raw.trim();
  const fromUrl = key.match(/rtmps?:\/\/[^/\s]+\/(?:app|live2)\/([^/?#\s]+)/i);
  if (fromUrl?.[1]) return fromUrl[1];
  const fromApp = key.match(/\/(?:app|live2)\/([^/?#\s]+)/i);
  if (fromApp?.[1]) return fromApp[1];
  return key;
}
function isTwitchStreamKey(raw) {
  const key = extractStreamKey(raw);
  if (!key || /\s/.test(key) || key.length < 15 || key.length > 128) return false;
  return /^live_[a-zA-Z0-9_]+$/.test(key);
}
function isYouTubeStreamKey(raw) {
  const key = extractStreamKey(raw);
  if (!key || /\s/.test(key)) return false;
  return /^[a-z0-9]{4}(?:-[a-z0-9]{4}){3,5}$/i.test(key);
}
function streamKeyValid(platform, raw) {
  return platform === "youtube" ? isYouTubeStreamKey(raw) : isTwitchStreamKey(raw);
}
function normalizeTwitchChannel(raw) {
  const text = raw.trim().replace(/^@+/, "");
  if (!text) return "";
  const fromUrl = text.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([A-Za-z0-9_]{1,25})/i);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/twitch\.tv/i.test(text) || /^https?:/i.test(text)) {
    const path = text.split(/[?#]/)[0] ?? "";
    const bits = path.split("/").filter(Boolean);
    const last = (bits[bits.length - 1] ?? "").replace(/^@+/, "");
    if (/^[A-Za-z0-9_]{1,25}$/.test(last)) return last;
  }
  return text.slice(0, 25);
}
function isTwitchLogin(raw) {
  return TWITCH_LOGIN.test(raw);
}
function youtubeVideoId(raw) {
  const text = raw.trim().slice(0, 512);
  if (!text) return "";
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
    /youtu\.be\/([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
    /youtube\.com\/(?:embed|live|shorts|v)\/([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  if (YOUTUBE_VIDEO_ID.test(text)) return text;
  return "";
}
const STEPS = ["platform", "key", "details", "go"];
const GAME_LIST_ROWS = 5;
const GAME_LIST_ROW_PX = 44;
class GoLiveWizard {
  constructor(dialog, bindings) {
    this.dialog = dialog;
    this.bindings = bindings;
    this.step = "platform";
    this.platform = "twitch";
    this.busy = false;
    this.keyError = "";
    this.games = [];
    this.gamesLoaded = false;
    this.gameListOpen = false;
    this.blockDialogCancel = false;
    const q = (id) => {
      const el = dialog.querySelector(`#${id}`);
      if (!el) throw new Error(`Missing #${id}`);
      return el;
    };
    this.stepLabel = q("go-live-wizard-step");
    this.titleEl = q("go-live-wizard-title");
    this.bodyEl = q("go-live-wizard-body");
    this.panelPlatform = q("go-live-wizard-panel-platform");
    this.panelKey = q("go-live-wizard-panel-key");
    this.panelDetails = q("go-live-wizard-panel-details");
    this.panelGo = q("go-live-wizard-panel-go");
    this.twitchKey = q("wizard-twitch-key");
    this.youtubeKey = q("wizard-youtube-key");
    this.keyHint = q("wizard-key-hint");
    this.titleInput = q("go-live-wizard-title-input");
    this.descriptionField = q("go-live-wizard-description-field");
    this.descriptionInput = q("go-live-wizard-description");
    this.descriptionCount = q("go-live-wizard-description-count");
    this.gameButton = q("go-live-wizard-game-input");
    this.gameList = q("go-live-wizard-game-list");
    this.qualitySelect = q("go-live-wizard-quality");
    this.goStatus = q("go-live-wizard-go-status");
    this.gameCard = document.getElementById("go-live-game-card");
    this.gameCardImg = document.getElementById("go-live-game-card-img");
    this.gameCardName = document.getElementById("go-live-game-card-name");
    this.btnBack = q("go-live-wizard-back");
    this.btnNext = q("go-live-wizard-next");
    this.btnCancel = q("go-live-wizard-cancel");
    this.btnBack.addEventListener("click", () => this.back());
    this.btnNext.addEventListener("click", () => void this.forward());
    this.btnCancel.addEventListener("click", () => this.close());
    dialog.querySelectorAll("[data-platform]").forEach((button) => {
      button.addEventListener("click", () => {
        this.platform = button.dataset.platform === "youtube" ? "youtube" : "twitch";
        this.paintPlatforms();
        this.syncKeyPanel();
        this.refreshKeyGate();
        this.syncDescriptionField();
      });
    });
    this.twitchKey.addEventListener("input", () => {
      this.keyError = "";
      this.refreshKeyGate();
    });
    this.youtubeKey.addEventListener("input", () => {
      this.keyError = "";
      this.refreshKeyGate();
    });
    this.qualitySelect.addEventListener("change", () => {
      this.bindings.applyEncodeProfile(this.qualitySelect.value);
    });
    this.titleInput.addEventListener("change", () => this.publishDetails());
    this.descriptionInput.addEventListener("input", () => {
      this.descriptionInput.value = sanitizeYouTubeDescription(this.descriptionInput.value);
      this.paintDescriptionCount();
      this.publishDetails();
    });
    this.gameButton.addEventListener("click", () => this.setGameListOpen(!this.gameListOpen));
    this.dialog.addEventListener("cancel", (event) => {
      if (!this.gameListOpen && !this.blockDialogCancel) return;
      event.preventDefault();
      this.blockDialogCancel = false;
      this.setGameListOpen(false);
    });
    this.dialog.addEventListener("close", () => {
      this.busy = false;
      this.setGameListOpen(false);
      this.hideGameCard();
    });
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.gameListOpen) return;
        const target = event.target;
        if (!(target instanceof Element)) {
          this.setGameListOpen(false);
          return;
        }
        if (this.gameButton.contains(target) || this.gameList.contains(target)) return;
        this.setGameListOpen(false);
      },
      true
    );
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.gameListOpen) return;
      this.blockDialogCancel = true;
      event.preventDefault();
      event.stopPropagation();
      this.setGameListOpen(false);
    });
    window.addEventListener("resize", () => {
      if (this.gameListOpen) this.positionGameList();
      if (this.step === "details") this.positionGameCard();
    });
  }
  open() {
    if (this.bindings.isLive()) {
      void this.bindings.endLive().finally(() => this.close());
      return;
    }
    const ui = this.bindings.readUi();
    const preferred = this.bindings.readPreferredPlatform();
    if (preferred === "youtube" || ui.destYoutube && !ui.destTwitch) this.platform = "youtube";
    else this.platform = "twitch";
    this.twitchKey.value = ui.twitchKey;
    this.youtubeKey.value = ui.youtubeKey;
    const profile = this.bindings.readEncodeProfile();
    if (this.qualitySelect.value !== profile) this.qualitySelect.value = profile;
    const info = this.bindings.readStreamInfo();
    this.titleInput.value = info.title;
    this.descriptionInput.value = sanitizeYouTubeDescription(info.description);
    this.paintDescriptionCount();
    this.paintGameTrigger(info.game, this.imageForGame(info.game));
    this.step = "platform";
    this.busy = false;
    this.goStatus.textContent = "";
    this.goStatus.dataset.state = "idle";
    this.render();
    void this.loadGames().then(() => {
      if (this.dialog.open) this.paintGameTrigger(this.gameName(), this.imageForGame(this.gameName()));
    });
    this.dialog.showModal();
  }
  close() {
    this.setGameListOpen(false);
    this.hideGameCard();
    if (this.dialog.open) this.dialog.close();
  }
  async loadGames() {
    if (this.gamesLoaded) {
      this.renderGameList();
      return;
    }
    const fallback = [
      { id: "just-chatting", name: "Just Chatting", image: "assets/games/just-chatting.jpg" }
    ];
    try {
      const response = await fetch(new URL("data/game-catalogue.json", window.location.href).toString());
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      const next = (data.games ?? []).filter((row) => row?.name && row.image);
      this.games = next.length ? next : fallback;
    } catch {
      this.games = fallback;
    }
    this.gamesLoaded = true;
    this.renderGameList();
  }
  renderGameList() {
    const current = this.gameName();
    this.gameList.replaceChildren();
    for (const entry of this.games) {
      const item = document.createElement("li");
      item.className = "game-picker-option";
      item.setAttribute("role", "option");
      item.dataset.gameName = entry.name;
      item.setAttribute("aria-selected", sanitizeStreamGame(entry.name) === current ? "true" : "false");
      const img = document.createElement("img");
      img.src = new URL(entry.image, window.location.href).toString();
      img.alt = "";
      const name = document.createElement("span");
      name.className = "game-picker-option-name";
      name.textContent = entry.name;
      item.append(img, name);
      item.addEventListener("click", () => this.pickGame(entry.name, entry.image));
      this.gameList.appendChild(item);
    }
  }
  pickGame(name, image) {
    this.paintGameTrigger(name, image);
    this.setGameListOpen(false);
    this.syncGameCard();
    this.publishDetails();
  }
  gameName() {
    return sanitizeStreamGame(this.gameButton.dataset.gameName ?? "");
  }
  imageForGame(name) {
    return this.games.find((g) => g.name === name)?.image ?? "";
  }
  paintGameTrigger(name, image) {
    const safe = sanitizeStreamGame(name);
    this.gameButton.dataset.gameName = safe;
    const label = this.gameButton.querySelector(".game-picker-trigger-label");
    if (label) label.textContent = safe;
    const existingImg = this.gameButton.querySelector(".game-picker-trigger-img");
    if (image) {
      if (existingImg instanceof HTMLImageElement) {
        existingImg.src = new URL(image, window.location.href).toString();
      } else {
        const img = document.createElement("img");
        img.className = "game-picker-trigger-img";
        img.src = new URL(image, window.location.href).toString();
        img.alt = "";
        this.gameButton.prepend(img);
      }
    } else if (existingImg) {
      existingImg.remove();
    }
    if (this.gameCardName) this.gameCardName.textContent = safe;
    if (this.gameCardImg && image) {
      this.gameCardImg.src = new URL(image, window.location.href).toString();
      this.gameCardImg.alt = safe;
    }
    for (const option of this.gameList.querySelectorAll('[role="option"]')) {
      const row = option;
      row.setAttribute(
        "aria-selected",
        sanitizeStreamGame(row.dataset.gameName ?? "") === safe ? "true" : "false"
      );
    }
  }
  setGameListOpen(open) {
    this.gameListOpen = open;
    this.gameButton.setAttribute("aria-expanded", open ? "true" : "false");
    const list = this.gameList;
    if (!open) {
      list.hidden = true;
      try {
        list.hidePopover?.();
      } catch {
      }
      return;
    }
    list.hidden = false;
    try {
      list.showPopover?.();
    } catch {
    }
    this.positionGameList();
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }
  positionGameList() {
    const rect = this.gameButton.getBoundingClientRect();
    const width = Math.max(rect.width, 220);
    const maxH = GAME_LIST_ROWS * GAME_LIST_ROW_PX + 2;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openUp = spaceBelow < maxH && rect.top > spaceBelow;
    this.gameList.style.position = "fixed";
    this.gameList.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    this.gameList.style.width = `${width}px`;
    this.gameList.style.maxHeight = `${maxH}px`;
    if (openUp) {
      this.gameList.style.top = "auto";
      this.gameList.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      this.gameList.style.bottom = "auto";
      this.gameList.style.top = `${rect.bottom + 4}px`;
    }
  }
  hideGameCard() {
    const card = this.gameCard;
    try {
      card.hidePopover?.();
    } catch {
    }
    card.hidden = true;
  }
  positionGameCard() {
    const rect = this.dialog.getBoundingClientRect();
    const width = this.gameCard.offsetWidth || 168;
    let left = rect.right + 18;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    const top = rect.top + Math.max(24, (rect.height - (this.gameCard.offsetHeight || 280)) / 2);
    this.gameCard.style.left = `${Math.max(8, left)}px`;
    this.gameCard.style.top = `${Math.max(8, top)}px`;
  }
  syncGameCard() {
    const wide = window.matchMedia("(min-width: 1101px)").matches;
    if (this.step !== "details" || !this.dialog.open || !wide) {
      this.hideGameCard();
      return;
    }
    const card = this.gameCard;
    card.hidden = false;
    try {
      card.showPopover?.();
    } catch {
    }
    this.positionGameCard();
    requestAnimationFrame(() => this.positionGameCard());
  }
  paintPlatforms() {
    this.dialog.querySelectorAll("[data-platform]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.platform === this.platform ? "true" : "false");
    });
  }
  syncKeyPanel() {
    const twitch = this.panelKey.querySelector('[data-wizard-key="twitch"]');
    const youtube = this.panelKey.querySelector('[data-wizard-key="youtube"]');
    if (twitch) twitch.hidden = this.platform !== "twitch";
    if (youtube) youtube.hidden = this.platform !== "youtube";
  }
  activeKey() {
    return (this.platform === "youtube" ? this.youtubeKey.value : this.twitchKey.value).trim();
  }
  refreshKeyGate() {
    const value = this.activeKey();
    const ok = streamKeyValid(this.platform, value);
    if (this.step === "key") this.btnNext.disabled = this.busy || !ok;
    if (this.step === "key" && this.keyError) {
      this.keyHint.hidden = false;
      this.keyHint.textContent = this.keyError;
      return;
    }
    if (this.step !== "key" || !value || ok) {
      this.keyHint.hidden = true;
      this.keyHint.textContent = "";
      return;
    }
    this.keyHint.hidden = false;
    this.keyHint.textContent = this.platform === "youtube" ? "That doesn’t match a YouTube stream key (abcd-efgh-ijkl-mnop)." : "That doesn’t match a Twitch stream key (live_…).";
  }
  descriptionValue() {
    return this.platform === "youtube" ? sanitizeYouTubeDescription(this.descriptionInput.value) : "";
  }
  paintDescriptionCount() {
    const length = sanitizeYouTubeDescription(this.descriptionInput.value).length;
    this.descriptionCount.textContent = `${length}/${YOUTUBE_DESCRIPTION_LIMIT}`;
  }
  syncDescriptionField() {
    this.descriptionField.hidden = this.platform !== "youtube";
  }
  publishDetails() {
    const info = this.bindings.readStreamInfo();
    this.bindings.applyStreamInfo({
      title: sanitizeStreamWizardTitle(this.titleInput.value),
      game: this.gameName(),
      description: this.descriptionValue(),
      channel: info.channel,
      includeChat: info.includeChat,
      twitchChatLink: info.twitchChatLink,
      youtubeChatLink: info.youtubeChatLink
    });
    this.bindings.applyEncodeProfile(this.qualitySelect.value);
  }
  render() {
    if (this.step !== "details") this.setGameListOpen(false);
    this.dialog.dataset.step = this.step;
    this.panelPlatform.hidden = this.step !== "platform";
    this.panelKey.hidden = this.step !== "key";
    this.panelDetails.hidden = this.step !== "details";
    this.panelGo.hidden = this.step !== "go";
    this.paintPlatforms();
    const index = STEPS.indexOf(this.step);
    this.stepLabel.textContent = `Step ${index + 1} of ${STEPS.length}`;
    this.btnBack.hidden = this.step === "platform";
    this.btnNext.disabled = this.busy;
    this.btnNext.textContent = this.step === "go" ? this.busy ? "Going live…" : "Go Live" : "Next";
    if (this.step === "platform") {
      this.titleEl.textContent = "Choose a platform";
      this.bodyEl.textContent = "Which platform would you like to stream to?";
    } else if (this.step === "key") {
      this.titleEl.textContent = "Stream key";
      this.bodyEl.textContent = "Enter your stream key";
      this.syncKeyPanel();
      this.refreshKeyGate();
    } else if (this.step === "details") {
      this.titleEl.textContent = "Stream info";
      this.bodyEl.textContent = "";
      this.syncDescriptionField();
    }
    this.syncGameCard();
  }
  back() {
    if (this.step === "key") this.step = "platform";
    else if (this.step === "details") this.step = "key";
    else if (this.step === "go") this.step = "details";
    this.render();
  }
  async forward() {
    if (this.busy) return;
    if (this.step === "platform") {
      this.bindings.applyPlatform(this.platform);
      this.step = "key";
      this.render();
      return;
    }
    if (this.step === "key") {
      if (!streamKeyValid(this.platform, this.activeKey())) {
        this.refreshKeyGate();
        return;
      }
      const key = extractStreamKey(this.activeKey()).slice(0, 256);
      if (this.platform === "twitch") this.bindings.applyKeys({ twitchKey: key });
      else this.bindings.applyKeys({ youtubeKey: key });
      this.bindings.applyPlatform(this.platform);
      this.bindings.applyEncodeProfile(this.qualitySelect.value);
      this.busy = true;
      this.keyError = "";
      this.btnNext.disabled = true;
      this.keyHint.hidden = false;
      this.keyHint.textContent = "Checking the relay…";
      const result = await this.bindings.validate();
      this.busy = false;
      if (!result.ok) {
        this.keyError = result.message;
        this.render();
        return;
      }
      this.keyError = "";
      this.keyHint.hidden = true;
      this.step = "details";
      this.render();
      return;
    }
    if (this.step === "details") {
      this.publishDetails();
      this.step = "go";
      this.render();
      return;
    }
    this.publishDetails();
    this.busy = true;
    this.render();
    try {
      await this.bindings.goLive();
      this.close();
    } catch (error) {
      this.goStatus.hidden = false;
      this.goStatus.dataset.state = "error";
      this.goStatus.textContent = error instanceof Error ? error.message : "Go live failed.";
    } finally {
      this.busy = false;
      if (this.dialog.open) this.render();
    }
  }
}
function liveEnabledAudioTracks(streams) {
  const out = [];
  for (const stream of streams) {
    if (!stream) continue;
    const track = stream.getAudioTracks().find((t) => t.readyState === "live" && t.enabled);
    if (track) out.push(track);
  }
  return out;
}
function createProgramOutputCompositor(deps) {
  let canvas = null;
  let outputStream = null;
  let rafId = 0;
  let active = false;
  let skipFrames = 0;
  let framesToSkip = 0;
  function primaryVideoEl() {
    if (deps.hasGameplayVideo()) {
      const el = deps.getProgramVideo();
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !el.hidden) return el;
    }
    const cam = deps.getWebcamVideo();
    if (cam.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !cam.hidden) return cam;
    const program = deps.getProgramVideo();
    if (program.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return program;
    return cam.readyState >= HTMLMediaElement.HAVE_METADATA ? cam : program;
  }
  function startCanvasPump() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const spec = deps.getEncodeSpec();
    canvas.width = spec.width;
    canvas.height = spec.height;
    const budgetMs = spec.fps > 0 ? 1e3 / spec.fps : 33;
    const tick = () => {
      if (!active) return;
      if (framesToSkip > 0) {
        framesToSkip -= 1;
        rafId = requestAnimationFrame(tick);
        return;
      }
      const started = performance.now();
      const video = primaryVideoEl();
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (video && video.videoWidth > 0) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.min(canvas.width / vw, canvas.height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(video, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = "#f6f3ec";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#1a1408";
        ctx.font = "24px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No program video", canvas.width / 2, canvas.height / 2);
      }
      skipFrames = nextCompositorSkip(skipFrames, performance.now() - started, budgetMs);
      framesToSkip = skipFrames;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopCanvasPump() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function buildStream() {
    const spec = deps.getEncodeSpec();
    canvas = document.createElement("canvas");
    outputStream = null;
    startCanvasPump();
    const videoStream = canvas.captureStream(spec.fps);
    const tracks = [
      ...videoStream.getVideoTracks(),
      ...liveEnabledAudioTracks([
        deps.getMicStream(),
        deps.getDesktopAudioStream(),
        deps.getGameAudioStream()
      ])
    ];
    outputStream = new MediaStream(tracks);
    return outputStream;
  }
  return {
    isActive: () => active,
    getStream: () => outputStream,
    getCanvas: () => canvas,
    getSkip: () => skipFrames,
    start() {
      if (active && outputStream) return outputStream;
      active = true;
      return buildStream();
    },
    stop() {
      if (!active) return;
      active = false;
      skipFrames = 0;
      framesToSkip = 0;
      stopCanvasPump();
      if (outputStream) {
        for (const track of outputStream.getTracks()) track.stop();
        outputStream = null;
      }
      canvas = null;
    }
  };
}
const PREFERRED_MIME = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm"
];
function pickRecorderMime() {
  for (const mime of PREFERRED_MIME) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}
function createProgramRecording(deps) {
  const compositor = deps.compositor ?? createProgramOutputCompositor(deps);
  const ownsCompositor = !deps.compositor;
  let recorder = null;
  let recordStream = null;
  const chunks = [];
  let active = false;
  return {
    isRecording: () => active,
    async start() {
      if (active) return;
      const mime = pickRecorderMime();
      if (!mime && !MediaRecorder.isTypeSupported("")) {
        throw new Error("MediaRecorder is not supported in this environment.");
      }
      chunks.length = 0;
      recordStream = compositor.isActive() ? compositor.getStream() : compositor.start();
      if (!recordStream) {
        throw new Error("Could not start program output compositor.");
      }
      recorder = mime ? new MediaRecorder(recordStream, { mimeType: mime }) : new MediaRecorder(recordStream);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      active = true;
      recorder.start(1e3);
    },
    async stop() {
      if (!active || !recorder) return null;
      active = false;
      const rec = recorder;
      recorder = null;
      await new Promise((resolve) => {
        rec.onstop = () => resolve();
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
      if (ownsCompositor && compositor.isActive()) {
        compositor.stop();
      }
      recordStream = null;
      if (!chunks.length) return null;
      const type = rec.mimeType || "video/webm";
      return new Blob(chunks, { type });
    }
  };
}
function recordingFileExtension(blob) {
  if (blob.type.includes("mp4")) return "mp4";
  return "webm";
}
function recordingTimestampForFilename(at = /* @__PURE__ */ new Date()) {
  return at.toISOString().replace(/[:.]/g, "-");
}
function buildRecordingFileName(profileId, ext, at = /* @__PURE__ */ new Date()) {
  const ts = recordingTimestampForFilename(at);
  return `maka-recording-${ts}-${profileId}.${ext}`;
}
function createProgramVirtualCamera(deps) {
  const compositor = deps.compositor ?? createProgramOutputCompositor(deps);
  const ownsCompositor = !deps.compositor;
  let sessionActive = false;
  let frameTimer = null;
  function stopFramePump() {
    if (frameTimer == null) return;
    clearInterval(frameTimer);
    frameTimer = null;
  }
  return {
    isActive: () => sessionActive,
    start() {
      if (sessionActive) return;
      compositor.start();
      sessionActive = true;
      stopFramePump();
      frameTimer = setInterval(() => {
        const canvas = compositor.getCanvas();
        if (!canvas || !deps.publishFrame) return;
        deps.publishFrame(canvas.toDataURL("image/jpeg", 0.72));
      }, 200);
    },
    stop() {
      if (!sessionActive) return;
      sessionActive = false;
      stopFramePump();
      if (ownsCompositor && compositor.isActive()) {
        compositor.stop();
      }
    },
    async copyProgramFrameToClipboard() {
      if (!sessionActive) {
        compositor.start();
        sessionActive = true;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      const canvas = compositor.getCanvas();
      if (!canvas) {
        throw new Error("Could not access program canvas.");
      }
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });
      if (!blob) throw new Error("Could not capture program frame.");
      if (!navigator.clipboard?.write) {
        throw new Error("Clipboard is not available in this context.");
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }
  };
}
const MAX_LIVE_RETRY_ATTEMPTS = 30;
const LIVE_RETRY_BASE_MS = 1e3;
const LIVE_RETRY_MAX_MS = 15e3;
function liveRetryBackoffMs(attemptIndex) {
  const capped = Math.min(Math.max(0, attemptIndex), 4);
  return Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * 2 ** capped);
}
const RELAY_CONTROL_RETRY_ATTEMPTS = 3;
const WHIP_DISCONNECT_GRACE_MS = 2e3;
function relayControlStatusShouldRetry(status) {
  if (status === 408 || status === 429) return true;
  return status >= 500;
}
const FATAL_INGEST_PATTERNS = [
  /\b401\b/,
  /\b403\b/,
  /\bunauthorized\b/,
  /\bforbidden\b/,
  /\binvalid\s+stream\s+key\b/,
  /\bstream\s+key\s+(is\s+)?invalid\b/,
  /\bbad\s+stream\s+key\b/,
  /\bauthentication\s+failed\b/,
  /\bauth(?:entication)?\s+failed\b/,
  /\baccess\s+denied\b/,
  /\bnot\s+authorized\b/,
  /\bpermission\s+denied\b/,
  /\binvalid\s+key\b/,
  /\bkey\s+expired\b/,
  /\bpublish\s+denied\b/,
  /\blogin\s+failed\b/,
  /\b(?:stream|ingest|publish).{0,40}\brejected\b/,
  /\brejected\b.{0,40}\b(?:stream|ingest|publish|connection)\b/,
  /\bcould\s+not\s+authenticate\b/,
  /\bdenied\s+by\s+server\b/
];
const RTMP_TRANSIENT_PATTERNS = [
  /\bbroken\s+pipe\b/,
  /\bconnection\s+reset\b/,
  /\bconnection\s+timed\s+out\b/,
  /\btimed\s+out\b/,
  /\bnetwork\s+is\s+unreachable\b/,
  /\bno\s+route\s+to\s+host\b/,
  /\bi\/o\s+error\b/,
  /\bconnection\s+lost\b/
];
function messageLooksFatalIngest(text) {
  const msg = text.toLowerCase();
  return FATAL_INGEST_PATTERNS.some((re) => re.test(msg));
}
function rtmpPayloadLooksTransient(payload) {
  const msg = payload.toLowerCase();
  return RTMP_TRANSIENT_PATTERNS.some((re) => re.test(msg));
}
function isFatalLiveRecoveryReason(reason, detail) {
  if (reason.startsWith("whip:")) return false;
  if (reason === "relay:restart" || reason === "relay:error" || reason === "relay:health" || reason === "relay:recover" || reason === "manual-retry") {
    return false;
  }
  const detailText = detail?.trim() ?? "";
  if (detailText && messageLooksFatalIngest(detailText)) return true;
  if (reason.startsWith("rtmp:")) {
    const payload = reason.slice("rtmp:".length);
    if (rtmpPayloadLooksTransient(payload)) return false;
    if (messageLooksFatalIngest(payload)) return true;
    if (messageLooksFatalIngest(`${payload} ${detailText}`)) return true;
    return false;
  }
  if (detailText && messageLooksFatalIngest(`${reason} ${detailText}`)) return true;
  return false;
}
function liveRecoveryAttemptCap(reason, detail) {
  return isFatalLiveRecoveryReason(reason, detail) ? 1 : MAX_LIVE_RETRY_ATTEMPTS;
}
function liveRecoveryReasonLabel(reason) {
  if (reason.startsWith("rtmp:")) return "Ingest error";
  switch (reason) {
    case "relay:restart":
      return "Relay restarted";
    case "relay:error":
      return "Relay error";
    case "relay:health":
      return "Relay health lost";
    case "relay:recover":
      return "Relay recovering";
    case "manual-retry":
      return "Manual retry";
    case "whip:no-video":
      return "Outbound video stalled";
    case "whip:disconnected":
      return "WHIP disconnected";
    case "whip:failed":
      return "WHIP failed";
    case "whip:closed":
      return "WHIP closed";
    default:
      if (reason.startsWith("whip:")) return `WHIP ${reason.slice("whip:".length)}`;
      return "Connection lost";
  }
}
const DEFAULT_TIMEOUT_MS = 8e3;
function formatFetchError(err) {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause instanceof Error ? err.cause.message : typeof err.cause === "string" ? err.cause : "";
  const code = err.cause && typeof err.cause === "object" && err.cause !== null && "code" in err.cause ? String(err.cause.code ?? "") : "";
  const bits = [err.message];
  if (code && !err.message.includes(code)) bits.push(code);
  if (cause && cause !== err.message) bits.push(cause);
  return bits.filter(Boolean).join(" — ");
}
async function relayControlFetch(input, init, options = {}) {
  const attempts = options.attempts ?? RELAY_CONTROL_RETRY_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastResponse = null;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(timeoutMs)
      });
      if (res.ok || !relayControlStatusShouldRetry(res.status) || attempt + 1 >= attempts) return res;
      lastResponse = res;
    } catch (err) {
      lastError = new Error(formatFetchError(err));
      if (attempt + 1 >= attempts) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, liveRetryBackoffMs(attempt)));
  }
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("Relay request failed");
}
const RELAY_DEFAULT_PORT = 38473;
const RELAY_BASE_URL = `http://127.0.0.1:${RELAY_DEFAULT_PORT}`;
const RELAY_HEALTH_PATH = "/health";
const RELAY_CONFIG_PATH = "/config";
const RELAY_VERIFY_PATH = "/config/verify";
const RELAY_STOP_PATH = "/stop";
const RELAY_SCENE_PATH = "/scene";
const RELAY_TRACK_STREAM_IDS = {
  gameplay: "gameplay",
  browser: "browser",
  webcam: "webcam",
  mic: "mic",
  desktopAudio: "desktop-audio",
  gameAudio: "game-audio"
};
const RELAY_FETCH_MS = 8e3;
function relayFetch(input, init) {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(RELAY_FETCH_MS)
  });
}
async function relayFetchRetry(input, init, attempts) {
  return relayControlFetch(input, init, { attempts, timeoutMs: RELAY_FETCH_MS });
}
async function postWhipOfferHttp(whipUrl, localSdp, headers = {}) {
  const res = await relayControlFetch(
    whipUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/sdp", Accept: "application/sdp", ...headers },
      body: localSdp
    },
    { timeoutMs: 25e3 }
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(`WHIP publish failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const answerSdp = await res.text();
  const location = res.headers.get("Location");
  return { answerSdp, resourceUrl: location ? new URL(location, whipUrl).href : null };
}
function authHeaders(health) {
  if (!health?.relayToken) return {};
  return { Authorization: `Bearer ${health.relayToken}` };
}
async function postRelayConfig(health, body2) {
  const res = await relayFetchRetry(`${RELAY_BASE_URL}${RELAY_CONFIG_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(health)
    },
    body: JSON.stringify(body2)
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(`Relay config failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
}
async function verifyRelayConfig(health, body2) {
  const res = await relayFetchRetry(`${RELAY_BASE_URL}${RELAY_VERIFY_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(health)
    },
    body: JSON.stringify(body2)
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(`Verify failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return await res.json();
}
async function postSceneLayout(health, layout) {
  const res = await relayFetchRetry(`${RELAY_BASE_URL}${RELAY_SCENE_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(health)
    },
    body: JSON.stringify(layout)
  });
  if (!res.ok) {
    console.warn("[scene] POST failed", res.status);
  }
}
async function stopRelayStream(health) {
  await relayFetch(`${RELAY_BASE_URL}${RELAY_STOP_PATH}`, {
    method: "POST",
    headers: authHeaders(health)
  }).catch(() => void 0);
}
function defaultSceneLayout(opts) {
  const profile = normalizeEncodeProfileId(opts.profile);
  const spec = encodeProfileSpec(profile);
  const canvas = { width: spec.width, height: spec.height };
  const sources = [
    {
      id: "gameplay",
      type: "video",
      label: "Gameplay",
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      zIndex: 0
    }
  ];
  if (opts.hasWebcam) {
    const w = Math.round(canvas.width * 0.22);
    const h = Math.round(w * (9 / 16));
    sources.push({
      id: "webcam",
      type: "video",
      label: "Webcam",
      x: canvas.width - w - 24,
      y: canvas.height - h - 24,
      width: w,
      height: h,
      zIndex: 2
    });
  }
  if (opts.hasBrowser) {
    const w = Math.round(canvas.width * 0.35);
    const h = Math.round(w * (9 / 16));
    sources.push({
      id: "browser",
      type: "video",
      label: "Browser",
      x: 24,
      y: 24,
      width: w,
      height: h,
      zIndex: 1
    });
  }
  return { canvas, sources };
}
function whipUrlFromHealth(_health) {
  return `${RELAY_BASE_URL}/whip`;
}
function relayNeedsLiveBootstrap(snapshot) {
  if (!snapshot.health) return true;
  if (snapshot.lifecycle === "stopped") return true;
  if (snapshot.status?.whipSessionActive === false) return true;
  if (snapshot.status?.status === "idle" && snapshot.lifecycle === "ready") return true;
  return false;
}
async function waitForRelayReady(readSnapshot, tick, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 45e3;
  const pollMs = opts.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await tick().catch(() => void 0);
    const snapshot = await readSnapshot();
    if (snapshot.health && (snapshot.lifecycle === "ready" || snapshot.lifecycle === "live")) {
      return snapshot;
    }
    if (snapshot.error && snapshot.lifecycle === "error" && snapshot.error.includes("auto-restart exhausted")) {
      return snapshot;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Relay did not become ready during reconnect wait.");
}
async function pingRelayHealth() {
  try {
    const res = await relayFetch(`${RELAY_BASE_URL}${RELAY_HEALTH_PATH}`, {
      headers: { Accept: "application/json" }
    });
    return res.ok;
  } catch {
    return false;
  }
}
function payloadType(line) {
  const match = /^a=rtpmap:(\d+)\s/i.exec(line);
  return match ? match[1] : null;
}
function isRtx(section, payload) {
  return new RegExp(`^a=fmtp:${payload}\\b.*\\bapt=`, "im").test(section);
}
function mediaLines(section) {
  return section.split(/\r?\n/).filter((line) => line !== "");
}
function hardenVideoLines(lines, section) {
  const feedback = [];
  for (const line of lines) {
    const payload = payloadType(line);
    if (!payload || isRtx(section, payload)) continue;
    const hasNack = lines.some((item) => item === `a=rtcp-fb:${payload} nack`);
    const hasPli = lines.some((item) => item === `a=rtcp-fb:${payload} nack pli`);
    if (!hasNack) feedback.push(`a=rtcp-fb:${payload} nack`);
    if (!hasPli) feedback.push(`a=rtcp-fb:${payload} nack pli`);
  }
  const candidateAt = lines.findIndex((line) => line.startsWith("a=candidate:"));
  if (candidateAt === -1) return [...lines, ...feedback];
  return [...lines.slice(0, candidateAt), ...feedback, ...lines.slice(candidateAt)];
}
function hardenAudioLines(lines) {
  const next = [...lines];
  const additions = [];
  for (const line of lines) {
    const match = /^a=rtpmap:(\d+)\s+opus\/48000/i.exec(line);
    if (!match) continue;
    const payload = match[1];
    const fmtpIndex = next.findIndex((item) => item.startsWith(`a=fmtp:${payload}`));
    if (fmtpIndex === -1) {
      additions.push(`a=fmtp:${payload} useinbandfec=1`);
      continue;
    }
    if (!/useinbandfec=1/.test(next[fmtpIndex])) {
      next[fmtpIndex] = `${next[fmtpIndex]};useinbandfec=1`;
    }
  }
  const candidateAt = next.findIndex((line) => line.startsWith("a=candidate:"));
  if (candidateAt === -1) return [...next, ...additions];
  return [...next.slice(0, candidateAt), ...additions, ...next.slice(candidateAt)];
}
function candidateRank(line) {
  if (/\budp\b/i.test(line)) return 2;
  if (/\btcp\b/i.test(line)) return 1;
  return 0;
}
function preferUdpCandidates(lines) {
  const candidates = lines.filter((line) => line.startsWith("a=candidate:"));
  if (candidates.length < 2) return lines;
  const ranked = [...candidates].sort((left, right) => candidateRank(right) - candidateRank(left));
  let seen = 0;
  return lines.map((line) => {
    if (!line.startsWith("a=candidate:")) return line;
    const next = ranked[seen];
    seen += 1;
    return next;
  });
}
function hardenWhipMediaSdp(sdp) {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const parts = sdp.split(/\r?\n(?=m=)/);
  const hardened = parts.map((part) => {
    const lines = mediaLines(part);
    if (part.startsWith("m=video")) return preferUdpCandidates(hardenVideoLines(lines, part)).join(eol);
    if (part.startsWith("m=audio")) return preferUdpCandidates(hardenAudioLines(lines)).join(eol);
    return lines.join(eol);
  });
  const body2 = hardened.join(eol);
  return sdp.endsWith("\n") ? `${body2}${eol}` : body2;
}
function rewriteWhipOfferMsids(sdp, streamIds) {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const parts = sdp.split(/\r?\n(?=m=)/);
  const used = [];
  let mediaIndex = 0;
  const rewritten = parts.map((part) => {
    if (!part.startsWith("m=")) return part;
    const id = streamIds[mediaIndex] ?? "";
    mediaIndex += 1;
    if (!id) return part;
    used.push(id);
    return part.replace(/^a=msid:\S+(.*)$/gm, `a=msid:${id}$1`).replace(/^(a=ssrc:\d+ msid:)\S+/gm, `$1${id}`);
  });
  if (used.length > 0) {
    const semantic = `a=msid-semantic: WMS ${used.join(" ")}`;
    if (/^a=msid-semantic:/m.test(rewritten[0])) {
      rewritten[0] = rewritten[0].replace(/^a=msid-semantic:.*$/m, semantic);
    } else {
      rewritten[0] = `${rewritten[0].replace(/\s*$/, "")}${eol}${semantic}${eol}`;
    }
  }
  return rewritten.join(eol);
}
const WHIP_VIDEO_WATCHDOG_POLL_MS = 2e3;
const WHIP_VIDEO_WATCHDOG_STALL_MS = 8e3;
function parseWhipStreamMetrics(stats) {
  let roundTripMs = null;
  let outboundVideoFramesDropped = null;
  let outboundVideoFramesEncoded = null;
  let outboundVideoFramesPerSecond = null;
  let outboundVideoBytesSent = null;
  for (const report of stats.values()) {
    if (report.type === "candidate-pair") {
      const pair = report;
      const rttSec = pair.currentRoundTripTime;
      if (typeof rttSec === "number" && rttSec > 0 && (pair.state === "succeeded" || pair.nominated === true)) {
        const ms = Math.round(rttSec * 1e3);
        roundTripMs = roundTripMs === null ? ms : Math.min(roundTripMs, ms);
      }
    }
    if (report.type === "remote-inbound-rtp" && report.kind === "video") {
      const inbound = report;
      if (typeof inbound.roundTripTime === "number" && inbound.roundTripTime > 0) {
        roundTripMs = Math.round(inbound.roundTripTime * 1e3);
      }
    }
    if (report.type === "outbound-rtp" && report.kind === "video") {
      const outbound = report;
      if (typeof outbound.framesDropped === "number" && outbound.framesDropped >= 0) {
        outboundVideoFramesDropped = (outboundVideoFramesDropped ?? 0) + Math.floor(outbound.framesDropped);
      }
      if (typeof outbound.framesEncoded === "number" && outbound.framesEncoded >= 0) {
        outboundVideoFramesEncoded = (outboundVideoFramesEncoded ?? 0) + Math.floor(outbound.framesEncoded);
      }
      if (typeof outbound.framesPerSecond === "number" && outbound.framesPerSecond > 0) {
        outboundVideoFramesPerSecond = Math.round(outbound.framesPerSecond);
      }
      if (typeof outbound.bytesSent === "number" && outbound.bytesSent >= 0) {
        outboundVideoBytesSent = (outboundVideoBytesSent ?? 0) + outbound.bytesSent;
      }
    }
  }
  return {
    roundTripMs,
    outboundVideoFramesDropped,
    outboundVideoFramesEncoded,
    outboundVideoFramesPerSecond,
    outboundVideoBytesSent
  };
}
const WHIP_STATS_POLL_MS = 2e3;
function startWhipStatsSampler(options) {
  const pollIntervalMs = options.pollIntervalMs ?? WHIP_STATS_POLL_MS;
  const getStats = options.getStats ?? ((pc2) => pc2.getStats());
  let stopped = false;
  const tick = async () => {
    if (stopped || !options.isLive()) return;
    if (options.pc.connectionState !== "connected") return;
    try {
      options.onMetrics(parseWhipStreamMetrics(await getStats(options.pc)));
    } catch {
    }
  };
  const timer = setInterval(() => void tick(), pollIntervalMs);
  void tick();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    }
  };
}
function sumOutboundVideoBytesSent(stats) {
  let total = 0;
  for (const report of stats.values()) {
    if (report.type !== "outbound-rtp") continue;
    if (report.kind !== "video") continue;
    const bytes = report.bytesSent;
    if (typeof bytes === "number" && Number.isFinite(bytes)) total += bytes;
  }
  return total;
}
function evaluateWhipVideoStall(state, bytesSent, nowMs, stallWindowMs) {
  if (state.lastBytes === null) {
    return { next: { lastBytes: bytesSent, stallSinceMs: nowMs }, stalled: false };
  }
  if (bytesSent > state.lastBytes) {
    return { next: { lastBytes: bytesSent, stallSinceMs: null }, stalled: false };
  }
  const stallSince = state.stallSinceMs ?? nowMs;
  const next = { lastBytes: bytesSent, stallSinceMs: stallSince };
  return { next, stalled: nowMs - stallSince >= stallWindowMs };
}
function startWhipVideoWatchdog(options) {
  const pollIntervalMs = options.pollIntervalMs ?? WHIP_VIDEO_WATCHDOG_POLL_MS;
  const stallWindowMs = options.stallWindowMs ?? WHIP_VIDEO_WATCHDOG_STALL_MS;
  const now = options.now ?? (() => Date.now());
  const getStats = options.getStats ?? ((pc2) => pc2.getStats());
  let state = { lastBytes: null, stallSinceMs: null };
  let stopped = false;
  const reset = () => {
    state = { lastBytes: null, stallSinceMs: null };
  };
  const tick = async () => {
    if (stopped || !options.isLive()) return;
    if (options.pc.connectionState !== "connected" || !options.shouldExpectVideo()) {
      reset();
      return;
    }
    try {
      const bytes = sumOutboundVideoBytesSent(await getStats(options.pc));
      const result = evaluateWhipVideoStall(state, bytes, now(), stallWindowMs);
      state = result.next;
      if (result.stalled) {
        stopped = true;
        clearInterval(timer);
        options.onVideoStall("whip:no-video");
      }
    } catch {
    }
  };
  const timer = setInterval(() => void tick(), pollIntervalMs);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    }
  };
}
function waitForIceGathering$1(pc2, timeoutMs = 4e3) {
  if (pc2.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc2.removeEventListener("icegatheringstatechange", onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc2.iceGatheringState === "complete") done();
    };
    pc2.addEventListener("icegatheringstatechange", onChange);
    const timer = setTimeout(done, timeoutMs);
  });
}
function createNamedMediaStream(id, tracks) {
  const stream = new MediaStream(tracks);
  Object.defineProperty(stream, "id", { value: id, writable: false, configurable: true });
  return stream;
}
function attachWhipSources(pc2, sources, audioSenders, videoSenders) {
  const streamIds = [];
  const addTracks = (streamId, tracks, role, videoRole) => {
    const live = tracks.filter((track) => track.readyState === "live");
    if (live.length === 0) return;
    const named = createNamedMediaStream(streamId, live);
    for (const track of live) {
      const sender = pc2.addTrack(track, named);
      streamIds.push(streamId);
      if (role) audioSenders[role] = sender;
      if (videoRole) videoSenders[videoRole] = sender;
    }
  };
  addTracks(RELAY_TRACK_STREAM_IDS.gameplay, sources.gameplay.getTracks());
  if (sources.browser) {
    addTracks(RELAY_TRACK_STREAM_IDS.browser, sources.browser.getVideoTracks(), void 0, "browser");
  }
  if (sources.webcam) {
    addTracks(RELAY_TRACK_STREAM_IDS.webcam, sources.webcam.getVideoTracks(), void 0, "webcam");
  }
  addTracks(RELAY_TRACK_STREAM_IDS.mic, sources.mic?.getAudioTracks() ?? [], "mic");
  addTracks(RELAY_TRACK_STREAM_IDS.desktopAudio, sources.desktopAudio?.getAudioTracks() ?? [], "desktop");
  addTracks(RELAY_TRACK_STREAM_IDS.gameAudio, sources.gameAudio?.getAudioTracks() ?? [], "game");
  return streamIds;
}
function preferH264VideoCodecs(pc2) {
  const caps = RTCRtpSender.getCapabilities("video");
  if (!caps) return;
  const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase().includes("h264"));
  const other = caps.codecs.filter((c) => !c.mimeType.toLowerCase().includes("h264"));
  if (h264.length === 0) return;
  const ordered = [...h264, ...other];
  for (const transceiver of pc2.getTransceivers()) {
    if (transceiver.sender.track?.kind !== "video") continue;
    try {
      transceiver.setCodecPreferences(ordered);
    } catch {
    }
  }
}
async function publishWhip(whipUrl, sources, headers = {}, onConnectionStateChange, signaling) {
  const pc2 = new RTCPeerConnection({
    iceServers: [],
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: "all"
  });
  const notifyConnection = () => {
    onConnectionStateChange?.(pc2.connectionState);
  };
  pc2.onconnectionstatechange = notifyConnection;
  pc2.oniceconnectionstatechange = () => {
    const ice = pc2.iceConnectionState;
    if (ice === "failed" || ice === "disconnected") {
      notifyConnection();
    }
  };
  const audioSenders = {};
  const videoSenders = {};
  const streamIds = attachWhipSources(pc2, sources, audioSenders, videoSenders);
  preferH264VideoCodecs(pc2);
  const offer = await pc2.createOffer();
  await pc2.setLocalDescription({
    type: "offer",
    sdp: rewriteWhipOfferMsids(hardenWhipMediaSdp(offer.sdp ?? ""), streamIds)
  });
  await waitForIceGathering$1(pc2);
  const localSdp = pc2.localDescription?.sdp;
  if (!localSdp) {
    pc2.close();
    throw new Error("WHIP offer produced empty SDP");
  }
  let answerSdp;
  let resourceUrl;
  const postOfferHttp = async () => {
    if (signaling?.postOffer) {
      return signaling.postOffer(localSdp, headers);
    }
    let response = null;
    let lastError = null;
    for (let attempt = 0; attempt < RELAY_CONTROL_RETRY_ATTEMPTS; attempt += 1) {
      try {
        response = await fetch(whipUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp", Accept: "application/sdp", ...headers },
          body: localSdp,
          signal: AbortSignal.timeout(25e3)
        });
        if (response.ok || !relayControlStatusShouldRetry(response.status)) break;
        lastError = new Error(`WHIP publish failed (${response.status})`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Network error");
        response = null;
      }
      if (attempt + 1 < RELAY_CONTROL_RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, liveRetryBackoffMs(attempt)));
      }
    }
    if (!response) {
      throw lastError ?? new Error("Failed to fetch");
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim();
      throw new Error(`WHIP publish failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    const sdp = await response.text();
    const location = response.headers.get("Location");
    return { answerSdp: sdp, resourceUrl: location ? new URL(location, whipUrl).href : null };
  };
  try {
    ;
    ({ answerSdp, resourceUrl } = await postOfferHttp());
  } catch (error) {
    pc2.close();
    const message = error instanceof Error ? error.message : "Network error";
    const hint = message === "Failed to fetch" || /fetch failed/i.test(message) ? ` MAKArelay may not be listening at ${whipUrl}. Check the relay chip (Ready) and try Start relay if needed.` : "";
    throw new Error(`WHIP publish failed: ${message}${hint}`);
  }
  await pc2.setRemoteDescription({ type: "answer", sdp: answerSdp });
  return {
    pc: pc2,
    resourceUrl,
    audioSenders,
    videoSenders,
    async close() {
      if (resourceUrl) {
        try {
          if (signaling?.deleteResource) {
            await signaling.deleteResource(resourceUrl, headers);
          } else {
            await fetch(resourceUrl, { method: "DELETE", headers, signal: AbortSignal.timeout(8e3) });
          }
        } catch {
        }
      }
      pc2.close();
    }
  };
}
function startAudioLevelMeter(stream, setLevelPercent) {
  let raf = 0;
  let ctx = null;
  let analyser = null;
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    analyser = null;
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
    setLevelPercent(0);
  };
  try {
    ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const v of data) sum += v;
      const avg = sum / data.length / 255;
      setLevelPercent(Math.min(100, Math.round(avg * 140)));
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    stop();
  }
  return { stop };
}
function setHorizontalMeterLevel(el, percent) {
  const level = Math.max(0, Math.min(100, percent));
  el.style.width = `${level}%`;
  el.style.removeProperty("height");
}
function parseCapturePlatform(raw) {
  if (raw === "win32" || raw === "darwin" || raw === "linux") return raw;
  return "other";
}
function systemAudioCaptureSupported(platform) {
  return platform === "win32" || platform === "linux" || platform === "darwin";
}
async function startDisplayShareAudio() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: 16, height: 16, frameRate: 1 }
    });
    const audio = stream.getAudioTracks();
    if (!audio.length) {
      stopMediaStream(stream);
      return null;
    }
    return stripVideoTracks(stream);
  } catch {
    return null;
  }
}
function stripVideoTracks(stream) {
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  return stream;
}
async function captureDesktopAudioTracks(chromeMediaSourceId, outputDeviceId) {
  const audioMandatory = {
    chromeMediaSource: "desktop"
  };
  const audio = { mandatory: audioMandatory };
  if (outputDeviceId) {
    Object.assign(audio, { deviceId: { exact: outputDeviceId } });
  }
  const videoMandatory = {
    chromeMediaSource: "desktop",
    maxWidth: 1,
    maxHeight: 1,
    maxFrameRate: 1
  };
  const video = { mandatory: videoMandatory };
  const stream = await navigator.mediaDevices.getUserMedia({
    audio,
    video
  });
  return stripVideoTracks(stream);
}
async function startDesktopLoopbackAudio(outputDeviceId) {
  try {
    const stream = await captureDesktopAudioTracks(void 0, outputDeviceId?.trim() || void 0);
    const tracks = stream.getAudioTracks();
    if (!tracks.length) {
      stopMediaStream(stream);
      return null;
    }
    return stream;
  } catch {
    return null;
  }
}
function stopMediaStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
function gameAudioKind(sourceId) {
  if (!sourceId) return "none";
  if (sourceId.startsWith("window:")) return "window";
  if (sourceId.startsWith("screen:")) return "screen";
  return "none";
}
const SAMPLE_RATE = 48e3;
const CHANNELS = 2;
function createPcmPlayback() {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const dest = ctx.createMediaStreamDestination();
  const node = ctx.createScriptProcessor(2048, 0, CHANNELS);
  const queue = new Float32Array(SAMPLE_RATE * CHANNELS);
  let read = 0;
  let write = 0;
  let available = 0;
  node.onaudioprocess = (event) => {
    const left = event.outputBuffer.getChannelData(0);
    const right = event.outputBuffer.getChannelData(1);
    for (let i = 0; i < left.length; i++) {
      if (available < CHANNELS) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      left[i] = queue[read] ?? 0;
      right[i] = queue[(read + 1) % queue.length] ?? 0;
      read = (read + CHANNELS) % queue.length;
      available -= CHANNELS;
    }
  };
  node.connect(dest);
  void ctx.resume();
  return {
    stream: dest.stream,
    push(pcm) {
      const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      for (let i = 0; i + 3 < pcm.byteLength; i += 4) {
        if (available + CHANNELS >= queue.length) return;
        queue[write] = view.getInt16(i, true) / 32768;
        queue[(write + 1) % queue.length] = view.getInt16(i + 2, true) / 32768;
        write = (write + CHANNELS) % queue.length;
        available += CHANNELS;
      }
    },
    close() {
      node.onaudioprocess = null;
      node.disconnect();
      for (const track of dest.stream.getTracks()) track.stop();
      void ctx.close();
    }
  };
}
const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "Welcome",
    body: "Quick look around. I’ll point at the parts you’ll actually use.",
    placement: "center"
  },
  {
    id: "modes",
    title: "This is home",
    body: "The gold M is Maka. The little number next to it is your version.",
    target: '[data-tour="modes"]',
    placement: "bottom"
  },
  {
    id: "sources",
    title: "What you capture",
    body: "Pick your screen or a window. Camera, mic, chat, and alerts are in this list too.",
    target: '[data-tour="sources"]',
    placement: "right"
  },
  {
    id: "program",
    title: "What people see",
    body: "This big window is the stream. Your scene, game, chat, and alerts show up here.",
    target: '[data-tour="program"]',
    placement: "left"
  },
  {
    id: "relay",
    title: "Ready to send",
    body: "This light turns on when Maka opens, and it turns off when you close the app.",
    target: '[data-tour="relay"]',
    placement: "bottom"
  },
  {
    id: "destinations",
    title: "Twitch and YouTube",
    body: "Save your key and chat link here. Go Live fills them in for the one you pick.",
    target: '[data-tour="destinations"]',
    placement: "left"
  },
  // Marketplace tour returns when the addon catalog is part of the build.
  // {
  //   id: 'addons',
  //   title: 'Extras',
  //   body: 'Want something extra? Browse addons for new tools and layouts.',
  //   target: '[data-tour="addons"]',
  //   placement: 'left',
  // },
  {
    id: "go-live",
    title: "Go Live",
    body: "Hit Go Live, or press F8. When you’re live, that same button says End Stream.",
    target: '[data-tour="go-live"]',
    placement: "bottom"
  }
];
class OnboardingTour {
  constructor(root, spotlight, card, stepLabel, titleEl, bodyEl, btnPrev, btnNext, btnSkip, options) {
    this.root = root;
    this.spotlight = spotlight;
    this.card = card;
    this.stepLabel = stepLabel;
    this.titleEl = titleEl;
    this.bodyEl = bodyEl;
    this.btnPrev = btnPrev;
    this.btnNext = btnNext;
    this.btnSkip = btnSkip;
    this.options = options;
    this.index = 0;
    this.btnPrev.addEventListener("click", () => this.prev());
    this.btnNext.addEventListener("click", () => this.next());
    this.btnSkip.addEventListener("click", () => this.finish(true));
    window.addEventListener("resize", () => this.renderStep());
    window.addEventListener("scroll", () => this.renderStep(), true);
  }
  start() {
    this.index = 0;
    this.root.hidden = false;
    this.root.classList.remove("hidden");
    document.body.classList.add("onboarding-active");
    this.renderStep();
  }
  isOpen() {
    return !this.root.hidden;
  }
  finish(skipped) {
    this.root.hidden = true;
    this.root.classList.add("hidden");
    delete this.root.dataset.dim;
    document.body.classList.remove("onboarding-active");
    this.spotlight.hidden = true;
    if (skipped) this.options.onSkip();
    else this.options.onComplete();
  }
  prev() {
    if (this.index <= 0) return;
    this.index -= 1;
    this.renderStep();
  }
  next() {
    if (this.index >= ONBOARDING_STEPS.length - 1) {
      this.finish(false);
      return;
    }
    this.index += 1;
    this.renderStep();
  }
  renderStep() {
    const step = ONBOARDING_STEPS[this.index];
    if (!step) return;
    this.stepLabel.textContent = `${this.index + 1} / ${ONBOARDING_STEPS.length}`;
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;
    this.btnPrev.disabled = this.index === 0;
    this.btnNext.textContent = this.index >= ONBOARDING_STEPS.length - 1 ? "Finish" : "Next";
    const target = step.target ? document.querySelector(step.target) : null;
    this.position(step.placement ?? "center", target);
  }
  position(placement, target) {
    const pad = 10;
    const margin = 16;
    const cardRect = () => this.card.getBoundingClientRect();
    if (!target || placement === "center") {
      this.spotlight.hidden = true;
      this.root.dataset.dim = "full";
      this.card.style.top = "50%";
      this.card.style.left = "50%";
      this.card.style.transform = "translate(-50%, -50%)";
      this.card.dataset.placement = "center";
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      this.spotlight.hidden = true;
      return;
    }
    this.spotlight.hidden = false;
    this.root.dataset.dim = "spotlight";
    this.spotlight.style.left = `${Math.max(0, rect.left - pad)}px`;
    this.spotlight.style.top = `${Math.max(0, rect.top - pad)}px`;
    this.spotlight.style.width = `${rect.width + pad * 2}px`;
    this.spotlight.style.height = `${rect.height + pad * 2}px`;
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    this.card.style.transform = "none";
    this.card.dataset.placement = placement;
    const card = cardRect();
    let top = rect.bottom + margin;
    let left = rect.left;
    if (placement === "top") {
      top = rect.top - card.height - margin;
      left = rect.left + rect.width / 2 - card.width / 2;
    } else if (placement === "bottom") {
      top = rect.bottom + margin;
      left = rect.left + rect.width / 2 - card.width / 2;
    } else if (placement === "left") {
      top = rect.top + rect.height / 2 - card.height / 2;
      left = rect.left - card.width - margin;
    } else if (placement === "right") {
      top = rect.top + rect.height / 2 - card.height / 2;
      left = rect.right + margin;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    left = Math.max(margin, Math.min(left, vw - card.width - margin));
    top = Math.max(margin, Math.min(top, vh - card.height - margin));
    this.card.style.left = `${left}px`;
    this.card.style.top = `${top}px`;
  }
}
const SETUP_WIZARD_STEPS = [
  {
    id: "welcome",
    title: "Set up Maka",
    body: "This quick setup checks your relay, capture sources, and optional stream keys. Streaming is the home screen after this. Search, the browser, stays a separate tab. Skip anytime if you already know the studio."
  },
  {
    id: "relay",
    title: "Relay health",
    body: "Maka runs a local encoder on port 38473. We will verify the relay binary and health endpoint before you go live."
  },
  {
    id: "capture",
    title: "Capture test",
    body: "Pick a display or window source for your program feed. At least one capture source must be available."
  },
  {
    id: "keys",
    title: "Stream keys (optional)",
    body: "Paste Twitch or YouTube stream keys now, or skip and add them later in Destinations. Keys stay in relay memory only."
  },
  {
    id: "ready",
    title: "Ready to stream",
    body: "Setup complete. You land in the streaming studio. Choose a source, verify destinations, then hit Go Live. Open Search only when you want the browser."
  }
];
class SetupWizard {
  constructor(root, stepLabel, titleEl, bodyEl, statusEl, keysPanel, twitchKeyInput, youtubeKeyInput, btnPrev, btnNext, btnSkip, options) {
    this.root = root;
    this.stepLabel = stepLabel;
    this.titleEl = titleEl;
    this.bodyEl = bodyEl;
    this.statusEl = statusEl;
    this.keysPanel = keysPanel;
    this.twitchKeyInput = twitchKeyInput;
    this.youtubeKeyInput = youtubeKeyInput;
    this.btnPrev = btnPrev;
    this.btnNext = btnNext;
    this.btnSkip = btnSkip;
    this.options = options;
    this.index = 0;
    this.relayOk = false;
    this.captureOk = false;
    this.keysSkipped = true;
    this.btnPrev.addEventListener("click", () => this.prev());
    this.btnNext.addEventListener("click", () => void this.next());
    this.btnSkip.addEventListener("click", () => this.finish(true));
  }
  start() {
    this.index = 0;
    this.relayOk = false;
    this.captureOk = false;
    this.root.hidden = false;
    this.root.classList.remove("hidden");
    document.body.classList.add("setup-wizard-active");
    void this.renderStep();
  }
  isOpen() {
    return !this.root.hidden;
  }
  finish(skipped) {
    this.root.hidden = true;
    this.root.classList.add("hidden");
    document.body.classList.remove("setup-wizard-active");
    if (skipped) this.options.onSkip();
    else this.options.onComplete();
  }
  prev() {
    if (this.index <= 0) return;
    this.index -= 1;
    void this.renderStep();
  }
  async next() {
    const step = SETUP_WIZARD_STEPS[this.index];
    if (!step) return;
    if (step.id === "relay" && !this.relayOk) {
      await this.runRelayCheck(this.statusEl, this.bodyEl, this.btnNext);
      if (!this.relayOk) return;
    }
    if (step.id === "capture" && !this.captureOk) {
      await this.runCaptureCheck(this.statusEl, this.bodyEl, this.btnNext);
      if (!this.captureOk) return;
    }
    if (step.id === "keys") {
      this.keysSkipped = !this.twitchKeyInput.value.trim() && !this.youtubeKeyInput.value.trim();
    }
    if (this.index >= SETUP_WIZARD_STEPS.length - 1) {
      this.finish(false);
      return;
    }
    this.index += 1;
    await this.renderStep();
  }
  async renderStep() {
    const step = SETUP_WIZARD_STEPS[this.index];
    if (!step) return;
    this.stepLabel.textContent = `Step ${this.index + 1} of ${SETUP_WIZARD_STEPS.length}`;
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;
    this.statusEl.textContent = "";
    this.statusEl.dataset.state = "";
    this.btnPrev.disabled = this.index === 0;
    this.keysPanel.hidden = step.id !== "keys";
    if (step.id === "relay") {
      this.btnNext.textContent = this.relayOk ? "Next" : "Check relay";
      if (!this.relayOk) {
        await this.runRelayCheck(this.statusEl, this.bodyEl, this.btnNext);
      }
    } else if (step.id === "capture") {
      this.btnNext.textContent = this.captureOk ? "Next" : "Test capture";
      if (!this.captureOk) {
        await this.runCaptureCheck(this.statusEl, this.bodyEl, this.btnNext);
      }
    } else if (step.id === "keys") {
      this.btnNext.textContent = "Next";
    } else if (step.id === "ready") {
      const parts = ["Relay OK", "Capture OK"];
      if (!this.keysSkipped) parts.push("Keys saved");
      this.statusEl.textContent = parts.join(" · ");
      this.statusEl.dataset.state = "ok";
      this.btnNext.textContent = "Finish setup";
    } else {
      this.btnNext.textContent = "Next";
    }
  }
  async runRelayCheck(statusEl, bodyEl, nextBtn) {
    statusEl.textContent = "Checking relay…";
    statusEl.dataset.state = "pending";
    nextBtn.disabled = true;
    let snapshot = await window.maka.getRelay();
    if (snapshot.lifecycle !== "ready" && snapshot.lifecycle !== "live") {
      statusEl.textContent = "Starting relay…";
      snapshot = await window.maka.startRelay();
    }
    const report = await window.maka.verifySystem();
    const relayCheck = report.checks.find((c) => c.name === "relay-lifecycle");
    const healthCheck = report.checks.find((c) => c.name === "relay-health");
    const binaryCheck = report.checks.find((c) => c.name === "relay-binary");
    this.relayOk = Boolean(relayCheck?.ok && healthCheck?.ok && binaryCheck?.ok);
    if (this.relayOk) {
      const version = snapshot.health?.version ? ` v${snapshot.health.version}` : "";
      statusEl.textContent = `Relay online${version} — health endpoint OK`;
      statusEl.dataset.state = "ok";
      nextBtn.disabled = false;
      nextBtn.textContent = "Next";
      return;
    }
    const lines = report.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
    statusEl.textContent = lines.join("\n");
    statusEl.dataset.state = "fail";
    bodyEl.textContent = "The relay starts with Maka and stops when you close the app. It is not ready yet. Check again in a moment.";
    nextBtn.disabled = false;
    nextBtn.textContent = "Check relay";
  }
  async runCaptureCheck(statusEl, bodyEl, nextBtn) {
    statusEl.textContent = "Listing capture sources…";
    statusEl.dataset.state = "pending";
    nextBtn.disabled = true;
    try {
      const sources = await window.maka.listCaptureSources();
      this.captureOk = sources.length > 0;
      if (this.captureOk) {
        const screens = sources.filter((s) => s.type === "screen").length;
        const windows = sources.filter((s) => s.type === "window").length;
        const browser = sources.filter((s) => s.type === "browser").length;
        const parts = [];
        if (screens) parts.push(`${screens} display${screens === 1 ? "" : "s"}`);
        if (windows) parts.push(`${windows} window${windows === 1 ? "" : "s"}`);
        if (browser) parts.push("Search tab");
        statusEl.textContent = `Found ${sources.length} source${sources.length === 1 ? "" : "s"} (${parts.join(", ")})`;
        statusEl.dataset.state = "ok";
        nextBtn.textContent = "Next";
      } else {
        statusEl.textContent = "No capture sources found — check display permissions.";
        statusEl.dataset.state = "fail";
        bodyEl.textContent = "Windows may block screen capture for new apps. Open Settings → Privacy → Screen capture and allow Maka, then retry.";
        nextBtn.textContent = "Test capture";
      }
    } catch (err) {
      this.captureOk = false;
      statusEl.textContent = err instanceof Error ? err.message : String(err);
      statusEl.dataset.state = "fail";
      nextBtn.textContent = "Test capture";
    }
    nextBtn.disabled = false;
  }
}
const SETTINGS_TAB_IDS = [
  "general",
  "streaming",
  "audio",
  "video",
  "recording",
  "help"
];
function isSettingsTabId(value) {
  return SETTINGS_TAB_IDS.includes(value);
}
function setActiveSettingsTab(root, tabId) {
  root.dataset.settingsTab = tabId;
  for (const btn of root.querySelectorAll(".settings-tab")) {
    const active = btn.dataset.settingsTab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-current", active ? "page" : "false");
  }
  for (const panel of root.querySelectorAll(".settings-panel")) {
    const active = panel.dataset.settingsPanel === tabId;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
}
function populateEncodeSelect(select) {
  if (select.options.length > 0) return;
  for (const id of ENCODE_PROFILE_ORDER) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = encodeProfileSpec(id).menuLabel;
    select.appendChild(opt);
  }
}
function applySettingsToForm(s) {
  document.getElementById("set-tray-live").checked = s.minimizeToTrayWhileLive;
  document.getElementById("set-lab-mode").checked = s.labMode;
  document.getElementById("set-auto-update").checked = s.autoCheckUpdatesOnStartup;
  const encodeSelect = document.getElementById("set-encode-profile");
  populateEncodeSelect(encodeSelect);
  encodeSelect.value = s.bitrateProfile;
  const adaptive = document.getElementById("set-adaptive-encode");
  if (adaptive) adaptive.checked = s.adaptiveEncode !== false;
  document.getElementById("set-mic-bitrate").value = String(
    s.audioMicBitrateKbps
  );
  document.getElementById("set-desktop-bitrate").value = String(
    s.audioDesktopBitrateKbps
  );
  document.getElementById("set-video-encoder").value = s.videoEncoderPreference;
  document.getElementById("set-gpu-pref").value = s.gpuPreference;
  const folderInput = document.getElementById("set-recording-folder");
  folderInput.value = s.recordingSaveFolder || "";
  folderInput.placeholder = s.recordingSaveFolder ? "" : "Choose a folder…";
  const twitchClient = document.getElementById("set-twitch-client-id");
  const twitchToken = document.getElementById("set-twitch-user-token");
  const youtubeToken = document.getElementById("set-youtube-user-token");
  if (twitchClient) twitchClient.value = s.twitchClientId || "";
  if (twitchToken) twitchToken.value = s.twitchUserToken || "";
  if (youtubeToken) youtubeToken.value = s.youtubeUserToken || "";
  const tab = s.settingsActiveTab;
  if (isSettingsTabId(tab)) {
    setActiveSettingsTab(document.getElementById("settings-view"), tab);
  }
}
async function refreshVersionLabels(maka) {
  const info = await maka.getVersionInfo();
  const appLine = `App v${info.appVersion}`;
  const relayLine = info.relayVersion ? `Relay v${info.relayVersion}` : "Relay —";
  const appVersionTop = document.getElementById("app-version-label");
  if (appVersionTop) appVersionTop.textContent = info.appVersion;
  const settingsApp = document.getElementById("settings-app-version");
  const settingsRelay = document.getElementById("settings-relay-version");
  const footer = document.getElementById("settings-footer-version");
  if (settingsApp) settingsApp.textContent = appLine;
  if (settingsRelay) settingsRelay.textContent = relayLine;
  if (footer) footer.textContent = `Maka ${appLine} · ${relayLine}`;
}
async function populateGpuSelect(maka, selected) {
  const select = document.getElementById("set-gpu-pref");
  const options = await maka.listGpuOptions();
  select.innerHTML = "";
  for (const opt of options) {
    const el = document.createElement("option");
    el.value = opt.id;
    el.textContent = opt.label;
    select.appendChild(el);
  }
  if (options.some((o) => o.id === selected)) {
    select.value = selected;
  } else {
    select.value = "default";
  }
}
function initSettingsView(maka, hooks) {
  const root = document.getElementById("settings-view");
  for (const btn of root.querySelectorAll(".settings-tab")) {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.settingsTab;
      if (!tab || !isSettingsTabId(tab)) return;
      setActiveSettingsTab(root, tab);
      void maka.setSettings({ settingsActiveTab: tab });
    });
  }
  const persistCheckbox = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener("change", () => {
      void maka.setSettings({ [key]: el.checked }).then((s) => {
        if (key === "labMode") hooks.onLabModeChange(s.labMode);
      });
    });
  };
  persistCheckbox("set-tray-live", "minimizeToTrayWhileLive");
  persistCheckbox("set-lab-mode", "labMode");
  persistCheckbox("set-auto-update", "autoCheckUpdatesOnStartup");
  persistCheckbox("set-adaptive-encode", "adaptiveEncode");
  document.getElementById("set-adaptive-encode").addEventListener("change", (event) => {
    hooks.onAdaptiveEncodeChange(event.target.checked);
  });
  document.getElementById("set-encode-profile").addEventListener("change", (event) => {
    const value = event.target.value;
    void maka.setSettings({ bitrateProfile: value }).then(() => {
      hooks.onEncodeProfileChange(value);
    });
  });
  for (const id of ["set-mic-bitrate", "set-desktop-bitrate"]) {
    document.getElementById(id).addEventListener("change", (event) => {
      const kbps = Number(event.target.value);
      const patch = id === "set-mic-bitrate" ? { audioMicBitrateKbps: kbps } : { audioDesktopBitrateKbps: kbps };
      void maka.setSettings(patch).then(() => hooks.onRelayStudioSettingsChange());
    });
  }
  document.getElementById("set-video-encoder").addEventListener("change", (event) => {
    const value = event.target.value;
    void maka.setSettings({ videoEncoderPreference: value }).then(() => hooks.onRelayStudioSettingsChange());
  });
  document.getElementById("set-gpu-pref").addEventListener("change", (event) => {
    const value = event.target.value;
    void maka.setSettings({ gpuPreference: value }).then(() => hooks.onRelayStudioSettingsChange());
  });
  document.getElementById("btn-pick-recording-folder").addEventListener("click", () => {
    void maka.pickRecordingFolder().then((result) => {
      if (result.canceled) return;
      void maka.setSettings({ recordingSaveFolder: result.path }).then((s) => {
        const folderInput = document.getElementById("set-recording-folder");
        folderInput.value = s.recordingSaveFolder;
        hooks.onRecordingFolderChange(s.recordingSaveFolder);
      });
    });
  });
  document.getElementById("btn-replay-setup").addEventListener("click", () => {
    hooks.onReplaySetup();
  });
  document.getElementById("btn-replay-tour").addEventListener("click", () => {
    hooks.onReplayTour();
  });
  document.getElementById("btn-check-updates").addEventListener("click", () => {
    hooks.onCheckUpdates();
  });
  return {
    open: async () => {
      const s = await maka.getSettings();
      applySettingsToForm(s);
      await populateGpuSelect(maka, s.gpuPreference);
      await refreshVersionLabels(maka);
      root.hidden = false;
      const tabFromDom = root.dataset.settingsTab || "general";
      setActiveSettingsTab(root, isSettingsTabId(tabFromDom) ? tabFromDom : "general");
    },
    refreshVersions: () => refreshVersionLabels(maka)
  };
}
const PHONE_CAM_STREAM_ID = "phone-cam";
const PHONE_MIC_STREAM_ID = "phone-mic";
const PHONE_CAMERA_DEVICE_VALUE = "phone-cam";
const PHONE_MIC_DEVICE_VALUE = "phone-mic";
let pc = null;
let videoTrack = null;
let audioTrack = null;
let pairStatus = "waiting";
const listeners = /* @__PURE__ */ new Set();
function emit() {
  const snap = {
    videoTrack,
    audioTrack,
    pairStatus
  };
  for (const listener of listeners) listener(snap);
}
function clearTracks() {
  videoTrack = null;
  audioTrack = null;
}
function closePeer() {
  if (pc) {
    pc.close();
    pc = null;
  }
}
function resetWebrtc() {
  closePeer();
  clearTracks();
  emit();
}
function peerConnectionLost() {
  closePeer();
  clearTracks();
  emit();
}
function waitForIceGathering(peer, timeoutMs = 4e3) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      peer.removeEventListener("icegatheringstatechange", onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (peer.iceGatheringState === "complete") done();
    };
    peer.addEventListener("icegatheringstatechange", onChange);
    const timer = setTimeout(done, timeoutMs);
  });
}
function bindTrack(track, kind) {
  track.addEventListener("ended", () => {
    if (kind === "video" && videoTrack === track) videoTrack = null;
    if (kind === "audio" && audioTrack === track) audioTrack = null;
    emit();
  });
  if (kind === "video") videoTrack = track;
  else audioTrack = track;
  emit();
}
async function handleOffer(maka, offer, iceServers) {
  closePeer();
  clearTracks();
  const peer = new RTCPeerConnection({ iceServers });
  pc = peer;
  peer.ontrack = (event) => {
    const stream = event.streams[0];
    const streamId = stream?.id ?? "";
    const track = event.track;
    if (streamId === PHONE_CAM_STREAM_ID || track.kind === "video") {
      bindTrack(track, "video");
      return;
    }
    if (streamId === PHONE_MIC_STREAM_ID || track.kind === "audio") {
      bindTrack(track, "audio");
    }
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed" || peer.connectionState === "closed") {
      peerConnectionLost();
    }
  };
  await peer.setRemoteDescription(offer);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await waitForIceGathering(peer);
  const local = peer.localDescription;
  if (!local) throw new Error("Missing local WebRTC answer");
  await maka.submitPhoneWebrtcAnswer({ type: "answer", sdp: local.sdp });
}
function getPhoneTracksSnapshot() {
  return { videoTrack, audioTrack, pairStatus };
}
function trackLive(track) {
  return Boolean(track && track.readyState === "live");
}
function phoneHasVideoTrack(snap) {
  return snap.pairStatus === "connected" && trackLive(snap.videoTrack);
}
function phoneHasAudioTrack(snap) {
  return snap.pairStatus === "connected" && trackLive(snap.audioTrack);
}
function subscribePhoneTracks(listener) {
  listeners.add(listener);
  listener(getPhoneTracksSnapshot());
  return () => listeners.delete(listener);
}
function initPhoneTracks(maka) {
  maka.onPhoneWebrtcOffer((offer) => {
    void maka.getPhoneWebRtcIceServers().then((iceServers) => handleOffer(maka, offer, iceServers)).catch(() => {
      resetWebrtc();
    });
  });
  maka.onPhoneWebrtcReset(() => {
    resetWebrtc();
  });
  maka.onPhonePairUpdate((snap) => {
    pairStatus = snap.status;
    if (snap.status === "connected") {
      emit();
      return;
    }
    if (snap.status === "reconnecting") {
      clearTracks();
      emit();
      return;
    }
    resetWebrtc();
  });
  void maka.getPhonePair().then((snap) => {
    pairStatus = snap.status;
    emit();
  });
}
const body = document.body;
const relayChip = document.getElementById("relay-chip");
const relayLabel = document.getElementById("relay-label");
const relayStatus = document.getElementById("relay-status");
const relayVersion = document.getElementById("relay-version");
const relayError = document.getElementById("relay-error");
const sourceList = document.getElementById("source-list");
const programVideo = document.getElementById("program-video");
const programEmpty = document.getElementById("program-empty");
const programSceneCard = document.getElementById("program-scene-card");
const programSceneCardTitle = document.getElementById("program-scene-card-title");
const programSceneCardSubtitle = document.getElementById("program-scene-card-subtitle");
const programSceneBg = document.getElementById("program-scene-bg");
const sceneImagePanel = document.getElementById("scene-image-panel");
const sceneImagePanelLabel = document.getElementById("scene-image-panel-label");
const sceneImagePanelHint = document.getElementById("scene-image-panel-hint");
const btnSceneImagePick = document.getElementById("btn-scene-image-pick");
const btnSceneImageClear = document.getElementById("btn-scene-image-clear");
const sceneImageMenuDialog = document.getElementById("scene-image-menu-dialog");
const sceneImageMenuPick = document.getElementById("scene-image-menu-pick");
const sceneImageMenuClear = document.getElementById("scene-image-menu-clear");
const sceneImageMenuCancel = document.getElementById("scene-image-menu-cancel");
const sceneImageMenuDelete = document.getElementById("scene-image-menu-delete");
const sceneMenuTimerStop = document.getElementById("scene-image-menu-stop-timer");
const sceneMenuTimerRows = [
  document.getElementById("scene-menu-timer-5"),
  document.getElementById("scene-menu-timer-15"),
  document.getElementById("scene-menu-timer-30"),
  document.getElementById("scene-menu-timer-stop")
];
const sceneMenuImagePickRow = document.getElementById("scene-menu-image-pick");
const sceneMenuImageClearRow = document.getElementById("scene-menu-image-clear");
const sceneMenuDeleteRow = document.getElementById("scene-menu-delete");
const programChatHint = document.getElementById("program-chat-hint");
const programChatLines = document.getElementById("program-chat-lines");
const programChatView = document.getElementById("program-chat-view");
const programAlertBox = document.getElementById("program-alert-box");
const programAlert = document.getElementById("program-alert");
const programAlertKicker = document.getElementById("program-alert-kicker");
const programAlertName = document.getElementById("program-alert-name");
const programAlertAmount = document.getElementById("program-alert-amount");
const programAlertMessage = document.getElementById("program-alert-message");
const streamThumbImg = document.getElementById("stream-thumb-img");
const streamTitleText = document.getElementById("stream-title-text");
const streamCategoryText = document.getElementById("stream-category-text");
const streamLivePill = document.getElementById("stream-live-pill");
const streamViewers = document.getElementById("stream-viewers");
const streamDuration = document.getElementById("stream-duration");
const btnGoLiveLabel = document.getElementById("btn-go-live-label");
const programCam = document.getElementById("program-cam");
const programCamVideo = document.getElementById("program-cam-video");
const programCamOffline = document.getElementById("program-cam-offline");
const cameraSelect = document.getElementById("camera-select");
const micSelect = document.getElementById("mic-select");
const programQualitySelect = document.getElementById(
  "program-quality-select"
);
const platformKeyDialog = document.getElementById("platform-key-dialog");
const platformKeyForm = document.getElementById("platform-key-form");
const platformKeyPanelTwitch = document.getElementById("platform-key-panel-twitch");
const platformKeyPanelYoutube = document.getElementById("platform-key-panel-youtube");
const platformKeyDialogTitle = document.getElementById("platform-key-dialog-title");
const platformKeySave = document.getElementById("platform-key-save");
const camScale = document.getElementById("cam-scale");
const micMeter = document.getElementById("mic-meter");
const desktopMeter = document.getElementById("desktop-meter");
const gameMeter = document.getElementById("game-meter");
const audioDesktopChannel = document.getElementById("audio-desktop");
const audioGameChannel = document.getElementById("audio-game");
const audioDesktopLabel = document.getElementById("audio-desktop-label");
const audioGameLabel = document.getElementById("audio-game-label");
const desktopAudioOutputSelect = document.getElementById(
  "desktop-audio-output"
);
const btnDesktopAudioSettings = document.getElementById(
  "btn-desktop-audio-settings"
);
const btnGameAudioSettings = document.getElementById("btn-game-audio-settings");
const destTwitch = document.getElementById("dest-twitch");
const destYoutube = document.getElementById("dest-youtube");
const twitchKey = document.getElementById("twitch-key");
const youtubeKey = document.getElementById("youtube-key");
const twitchChatLinkInput = document.getElementById("twitch-chat-link");
const youtubeChatLinkInput = document.getElementById("youtube-chat-link");
const platformKeyStatus = document.getElementById("platform-key-status");
const destHint = document.getElementById("dest-hint");
const destError = document.getElementById("dest-error");
const ffmpegLog = document.getElementById("ffmpeg-log");
const diagDrawer = document.getElementById("diag-drawer");
const settingsViewRoot = document.getElementById("settings-view");
const btnSettings = document.getElementById("btn-settings");
const btnGoLive = document.getElementById("btn-go-live-sidebar");
const layerGame = document.getElementById("layer-game");
const layerCam = document.getElementById("layer-cam");
const layerMic = document.getElementById("layer-mic");
const layerBrowser = document.getElementById("layer-browser");
const toggleWebcam = document.getElementById("toggle-webcam");
const toggleMic = document.getElementById("toggle-mic");
const toggleWebcamState = document.getElementById("toggle-webcam-state");
const toggleMicState = document.getElementById("toggle-mic-state");
const studioSourceGame = document.getElementById("studio-source-game");
const studioSourceWebcam = document.getElementById("studio-source-webcam");
const studioSourceMic = document.getElementById("studio-source-mic");
const studioSourceBrowser = document.getElementById("studio-source-browser");
const studioSourceChat = document.getElementById("studio-source-chat");
const studioSourceNotifications = document.getElementById("studio-source-notifications");
const studioStatusDot = document.getElementById("studio-status-dot");
const studioStatusText = document.getElementById("studio-status-text");
const addonPanels = document.getElementById("addon-panels");
const platTwitch = document.getElementById("plat-twitch");
const platYoutube = document.getElementById("plat-youtube");
const platCustom = document.getElementById("plat-custom");
const destCustomBlock = document.getElementById("dest-custom-block");
const destCustom = document.getElementById("dest-custom");
const customRtmpUrl = document.getElementById("custom-rtmp-url");
const customRtmpKey = document.getElementById("custom-rtmp-key");
const backupRtmpUrl = document.getElementById("backup-rtmp-url");
const backupRtmpKey = document.getElementById("backup-rtmp-key");
const programBrowser = document.getElementById("program-browser");
const programBrowserVideo = document.getElementById("program-browser-video");
const programChatSlot = document.getElementById("program-chat-slot");
const programNotificationsSlot = document.getElementById("program-notifications-slot");
const CUSTOM_RTM_ADDON_ID = "com.maka.custom-rtmp";
let selectedSourceId = null;
let captureKind = null;
let lastCaptureSource = null;
let captureStallState = emptyCaptureStallState();
let captureRetryUsed = false;
let captureRetryInFlight = false;
let captureStallNotified = false;
let captureBlackSamples = 0;
let captureBlackFallbackUsed = false;
let liveRecoveryAttempts = 0;
let liveReconnecting = false;
let liveRecoveryExhausted = false;
let liveRecoveryReason = null;
let adaptiveEncodeEnabled = true;
let encodeAdaptUserHold = false;
let encodeAdaptState = emptyEncodeAdaptState();
let whipLoadState = emptyWhipLoadState();
let whipLoadFrameMark = null;
let encodeAdaptFrameMark = null;
let applyingAdaptiveEncode = false;
let liveRecoveryFatal = false;
let sessionLiveIntent = false;
let liveReconnectTimer = null;
let whipDisconnectTimer = null;
let liveReconnectRunId = 0;
let programStream = null;
let browserStream = null;
let cameraStream = null;
let micStream = null;
let desktopAudioStream = null;
let gameAudioStream = null;
let gamePcm = null;
let gameAudioSession = 0;
let gameAudioStatus = "";
let stopGamePcmListener = null;
let desktopMeterHandle = null;
let gameMeterHandle = null;
let desktopAudioMuted = false;
let gameAudioMuted = false;
let desktopAudioStarting = false;
let capturePlatform = "other";
let preferredDesktopOutputDeviceId = "";
let currentMode = "studio";
let whipPublisher = null;
let whipVideoWatchdog = null;
let whipStatsSampler = null;
let whipStreamMetrics = null;
let lastRelaySnapshot = null;
let goingLive = false;
let micMuted = false;
let labMode = false;
let recordingSaveFolder = "";
let lastStreamPlatform = "none";
let relayStudioSettings = { streamTitle: "", streamCategory: "", streamDescription: "", audioMicBitrateKbps: 160, audioDesktopBitrateKbps: 160, videoEncoderPreference: "system", gpuPreference: "default" };
let pcCameraBeforePhone = "";
let pcMicBeforePhone = "";
let preferPhoneCamera = false;
let phoneVideoWasLive = false;
let phoneAudioWasLive = false;
let sessionIngestTarget = "primary";
let micMeterHandle = null;
const layerEnabled = {
  game: true,
  cam: true,
  mic: true,
  desktopAudio: true,
  gameAudio: true,
  browser: false,
  overlay: false,
  chat: false,
  notifications: false
};
let activeChatSourceId = "off";
let activeSceneTemplateId = "gaming-cam";
const sceneImagePaths = {};
const sceneImageDataUrlCache = /* @__PURE__ */ new Map();
let sceneImageMenuTargetId = null;
let customScenes = [];
let intermissionEndsAtMs = null;
let intermissionTimer = null;
let streamChannel = "";
let platformViewers = { twitch: null, youtube: null };
let platformViewerTimer = null;
let streamTwitchChatLink = "";
let streamYoutubeChatLink = "";
let streamAlertBoxUrl = "";
let streamIncludeChat = false;
const gameArtByName = /* @__PURE__ */ new Map();
let twitchAlertFeed = null;
let twitchFeedLogin = "";
let twitchChatStatus = "idle";
const TWITCH_CHAT_LIMIT = 80;
const streamAlertQueue = [];
let streamAlertTimer = null;
let shownAlertIds = /* @__PURE__ */ new Set();
let captureClockFrames = 0;
let captureClockStartedAt = 0;
let measuredCaptureFps = null;
let playbackDroppedFrames = 0;
let playbackTotalFrames = 0;
let whipBytesSample = null;
let measuredWhipMbps = null;
const studioScenesList = document.getElementById("studio-scenes-list");
const studioAddSceneRow = document.getElementById("studio-add-scene-row");
let activeOverlayPresetId = "";
const WEBCAM_OFFLINE_TEXT = "video is offline";
const lifecycleCopy = {
  stopped: "Relay offline",
  starting: "Relay starting…",
  ready: "Relay ready",
  live: "LIVE",
  error: "Relay error"
};
function relayErrorPlain(error) {
  if (error == null || error === "") return "";
  return typeof error === "string" ? error : String(error);
}
function relayChipLabel(snapshot) {
  const base = lifecycleCopy[snapshot.lifecycle] ?? "Relay ready";
  const errText = relayErrorPlain(snapshot.error);
  if (snapshot.lifecycle === "stopped" && errText) {
    const short = errText.length > 80 ? `${errText.slice(0, 77)}…` : errText;
    return `Relay offline — ${short}`;
  }
  return base;
}
function setDestError(message) {
  if (!message) {
    destError.hidden = true;
    destError.textContent = "";
    return;
  }
  destError.hidden = false;
  destError.textContent = message;
}
function applyMode(mode) {
  currentMode = mode;
  body.dataset.mode = mode;
  const settingsOpen = mode === "settings";
  settingsViewRoot.hidden = !settingsOpen;
  document.title = settingsOpen ? "Maka — Settings" : "Maka — Streaming";
  if (btnSettings) {
    btnSettings.setAttribute("aria-pressed", settingsOpen ? "true" : "false");
  }
}
function startMicMeter(stream) {
  stopMicMeter();
  micMeterHandle = startAudioLevelMeter(stream, setMicMeterLevel);
}
function stopMicMeter() {
  micMeterHandle?.stop();
  micMeterHandle = null;
  setMicMeterLevel(0);
}
function setMicMeterLevel(percent) {
  const level = Math.max(0, Math.min(100, percent));
  micMeter.style.width = `${level}%`;
  micMeter.style.removeProperty("height");
}
function setDesktopMeterLevel(percent) {
  setHorizontalMeterLevel(desktopMeter, percent);
}
function setGameMeterLevel(percent) {
  setHorizontalMeterLevel(gameMeter, percent);
}
function syncSystemAudioChannelUi() {
  const supported = systemAudioCaptureSupported(capturePlatform);
  const desktopLive = Boolean(desktopAudioStream);
  const gameLive = Boolean(gameAudioStream);
  audioDesktopChannel.dataset.captureUnavailable = supported && desktopLive ? "0" : "1";
  audioGameChannel.dataset.captureUnavailable = supported && gameLive ? "0" : "1";
  audioDesktopChannel.dataset.muted = desktopAudioMuted ? "1" : "0";
  audioGameChannel.dataset.muted = gameAudioMuted ? "1" : "0";
  btnDesktopAudioSettings.disabled = !supported;
  btnGameAudioSettings.disabled = !supported;
  audioDesktopLabel.textContent = "Desktop Audio";
  audioGameLabel.textContent = "Game Audio";
  if (!supported) {
    audioDesktopChannel.title = "System audio capture is not available on this host";
    audioGameChannel.title = "System audio capture is not available on this host";
    return;
  }
  if (!desktopLive) {
    audioDesktopChannel.title = "No desktop audio yet. Click the name or gear to share system audio.";
  } else {
    audioDesktopChannel.title = desktopAudioMuted ? "Desktop audio muted for stream (click name to unmute)" : "Desktop audio live — click name to mute for stream";
  }
  if (!gameLive) {
    const kind = gameAudioKind(
      captureKind === "desktop" ? selectedSourceId : null
    );
    audioGameChannel.title = gameAudioStatus || (kind === "screen" ? "This gameplay source is the whole screen. Game audio follows a window. Desktop audio already has this mix." : "Pick a gameplay window. Game audio follows that app, and desktop audio stays the full output.");
  } else if (gameAudioMuted) {
    audioGameChannel.title = "Game audio muted for stream (click name to unmute)";
  } else {
    audioGameChannel.title = "Game audio is this window’s app. Other windows of the same app are included. Click the name to mute.";
  }
}
function applyDesktopGameAudioTrackEnabled() {
  if (desktopAudioStream) {
    for (const track of desktopAudioStream.getAudioTracks()) {
      track.enabled = !desktopAudioMuted;
    }
  }
  if (gameAudioStream) {
    for (const track of gameAudioStream.getAudioTracks()) {
      track.enabled = !gameAudioMuted;
    }
  }
}
function stopDesktopAudioMeter() {
  desktopMeterHandle?.stop();
  desktopMeterHandle = null;
  setDesktopMeterLevel(0);
}
function stopGameAudioMeter() {
  gameMeterHandle?.stop();
  gameMeterHandle = null;
  setGameMeterLevel(0);
}
function stopDesktopAudioCapture() {
  stopDesktopAudioMeter();
  stopMediaStream(desktopAudioStream);
  desktopAudioStream = null;
}
function stopGameAudioCapture() {
  stopGameAudioMeter();
  gamePcm?.close();
  gamePcm = null;
  stopMediaStream(gameAudioStream);
  gameAudioStream = null;
  gameAudioSession = 0;
}
function ensureGamePcmListener() {
  if (stopGamePcmListener) return;
  stopGamePcmListener = window.maka.onWindowAudioPcm((session, pcm) => {
    if (session !== gameAudioSession || !gamePcm) return;
    gamePcm.push(pcm);
  });
}
async function openDesktopAudioStream(fromGesture) {
  const loopback = await startDesktopLoopbackAudio(preferredDesktopOutputDeviceId);
  if (loopback) return loopback;
  if (!fromGesture) return null;
  return startDisplayShareAudio();
}
async function refreshDesktopAudioCapture(fromGesture = false) {
  if (!systemAudioCaptureSupported(capturePlatform)) {
    stopDesktopAudioCapture();
    syncSystemAudioChannelUi();
    return;
  }
  if (desktopAudioStarting) return;
  desktopAudioStarting = true;
  stopDesktopAudioCapture();
  try {
    const stream = await openDesktopAudioStream(fromGesture);
    if (!stream) {
      if (fromGesture) {
        setDestError("Could not open desktop audio. Share a screen or window that includes audio.");
      }
      syncSystemAudioChannelUi();
      return;
    }
    desktopAudioStream = stream;
    applyDesktopGameAudioTrackEnabled();
    desktopMeterHandle = startAudioLevelMeter(stream, setDesktopMeterLevel);
    syncWhipAvTracks();
  } finally {
    desktopAudioStarting = false;
    syncSystemAudioChannelUi();
  }
}
async function refreshGameAudioCapture() {
  stopGameAudioCapture();
  gameAudioStatus = "";
  if (capturePlatform !== "win32") {
    gameAudioStatus = "Game audio follows a window on Windows.";
    syncSystemAudioChannelUi();
    syncWhipAvTracks();
    return;
  }
  const sourceId = captureKind === "desktop" && selectedSourceId && selectedSourceId !== BROWSE_CAPTURE_SOURCE_ID ? selectedSourceId : null;
  if (gameAudioKind(sourceId) !== "window" || !sourceId) {
    await window.maka.stopWindowAudio();
    syncSystemAudioChannelUi();
    syncWhipAvTracks();
    return;
  }
  const started = await window.maka.startWindowAudio(sourceId);
  if (!started.ok) {
    gameAudioStatus = started.message;
    syncSystemAudioChannelUi();
    syncWhipAvTracks();
    return;
  }
  gameAudioSession = started.session;
  gamePcm = createPcmPlayback();
  gameAudioStream = gamePcm.stream;
  ensureGamePcmListener();
  applyDesktopGameAudioTrackEnabled();
  gameMeterHandle = startAudioLevelMeter(gameAudioStream, setGameMeterLevel);
  syncWhipAvTracks();
  syncSystemAudioChannelUi();
}
async function refreshDesktopAudioOutputDevices() {
  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    devices = [];
  }
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  const prev = desktopAudioOutputSelect.value;
  desktopAudioOutputSelect.innerHTML = '<option value="">Default system output</option>';
  for (const out of outputs) {
    const opt = document.createElement("option");
    opt.value = out.deviceId;
    opt.textContent = out.label || `Output ${desktopAudioOutputSelect.options.length}`;
    desktopAudioOutputSelect.appendChild(opt);
  }
  const preferred = preferredDesktopOutputDeviceId;
  if (preferred && [...desktopAudioOutputSelect.options].some((o) => o.value === preferred)) {
    desktopAudioOutputSelect.value = preferred;
  } else if ([...desktopAudioOutputSelect.options].some((o) => o.value === prev)) {
    desktopAudioOutputSelect.value = prev;
  }
}
async function initSystemAudioCapture() {
  const info = await window.maka.getVersionInfo();
  capturePlatform = parseCapturePlatform(info.platform);
  syncSystemAudioChannelUi();
  if (!systemAudioCaptureSupported(capturePlatform)) {
    setDesktopMeterLevel(0);
    setGameMeterLevel(0);
    return;
  }
  try {
    const s = await window.maka.getSettings();
    preferredDesktopOutputDeviceId = s.preferredDesktopAudioOutputDeviceId ?? "";
  } catch {
  }
  await refreshDesktopAudioOutputDevices();
  await refreshDesktopAudioCapture();
  await refreshGameAudioCapture();
}
function whipLiveAudioTrack(stream, enabled) {
  if (!stream || !enabled) return null;
  return stream.getAudioTracks().find((t) => t.readyState === "live") ?? null;
}
function activeSceneImagePath() {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) return void 0;
  return sceneImagePaths[activeSceneTemplateId];
}
function sceneImageMimeForPath(filePath) {
  return filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}
function sceneImageRectForLayout(layout, mode) {
  const { canvas, sources } = layout;
  if (mode === "game-mask-only") {
    const gameplay = sources.find((s) => s.id === "gameplay");
    if (gameplay) {
      return {
        x: gameplay.x,
        y: gameplay.y,
        width: gameplay.width,
        height: gameplay.height
      };
    }
  }
  return { x: 0, y: 0, width: canvas.width, height: canvas.height };
}
function hideProgramSceneBg() {
  programSceneBg.hidden = true;
  programSceneBg.removeAttribute("src");
}
async function resolveSceneImageDataUrl(filePath) {
  const cached = sceneImageDataUrlCache.get(filePath);
  if (cached) return cached;
  const dataUrl = await window.maka.readSceneImageDataUrl(filePath);
  if (dataUrl) sceneImageDataUrlCache.set(filePath, dataUrl);
  return dataUrl;
}
async function refreshProgramSceneBgLayer() {
  const mode = sceneImageMaskMode(activeSceneTemplateId);
  const path = activeSceneImagePath();
  if (!mode || !path) {
    hideProgramSceneBg();
    return;
  }
  const dataUrl = await resolveSceneImageDataUrl(path);
  if (!dataUrl) {
    hideProgramSceneBg();
    return;
  }
  const layout = buildOutgoingSceneLayout();
  const rect = sceneImageRectForLayout(layout, mode);
  applySourceBox(programSceneBg, { ...rect }, layout.canvas);
  programSceneBg.src = dataUrl;
  programSceneBg.hidden = false;
}
function syncSceneImagePanel() {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) {
    sceneImagePanel.hidden = true;
    return;
  }
  sceneImagePanel.hidden = false;
  const sceneId = activeSceneTemplateId;
  const path = sceneImagePaths[sceneId];
  btnSceneImageClear.hidden = !path;
  const mode = sceneImageMaskMode(activeSceneTemplateId);
  if (mode === "game-mask-only") {
    if (activeSceneTemplateId === "desk-only") {
      sceneImagePanelLabel.textContent = "Just Chatting image";
    } else if (isCustomSceneId(activeSceneTemplateId)) {
      const custom = customScenes.find((s) => s.id === activeSceneTemplateId);
      sceneImagePanelLabel.textContent = custom ? `${custom.name} image` : "Scene image";
    } else {
      sceneImagePanelLabel.textContent = "Scene image";
    }
    sceneImagePanelHint.textContent = "PNG/JPG replaces the gameplay layer only. Webcam stays above the image; chat and notification slots follow your overlay layout.";
  } else {
    sceneImagePanelLabel.textContent = "Scene image";
    sceneImagePanelHint.textContent = "PNG/JPG covers the program area (game + webcam). Chat and notification regions stay visible when an overlay layout is active.";
  }
  if (path) {
    const name = path.split(/[/\\]/).pop() ?? path;
    sceneImagePanelHint.textContent = `${sceneImagePanelHint.textContent} Current: ${name}`;
  }
}
function syncSceneProgramPresentation() {
  const stub = isSceneStubId(activeSceneTemplateId);
  const preset = sceneStubPreset(activeSceneTemplateId);
  const hasSceneImage = Boolean(activeSceneImagePath());
  syncSceneImagePanel();
  if (stub && preset && !hasSceneImage) {
    programSceneCard.hidden = false;
    programSceneCard.dataset.scene = activeSceneTemplateId;
    programSceneCardTitle.textContent = preset.title;
    programSceneCardSubtitle.textContent = activeSceneTemplateId === "intermission" ? intermissionSubtitle(Date.now(), intermissionEndsAtMs, preset.subtitle) : preset.subtitle;
    programVideo.hidden = true;
    programCam.hidden = true;
    programBrowser.hidden = true;
    programChatSlot.hidden = true;
    programNotificationsSlot.hidden = true;
    programEmpty.hidden = true;
    hideProgramSceneBg();
    return;
  }
  programSceneCard.hidden = true;
  programSceneCard.dataset.scene = "";
  if (stub && hasSceneImage) {
    programVideo.hidden = true;
    programCam.hidden = true;
    programBrowser.hidden = true;
    programEmpty.hidden = true;
    void refreshProgramSceneBgLayer();
    refreshProgramPreviewLayout();
    updateProgramBrowserOverlay();
    return;
  }
  const showGameplay = Boolean(programStream) && layerEnabled.game && !hasSceneImage;
  programVideo.hidden = !showGameplay;
  programEmpty.hidden = showGameplay || hasSceneImage;
  if (hasSceneImage) {
    void refreshProgramSceneBgLayer();
  } else {
    hideProgramSceneBg();
  }
  updateProgramCamOverlay();
  updateProgramBrowserOverlay();
}
function syncProgramVideoSurface() {
  syncSceneProgramPresentation();
}
function updateStudioMixControls() {
  const camOn = layerEnabled.cam;
  toggleWebcam.dataset.on = camOn ? "1" : "0";
  toggleWebcam.setAttribute("aria-pressed", camOn ? "true" : "false");
  toggleWebcamState.textContent = camOn ? "On" : "Off";
  const micOn = layerEnabled.mic && Boolean(micStream);
  toggleMic.dataset.on = micOn && !micMuted ? "1" : "0";
  toggleMic.setAttribute("aria-pressed", micOn && !micMuted ? "true" : "false");
  if (!micStream) {
    toggleMicState.textContent = "Off";
  } else if (micMuted) {
    toggleMicState.textContent = "Muted";
  } else {
    toggleMicState.textContent = layerEnabled.mic ? "On" : "Off";
  }
  studioSourceGame.dataset.active = programStream ? "1" : "0";
  studioSourceGame.dataset.enabled = layerEnabled.game ? "1" : "0";
  studioSourceWebcam.dataset.active = hasLiveWebcamVideo() ? "1" : "0";
  studioSourceWebcam.dataset.enabled = layerEnabled.cam ? "1" : "0";
  studioSourceMic.dataset.active = micStream ? "1" : "0";
  studioSourceMic.dataset.enabled = layerEnabled.mic ? "1" : "0";
  const overlayActive = overlaySourceShowingInProgram();
  studioSourceBrowser.dataset.active = overlayActive ? "1" : "0";
  studioSourceBrowser.dataset.enabled = overlayActive ? "1" : "0";
  studioSourceChat.dataset.enabled = layerEnabled.chat ? "1" : "0";
  studioSourceChat.dataset.active = layerEnabled.chat ? "1" : "0";
  studioSourceNotifications.dataset.enabled = layerEnabled.notifications ? "1" : "0";
  studioSourceNotifications.dataset.active = layerEnabled.notifications ? "1" : "0";
  syncChatSourceRow();
}
function updateStudioStatusFooter(snapshot) {
  if (snapshot.lifecycle === "error" || liveRecoveryExhausted) {
    studioStatusDot.dataset.state = "bad";
    studioStatusText.textContent = "Relay needs attention";
    return;
  }
  if (snapshot.lifecycle === "starting" || liveReconnecting) {
    studioStatusDot.dataset.state = "warn";
    studioStatusText.textContent = "Relay starting…";
    return;
  }
  if (snapshot.lifecycle === "stopped") {
    studioStatusDot.dataset.state = "warn";
    studioStatusText.textContent = "Relay is off";
    return;
  }
  studioStatusDot.dataset.state = "ok";
  studioStatusText.textContent = "All systems nominal";
}
function syncLayerTracks() {
  if (programStream) {
    for (const track of programStream.getVideoTracks()) {
      track.enabled = layerEnabled.game;
    }
  }
  if (browserStream) {
    for (const track of browserStream.getVideoTracks()) {
      track.enabled = layerEnabled.browser;
    }
  }
  if (cameraStream) {
    for (const track of cameraStream.getVideoTracks()) {
      track.enabled = layerEnabled.cam;
    }
  }
  if (micStream) {
    for (const track of micStream.getAudioTracks()) {
      track.enabled = layerEnabled.mic && !micMuted;
    }
  }
  applyDesktopGameAudioTrackEnabled();
  layerGame.dataset.enabled = layerEnabled.game ? "1" : "0";
  layerCam.dataset.enabled = layerEnabled.cam ? "1" : "0";
  layerMic.dataset.enabled = layerEnabled.mic ? "1" : "0";
  layerBrowser.dataset.enabled = layerEnabled.browser ? "1" : "0";
  syncSceneProgramPresentation();
  refreshProgramPreviewLayout();
  updateStudioMixControls();
}
function updateProgramBrowserOverlay() {
  const show = Boolean(browserStream) && layerEnabled.browser;
  programBrowser.hidden = !show;
  if (show) {
    if (programBrowserVideo.srcObject !== browserStream) {
      programBrowserVideo.srcObject = browserStream;
    }
    void programBrowserVideo.play().catch(() => void 0);
  } else if (!browserStream) {
    programBrowserVideo.srcObject = null;
  }
}
function hasLiveWebcamVideo() {
  return Boolean(
    cameraStream?.getVideoTracks().some((track) => track.readyState === "live")
  );
}
function usesOverlayPresetLayout() {
  return Boolean(
    activeOverlayPresetId && layerEnabled.overlay && overlayPresetById(activeOverlayPresetId)
  );
}
function syncWebcamPresentation(camLabel) {
  const layerOn = layerEnabled.cam;
  const hasVideo = hasLiveWebcamVideo();
  if (!layerOn) {
    programCam.hidden = true;
    programCamVideo.hidden = true;
    programCamOffline.hidden = true;
    programCamVideo.srcObject = null;
    updateStudioMixControls();
    return;
  }
  const layout = buildOutgoingSceneLayout();
  const webcam = layout.sources.find((s) => s.id === "webcam");
  if (webcam) {
    applySourceBox(programCam, webcam, layout.canvas);
  } else if (!usesOverlayPresetLayout()) {
    programCam.style.left = "";
    programCam.style.top = "";
    programCam.style.height = "";
    const scale = Math.max(12, Math.min(40, Number(camScale.value) || 22));
    programCam.style.width = `${scale}%`;
  }
  programCam.hidden = false;
  if (hasVideo) {
    programCamVideo.hidden = false;
    programCamOffline.hidden = true;
    if (programCamVideo.srcObject !== cameraStream) {
      programCamVideo.srcObject = cameraStream;
    }
    void programCamVideo.play().catch(() => void 0);
  } else {
    programCamVideo.hidden = true;
    programCamOffline.hidden = false;
    programCamOffline.textContent = WEBCAM_OFFLINE_TEXT;
    programCamVideo.srcObject = null;
  }
  if (camLabel) {
    layerCam.textContent = camLabel;
  } else if (!hasVideo) {
    layerCam.textContent = "Webcam — offline";
  }
}
function updateProgramCamOverlay() {
  syncWebcamPresentation();
}
function applySourceBox(el, source, canvas) {
  el.style.inset = "auto";
  el.style.right = "auto";
  el.style.bottom = "auto";
  el.style.left = `${source.x / canvas.width * 100}%`;
  el.style.top = `${source.y / canvas.height * 100}%`;
  el.style.width = `${source.width / canvas.width * 100}%`;
  el.style.height = `${source.height / canvas.height * 100}%`;
  el.style.aspectRatio = "auto";
}
function resetProgramGameplayBox() {
  programVideo.style.inset = "0";
  programVideo.style.left = "";
  programVideo.style.top = "";
  programVideo.style.width = "100%";
  programVideo.style.height = "100%";
}
function applyProgramPreviewLayout(layout) {
  const { canvas, sources } = layout;
  const sourceById = (id) => sources.find((s) => s.id === id);
  const gameplay = sourceById("gameplay");
  if (gameplay && layerEnabled.game && programStream) {
    applySourceBox(programVideo, gameplay, canvas);
  } else if (programStream) {
    resetProgramGameplayBox();
  }
  const webcam = sourceById("webcam");
  if (webcam && layerEnabled.cam) {
    applySourceBox(programCam, webcam, canvas);
  } else if (!usesOverlayPresetLayout()) {
    programCam.style.left = "";
    programCam.style.top = "";
    programCam.style.width = "";
    programCam.style.height = "";
  } else if (usesOverlayPresetLayout()) {
    programCam.style.left = "";
    programCam.style.top = "";
    programCam.style.height = "";
  }
  const chat = sourceById("chat");
  const showChatPlaceholder = layerEnabled.chat && Boolean(chat) && !(browserStream && layerEnabled.browser);
  programChatSlot.hidden = !showChatPlaceholder;
  if (showChatPlaceholder && chat) {
    applySourceBox(programChatSlot, chat, canvas);
  }
  const notifications = sourceById("notifications");
  const alertVisible = !programAlert.hidden || !programAlertBox.hidden;
  const showNotifications = layerEnabled.notifications && Boolean(notifications) && alertVisible;
  programNotificationsSlot.hidden = !showNotifications;
  if (showNotifications && notifications) {
    applySourceBox(programNotificationsSlot, notifications, canvas);
  }
  if (browserStream && layerEnabled.browser) {
    const browserRect = sourceById("browser") ?? chat;
    if (browserRect) {
      applySourceBox(programBrowser, browserRect, canvas);
    }
  }
}
function buildOutgoingSceneLayout() {
  const profile = selectedProfile();
  const hasWebcam = hasLiveWebcamVideo() && layerEnabled.cam;
  const hasBrowser = Boolean(browserStream) && layerEnabled.browser;
  const preset = activeOverlayPresetId && layerEnabled.overlay ? overlayPresetById(activeOverlayPresetId) : void 0;
  let layout;
  if (isSceneStubId(activeSceneTemplateId)) {
    const template = SCENE_TEMPLATES.find((t) => t.id === activeSceneTemplateId);
    layout = template ? template.build({ profile, hasWebcam: false }) : { canvas: canvasForEncodeProfile(profile), sources: [] };
    if (preset) {
      const presetLayout = preset.build({ profile, hasWebcam: false });
      const overlaySlotIds = /* @__PURE__ */ new Set(["chat", "notifications", "browser"]);
      for (const source of presetLayout.sources) {
        if (overlaySlotIds.has(source.id)) {
          layout.sources.push({ ...source });
        }
      }
    }
  } else if (preset) {
    layout = preset.build({ profile, hasWebcam });
  } else {
    const layoutTemplateId = resolveSceneLayoutTemplateId(activeSceneTemplateId);
    const template = SCENE_TEMPLATES.find((t) => t.id === layoutTemplateId);
    layout = template ? template.build({ profile, hasWebcam }) : defaultSceneLayout({
      profile,
      hasWebcam,
      hasBrowser
    });
    const scale = Number(camScale.value) / 100;
    const cam = layout.sources.find((s) => s.id === "webcam");
    if (cam) {
      cam.width = Math.round(layout.canvas.width * scale);
      cam.height = Math.round(cam.width * (9 / 16));
      cam.x = layout.canvas.width - cam.width - 24;
      cam.y = layout.canvas.height - cam.height - 24;
    }
  }
  if (!layerEnabled.game) {
    layout.sources = layout.sources.filter((s) => s.id !== "gameplay");
  }
  if (!hasWebcam) {
    layout.sources = layout.sources.filter((s) => s.id !== "webcam");
  }
  if (!layerEnabled.browser) {
    layout.sources = layout.sources.filter((s) => s.id !== "browser");
  }
  if (!layerEnabled.chat) {
    layout.sources = layout.sources.filter((s) => s.id !== "chat");
  } else if (!layout.sources.some((s) => s.id === "chat")) {
    layout.sources.push(defaultChatOverlaySlot(layout.canvas));
  }
  if (!layerEnabled.notifications) {
    layout.sources = layout.sources.filter((s) => s.id !== "notifications");
  } else if (!layout.sources.some((s) => s.id === "notifications")) {
    layout.sources.push(defaultNotificationsOverlaySlot(layout.canvas));
  }
  layout.sources = layout.sources.filter((s) => s.id !== "scene-image");
  const imageMode = sceneImageMaskMode(activeSceneTemplateId);
  const imagePath = imageMode && sceneSupportsImageUpload(activeSceneTemplateId) ? sceneImagePaths[activeSceneTemplateId] : void 0;
  if (imagePath && imageMode) {
    const rect = sceneImageRectForLayout(layout, imageMode);
    layout.sources.push({
      id: "scene-image",
      type: "overlay",
      label: "Scene image",
      ...rect,
      zIndex: imageMode === "game-mask-only" ? 0 : 1,
      assetPath: imagePath,
      assetMime: sceneImageMimeForPath(imagePath)
    });
  }
  if (hasBrowser && !layout.sources.some((s) => s.id === "browser")) {
    const chat = layout.sources.find((s) => s.id === "chat");
    if (chat) {
      layout.sources.push({
        id: "browser",
        type: "video",
        label: "Search tab",
        x: chat.x,
        y: chat.y,
        width: chat.width,
        height: chat.height,
        zIndex: chat.zIndex + 1
      });
    } else {
      const w = Math.round(layout.canvas.width * 0.35);
      const h = Math.round(w * (9 / 16));
      layout.sources.push({
        id: "browser",
        type: "video",
        label: "Search tab",
        x: 24,
        y: 24,
        width: w,
        height: h,
        zIndex: 1
      });
    }
  }
  return layout;
}
function refreshProgramPreviewLayout() {
  const layout = buildOutgoingSceneLayout();
  applyProgramPreviewLayout(layout);
  if (activeSceneImagePath()) {
    void refreshProgramSceneBgLayer();
  }
}
function syncOverlaySourceRow() {
  const preset = activeOverlayPresetId && layerEnabled.overlay ? overlayPresetById(activeOverlayPresetId) : void 0;
  const presetLabel = preset?.name ?? "Scene layout";
  layerBrowser.dataset.active = preset && layerEnabled.overlay ? "1" : "0";
  layerBrowser.textContent = `Overlay — ${presetLabel}`;
}
async function selectOverlayPreset(id) {
  activeOverlayPresetId = id;
  layerEnabled.overlay = true;
  const preset = overlayPresetById(id);
  if (preset) {
    const preview = preset.build({
      profile: selectedProfile(),
      hasWebcam: hasLiveWebcamVideo() && layerEnabled.cam
    });
    if (preview.sources.some((s) => s.id === "chat")) {
      layerEnabled.chat = true;
      if (activeChatSourceId === "off") activeChatSourceId = "placeholder";
    }
    if (preview.sources.some((s) => s.id === "notifications")) {
      layerEnabled.notifications = true;
    }
    syncChatSourceRow();
  }
  syncOverlaySourceRow();
  syncLayerTracks();
  if (expandedSourceKinds.has("browser")) {
    void refreshSourcePicker("browser");
  }
  void pushSceneLayout();
}
async function pushSceneLayout() {
  const layout = buildOutgoingSceneLayout();
  applyProgramPreviewLayout(layout);
  const snapshot = await window.maka.getRelay();
  if (!snapshot.health) return;
  await postSceneLayout(snapshot.health, layout);
}
function isSessionLive() {
  return sessionLiveIntent || Boolean(whipPublisher);
}
function clearLiveReconnectTimer() {
  if (liveReconnectTimer) {
    clearTimeout(liveReconnectTimer);
    liveReconnectTimer = null;
  }
}
function clearWhipDisconnectTimer() {
  if (whipDisconnectTimer) {
    clearTimeout(whipDisconnectTimer);
    whipDisconnectTimer = null;
  }
}
function cancelLiveRecovery() {
  clearLiveReconnectTimer();
  clearWhipDisconnectTimer();
  liveReconnectRunId += 1;
  liveReconnecting = false;
  liveRecoveryReason = null;
  liveRecoveryFatal = false;
}
function liveReconnectStatusLine() {
  const reason = liveRecoveryReason ?? "relay:recover";
  const label = liveRecoveryReasonLabel(reason);
  return `${label} — reconnecting (${liveRecoveryAttempts}/${MAX_LIVE_RETRY_ATTEMPTS})`;
}
function renderRelay(snapshot) {
  lastRelaySnapshot = snapshot;
  const lifecycle = snapshot.lifecycle;
  const live = isSessionLive();
  const relayUiState = live && liveReconnecting ? "starting" : live && liveRecoveryExhausted ? "error" : lifecycle;
  relayChip.dataset.state = relayUiState;
  if (live && liveReconnecting) {
    relayLabel.textContent = liveReconnectStatusLine();
  } else if (live && liveRecoveryExhausted) {
    const label = liveRecoveryReasonLabel(liveRecoveryReason ?? "relay:recover");
    relayLabel.textContent = liveRecoveryFatal ? `${label} — ingest rejected` : `${label} — reconnect failed`;
  } else {
    relayLabel.textContent = relayChipLabel({
      ...snapshot,
      lifecycle
    });
  }
  relayStatus.textContent = live && liveReconnecting ? "reconnecting" : snapshot.status?.status ?? lifecycle;
  relayVersion.textContent = snapshot.health ? `v${snapshot.health.version}` : "—";
  renderPlatformStatus(snapshot);
  if (live && liveRecoveryExhausted) {
    relayError.hidden = false;
    const label = liveRecoveryReasonLabel(liveRecoveryReason ?? "relay:recover");
    relayError.textContent = liveRecoveryFatal ? `${label} — stream key or ingest rejected (auto-retry stopped).` : `${label} — could not restore the stream after ${MAX_LIVE_RETRY_ATTEMPTS} attempts.`;
  } else if (relayErrorPlain(snapshot.error) && !(live && liveReconnecting)) {
    relayError.hidden = false;
    relayError.textContent = relayErrorPlain(snapshot.error);
  } else if (!liveRecoveryExhausted) {
    relayError.hidden = true;
    relayError.textContent = "";
  }
  updateStudioStatusFooter(snapshot);
  if (snapshot.restarts && snapshot.restarts > 0 && snapshot.lifecycle !== "ready" && snapshot.lifecycle !== "live" && !(live && liveReconnecting)) {
    relayLabel.textContent = `${relayChipLabel(snapshot)} · r${snapshot.restarts}`;
  }
  btnGoLive.dataset.live = live ? "1" : "0";
  btnGoLive.dataset.exhausted = liveRecoveryExhausted ? "1" : "0";
  if (!goingLive && !liveReconnecting) updateGoLiveLabel(live);
  const lines = snapshot.status?.ffmpegLog;
  if (lines?.length) {
    ffmpegLog.textContent = lines.join("\n");
  }
  updateProgramStats(snapshot);
  updateGoLiveLabel(live);
  updateStreamInfo(live, snapshot);
}
function relayPlatformLiveFlag(value) {
  if (value === void 0) return void 0;
  if (typeof value === "boolean") return value;
  if (typeof value.live === "boolean") return value.live;
  return void 0;
}
function platformChipState(enabled, hasKey, live, platformLive) {
  const platformLiveFlag = relayPlatformLiveFlag(platformLive);
  if (!enabled) return "off";
  if (live && platformLiveFlag === true) return "live";
  if (live && platformLiveFlag === false) return "error";
  if (hasKey) return "armed";
  return "idle";
}
function renderPlatformStatus(snapshot) {
  const live = isSessionLive();
  const platforms = snapshot.status?.platforms;
  platTwitch.dataset.state = platformChipState(
    destTwitch.checked,
    Boolean(twitchKey.value.trim()),
    live,
    platforms?.twitch
  );
  platTwitch.dataset.key = streamKeyValid("twitch", twitchKey.value) ? "valid" : "missing";
  platYoutube.dataset.state = platformChipState(
    destYoutube.checked,
    Boolean(youtubeKey.value.trim()),
    live,
    platforms?.youtube
  );
  platYoutube.dataset.key = streamKeyValid("youtube", youtubeKey.value) ? "valid" : "missing";
  platCustom.dataset.state = platformChipState(
    destCustom.checked,
    Boolean(customRtmpKey.value.trim()),
    live,
    platforms?.custom
  );
}
function stopWhipVideoWatchdog() {
  whipVideoWatchdog?.stop();
  whipVideoWatchdog = null;
  whipStatsSampler?.stop();
  whipStatsSampler = null;
}
function clearWhipStreamMetrics() {
  whipStreamMetrics = null;
  whipBytesSample = null;
  measuredWhipMbps = null;
}
function startWhipStatsSamplerForPublisher() {
  whipStatsSampler?.stop();
  whipStatsSampler = null;
  if (!whipPublisher || !sessionLiveIntent) return;
  whipStatsSampler = startWhipStatsSampler({
    pc: whipPublisher.pc,
    isLive: () => sessionLiveIntent && !goingLive && !liveReconnecting,
    onMetrics: (metrics) => {
      whipStreamMetrics = metrics;
      if (metrics.outboundVideoBytesSent != null) {
        const now = Date.now();
        if (whipBytesSample && now > whipBytesSample.at) {
          measuredWhipMbps = mbpsFromByteDelta(
            metrics.outboundVideoBytesSent - whipBytesSample.bytes,
            now - whipBytesSample.at
          );
        }
        whipBytesSample = { bytes: metrics.outboundVideoBytesSent, at: now };
      }
      updateProgramStats(lastRelaySnapshot);
      if (isSessionLive()) updateStreamInfo(true, lastRelaySnapshot);
    }
  });
}
function whipExpectsOutboundVideo() {
  const gameplay = layerEnabled.game && Boolean(programStream?.getVideoTracks().some((t) => t.readyState === "live"));
  const browser = layerEnabled.browser && Boolean(browserStream?.getVideoTracks().some((t) => t.readyState === "live"));
  const webcam = layerEnabled.cam && hasLiveWebcamVideo();
  return gameplay || browser || webcam;
}
function startWhipVideoWatchdogForPublisher() {
  stopWhipVideoWatchdog();
  startWhipStatsSamplerForPublisher();
  if (!whipPublisher || !sessionLiveIntent) return;
  whipVideoWatchdog = startWhipVideoWatchdog({
    pc: whipPublisher.pc,
    shouldExpectVideo: whipExpectsOutboundVideo,
    isLive: () => sessionLiveIntent && !goingLive && !liveReconnecting,
    onVideoStall: (reason) => {
      stopWhipVideoWatchdog();
      queueLiveRecovery(reason);
    }
  });
}
function whipPeerNeedsRecovery() {
  if (!whipPublisher) return sessionLiveIntent;
  const state = whipPublisher.pc.connectionState;
  return state === "failed" || state === "disconnected" || state === "closed";
}
function relaySnapshotNeedsRecovery(snapshot) {
  if (!sessionLiveIntent || goingLive || liveRecoveryExhausted) return false;
  if (liveReconnecting || liveReconnectTimer) return false;
  const whipBad = whipPeerNeedsRecovery();
  if (snapshot.lifecycle === "starting") {
    return whipBad;
  }
  if (snapshot.status?.status === "error") return true;
  if (!snapshot.health && snapshot.lifecycle !== "stopped") return whipBad || snapshot.lifecycle === "error";
  if (snapshot.lifecycle === "error" && !snapshot.error?.includes("auto-restart exhausted")) {
    return true;
  }
  if (relayNeedsLiveBootstrap(snapshot)) return true;
  return whipBad;
}
function onWhipConnectionState(state) {
  if (!sessionLiveIntent) return;
  if (state === "connected") {
    clearWhipDisconnectTimer();
    liveRecoveryAttempts = 0;
    liveRecoveryExhausted = false;
    liveRecoveryFatal = false;
    liveReconnecting = false;
    liveRecoveryReason = null;
    setDestError(null);
    startWhipVideoWatchdogForPublisher();
    void window.maka.getRelay().then(renderRelay);
    return;
  }
  if (state === "disconnected") {
    if (whipDisconnectTimer || goingLive || liveReconnecting) return;
    stopWhipVideoWatchdog();
    whipDisconnectTimer = setTimeout(() => {
      whipDisconnectTimer = null;
      if (!sessionLiveIntent || goingLive || liveReconnecting) return;
      const current = whipPublisher?.pc.connectionState;
      if (current === "connected" || current === "connecting") return;
      clearWhipStreamMetrics();
      queueLiveRecovery("whip:disconnected");
    }, WHIP_DISCONNECT_GRACE_MS);
    return;
  }
  if (state === "failed" || state === "closed") {
    clearWhipDisconnectTimer();
    stopWhipVideoWatchdog();
    clearWhipStreamMetrics();
    if (goingLive || liveReconnecting) return;
    queueLiveRecovery(`whip:${state}`);
  }
}
function enabledDestinationKeysEmpty() {
  if (destTwitch.checked && !twitchKey.value.trim()) return true;
  if (destYoutube.checked && !youtubeKey.value.trim()) return true;
  if (destCustom.checked && (!customRtmpUrl.value.trim() || !customRtmpKey.value.trim())) {
    return true;
  }
  return false;
}
function queueLiveRecovery(reason, detail) {
  if (!sessionLiveIntent || goingLive || liveRecoveryExhausted) return;
  if (liveReconnecting || liveReconnectTimer) return;
  if (isFatalLiveRecoveryReason(reason, detail)) {
    markLiveRecoveryFatal(reason, detail);
    return;
  }
  const cap = liveRecoveryAttemptCap(reason, detail);
  if (liveRecoveryAttempts >= cap) {
    markLiveRecoveryExhausted(reason, detail);
    return;
  }
  liveRecoveryReason = reason;
  recordQos("recovery", reason, { detail, attempt: liveRecoveryAttempts + 1 });
  const delay = liveRetryBackoffMs(liveRecoveryAttempts);
  liveReconnectTimer = setTimeout(() => {
    liveReconnectTimer = null;
    void runLiveRecovery(reason);
  }, delay);
}
async function repostStreamInfo(snapshot) {
  if (!snapshot.health) return snapshot;
  await postRelayConfig(snapshot.health, relayConfigForIngest(sessionIngestTarget));
  await pushSceneLayout();
  return snapshot;
}
async function runLiveRecovery(reason) {
  if (!sessionLiveIntent || goingLive || liveRecoveryExhausted) return;
  const runId = ++liveReconnectRunId;
  liveRecoveryAttempts += 1;
  liveReconnecting = true;
  liveRecoveryReason = reason;
  setDestError(null);
  destHint.textContent = liveReconnectStatusLine();
  void window.maka.getRelay().then(renderRelay);
  const previousIngest = sessionIngestTarget;
  sessionIngestTarget = nextIngestTargetAfterFailedRecovery(
    sessionIngestTarget,
    reason,
    backupIngestFromUi()
  );
  if (sessionIngestTarget === "backup" && previousIngest !== "backup") {
    recordQos("failover", reason, {
      detail: "Switched to backup ingest",
      attempt: liveRecoveryAttempts,
      ingest: "backup"
    });
  }
  try {
    if (!primaryVideoStreamForWhip()) {
      throw new Error("Program source missing — cannot reconnect live session.");
    }
    stopWhipVideoWatchdog();
    if (whipPublisher) {
      await whipPublisher.close().catch(() => void 0);
      whipPublisher = null;
    }
    let snapshot = await window.maka.getRelay();
    if (!snapshot.health || snapshot.lifecycle === "stopped" || snapshot.lifecycle === "error") {
      snapshot = await window.maka.startRelay();
    }
    snapshot = await waitForRelayReady(
      () => window.maka.getRelay(),
      async () => {
        await window.maka.refreshRelay();
      }
    );
    if (runId !== liveReconnectRunId) return;
    if (!snapshot.health) {
      throw new Error(snapshot.error ?? "Relay not ready for live reconnect.");
    }
    if (snapshot.error?.includes("auto-restart exhausted")) {
      throw new Error(snapshot.error);
    }
    snapshot = await repostStreamInfo(snapshot);
    await window.maka.refreshRelay();
    snapshot = await window.maka.getRelay();
    if (!snapshot.health) {
      throw new Error("Relay health missing after reconnect wait.");
    }
    whipPublisher = await attachWhipPublisher(await refreshRelayHealthForWhip());
    syncWhipAvTracks();
    await window.maka.refreshRelay();
    if (runId !== liveReconnectRunId) return;
    liveRecoveryAttempts = 0;
    liveRecoveryExhausted = false;
    liveRecoveryFatal = false;
    liveRecoveryReason = null;
    destHint.textContent = liveDestHintAfterRecovery();
    setDestError(null);
  } catch (err) {
    if (runId !== liveReconnectRunId) return;
    const message = err instanceof Error ? err.message : String(err);
    sessionIngestTarget = nextIngestTargetAfterFailedRecovery(
      sessionIngestTarget,
      reason,
      backupIngestFromUi()
    );
    if (isFatalLiveRecoveryReason(reason, message)) {
      markLiveRecoveryFatal(reason, message);
    } else if (liveRecoveryAttempts >= liveRecoveryAttemptCap(reason, message)) {
      markLiveRecoveryExhausted(reason, message);
    } else {
      setDestError(message);
      queueLiveRecovery(reason, message);
    }
  } finally {
    if (runId === liveReconnectRunId) {
      liveReconnecting = false;
      void window.maka.getRelay().then(renderRelay);
    }
  }
}
function markLiveRecoveryExhausted(reason, detail) {
  liveRecoveryExhausted = true;
  liveRecoveryFatal = false;
  liveReconnecting = false;
  liveRecoveryReason = reason;
  clearLiveReconnectTimer();
  const label = liveRecoveryReasonLabel(reason);
  const extra = detail ? ` ${detail}` : "";
  recordQos("recovery", reason, { detail, attempt: liveRecoveryAttempts, label: `${label} (retries exhausted)` });
  setDestError(
    `Live stream dropped (${label}).${extra} Use Retry connection or End Stream.`
  );
  mountRetryConnectionHint(false);
  void window.maka.getRelay().then(renderRelay);
}
function markLiveRecoveryFatal(reason, detail) {
  liveRecoveryExhausted = true;
  liveRecoveryFatal = true;
  liveReconnecting = false;
  liveRecoveryReason = reason;
  if (liveRecoveryAttempts < 1) liveRecoveryAttempts = 1;
  clearLiveReconnectTimer();
  const label = liveRecoveryReasonLabel(reason);
  recordQos("fatal", reason, { detail, attempt: liveRecoveryAttempts });
  const extra = (detail ?? reason.replace(/^rtmp:/, "")).trim();
  const keyHint = enabledDestinationKeysEmpty() ? " Enter stream keys in Destinations, then Retry connection or End Stream." : " Use Retry connection or End Stream.";
  setDestError(`Live stream stopped (${label}).${extra ? ` ${extra}` : ""}${keyHint}`);
  mountRetryConnectionHint(true);
  void window.maka.getRelay().then(renderRelay);
}
function recoveryReasonFromSnapshot(snapshot) {
  if (snapshot.status?.status === "error") {
    return `rtmp:${snapshot.status.error ?? "error"}`;
  }
  if (relayNeedsLiveBootstrap(snapshot)) {
    return "relay:restart";
  }
  if (snapshot.lifecycle === "error") {
    const err = snapshot.error?.toLowerCase() ?? "";
    if (err.includes("exit") || err.includes("health") || err.includes("recovering")) {
      return "relay:restart";
    }
    return "relay:error";
  }
  if (!snapshot.health) return "relay:health";
  if (whipPeerNeedsRecovery()) {
    const state = whipPublisher?.pc.connectionState ?? "failed";
    return `whip:${state}`;
  }
  return "relay:recover";
}
function handleRelayLiveRecovery(snapshot) {
  renderRelay(snapshot);
  if (snapshot.health && typeof snapshot.health === "object" && "version" in snapshot.health) {
    void settingsView.refreshVersions();
  }
  if (!relaySnapshotNeedsRecovery(snapshot)) return;
  const reason = recoveryReasonFromSnapshot(snapshot);
  const detail = snapshot.status?.error ?? snapshot.error ?? void 0;
  if (isFatalLiveRecoveryReason(reason, detail)) {
    markLiveRecoveryFatal(reason, detail);
    return;
  }
  queueLiveRecovery(reason, detail);
}
function primaryVideoStreamForWhip() {
  if (programStream) return programStream;
  if (isDeskOnlyLikeScene(activeSceneTemplateId) && layerEnabled.cam && cameraStream) {
    return cameraStream;
  }
  return null;
}
function captureReadyForGoLive() {
  if (isSceneStubId(activeSceneTemplateId)) {
    return Boolean(primaryVideoStreamForWhip() || layerEnabled.cam && cameraStream);
  }
  if (isDeskOnlyLikeScene(activeSceneTemplateId)) {
    return Boolean(primaryVideoStreamForWhip());
  }
  return Boolean(programStream);
}
function goLiveCaptureError() {
  if (isDeskOnlyLikeScene(activeSceneTemplateId)) {
    return "Select a webcam (or gameplay source) before going live.";
  }
  if (isSceneStubId(activeSceneTemplateId)) {
    return "Attach a capture source before going live on a holding scene.";
  }
  return "Select a display or window for gameplay first.";
}
function relayBearerToken(headers) {
  const match = /^Bearer\s+(.+)$/i.exec((headers.Authorization ?? "").trim());
  return match?.[1]?.trim() ?? "";
}
async function refreshRelayHealthForWhip() {
  const snapshot = await window.maka.refreshRelay();
  const health = snapshot.health;
  if (!health?.relayToken?.trim()) {
    throw new Error(
      snapshot.error ?? "Relay token missing — wait for MAKArelay Ready or press Start relay."
    );
  }
  return health;
}
const electronWhipSignaling = {
  postOffer: async (localSdp, headers) => {
    const token = relayBearerToken(headers);
    try {
      return await window.maka.publishWhipOffer(localSdp, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ipcOrTransport = /invoking remote method 'whip:publish'/i.test(message) || /fetch failed/i.test(message) || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message);
      if (!ipcOrTransport) throw err;
      const health = await refreshRelayHealthForWhip();
      return postWhipOfferHttp(whipUrlFromHealth(), localSdp, authHeaders(health));
    }
  },
  deleteResource: (resourceUrl) => window.maka.closeWhipResource(resourceUrl, "")
};
async function ensureRelayReadyForLive() {
  let snapshot = await window.maka.getRelay();
  if (!snapshot.health || snapshot.lifecycle === "stopped" || snapshot.lifecycle === "error") {
    snapshot = await window.maka.startRelay();
  }
  snapshot = await waitForRelayReady(
    () => window.maka.getRelay(),
    () => window.maka.refreshRelay().then(() => void 0),
    { timeoutMs: 45e3 }
  );
  if (!snapshot.health) {
    throw new Error(
      snapshot.error ?? "MAKArelay did not respond. Open Settings or restart the app, then confirm the relay chip shows Ready."
    );
  }
  return snapshot;
}
async function snapshotWithReachableRelay() {
  let snapshot = await window.maka.refreshRelay();
  if (!snapshot.health || snapshot.lifecycle === "stopped" || snapshot.lifecycle === "error") {
    snapshot = await ensureRelayReadyForLive();
  } else if (!await pingRelayHealth()) {
    snapshot = await ensureRelayReadyForLive();
  }
  if (!snapshot.health || !await pingRelayHealth()) {
    throw new Error(
      snapshot.error ?? "MAKArelay is not reachable at 127.0.0.1:38473. Wait for Ready on the relay chip or press Start relay."
    );
  }
  return snapshot;
}
async function attachWhipPublisher(health) {
  const gameplay = primaryVideoStreamForWhip();
  if (!gameplay) {
    throw new Error(goLiveCaptureError());
  }
  return publishWhip(
    whipUrlFromHealth(),
    {
      gameplay,
      browser: layerEnabled.browser && browserStream ? browserStream : null,
      webcam: layerEnabled.cam ? cameraStream : null,
      mic: layerEnabled.mic ? micStream : null,
      desktopAudio: desktopAudioStream,
      gameAudio: gameAudioStream
    },
    authHeaders(health),
    onWhipConnectionState,
    electronWhipSignaling
  );
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function stopStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}
function releaseCameraStream() {
  if (!cameraStream) return;
  const phoneVideo = getPhoneTracksSnapshot().videoTrack;
  for (const track of cameraStream.getVideoTracks()) {
    if (track !== phoneVideo) track.stop();
  }
  cameraStream = null;
}
function releaseMicStream() {
  if (!micStream) return;
  const phoneAudio = getPhoneTracksSnapshot().audioTrack;
  for (const track of micStream.getAudioTracks()) {
    if (track !== phoneAudio) track.stop();
  }
  micStream = null;
}
function selectedProfile() {
  return normalizeEncodeProfileId(programQualitySelect.value);
}
function populateEncodeProfileSelect(select) {
  select.innerHTML = "";
  for (const id of ENCODE_PROFILE_ORDER) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = formatAutoEncodeLabel(id);
    select.appendChild(option);
  }
}
function syncEncodeProfileSelects(id) {
  if (programQualitySelect.value !== id) programQualitySelect.value = id;
  const wizardQuality = document.getElementById("go-live-wizard-quality");
  if (wizardQuality && wizardQuality.value !== id) wizardQuality.value = id;
}
function onEncodeProfileChanged(id, origin = "user") {
  if (origin === "user" && isSessionLive()) encodeAdaptUserHold = true;
  syncEncodeProfileSelects(id);
  updateProgramStats();
  syncStreamInfoMeta();
  void window.maka.setSettings({ bitrateProfile: id });
  void pushSceneLayout().catch(() => void 0);
  void repostRelayConfigIfLive();
}
function resetEncodeAdaptSession() {
  encodeAdaptUserHold = false;
  encodeAdaptState = emptyEncodeAdaptState();
  encodeAdaptFrameMark = null;
  whipLoadState = emptyWhipLoadState();
  whipLoadFrameMark = null;
}
function windowedDropPercent(dropped, encoded) {
  const prev = encodeAdaptFrameMark;
  encodeAdaptFrameMark = { dropped, encoded };
  if (!prev) return null;
  const encodedDelta = encoded - prev.encoded;
  const droppedDelta = dropped - prev.dropped;
  if (encodedDelta <= 0 || droppedDelta < 0) return null;
  return droppedDelta / encodedDelta * 100;
}
function maybeAdaptEncode(sample) {
  if (applyingAdaptiveEncode || !isSessionLive()) return;
  const result = observeEncodeAdapt(
    encodeAdaptState,
    selectedProfile(),
    sample,
    Date.now(),
    adaptiveEncodeEnabled && !encodeAdaptUserHold
  );
  encodeAdaptState = result.state;
  if (!result.next) return;
  applyingAdaptiveEncode = true;
  try {
    const label = encodeProfileSpec(result.next).menuLabel;
    onEncodeProfileChanged(result.next, "adapt");
    destHint.textContent = `Encode stepped down to ${label} — connection congested.`;
    recordQos("encode", `encode:${result.next}`, { label: `Encode stepped down to ${label}`, detail: label });
  } finally {
    applyingAdaptiveEncode = false;
  }
}
function initEncodeProfileControls() {
  populateEncodeProfileSelect(programQualitySelect);
  const initial = normalizeEncodeProfileId(programQualitySelect.value);
  syncEncodeProfileSelects(initial);
  updateProgramStats();
}
function backupIngestFromUi() {
  return { url: backupRtmpUrl.value, key: backupRtmpKey.value };
}
function primaryCustomFromUi() {
  return { enabled: destCustom.checked, url: customRtmpUrl.value, key: customRtmpKey.value };
}
function relayConfigForIngest(ingestTarget) {
  const custom = resolveCustomRtmpForPost(ingestTarget, primaryCustomFromUi(), backupIngestFromUi());
  return buildRelayConfigRequest({ twitchKey: destTwitch.checked ? twitchKey.value : "", youtubeKey: destYoutube.checked ? youtubeKey.value : "", customRtmpUrl: custom.url, customRtmpKey: custom.key }, selectedProfile(), relayStudioSettings);
}
async function repostRelayConfigIfLive() {
  if (!sessionLiveIntent && !isSessionLive()) return;
  const snapshot = await window.maka.getRelay();
  if (!snapshot.health) return;
  await postRelayConfig(snapshot.health, relayConfigForIngest(sessionIngestTarget));
  await window.maka.refreshRelay();
}
function liveDestHintAfterRecovery() {
  if (sessionIngestTarget === "backup") {
    return `Live — ${BACKUP_INGEST_STATUS}. Keys stay in relay RAM.`;
  }
  return "Live — stream recovered. Keys stay in relay RAM.";
}
function streamDestinationsFromUi() {
  return {
    destTwitch: destTwitch.checked,
    destYoutube: destYoutube.checked,
    destCustom: destCustom.checked,
    twitchKey: twitchKey.value,
    youtubeKey: youtubeKey.value
  };
}
function applyStreamDestinations(saved) {
  destTwitch.checked = saved.destTwitch;
  destYoutube.checked = saved.destYoutube;
  destCustom.checked = saved.destCustom;
  twitchKey.value = saved.twitchKey;
  youtubeKey.value = saved.youtubeKey;
  syncDestinationInputs();
  void window.maka.getRelay().then(renderPlatformStatus);
}
async function persistStreamDestinationsFromUi() {
  await window.maka.setSettings({ streamDestinations: streamDestinationsFromUi() });
}
function syncDestinationInputs() {
  twitchKey.disabled = !destTwitch.checked;
  youtubeKey.disabled = !destYoutube.checked;
  const customEnabled = destCustom.checked;
  customRtmpUrl.disabled = !customEnabled;
  customRtmpKey.disabled = !customEnabled;
  syncStreamInfoMeta();
}
function applyWizardPlatform(platform) {
  destTwitch.checked = platform === "twitch";
  destYoutube.checked = platform === "youtube";
  destCustom.checked = platform === "custom";
  syncDestinationInputs();
  if (platform === "twitch" || platform === "youtube") {
    lastStreamPlatform = platform;
    void window.maka.setSettings({ lastStreamPlatform: platform });
  }
}
function resolvedChatChannel(platform, raw) {
  if (platform === "twitch") {
    const login = normalizeTwitchChannel(raw);
    return isTwitchLogin(login) ? login : "";
  }
  return youtubeVideoId(raw);
}
function applySavedChatLinks(platform, include, channel) {
  lastStreamPlatform = platform;
  streamChannel = include ? channel : "";
  streamIncludeChat = include;
  layerEnabled.chat = include;
  layerEnabled.notifications = include;
  syncChatFeed();
  syncPlatformAlerts();
  updateStudioMixControls();
  refreshProgramPreviewLayout();
}
function openPlatformKeyDialog(platform) {
  platformKeyPanelTwitch.hidden = platform !== "twitch";
  platformKeyPanelYoutube.hidden = platform !== "youtube";
  platformKeyDialogTitle.textContent = platform === "twitch" ? "Twitch" : "YouTube";
  platformKeySave.textContent = platform === "twitch" ? "Save Twitch key" : "Save YouTube key";
  twitchChatLinkInput.value = streamTwitchChatLink;
  youtubeChatLinkInput.value = streamYoutubeChatLink;
  platformKeyStatus.hidden = true;
  platformKeyStatus.textContent = "";
  syncDestinationInputs();
  const input = platform === "twitch" ? twitchKey : youtubeKey;
  input.disabled = false;
  platformKeyDialog.showModal();
  requestAnimationFrame(() => {
    input.focus();
  });
}
async function savePlatformCredentials(platform) {
  const rawLink = (platform === "twitch" ? twitchChatLinkInput.value : youtubeChatLinkInput.value).trim();
  if (platform === "twitch") streamTwitchChatLink = rawLink.slice(0, 120);
  else streamYoutubeChatLink = rawLink.slice(0, 512);
  const channel = resolvedChatChannel(platform, rawLink);
  const include = Boolean(channel);
  if (rawLink && !include) {
    platformKeyStatus.hidden = false;
    platformKeyStatus.textContent = platform === "twitch" ? "Key saved. That chat link is not a Twitch channel yet." : "Key saved. That chat link is not a YouTube live video yet.";
  }
  applySavedChatLinks(platform, include, channel);
  await persistStreamDestinationsFromUi();
  await window.maka.setSettings({
    lastStreamPlatform: platform,
    streamTwitchChatLink,
    streamYoutubeChatLink,
    streamChannel,
    streamIncludeChat
  });
}
function syncCustomRtmpBlock(show) {
  destCustomBlock.hidden = !show;
  platCustom.hidden = !show;
  const wizardCustom = document.getElementById("go-live-wizard-custom-option");
  if (wizardCustom) wizardCustom.hidden = !show;
}
async function loadCustomRtmpSettings() {
  const [studio, addon] = await Promise.all([
    window.maka.getSettings(),
    window.maka.getAddonSettings(CUSTOM_RTM_ADDON_ID)
  ]);
  if (addon.customRtmpUrl) customRtmpUrl.value = addon.customRtmpUrl;
  if (addon.customRtmpKeyConfigured) {
    customRtmpKey.placeholder = "Stream key saved";
  }
  const backupUrl = studio.backupRtmpUrl || addon.backupRtmpUrl || "";
  const backupKey = studio.backupRtmpKey || addon.backupRtmpKey || "";
  if (backupUrl) backupRtmpUrl.value = backupUrl;
  if (backupKey) backupRtmpKey.value = backupKey;
  else if (addon.backupRtmpKeyConfigured) backupRtmpKey.placeholder = "Backup stream key saved";
}
async function persistBackupIngest() {
  const backupRtmpUrlValue = backupRtmpUrl.value.trim();
  const backupRtmpKeyValue = backupRtmpKey.value.trim();
  await window.maka.setSettings({
    backupRtmpUrl: backupRtmpUrlValue,
    backupRtmpKey: backupRtmpKeyValue
  });
  await window.maka.setAddonSettings(CUSTOM_RTM_ADDON_ID, {
    backupRtmpUrl: backupRtmpUrlValue,
    backupRtmpKey: backupRtmpKeyValue
  });
}
async function persistCustomRtmpSettings() {
  if (!destCustomBlock.hidden) {
    await window.maka.setAddonSettings(CUSTOM_RTM_ADDON_ID, {
      customRtmpUrl: customRtmpUrl.value.trim(),
      customRtmpKey: customRtmpKey.value.trim()
    });
  }
  await persistBackupIngest();
}
let qosEvents = [];
function paintQosLog() {
  const el = document.getElementById("qos-event-log");
  if (el) el.textContent = formatQosLog(qosEvents);
}
function recordQos(kind, reason, extra) {
  const event = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind,
    reason,
    label: extra?.label ?? liveRecoveryReasonLabel(reason),
    detail: extra?.detail,
    attempt: extra?.attempt,
    ingest: extra?.ingest ?? sessionIngestTarget
  };
  qosEvents = pushQosEvent(qosEvents, event);
  paintQosLog();
  void window.maka.recordDiagnostic({
    level: kind === "fatal" ? "error" : "warn",
    source: "qos",
    message: `${event.kind}: ${event.label}`,
    detail: {
      reason: event.reason,
      detail: event.detail ?? "",
      attempt: event.attempt ?? 0,
      ingest: event.ingest ?? "primary"
    }
  }).catch(() => void 0);
}
const SOURCE_KINDS = ["game", "webcam", "mic", "browser", "chat", "notifications"];
const sourcePickerEls = {
  game: document.getElementById("source-picker-game"),
  webcam: document.getElementById("source-picker-webcam"),
  mic: document.getElementById("source-picker-mic"),
  browser: document.getElementById("source-picker-browser"),
  chat: document.getElementById("source-picker-chat"),
  notifications: document.getElementById("source-picker-notifications")
};
const expandedSourceKinds = /* @__PURE__ */ new Set();
function sourceMenuEl(kind) {
  return sourceToggleEls[kind].querySelector("[data-source-menu]");
}
function syncSourcePickerVisibility() {
  for (const kind of SOURCE_KINDS) {
    const picker = sourcePickerEls[kind];
    const toggle = sourceToggleEls[kind];
    const menu = sourceMenuEl(kind);
    const open = expandedSourceKinds.has(kind);
    picker.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.dataset.expanded = open ? "1" : "0";
    if (menu) {
      menu.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }
}
function appendPickerSectionHeader(picker, title) {
  const li = document.createElement("li");
  li.className = "studio-source-picker-section";
  const p = document.createElement("p");
  p.className = "studio-source-picker-section-title";
  p.textContent = title;
  li.appendChild(p);
  picker.appendChild(li);
}
function setPickerStatus(picker, message) {
  picker.innerHTML = "";
  const li = document.createElement("li");
  const p = document.createElement("p");
  p.className = "studio-source-picker-status";
  p.textContent = message;
  li.appendChild(p);
  picker.appendChild(li);
}
function appendPickerButton(picker, opts) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "studio-source-picker-item";
  btn.dataset.active = opts.active ? "1" : "0";
  if (opts.thumbnailDataUrl) {
    const img = document.createElement("img");
    img.className = "studio-source-picker-thumb";
    img.alt = "";
    img.src = opts.thumbnailDataUrl;
    btn.appendChild(img);
  }
  const label = document.createElement("span");
  label.className = "studio-source-picker-label";
  label.textContent = opts.label;
  btn.appendChild(label);
  if (opts.kindLabel) {
    const kind = document.createElement("span");
    kind.className = "studio-source-picker-kind";
    kind.textContent = opts.kindLabel;
    btn.appendChild(kind);
  }
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    void opts.onPick();
  });
  li.appendChild(btn);
  picker.appendChild(li);
}
const sourceToggleEls = {
  game: studioSourceGame,
  webcam: studioSourceWebcam,
  mic: studioSourceMic,
  browser: studioSourceBrowser,
  chat: studioSourceChat,
  notifications: studioSourceNotifications
};
const CHAT_PINNED_PRESETS = [
  { id: "pin-chat", label: "Twitch chat popout" },
  { id: "pin-yt-chat", label: "YouTube Live Chat" }
];
function syncChatSourceRow() {
  if (!layerEnabled.chat) {
    studioSourceChat.querySelector(".studio-list-text").textContent = "Chat";
    syncChatFeed();
    return;
  }
  if (activeChatSourceId === "placeholder") {
    studioSourceChat.querySelector(".studio-list-text").textContent = "Chat — placeholder";
    return;
  }
  const preset = CHAT_PINNED_PRESETS.find((p) => p.id === activeChatSourceId);
  if (preset) {
    studioSourceChat.querySelector(".studio-list-text").textContent = `Chat — ${preset.label}`;
    return;
  }
  studioSourceChat.querySelector(".studio-list-text").textContent = "Chat — on";
  syncChatFeed();
}
async function refreshSourcePicker(kind) {
  const picker = sourcePickerEls[kind];
  picker.innerHTML = "";
  setPickerStatus(picker, "Detecting…");
  try {
    if (kind === "game") {
      const sources = await window.maka.listCaptureSources();
      const desktop = sources.filter((s) => s.type !== "browser");
      picker.innerHTML = "";
      if (!desktop.length) {
        setPickerStatus(picker, "No displays or windows found.");
        return;
      }
      for (const source of desktop) {
        appendPickerButton(picker, {
          label: source.name,
          kindLabel: source.type === "screen" ? "Display" : "Window",
          thumbnailDataUrl: source.thumbnailDataUrl || void 0,
          active: selectedSourceId === source.id,
          onPick: () => selectDesktopSource(source)
        });
      }
      return;
    }
    if (kind === "webcam") {
      await refreshAvDevices({ video: true });
      picker.innerHTML = "";
      appendPickerButton(picker, {
        label: "No camera",
        active: !cameraSelect.value,
        onPick: async () => {
          layerEnabled.cam = false;
          cameraSelect.value = "";
          lastCameraSelectValue = "";
          await applyCamera();
          syncLayerTracks();
          void refreshSourcePicker("webcam");
        }
      });
      for (const opt of [...cameraSelect.options]) {
        if (!opt.value) continue;
        appendPickerButton(picker, {
          label: opt.textContent ?? "Camera",
          active: cameraSelect.value === opt.value,
          onPick: async () => {
            layerEnabled.cam = true;
            cameraSelect.value = opt.value;
            lastCameraSelectValue = opt.value;
            if (opt.value === PHONE_CAMERA_DEVICE_VALUE) {
              preferPhoneCamera = true;
            } else if (opt.value) {
              preferPhoneCamera = false;
            }
            await applyCamera();
            syncLayerTracks();
            void refreshSourcePicker("webcam");
          }
        });
      }
      return;
    }
    if (kind === "mic") {
      await refreshAvDevices({ audio: true });
      picker.innerHTML = "";
      appendPickerButton(picker, {
        label: "No microphone",
        active: !micSelect.value,
        onPick: async () => {
          layerEnabled.mic = false;
          micSelect.value = "";
          lastMicSelectValue = "";
          rememberPreferredMic("");
          await applyMic();
          syncLayerTracks();
          void refreshSourcePicker("mic");
        }
      });
      for (const opt of [...micSelect.options]) {
        if (!opt.value) continue;
        appendPickerButton(picker, {
          label: opt.textContent ?? "Microphone",
          active: micSelect.value === opt.value,
          onPick: async () => {
            layerEnabled.mic = true;
            micSelect.value = opt.value;
            lastMicSelectValue = opt.value;
            rememberPreferredMic(opt.value);
            await applyMic();
            syncLayerTracks();
            void refreshSourcePicker("mic");
          }
        });
      }
      return;
    }
    if (kind === "chat") {
      picker.innerHTML = "";
      appendPickerButton(picker, {
        label: "Chat off",
        active: !layerEnabled.chat,
        onPick: () => {
          layerEnabled.chat = false;
          activeChatSourceId = "off";
          syncChatSourceRow();
          syncLayerTracks();
          void refreshSourcePicker("chat");
        }
      });
      appendPickerButton(picker, {
        label: "Placeholder panel",
        kindLabel: "Program",
        active: layerEnabled.chat && activeChatSourceId === "placeholder",
        onPick: () => {
          layerEnabled.chat = true;
          activeChatSourceId = "placeholder";
          syncChatSourceRow();
          syncLayerTracks();
          void refreshSourcePicker("chat");
        }
      });
      return;
    }
    if (kind === "notifications") {
      picker.innerHTML = "";
      appendPickerButton(picker, {
        label: "Notifications off",
        active: !layerEnabled.notifications,
        onPick: () => {
          layerEnabled.notifications = false;
          syncLayerTracks();
          void refreshSourcePicker("notifications");
        }
      });
      appendPickerButton(picker, {
        label: "Placeholder overlay",
        kindLabel: "Program",
        active: layerEnabled.notifications,
        onPick: () => {
          layerEnabled.notifications = true;
          syncLayerTracks();
          void refreshSourcePicker("notifications");
        }
      });
      return;
    }
    picker.innerHTML = "";
    appendPickerSectionHeader(picker, "Layout presets");
    appendPickerButton(picker, {
      label: "Follow scene layout",
      kindLabel: "Composition",
      active: !activeOverlayPresetId,
      onPick: () => {
        activeOverlayPresetId = "";
        syncOverlaySourceRow();
        syncLayerTracks();
        void pushSceneLayout();
        void refreshSourcePicker("browser");
      }
    });
    for (const preset of OVERLAY_LAYOUT_PRESETS) {
      appendPickerButton(picker, {
        label: preset.name,
        kindLabel: "Composition",
        active: activeOverlayPresetId === preset.id,
        onPick: () => selectOverlayPreset(preset.id)
      });
    }
  } catch (err) {
    picker.innerHTML = "";
    setPickerStatus(
      picker,
      err instanceof Error ? err.message : "Could not list sources for this type."
    );
  }
}
function toggleGameLayer() {
  layerEnabled.game = !layerEnabled.game;
  syncLayerTracks();
  void pushSceneLayout().catch(() => void 0);
}
function overlaySourceShowingInProgram() {
  return Boolean(activeOverlayPresetId) && layerEnabled.overlay;
}
function toggleOverlaySourceLayer() {
  if (overlaySourceShowingInProgram()) {
    layerEnabled.overlay = false;
    activeOverlayPresetId = "";
    syncOverlaySourceRow();
    syncLayerTracks();
    void pushSceneLayout().catch(() => void 0);
    return;
  }
  layerEnabled.overlay = true;
  if (!activeOverlayPresetId && OVERLAY_LAYOUT_PRESETS[0]) {
    void selectOverlayPreset(OVERLAY_LAYOUT_PRESETS[0].id);
    return;
  }
  syncLayerTracks();
  void pushSceneLayout().catch(() => void 0);
}
function toggleLayerForSourceKind(kind) {
  if (kind === "game") {
    toggleGameLayer();
    return;
  }
  if (kind === "browser") {
    toggleOverlaySourceLayer();
    return;
  }
  if (kind === "webcam") {
    layerEnabled.cam = !layerEnabled.cam;
    if (layerEnabled.cam && !cameraSelect.value) {
      void refreshSourcePicker("webcam");
    }
    syncLayerTracks();
    return;
  }
  if (kind === "chat") {
    layerEnabled.chat = !layerEnabled.chat;
    if (layerEnabled.chat && activeChatSourceId === "off") {
      activeChatSourceId = "placeholder";
    }
    if (!layerEnabled.chat) {
      activeChatSourceId = "off";
    }
    syncChatSourceRow();
    syncLayerTracks();
    return;
  }
  if (kind === "notifications") {
    layerEnabled.notifications = !layerEnabled.notifications;
    syncLayerTracks();
  }
}
function toggleSourcePicker(kind) {
  const wasOpen = expandedSourceKinds.has(kind);
  expandedSourceKinds.clear();
  if (!wasOpen) {
    expandedSourceKinds.add(kind);
    void refreshSourcePicker(kind);
  }
  syncSourcePickerVisibility();
}
function renderSources(sources) {
  sourceList.innerHTML = "";
  if (expandedSourceKinds.has("game")) {
    void refreshSourcePicker("game");
  }
}
async function selectDesktopSource(source) {
  selectedSourceId = source.id;
  lastCaptureSource = source;
  captureKind = "desktop";
  captureStallState = emptyCaptureStallState();
  captureRetryUsed = false;
  captureStallNotified = false;
  captureBlackSamples = 0;
  captureBlackFallbackUsed = false;
  layerEnabled.game = true;
  for (const el of sourceList.querySelectorAll(".source-card")) {
    el.classList.toggle("active", el.dataset.id === source.id);
  }
  stopStream(programStream);
  programStream = null;
  try {
    const stream = await captureDesktopMedia(source);
    programStream = stream;
    bindGameplayStream(stream);
    programVideo.srcObject = stream;
    syncProgramVideoSurface();
    layerGame.dataset.active = "1";
    layerGame.textContent = `Gameplay — ${source.name}`;
    syncLayerTracks();
    if (currentMode !== "studio") {
      await window.maka.setMode("studio");
    }
    if (expandedSourceKinds.has("game")) {
      void refreshSourcePicker("game");
    }
    void refreshGameAudioCapture();
  } catch (err) {
    programVideo.srcObject = null;
    syncProgramVideoSurface();
    programEmpty.textContent = err instanceof Error ? err.message : "Could not capture this source";
    layerGame.dataset.active = "0";
    layerGame.textContent = "Gameplay — none";
    captureKind = null;
    void refreshGameAudioCapture();
  }
}
async function captureDesktopMedia(source, reduced = false) {
  await window.maka.setPreferredCaptureSource(source.id);
  const displayVideo = reduced ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } };
  const mandatory = {
    chromeMediaSource: "desktop",
    chromeMediaSourceId: source.id,
    maxWidth: reduced ? 1280 : 1920,
    maxHeight: reduced ? 720 : 1080,
    maxFrameRate: reduced ? 30 : 60
  };
  const display = () => navigator.mediaDevices.getDisplayMedia({ video: displayVideo, audio: false });
  const desktop = () => navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { mandatory }
  });
  if (reduced) {
    try {
      return await desktop();
    } catch {
      return await display();
    }
  }
  try {
    return await display();
  } catch {
    return await desktop();
  }
}
async function replaceGameplayWhipTrack(previous, next) {
  if (!whipPublisher) return;
  const previousIds = new Set(previous?.getVideoTracks().map((track) => track.id) ?? []);
  const nextTrack = next.getVideoTracks().find((track) => track.readyState === "live") ?? null;
  await Promise.all(
    whipPublisher.pc.getSenders().map(async (sender) => {
      if (sender.track && previousIds.has(sender.track.id)) {
        await sender.replaceTrack(nextTrack).catch(() => void 0);
      }
    })
  );
}
async function retryFrozenCapture() {
  const source = lastCaptureSource;
  if (!source || captureRetryInFlight) return;
  captureRetryInFlight = true;
  captureStallState = emptyCaptureStallState();
  recordQos("capture", "capture:stalled", { label: "Capture stalled", detail: "Retrying at 720p30" });
  destHint.textContent = "Capture froze — retrying at 720p30.";
  const previous = programStream;
  try {
    const stream = await captureDesktopMedia(source, true);
    programStream = stream;
    bindGameplayStream(stream);
    programVideo.srcObject = stream;
    syncProgramVideoSurface();
    await replaceGameplayWhipTrack(previous, stream);
    stopStream(previous);
    syncWhipAvTracks();
    destHint.textContent = "Capture retried at 720p30. If the preview is still black, pick the game window instead of the whole screen.";
  } catch (err) {
    programEmpty.hidden = false;
    programEmpty.textContent = err instanceof Error ? err.message : "Capture froze and the 720p30 retry failed. Pick the window again.";
    recordQos("capture", "capture:retry-failed", {
      label: "Capture retry failed",
      detail: err instanceof Error ? err.message : "retry failed"
    });
  } finally {
    captureRetryInFlight = false;
  }
}
const blackFrameCanvas = document.createElement("canvas");
blackFrameCanvas.width = 48;
blackFrameCanvas.height = 27;
function noteBlackProgramFrame() {
  const source = lastCaptureSource;
  if (!source || source.type !== "screen" || captureBlackFallbackUsed || captureRetryInFlight) return;
  if (!programVideo.videoWidth) return;
  const ctx = blackFrameCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(programVideo, 0, 0, blackFrameCanvas.width, blackFrameCanvas.height);
  const empty = frameLooksEmpty(ctx.getImageData(0, 0, blackFrameCanvas.width, blackFrameCanvas.height).data);
  const observed = observeBlackFrames(captureBlackSamples, empty);
  captureBlackSamples = observed.stillBlack;
  if (observed.fallback) void fallbackBlackScreenToWindow();
}
async function fallbackBlackScreenToWindow() {
  const current = lastCaptureSource;
  if (!current || current.type !== "screen" || captureRetryInFlight || captureBlackFallbackUsed) return;
  captureBlackFallbackUsed = true;
  captureRetryInFlight = true;
  captureStallState = emptyCaptureStallState();
  try {
    const sources = await window.maka.listCaptureSources();
    const next = pickGameplayWindowFallback(sources, current.id);
    if (!next) {
      destHint.textContent = "Screen capture is black. Pick the game window. Cloud desktops often hide the game from the full screen.";
      recordQos("capture", "capture:black-screen", {
        label: "Black screen capture",
        detail: "No other window to fall back to"
      });
      return;
    }
    recordQos("capture", "capture:wgc-window", {
      label: "Switched to window capture",
      detail: next.name
    });
    destHint.textContent = `Screen was black — capturing “${next.name}” instead.`;
    const previous = programStream;
    const stream = await captureDesktopMedia(
      { id: next.id, name: next.name, type: "window", thumbnailDataUrl: "" },
      true
    );
    lastCaptureSource = { id: next.id, name: next.name, type: "window", thumbnailDataUrl: "" };
    selectedSourceId = next.id;
    programStream = stream;
    bindGameplayStream(stream);
    programVideo.srcObject = stream;
    syncProgramVideoSurface();
    layerGame.dataset.active = "1";
    layerGame.textContent = `Gameplay — ${next.name}`;
    await replaceGameplayWhipTrack(previous, stream);
    stopStream(previous);
    syncWhipAvTracks();
    captureBlackSamples = 0;
  } catch (err) {
    destHint.textContent = "Screen capture is black and the window fallback failed. Pick the game window.";
    recordQos("capture", "capture:wgc-window-failed", {
      label: "Window capture fallback failed",
      detail: err instanceof Error ? err.message : "fallback failed"
    });
  } finally {
    captureRetryInFlight = false;
  }
}
function bindGameplayStream(stream) {
  for (const track of stream.getVideoTracks()) {
    track.onended = () => {
      if (programStream !== stream) return;
      programVideo.srcObject = null;
      syncProgramVideoSurface();
      programEmpty.textContent = "Capture source ended. Select a source again.";
      layerGame.dataset.active = "0";
      layerGame.textContent = "Gameplay — none";
      programStream = null;
      captureKind = null;
      selectedSourceId = null;
      void refreshGameAudioCapture();
    };
  }
}
function bindBrowserStream(stream) {
  for (const track of stream.getVideoTracks()) {
    track.onended = () => {
      if (browserStream !== stream) return;
      void stopBrowserCapture();
    };
  }
}
async function stopBrowserCapture() {
  stopStream(browserStream);
  browserStream = null;
  layerEnabled.browser = false;
  programBrowserVideo.srcObject = null;
  await window.maka.setBrowseCaptureActive(false);
  updateProgramBrowserOverlay();
  syncOverlaySourceRow();
  syncLayerTracks();
}
async function startBrowserCapture() {
  layerEnabled.browser = true;
  stopStream(browserStream);
  browserStream = null;
  const target = await window.maka.getBrowseCaptureTarget();
  if (!target) {
    syncOverlaySourceRow();
    setDestError("Open a page in the Search tab, then enable the Search tab layer.");
    layerEnabled.browser = false;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: target.mediaSourceId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30
        }
      }
    });
    browserStream = stream;
    bindBrowserStream(stream);
    syncOverlaySourceRow();
    syncLayerTracks();
    setDestError(null);
  } catch (err) {
    await stopBrowserCapture();
    layerEnabled.browser = false;
    setDestError(err instanceof Error ? err.message : "Could not capture Search tab");
  }
}
async function selectBrowseTabSource() {
  selectedSourceId = BROWSE_CAPTURE_SOURCE_ID;
  captureKind = "browse";
  for (const el of sourceList.querySelectorAll(".source-card")) {
    el.classList.toggle(
      "active",
      el.dataset.id === BROWSE_CAPTURE_SOURCE_ID
    );
  }
  if (!programStream && !isSceneStubId(activeSceneTemplateId)) {
    programEmpty.hidden = false;
    programEmpty.textContent = "Select gameplay (display/window) first, or use the Search tab layer for overlay only.";
  }
  layerEnabled.browser = true;
  await startBrowserCapture();
  if (browserStream && currentMode !== "studio") {
    await window.maka.setMode("studio");
  }
}
async function refreshSources() {
  try {
    const sources = await window.maka.listCaptureSources();
    renderSources(sources);
    for (const kind of expandedSourceKinds) {
      await refreshSourcePicker(kind);
    }
  } catch (err) {
    for (const kind of expandedSourceKinds) {
      setPickerStatus(
        sourcePickerEls[kind],
        err instanceof Error ? err.message : "Could not list sources"
      );
    }
  }
}
async function refreshAvDevices(options = {}) {
  const wantVideo = options.video === true;
  const wantAudio = options.audio === true;
  if (wantVideo || wantAudio) {
    let devices2 = [];
    try {
      devices2 = await navigator.mediaDevices.enumerateDevices();
    } catch {
      devices2 = [];
    }
    const labeledVideo = devices2.some((d) => d.kind === "videoinput" && d.label);
    const labeledAudio = devices2.some((d) => d.kind === "audioinput" && d.label);
    const probeVideo = wantVideo && !labeledVideo;
    const probeAudio = wantAudio && !labeledAudio;
    if (probeVideo || probeAudio) {
      try {
        const constraints = {};
        if (probeVideo) constraints.video = true;
        if (probeAudio) constraints.audio = true;
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stopStream(stream);
      } catch {
      }
    }
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === "videoinput");
  const mics = devices.filter((d) => d.kind === "audioinput");
  const camValue = cameraSelect.value;
  const micValue = micSelect.value;
  cameraSelect.innerHTML = '<option value="">No camera</option>';
  for (const cam of cams) {
    const opt = document.createElement("option");
    opt.value = cam.deviceId;
    opt.textContent = cam.label || `Camera ${cameraSelect.options.length}`;
    cameraSelect.appendChild(opt);
  }
  micSelect.innerHTML = '<option value="">No microphone</option>';
  for (const mic of mics) {
    const opt = document.createElement("option");
    opt.value = mic.deviceId;
    opt.textContent = mic.label || `Mic ${micSelect.options.length}`;
    micSelect.appendChild(opt);
  }
  const snap = getPhoneTracksSnapshot();
  if (phoneHasVideoTrack(snap)) {
    const phoneCam = document.createElement("option");
    phoneCam.value = PHONE_CAMERA_DEVICE_VALUE;
    phoneCam.textContent = "Phone";
    cameraSelect.appendChild(phoneCam);
  }
  if (phoneHasAudioTrack(snap)) {
    const phoneMic = document.createElement("option");
    phoneMic.value = PHONE_MIC_DEVICE_VALUE;
    phoneMic.textContent = "Phone";
    micSelect.appendChild(phoneMic);
  }
  if ([...cameraSelect.options].some((o) => o.value === camValue)) cameraSelect.value = camValue;
  const preferredMic = micSelect.dataset.preferredMic;
  if (preferredMic && [...micSelect.options].some((o) => o.value === preferredMic)) {
    micSelect.value = preferredMic;
  } else if ([...micSelect.options].some((o) => o.value === micValue)) {
    micSelect.value = micValue;
  }
}
function syncWhipAvTracks() {
  if (!whipPublisher) return;
  const pc2 = whipPublisher.pc;
  const gameplayIds = new Set(programStream?.getVideoTracks().map((t) => t.id) ?? []);
  const browserIds = new Set(browserStream?.getVideoTracks().map((t) => t.id) ?? []);
  let webcamSender = null;
  for (const sender of pc2.getSenders()) {
    const track = sender.track;
    if (!track) continue;
    if (track.kind === "video" && !gameplayIds.has(track.id) && !browserIds.has(track.id)) {
      webcamSender = sender;
    }
  }
  const allowWebcam = whipLoadState.applied !== "shed-webcam";
  const allowBrowser = whipLoadState.applied === "normal";
  const nextWebcam = allowWebcam && layerEnabled.cam && cameraStream ? cameraStream.getVideoTracks().find((t) => t.readyState === "live") ?? null : null;
  const nextBrowser = allowBrowser && layerEnabled.browser && browserStream ? browserStream.getVideoTracks().find((t) => t.readyState === "live") ?? null : null;
  const webcamOut = whipPublisher.videoSenders.webcam ?? webcamSender;
  if (webcamOut) void webcamOut.replaceTrack(nextWebcam).catch(() => void 0);
  if (whipPublisher.videoSenders.browser) {
    void whipPublisher.videoSenders.browser.replaceTrack(nextBrowser).catch(() => void 0);
  }
  const nextMic = whipLiveAudioTrack(micStream, layerEnabled.mic && !micMuted);
  const nextDesktop = whipLiveAudioTrack(
    desktopAudioStream,
    !desktopAudioMuted
  );
  const nextGame = whipLiveAudioTrack(gameAudioStream, !gameAudioMuted);
  const { audioSenders } = whipPublisher;
  if (audioSenders.mic) void audioSenders.mic.replaceTrack(nextMic).catch(() => void 0);
  if (audioSenders.desktop) {
    void audioSenders.desktop.replaceTrack(nextDesktop).catch(() => void 0);
  }
  if (audioSenders.game) void audioSenders.game.replaceTrack(nextGame).catch(() => void 0);
}
async function handlePhoneVideoAvailable() {
  const camBefore = cameraSelect.value;
  if (camBefore && camBefore !== PHONE_CAMERA_DEVICE_VALUE) {
    pcCameraBeforePhone = camBefore;
  }
  await refreshAvDevices({ video: true, audio: false });
  const shouldUsePhone = preferPhoneCamera || camBefore === PHONE_CAMERA_DEVICE_VALUE || !camBefore;
  if (shouldUsePhone) {
    preferPhoneCamera = true;
    cameraSelect.value = PHONE_CAMERA_DEVICE_VALUE;
    lastCameraSelectValue = PHONE_CAMERA_DEVICE_VALUE;
    await applyCamera();
  }
}
async function handlePhoneAudioAvailable() {
  const micBefore = micSelect.value;
  if (micBefore && micBefore !== PHONE_MIC_DEVICE_VALUE) {
    pcMicBeforePhone = micBefore;
  }
  await refreshAvDevices({ audio: true });
}
async function handlePhoneVideoLost() {
  const onPhoneCam = cameraSelect.value === PHONE_CAMERA_DEVICE_VALUE;
  await refreshAvDevices({ video: true });
  if (!onPhoneCam) {
    if (preferPhoneCamera) {
      await applyCamera();
      syncWhipAvTracks();
    }
    return;
  }
  const restore = pcCameraBeforePhone;
  const canRestore = Boolean(restore) && [...cameraSelect.options].some((o) => o.value === restore);
  if (canRestore) {
    preferPhoneCamera = false;
    cameraSelect.value = restore;
  } else {
    preferPhoneCamera = true;
    const phoneInList = [...cameraSelect.options].some(
      (o) => o.value === PHONE_CAMERA_DEVICE_VALUE
    );
    cameraSelect.value = phoneInList ? PHONE_CAMERA_DEVICE_VALUE : "";
  }
  lastCameraSelectValue = cameraSelect.value;
  if (cameraSelect.value) {
    await applyCamera();
  } else {
    showWebcamOfflineIdle();
  }
  syncWhipAvTracks();
  if (isSessionLive()) void pushSceneLayout();
}
async function handlePhoneAudioLost() {
  const onPhoneMic = micSelect.value === PHONE_MIC_DEVICE_VALUE;
  await refreshAvDevices({ audio: true });
  if (!onPhoneMic) return;
  const restore = pcMicBeforePhone;
  micSelect.value = restore && [...micSelect.options].some((o) => o.value === restore) ? restore : "";
  lastMicSelectValue = micSelect.value;
  await applyMic();
  syncWhipAvTracks();
  if (isSessionLive()) void pushSceneLayout();
}
function bindMicStream(stream) {
  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      if (micStream !== stream) return;
      void handleMicTrackLost();
    };
  }
}
async function handleMicTrackLost() {
  const onPhoneMic = micSelect.value === PHONE_MIC_DEVICE_VALUE;
  releaseMicStream();
  await refreshAvDevices({ audio: true }).catch(() => void 0);
  if (onPhoneMic) {
    await handlePhoneAudioLost();
    return;
  }
  const restore = pcMicBeforePhone;
  micSelect.value = restore && [...micSelect.options].some((o) => o.value === restore) ? restore : "";
  lastMicSelectValue = micSelect.value;
  if (micSelect.value) {
    await applyMic();
  } else {
    layerMic.dataset.active = "0";
    layerMic.textContent = "Mic — off";
    syncLayerTracks();
    syncWhipAvTracks();
  }
}
function finishCameraApply(label) {
  layerCam.dataset.active = "1";
  layerEnabled.cam = true;
  syncLayerTracks();
  syncWebcamPresentation(label);
  void pushSceneLayout();
  syncWhipAvTracks();
}
function showWebcamOfflineIdle() {
  layerCam.dataset.active = layerEnabled.cam ? "1" : "0";
  layerCam.textContent = layerEnabled.cam ? "Webcam — offline" : "Webcam — off";
  syncLayerTracks();
  syncWebcamPresentation();
  void pushSceneLayout();
  syncWhipAvTracks();
}
async function applyCamera() {
  releaseCameraStream();
  cameraStream = null;
  const deviceId = cameraSelect.value;
  if (!deviceId) {
    preferPhoneCamera = false;
    showWebcamOfflineIdle();
    return;
  }
  if (deviceId === PHONE_CAMERA_DEVICE_VALUE) {
    preferPhoneCamera = true;
    const phoneVideo = getPhoneTracksSnapshot().videoTrack;
    if (!phoneVideo || phoneVideo.readyState !== "live") {
      showWebcamOfflineIdle();
      return;
    }
    cameraStream = new MediaStream([phoneVideo]);
    finishCameraApply("Webcam — Phone");
    return;
  }
  preferPhoneCamera = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    cameraStream = stream;
    finishCameraApply(
      `Webcam — ${cameraSelect.selectedOptions[0]?.textContent ?? "on"}`
    );
  } catch {
    showWebcamOfflineIdle();
  }
}
function rememberPreferredMic(deviceId) {
  if (deviceId === PHONE_MIC_DEVICE_VALUE) return;
  micSelect.dataset.preferredMic = deviceId;
  void window.maka.setSettings({ preferredMicDeviceId: deviceId });
}
async function applyMic() {
  releaseMicStream();
  stopMicMeter();
  layerMic.dataset.active = "0";
  layerMic.textContent = "Mic — off";
  micMuted = false;
  const deviceId = micSelect.value;
  if (!deviceId) return;
  try {
    if (deviceId === PHONE_MIC_DEVICE_VALUE) {
      const phoneAudio = getPhoneTracksSnapshot().audioTrack;
      if (!phoneAudio || phoneAudio.readyState !== "live") {
        throw new Error("Phone microphone not available");
      }
      micStream = new MediaStream([phoneAudio]);
      bindMicStream(micStream);
      layerMic.dataset.active = "1";
      layerMic.textContent = "Mic — Phone";
      startMicMeter(micStream);
      syncLayerTracks();
      syncWhipAvTracks();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false
    });
    micStream = stream;
    bindMicStream(stream);
    layerMic.dataset.active = "1";
    layerMic.textContent = `Mic — ${micSelect.selectedOptions[0]?.textContent ?? "on"}`;
    startMicMeter(stream);
    syncLayerTracks();
    syncWhipAvTracks();
  } catch (err) {
    layerMic.textContent = err instanceof Error ? `Mic — ${err.message}` : "Mic — failed";
    stopMicMeter();
  }
}
function toggleMicMute() {
  if (!micStream) return;
  micMuted = !micMuted;
  for (const track of micStream.getAudioTracks()) {
    track.enabled = !micMuted;
  }
  const label = micSelect.selectedOptions[0]?.textContent ?? "on";
  layerMic.textContent = micMuted ? `Mic — muted (${label})` : `Mic — ${label}`;
  syncWhipAvTracks();
  updateStudioMixControls();
}
async function dispatchAddonLiveEvents(event) {
  try {
    const results = await window.maka.dispatchAddonLiveEvent(event, {
      profile: selectedProfile(),
      platforms: {
        twitch: destTwitch.checked,
        youtube: destYoutube.checked,
        custom: destCustom.checked
      }
    });
    const notable = results.filter((r) => r.message && r.message !== "No webhook configured — skipped");
    if (notable.length) {
      const summary = notable.map((r) => r.message).filter(Boolean).join(" · ");
      if (summary) {
        destHint.textContent = summary;
      }
    }
  } catch {
  }
}
function mountRetryConnectionHint(fatal) {
  destHint.replaceChildren();
  if (fatal) {
    destHint.append("Ingest rejected — auto-retry stopped. ");
  } else {
    destHint.append(`Reconnect failed after ${MAX_LIVE_RETRY_ATTEMPTS} attempts. `);
  }
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "hint-action";
  retry.textContent = "Retry connection";
  retry.addEventListener("click", () => {
    if (!sessionLiveIntent) return;
    liveRecoveryExhausted = false;
    liveRecoveryFatal = false;
    liveRecoveryAttempts = 0;
    liveRecoveryReason = "manual-retry";
    setDestError(null);
    void runLiveRecovery("manual-retry");
  });
  destHint.append(retry);
  destHint.append(" or End Stream to stop.");
}
async function endLive() {
  goingLive = true;
  btnGoLive.disabled = true;
  setGoLiveButtonLabel("Ending…");
  setDestError(null);
  sessionLiveIntent = false;
  stopPlatformViewerPoll();
  stopWhipVideoWatchdog();
  clearWhipStreamMetrics();
  cancelLiveRecovery();
  liveRecoveryAttempts = 0;
  liveRecoveryExhausted = false;
  liveRecoveryFatal = false;
  liveRecoveryReason = null;
  sessionIngestTarget = "primary";
  resetEncodeAdaptSession();
  try {
    if (whipPublisher) {
      await whipPublisher.close();
      whipPublisher = null;
    }
    const snapshot = await window.maka.getRelay();
    await stopRelayStream(snapshot.health);
    await window.maka.refreshRelay();
    await dispatchAddonLiveEvents("live.end");
  } catch (err) {
    setDestError(err instanceof Error ? err.message : String(err));
  } finally {
    goingLive = false;
    btnGoLive.disabled = false;
    btnGoLive.dataset.live = "0";
    setGoLiveButtonLabel("Go Live");
  }
}
async function goLive() {
  goingLive = true;
  btnGoLive.disabled = true;
  setGoLiveButtonLabel("Starting…");
  setDestError(null);
  try {
    if (!captureReadyForGoLive()) {
      throw new Error(goLiveCaptureError());
    }
    const twitch = destTwitch.checked ? twitchKey.value : "";
    const youtube = destYoutube.checked ? youtubeKey.value : "";
    const customUrl = destCustom.checked ? customRtmpUrl.value.trim() : "";
    const customKey = destCustom.checked ? customRtmpKey.value.trim() : "";
    if (!labMode) {
      const keysOk = validateRelayStreamKeys({
        twitchKey: twitch,
        youtubeKey: youtube,
        customRtmpUrl: customUrl,
        customRtmpKey: customKey,
        customEnabled: destCustom.checked
      });
      if (!keysOk.ok) throw new Error(keysOk.message);
    } else if (!twitch && !youtube && !(destCustom.checked && customUrl && customKey)) {
      throw new Error("Demo mode still needs a placeholder key in at least one destination.");
    }
    if (destCustom.checked && customUrl && customKey) {
      await persistCustomRtmpSettings();
    }
    let snapshot = await ensureRelayReadyForLive();
    await persistStreamMetaFromInputs();
    const profile = selectedProfile();
    sessionIngestTarget = "primary";
    const health = snapshot.health;
    await postRelayConfig(health, relayConfigForIngest("primary"));
    await postSceneLayout(
      health,
      defaultSceneLayout({
        profile,
        hasWebcam: hasLiveWebcamVideo() && layerEnabled.cam,
        hasBrowser: Boolean(browserStream) && layerEnabled.browser
      })
    );
    await pushSceneLayout();
    snapshot = await snapshotWithReachableRelay();
    destHint.textContent = "Publishing WHIP to local relay…";
    liveRecoveryAttempts = 0;
    liveRecoveryExhausted = false;
    liveRecoveryReason = null;
    resetEncodeAdaptSession();
    sessionLiveIntent = true;
    whipPublisher = await attachWhipPublisher(await refreshRelayHealthForWhip());
    syncWhipAvTracks();
    await window.maka.refreshRelay();
    await dispatchAddonLiveEvents("live.start");
    destHint.textContent = "Live — keys stay in relay RAM. End Stream to tear down WHIP.";
    startPlatformViewerPoll();
    btnGoLive.dataset.live = "1";
    setGoLiveButtonLabel("End Stream");
  } catch (err) {
    sessionLiveIntent = false;
    stopPlatformViewerPoll();
    const message = err instanceof Error ? err.message : String(err);
    setDestError(message);
    stopWhipVideoWatchdog();
    clearWhipStreamMetrics();
    if (whipPublisher) {
      await whipPublisher.close().catch(() => void 0);
      whipPublisher = null;
    }
    btnGoLive.dataset.live = "0";
    setGoLiveButtonLabel("Go Live");
    throw err instanceof Error ? err : new Error(message);
  } finally {
    goingLive = false;
    btnGoLive.disabled = false;
  }
}
let openGoLiveFlow = () => {
  void goLive();
};
async function onGoLiveClick() {
  if (isSessionLive()) {
    await endLive();
    return;
  }
  openGoLiveFlow();
}
async function verifyStreamKeys() {
  try {
    const twitch = destTwitch.checked ? twitchKey.value : "";
    const youtube = destYoutube.checked ? youtubeKey.value : "";
    const customUrl = destCustom.checked ? customRtmpUrl.value.trim() : "";
    const customKey = destCustom.checked ? customRtmpKey.value.trim() : "";
    const keysOk = validateRelayStreamKeys({
      twitchKey: twitch,
      youtubeKey: youtube,
      customRtmpUrl: customUrl,
      customRtmpKey: customKey,
      customEnabled: destCustom.checked
    });
    if (!keysOk.ok) throw new Error(keysOk.message);
    const snapshot = await ensureRelayReadyForLive();
    const config = relayConfigForIngest("primary");
    const health = snapshot.health;
    await postRelayConfig(health, config);
    const result = await verifyRelayConfig(health, config);
    if (!result.ok) {
      const parts = [
        result.message,
        result.twitch && !result.twitch.ok ? `Twitch: ${result.twitch.message ?? "failed"}` : null,
        result.youtube && !result.youtube.ok ? `YouTube: ${result.youtube.message ?? "failed"}` : null,
        result.custom && !result.custom.ok ? `Custom RTMP: ${result.custom.message ?? "failed"}` : null
      ].filter(Boolean);
      throw new Error(parts.join("\n") || "Verification failed");
    }
    return { ok: true, message: result.message ?? "Keys look good." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
async function onVerifyKeys() {
  setDestError(null);
  destHint.textContent = "Verifying…";
  const result = await verifyStreamKeys();
  if (result.ok) {
    destHint.textContent = result.message;
    setDestError(null);
  } else {
    setDestError(result.message);
    destHint.textContent = "Keys stay in relay RAM only. Go Live publishes WHIP to localhost — not OBS.";
  }
}
document.getElementById("btn-refresh-sources").addEventListener("click", () => {
  void refreshSources();
});
document.getElementById("btn-capture-browse").addEventListener("click", () => {
  void selectBrowseTabSource();
});
document.getElementById("btn-start-relay").addEventListener("click", () => {
  void window.maka.startRelay();
});
document.getElementById("btn-stop-relay").addEventListener("click", () => {
  void window.maka.stopRelay();
});
document.getElementById("btn-reveal-relay").addEventListener("click", () => {
  void window.maka.revealRelay();
});
document.getElementById("btn-win-min").addEventListener("click", () => {
  void window.maka.windowMinimize();
});
document.getElementById("btn-win-max").addEventListener("click", () => {
  void window.maka.windowMaximize();
});
document.getElementById("btn-win-close").addEventListener("click", () => {
  void window.maka.windowClose();
});
const settingsView = initSettingsView(window.maka, {
  onLabModeChange: (nextLab) => {
    labMode = nextLab;
    destHint.textContent = labMode ? "Demo mode on — key format checks skipped (for testing and walkthroughs)." : "Keys stay in relay RAM only. Go Live publishes WHIP to localhost.";
  },
  onEncodeProfileChange: (id) => onEncodeProfileChanged(id, "user"),
  onAdaptiveEncodeChange: (enabled) => {
    adaptiveEncodeEnabled = enabled;
    if (enabled) encodeAdaptUserHold = false;
    encodeAdaptState = emptyEncodeAdaptState();
  },
  onRelayStudioSettingsChange: () => {
    void window.maka.getSettings().then((s) => {
      applyRelayStudioSettingsFromAppSettings(s);
      void repostRelayConfigIfLive();
    });
  },
  onRecordingFolderChange: (folder) => {
    recordingSaveFolder = folder;
    syncRecordingButtonHint();
  },
  onReplaySetup: () => {
    void window.maka.exitSettingsMode().then(() => {
      window.setTimeout(() => setupWizard.start(), 200);
    });
  },
  onReplayTour: () => {
    void window.maka.exitSettingsMode().then(() => {
      window.setTimeout(() => onboardingTour.start(), 200);
    });
  },
  onCheckUpdates: () => {
    void window.maka.checkForUpdates().then(renderUpdateBanner);
  }
});
btnSettings.addEventListener("click", () => {
  if (currentMode === "settings") {
    void window.maka.exitSettingsMode();
    return;
  }
  void settingsView.open().then(() => {
    void window.maka.setMode("settings");
  });
});
camScale.addEventListener("input", () => {
  updateProgramCamOverlay();
});
camScale.addEventListener("change", () => {
  updateProgramCamOverlay();
  void pushSceneLayout();
});
function toggleWebcamLayer() {
  layerEnabled.cam = !layerEnabled.cam;
  syncLayerTracks();
  void pushSceneLayout();
}
function toggleMicLayer() {
  layerEnabled.mic = !layerEnabled.mic;
  if (!layerEnabled.mic) {
    micMuted = false;
  }
  syncLayerTracks();
  void pushSceneLayout();
}
toggleWebcam.addEventListener("click", () => {
  toggleWebcamLayer();
});
toggleMic.addEventListener("click", () => {
  toggleMicLayer();
});
function onSourceMenuActivate(kind, event) {
  event.preventDefault();
  event.stopPropagation();
  toggleSourcePicker(kind);
}
for (const kind of SOURCE_KINDS) {
  const menu = sourceMenuEl(kind);
  menu?.addEventListener("click", (event) => onSourceMenuActivate(kind, event));
  menu?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    onSourceMenuActivate(kind, event);
  });
  sourceToggleEls[kind].addEventListener("click", (event) => {
    if (event.target.closest("[data-source-menu]")) return;
    if (kind === "mic") {
      toggleMicLayer();
      return;
    }
    toggleLayerForSourceKind(kind);
  });
}
const micMixerSettingsBtn = document.querySelector(
  "#audio-mic .audio-channel-settings"
);
micMixerSettingsBtn?.addEventListener("click", () => {
  if (!expandedSourceKinds.has("mic")) {
    toggleSourcePicker("mic");
  }
  studioSourceMic.scrollIntoView({ block: "nearest", behavior: "smooth" });
});
async function renderAddonPanels() {
  const panels = await window.maka.listAddonPanels();
  const preloadPath = await window.maka.getAddonPreloadPath();
  const hasCustomRtmp = panels.some((p) => p.addonId === CUSTOM_RTM_ADDON_ID);
  syncCustomRtmpBlock(hasCustomRtmp);
  if (hasCustomRtmp) {
    await loadCustomRtmpSettings();
    syncDestinationInputs();
  }
  addonPanels.innerHTML = "";
  if (!panels.length) {
    addonPanels.innerHTML = '<p class="hint">No addons loaded.</p>';
    return;
  }
  for (const panel of panels) {
    const section = document.createElement("section");
    section.className = "addon-panel";
    section.innerHTML = `<h3>${escapeHtml(panel.title)}</h3>`;
    if (panel.description) {
      const p = document.createElement("p");
      p.className = "hint tight";
      p.textContent = panel.description;
      section.appendChild(p);
    }
    if (panel.runtimeUrl) {
      const webview = document.createElement("webview");
      webview.className = "addon-webview";
      webview.src = panel.runtimeUrl;
      if (preloadPath) webview.preload = preloadPath;
      webview.partition = `persist:addon-${panel.addonId}`;
      webview.setAttribute(
        "webpreferences",
        "contextIsolation=yes,nodeIntegration=no,sandbox=yes"
      );
      section.appendChild(webview);
    }
    if (panel.actions.length) {
      const list = document.createElement("div");
      list.className = "addon-actions";
      for (const action of panel.actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = action.label;
        if (action.description) btn.title = action.description;
        btn.addEventListener("click", () => {
          void runAddonAction(panel.addonId, action.id);
        });
        list.appendChild(btn);
      }
      section.appendChild(list);
    }
    addonPanels.appendChild(section);
  }
}
async function runAddonAction(addonId, actionId) {
  if (addonId === "com.maka.discord-now-live" && actionId === "configure-webhook") {
    const url = window.prompt(
      "Discord channel webhook URL (https://discord.com/api/webhooks/…)",
      ""
    );
    if (!url?.trim()) return;
    const res = await window.maka.setAddonSettings(addonId, { discordWebhookUrl: url.trim() });
    destHint.textContent = res.message ?? (res.ok ? "Webhook saved." : "Save failed.");
    if (!res.ok) setDestError(res.message ?? "Could not save webhook");
    return;
  }
  if (addonId === CUSTOM_RTM_ADDON_ID && actionId === "configure-kick") {
    customRtmpUrl.value = KICK_RTMP_URL;
    destCustom.checked = true;
    syncDestinationInputs();
    const res = await window.maka.setAddonSettings(addonId, { customRtmpUrl: KICK_RTMP_URL });
    destHint.textContent = res.ok ? "Kick ingest URL set — paste your stream key in Destinations → Custom RTMP." : res.message ?? "Could not save preset";
    return;
  }
  if (addonId === CUSTOM_RTM_ADDON_ID && actionId === "configure-rtmp") {
    const url = window.prompt("RTMP ingest URL (rtmps://…/app)", customRtmpUrl.value || KICK_RTMP_URL);
    if (!url?.trim()) return;
    const key = window.prompt("Stream key");
    if (!key?.trim()) return;
    customRtmpUrl.value = url.trim();
    customRtmpKey.value = key.trim();
    destCustom.checked = true;
    syncDestinationInputs();
    const res = await window.maka.setAddonSettings(addonId, {
      customRtmpUrl: url.trim(),
      customRtmpKey: key.trim()
    });
    destHint.textContent = res.message ?? (res.ok ? "Custom RTMP saved." : "Save failed.");
    if (!res.ok) setDestError(res.message ?? "Could not save RTMP settings");
    return;
  }
  const snapshot = await window.maka.getRelay();
  const result = await window.maka.runAddonAction(addonId, actionId, {
    profile: selectedProfile(),
    hasWebcam: hasLiveWebcamVideo() && layerEnabled.cam
  });
  if (!result.ok) {
    setDestError(result.message ?? "Addon action failed");
    return;
  }
  if (result.sceneLayout && snapshot.health) {
    await postSceneLayout(snapshot.health, result.sceneLayout);
    destHint.textContent = result.message ?? "Scene updated.";
    setDestError(null);
  } else if (result.message) {
    destHint.textContent = result.message;
  }
}
document.getElementById("btn-verify").addEventListener("click", () => {
  void runVerification();
});
document.getElementById("btn-toggle-diag").addEventListener("click", () => {
  diagDrawer.hidden = !diagDrawer.hidden;
  if (!diagDrawer.hidden) {
    void refreshDiagnostics();
  }
});
document.getElementById("btn-verify-keys").addEventListener("click", () => {
  void onVerifyKeys();
});
for (const el of [backupRtmpUrl, backupRtmpKey]) {
  el.addEventListener("change", () => {
    void persistBackupIngest();
  });
}
programQualitySelect.addEventListener("change", () => {
  onEncodeProfileChanged(normalizeEncodeProfileId(programQualitySelect.value));
});
platTwitch.addEventListener("click", () => {
  openPlatformKeyDialog("twitch");
});
platYoutube.addEventListener("click", () => {
  openPlatformKeyDialog("youtube");
});
platformKeyForm.addEventListener("submit", (event) => {
  const submitter = event.submitter;
  if (submitter?.value !== "save") return;
  const platform = platformKeyPanelYoutube.hidden ? "twitch" : "youtube";
  void savePlatformCredentials(platform).then(() => window.maka.getRelay().then(renderPlatformStatus));
});
async function teardownLiveSession() {
  try {
    stopWhipVideoWatchdog();
    clearWhipStreamMetrics();
    if (whipPublisher) {
      await whipPublisher.close().catch(() => void 0);
      whipPublisher = null;
    }
    const snapshot = await window.maka.getRelay();
    if (snapshot.health && snapshot.lifecycle === "live") {
      await stopRelayStream(snapshot.health).catch(() => void 0);
    }
    sessionLiveIntent = false;
    stopPlatformViewerPoll();
    cancelLiveRecovery();
    liveRecoveryAttempts = 0;
    liveRecoveryExhausted = false;
    stopStream(programStream);
    programStream = null;
    captureKind = null;
    await window.maka.setBrowseCaptureActive(false);
    stopStream(cameraStream);
    cameraStream = null;
    stopStream(micStream);
    micStream = null;
    void refreshGameAudioCapture();
  } catch (err) {
    console.error("teardownLiveSession", err);
  }
}
window.maka.onPrepareQuit(() => {
  if (programVirtualCamera.isActive()) {
    programVirtualCamera.stop();
    setVcamUi(false);
  }
  if (programRecording.isRecording()) {
    void programRecording.stop().finally(() => {
      programOutputCompositor.stop();
    });
  } else {
    programOutputCompositor.stop();
  }
  void teardownLiveSession().finally(() => {
    window.maka.ackPrepareQuit();
  });
});
window.maka.onTabs(() => {
  void refreshSources();
});
void window.maka.getSettings().then((s) => {
  labMode = s.labMode;
  adaptiveEncodeEnabled = s.adaptiveEncode !== false;
  recordingSaveFolder = s.recordingSaveFolder ?? "";
  lastStreamPlatform = s.lastStreamPlatform ?? "none";
  applyRelayStudioSettingsFromAppSettings(s);
  syncRecordingButtonHint();
  const profile = normalizeEncodeProfileId(s.bitrateProfile);
  syncEncodeProfileSelects(profile);
  updateProgramStats();
  Object.assign(sceneImagePaths, s.sceneImages ?? {});
  customScenes = coerceCustomScenes(s.customScenes ?? []);
  if (s.streamDestinations) {
    applyStreamDestinations(s.streamDestinations);
  }
  renderCustomSceneRows();
  syncAddSceneButtons();
  syncSceneImagePanel();
  syncSceneProgramPresentation();
  refreshProgramPreviewLayout();
  if (s.preferredMicDeviceId) {
    micSelect.dataset.preferredMic = s.preferredMicDeviceId;
  }
  preferredDesktopOutputDeviceId = s.preferredDesktopAudioOutputDeviceId ?? "";
  void loadCustomRtmpSettings();
  if (systemAudioCaptureSupported(capturePlatform)) {
    void refreshDesktopAudioOutputDevices().then(() => refreshDesktopAudioCapture());
  }
});
function formatDiag(events) {
  if (!events.length) return "No diagnostics yet.";
  return events.slice().reverse().slice(0, 40).map((e) => {
    const time = e.at.slice(11, 19);
    const stack = e.stack ? `
${e.stack}` : "";
    return `[${time}] ${e.level.toUpperCase()} ${e.source}
${e.message}${stack}`;
  }).join("\n\n");
}
async function refreshDiagnostics() {
  const events = await window.maka.listDiagnostics();
  diagDrawer.textContent = formatDiag(events);
  diagDrawer.dataset.fail = events.some((e) => e.level === "error" || e.level === "fatal") ? "1" : "0";
}
async function runVerification() {
  diagDrawer.hidden = false;
  diagDrawer.textContent = "Running verification…";
  const report = await window.maka.verifySystem();
  const lines = report.checks.map((c) => `${c.ok ? "OK " : "FAIL"}  ${c.name} — ${c.detail}`);
  lines.unshift(report.ok ? "Verification PASSED" : "Verification FAILED");
  lines.push("", "Recent diagnostics:", formatDiag(report.diagnostics));
  diagDrawer.textContent = lines.join("\n");
  diagDrawer.dataset.fail = report.ok ? "0" : "1";
  if (!report.ok) {
    setDestError("System verification failed — see Diagnostics.");
  }
}
window.maka.onDiagnostic((event) => {
  if (event.level === "error" || event.level === "fatal") {
    diagDrawer.hidden = false;
  }
  if (!diagDrawer.hidden) {
    void refreshDiagnostics();
  }
});
window.addEventListener("error", (event) => {
  diagDrawer.hidden = false;
  diagDrawer.dataset.fail = "1";
  diagDrawer.textContent = `Renderer error
${event.message}
${event.filename}:${event.lineno}
${event.error?.stack ?? ""}`;
});
window.addEventListener("unhandledrejection", (event) => {
  diagDrawer.hidden = false;
  diagDrawer.dataset.fail = "1";
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : "";
  diagDrawer.textContent = `Unhandled rejection
${message}
${stack ?? ""}`;
});
document.getElementById("btn-toggle-log").addEventListener("click", () => {
  ffmpegLog.hidden = !ffmpegLog.hidden;
});
let lastCameraSelectValue = cameraSelect.value;
let lastMicSelectValue = micSelect.value;
cameraSelect.addEventListener("change", () => {
  const prev = lastCameraSelectValue;
  lastCameraSelectValue = cameraSelect.value;
  if (prev && prev !== PHONE_CAMERA_DEVICE_VALUE && cameraSelect.value === PHONE_CAMERA_DEVICE_VALUE) {
    pcCameraBeforePhone = prev;
  }
  if (cameraSelect.value === PHONE_CAMERA_DEVICE_VALUE) {
    preferPhoneCamera = true;
  } else if (cameraSelect.value) {
    preferPhoneCamera = false;
  }
  void applyCamera();
});
micSelect.addEventListener("change", () => {
  const prev = lastMicSelectValue;
  lastMicSelectValue = micSelect.value;
  rememberPreferredMic(micSelect.value);
  if (prev && prev !== PHONE_MIC_DEVICE_VALUE && micSelect.value === PHONE_MIC_DEVICE_VALUE) {
    pcMicBeforePhone = prev;
  }
  void applyMic();
});
destTwitch.addEventListener("change", () => {
  syncDestinationInputs();
  void window.maka.getRelay().then(renderPlatformStatus);
});
destYoutube.addEventListener("change", () => {
  syncDestinationInputs();
  void window.maka.getRelay().then(renderPlatformStatus);
});
destCustom.addEventListener("change", () => {
  syncDestinationInputs();
  void window.maka.getRelay().then(renderPlatformStatus);
});
twitchKey.addEventListener("input", () => {
  void window.maka.getRelay().then(renderPlatformStatus);
});
youtubeKey.addEventListener("input", () => {
  void window.maka.getRelay().then(renderPlatformStatus);
});
customRtmpKey.addEventListener("input", () => {
  void window.maka.getRelay().then(renderPlatformStatus);
});
btnGoLive.addEventListener("click", () => {
  void onGoLiveClick();
});
window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
    return;
  }
  if (event.key === "F8" || event.ctrlKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    void onGoLiveClick();
  }
  if (event.key === "F9" || event.ctrlKey && event.key.toLowerCase() === "m") {
    event.preventDefault();
    toggleMicMute();
  }
});
window.maka.onMode(applyMode);
syncDestinationInputs();
syncProgramVideoSurface();
updateStudioMixControls();
void window.maka.getMode().then(applyMode);
void settingsView.refreshVersions();
window.maka.onRelayUpdate(handleRelayLiveRecovery);
void refreshSources();
void refreshAvDevices().then(() => {
  showWebcamOfflineIdle();
});
void renderAddonPanels();
initPhoneTracks(window.maka);
subscribePhoneTracks((snap) => {
  const hasVideo = phoneHasVideoTrack(snap);
  const hasAudio = phoneHasAudioTrack(snap);
  if (hasVideo && !phoneVideoWasLive) void handlePhoneVideoAvailable();
  else if (!hasVideo && phoneVideoWasLive) void handlePhoneVideoLost();
  if (hasAudio && !phoneAudioWasLive) void handlePhoneAudioAvailable();
  else if (!hasAudio && phoneAudioWasLive) void handlePhoneAudioLost();
  if (hasVideo || hasAudio) {
    void refreshAvDevices({ video: hasVideo, audio: hasAudio });
  }
  phoneVideoWasLive = hasVideo;
  phoneAudioWasLive = hasAudio;
});
window.maka.onAddonStudioToast((message) => {
  setDestError(null);
  destHint.textContent = message;
});
const onboardingTour = new OnboardingTour(
  document.getElementById("onboarding-root"),
  document.getElementById("onboarding-spotlight"),
  document.querySelector(".onboarding-card"),
  document.getElementById("onboarding-step"),
  document.getElementById("onboarding-title"),
  document.getElementById("onboarding-body"),
  document.getElementById("onboarding-prev"),
  document.getElementById("onboarding-next"),
  document.getElementById("onboarding-skip"),
  {
    onComplete: () => {
      void window.maka.setSettings({ onboardingComplete: true });
    },
    onSkip: () => {
      void window.maka.setSettings({ onboardingComplete: true });
    }
  }
);
const setupWizard = new SetupWizard(
  document.getElementById("setup-wizard-root"),
  document.getElementById("setup-wizard-step"),
  document.getElementById("setup-wizard-title"),
  document.getElementById("setup-wizard-body"),
  document.getElementById("setup-wizard-status"),
  document.getElementById("setup-wizard-keys"),
  document.getElementById("setup-twitch-key"),
  document.getElementById("setup-youtube-key"),
  document.getElementById("setup-wizard-prev"),
  document.getElementById("setup-wizard-next"),
  document.getElementById("setup-wizard-skip"),
  {
    onComplete: () => {
      const setupTwitch = document.getElementById("setup-twitch-key");
      const setupYoutube = document.getElementById("setup-youtube-key");
      if (setupTwitch.value.trim()) twitchKey.value = setupTwitch.value.trim();
      if (setupYoutube.value.trim()) youtubeKey.value = setupYoutube.value.trim();
      syncDestinationInputs();
      void window.maka.setSettings({ setupWizardComplete: true }).then((s) => {
        if (!s.onboardingComplete) {
          window.setTimeout(() => onboardingTour.start(), 400);
        }
      });
    },
    onSkip: () => {
      void window.maka.setSettings({ setupWizardComplete: true });
    }
  }
);
const updateBanner = document.getElementById("update-banner");
const updateBannerText = document.getElementById("update-banner-text");
const updateBannerAction = document.getElementById("update-banner-action");
const updateBannerDismiss = document.getElementById("update-banner-dismiss");
function renderUpdateBanner(status) {
  const showBanner = status.state === "checking" || status.state === "available" || status.state === "downloading" || status.state === "downloaded" || status.state === "error";
  if (!showBanner) {
    updateBanner.hidden = true;
    updateBanner.classList.add("hidden");
    document.body.classList.remove("update-banner-visible");
    return;
  }
  updateBanner.hidden = false;
  updateBanner.classList.remove("hidden");
  document.body.classList.add("update-banner-visible");
  updateBannerAction.hidden = false;
  updateBannerDismiss.hidden = false;
  if (status.state === "checking") {
    updateBannerText.textContent = "Checking for updates…";
    updateBannerAction.hidden = true;
  } else if (status.state === "available") {
    updateBannerText.textContent = `Update available${status.version ? `: v${status.version}` : ""}`;
    updateBannerAction.textContent = "Download";
    updateBannerAction.disabled = false;
  } else if (status.state === "downloading") {
    const pct = status.progress != null ? `${Math.round(status.progress)}%` : "…";
    updateBannerText.textContent = `Downloading update ${pct}`;
    updateBannerAction.hidden = true;
  } else if (status.state === "downloaded") {
    updateBannerText.textContent = `Update ready${status.version ? ` — v${status.version}` : ""}. Restart to install.`;
    updateBannerAction.textContent = "Restart now";
    updateBannerAction.hidden = false;
    updateBannerAction.disabled = false;
  } else if (status.state === "error") {
    updateBannerText.textContent = status.message ?? "Update check failed";
    updateBannerAction.hidden = true;
  }
}
updateBannerAction.addEventListener("click", () => {
  void window.maka.getUpdateStatus().then(async (status) => {
    if (status.state === "downloaded") {
      await window.maka.installUpdate();
      return;
    }
    if (status.state === "available") {
      await window.maka.downloadUpdate();
    }
  });
});
updateBannerDismiss.addEventListener("click", () => {
  updateBanner.hidden = true;
  updateBanner.classList.add("hidden");
});
window.maka.onUpdateStatus(renderUpdateBanner);
const appIntro = document.getElementById("app-intro");
document.body.dataset.intro = "1";
function enterStudioFromIntro() {
  appIntro.hidden = true;
  delete document.body.dataset.intro;
  void window.maka.getSettings().then((s) => {
    if (s.onboardingComplete) return;
    window.setTimeout(() => onboardingTour.start(), 200);
  });
}
document.getElementById("app-intro-stream").addEventListener("click", () => {
  enterStudioFromIntro();
});
document.getElementById("app-intro-github").addEventListener("click", () => {
  void window.maka.openExternal("https://github.com/n0social/maka-streaming-software/releases");
});
const sceneGameplay = document.getElementById("scene-gameplay");
const sceneStarting = document.getElementById("scene-starting");
const sceneChatting = document.getElementById("scene-chatting");
const sceneIntermission = document.getElementById("scene-intermission");
const sceneEnding = document.getElementById("scene-ending");
const btnAddSceneAlt = document.getElementById("btn-add-scene-alt");
document.getElementById("audio-mixer");
document.getElementById("stream-status");
document.getElementById("stream-info");
document.getElementById("program-stats");
const statDropped = document.getElementById("stat-dropped");
const statFps = document.getElementById("stat-fps");
const statLatency = document.getElementById("stat-latency");
const statBitrate = document.getElementById("stat-bitrate");
function highlightSceneSelection(sceneTemplate) {
  const buttons = document.querySelectorAll(".studio-list-item[data-scene]");
  for (const btn of buttons) {
    btn.dataset.active = btn.dataset.scene === sceneTemplate ? "1" : "0";
  }
}
function syncAddSceneButtons() {
  const atMax = customScenes.length >= MAX_CUSTOM_SCENES;
  const title = atMax ? `Maximum of ${MAX_CUSTOM_SCENES} custom scenes` : "Add scene";
  if (btnAddSceneAlt) {
    btnAddSceneAlt.disabled = atMax;
    btnAddSceneAlt.title = title;
  }
}
function renderCustomSceneRows() {
  studioScenesList.querySelectorAll("li[data-custom-scene-row]").forEach((row) => row.remove());
  for (const scene of customScenes) {
    const li = document.createElement("li");
    li.dataset.customSceneRow = "1";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "studio-list-item";
    btn.dataset.scene = scene.id;
    btn.dataset.active = activeSceneTemplateId === scene.id ? "1" : "0";
    const leading = document.createElement("span");
    leading.className = "studio-list-leading scene-icon";
    leading.setAttribute("aria-hidden", "true");
    leading.textContent = "▶️";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "studio-scene-name-input studio-list-text";
    nameInput.value = scene.name;
    nameInput.spellcheck = false;
    nameInput.setAttribute("aria-label", "Scene name");
    nameInput.title = "Double-click to rename";
    nameInput.addEventListener("click", (event) => event.stopPropagation());
    nameInput.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      nameInput.select();
    });
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        nameInput.blur();
      }
    });
    nameInput.addEventListener("blur", () => {
      void renameCustomScene(scene.id, nameInput.value);
    });
    const menu = document.createElement("span");
    menu.setAttribute("role", "button");
    menu.tabIndex = 0;
    menu.className = "studio-list-menu";
    menu.dataset.sceneMenu = scene.id;
    menu.setAttribute("aria-label", "Scene options");
    menu.title = "Scene options";
    menu.textContent = "⋯";
    btn.append(leading, nameInput, menu);
    btn.addEventListener("click", (event) => {
      if (event.target.closest("[data-scene-menu]")) return;
      void selectScene(scene.id);
    });
    li.append(btn);
    studioScenesList.insertBefore(li, studioAddSceneRow);
  }
}
async function persistCustomScenes(next) {
  customScenes = coerceCustomScenes(next);
  await window.maka.setSettings({ customScenes });
  renderCustomSceneRows();
  syncAddSceneButtons();
  syncSceneImagePanel();
}
async function renameCustomScene(sceneId, rawName) {
  if (!isCustomSceneId(sceneId)) return;
  const trimmed = rawName.trim().slice(0, 80) || defaultCustomSceneName(sceneId);
  const index = customScenes.findIndex((s) => s.id === sceneId);
  if (index < 0 || customScenes[index].name === trimmed) return;
  const next = customScenes.map((s) => s.id === sceneId ? { ...s, name: trimmed } : s);
  await persistCustomScenes(next);
}
async function addCustomScene() {
  const id = nextCustomSceneId(customScenes);
  if (!id) return;
  const next = [...customScenes, { id, name: defaultCustomSceneName(id) }];
  await persistCustomScenes(next);
  await selectScene(id);
  const input = studioScenesList.querySelector(
    `button[data-scene="${id}"] .studio-scene-name-input`
  );
  if (input) {
    input.focus();
    input.select();
  }
}
async function persistSceneImage(sceneId, filePath) {
  if (!sceneSupportsImageUpload(sceneId)) return;
  const previous = sceneImagePaths[sceneId];
  if (filePath) {
    sceneImagePaths[sceneId] = filePath;
  } else {
    delete sceneImagePaths[sceneId];
    if (previous) sceneImageDataUrlCache.delete(previous);
  }
  await window.maka.setSettings({
    sceneImages: { [sceneId]: filePath ?? "" }
  });
  if (sceneId === activeSceneTemplateId) {
    syncSceneProgramPresentation();
    refreshProgramPreviewLayout();
    if (isSessionLive()) {
      await pushSceneLayout().catch(() => void 0);
    }
  } else {
    syncSceneImagePanel();
  }
}
async function chooseSceneImage(sceneId) {
  if (!sceneSupportsImageUpload(sceneId)) return;
  const picked = await window.maka.pickSceneImageFile();
  if (picked.canceled) return;
  sceneImageDataUrlCache.set(picked.path, picked.dataUrl);
  await persistSceneImage(sceneId, picked.path);
}
async function selectScene(sceneTemplate) {
  activeSceneTemplateId = sceneTemplate;
  highlightSceneSelection(sceneTemplate);
  syncOverlaySourceRow();
  if (sceneTemplate === "gaming-cam") {
    layerEnabled.game = true;
    layerEnabled.cam = true;
  } else if (sceneTemplate === "desk-only" || isCustomSceneId(sceneTemplate)) {
    layerEnabled.game = false;
    layerEnabled.cam = true;
  } else if (isSceneStubId(sceneTemplate)) {
    layerEnabled.game = false;
    layerEnabled.cam = false;
  }
  syncLayerTracks();
  syncSceneProgramPresentation();
  refreshProgramPreviewLayout();
  if (isSessionLive()) {
    await pushSceneLayout().catch(() => void 0);
  }
}
function overlayPlatform() {
  if (lastStreamPlatform === "twitch" || lastStreamPlatform === "youtube") return lastStreamPlatform;
  if (destYoutube.checked && !destTwitch.checked) return "youtube";
  if (destTwitch.checked) return "twitch";
  return "none";
}
function presentStreamAlert(alert) {
  if (shownAlertIds.has(alert.id)) return;
  shownAlertIds.add(alert.id);
  streamAlertQueue.push(alert);
  if (streamAlertQueue.length === 1) playNextStreamAlert();
}
function playNextStreamAlert() {
  const alert = streamAlertQueue[0];
  if (!alert || alertBoxPageUrl(streamAlertBoxUrl)) {
    programAlert.hidden = true;
    if (!alertBoxPageUrl(streamAlertBoxUrl)) {
      programNotificationsSlot.dataset.alert = "0";
    }
    refreshProgramPreviewLayout();
    return;
  }
  const card = alertCard(alert);
  programAlertKicker.textContent = card.kicker;
  programAlertName.textContent = card.headline;
  programAlertAmount.textContent = "";
  programAlertMessage.textContent = card.detail;
  programAlert.hidden = false;
  programNotificationsSlot.dataset.alert = "1";
  layerEnabled.notifications = true;
  refreshProgramPreviewLayout();
  if (streamAlertTimer) clearTimeout(streamAlertTimer);
  streamAlertTimer = setTimeout(() => {
    streamAlertQueue.shift();
    playNextStreamAlert();
  }, ALERT_HOLD_MS);
}
function syncAlertBox() {
  const page = alertBoxPageUrl(streamAlertBoxUrl);
  if (!page) {
    programAlertBox.removeAttribute("src");
    programAlertBox.hidden = true;
    if (streamAlertQueue.length === 0) {
      programNotificationsSlot.hidden = true;
      programNotificationsSlot.dataset.alert = "0";
    }
    return;
  }
  if (programAlertBox.src !== page) programAlertBox.src = page;
  programAlertBox.hidden = false;
  programAlert.hidden = true;
  programNotificationsSlot.dataset.alert = "1";
  layerEnabled.notifications = true;
  refreshProgramPreviewLayout();
}
function twitchLoginForFeed() {
  if (overlayPlatform() !== "twitch") return "";
  const login = streamChannel.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{2,25}$/.test(login) ? login : "";
}
function clearTwitchChatLines() {
  programChatLines.replaceChildren();
}
function appendTwitchChatLine(line) {
  const item = document.createElement("p");
  item.className = "program-chat-line";
  const name = document.createElement("span");
  name.className = "program-chat-line-name";
  name.textContent = line.name;
  if (line.color) name.style.color = line.color;
  const body2 = document.createElement("span");
  body2.className = "program-chat-line-text";
  body2.textContent = line.message;
  item.append(name, document.createTextNode(": "), body2);
  programChatLines.append(item);
  while (programChatLines.childElementCount > TWITCH_CHAT_LIMIT) {
    programChatLines.firstElementChild?.remove();
  }
  programChatLines.hidden = false;
  programChatHint.hidden = true;
  programChatLines.scrollTop = programChatLines.scrollHeight;
}
function syncTwitchFeed() {
  const login = streamIncludeChat ? twitchLoginForFeed() : "";
  if (!login) {
    twitchAlertFeed?.stop();
    twitchAlertFeed = null;
    twitchFeedLogin = "";
    twitchChatStatus = "idle";
    clearTwitchChatLines();
    return;
  }
  if (twitchFeedLogin === login && twitchAlertFeed) return;
  twitchAlertFeed?.stop();
  clearTwitchChatLines();
  twitchFeedLogin = login;
  twitchChatStatus = "connecting";
  twitchAlertFeed = startTwitchChatFeed(login, {
    onAlert: (alert) => {
      if (alertBoxPageUrl(streamAlertBoxUrl)) return;
      presentStreamAlert(alert);
    },
    onChat: appendTwitchChatLine,
    onStatus: (status) => {
      if (twitchFeedLogin !== login) return;
      twitchChatStatus = status;
      paintChatFeed();
    }
  });
}
function syncPlatformAlerts() {
  syncAlertBox();
  syncTwitchFeed();
}
function paintIntermissionCard() {
  if (activeSceneTemplateId !== "intermission" || programSceneCard.hidden) return;
  const preset = sceneStubPreset("intermission");
  programSceneCardSubtitle.textContent = intermissionSubtitle(
    Date.now(),
    intermissionEndsAtMs,
    preset?.subtitle ?? "Short break — back shortly"
  );
}
function ensureIntermissionTimer() {
  if (intermissionTimer != null) return;
  intermissionTimer = setInterval(() => {
    paintIntermissionCard();
    if (intermissionEndsAtMs != null && Date.now() >= intermissionEndsAtMs) {
      intermissionEndsAtMs = null;
    }
  }, 250);
}
function startIntermissionTimer(minutes) {
  if (!isIntermissionMinutes(minutes)) return;
  intermissionEndsAtMs = intermissionEndsAt(Date.now(), minutes);
  ensureIntermissionTimer();
  void selectScene("intermission");
}
function stopIntermissionTimer() {
  intermissionEndsAtMs = null;
  paintIntermissionCard();
}
async function deleteCustomScene(sceneId) {
  if (!isCustomSceneId(sceneId)) return;
  const next = removeCustomScene(customScenes, sceneId);
  if (activeSceneTemplateId === sceneId) {
    await selectScene("gaming-cam");
  }
  await persistCustomScenes(next);
  if (sceneImagePaths[sceneId]) {
    await persistSceneImage(sceneId, null);
  }
}
function platformChatUrl() {
  return streamChatUrl(overlayPlatform(), streamChannel);
}
function paintChatFeed() {
  const login = twitchLoginForFeed();
  const twitch = streamIncludeChat && Boolean(login);
  if (twitch) {
    programChatView.removeAttribute("src");
    programChatView.hidden = true;
    const hasLines = programChatLines.childElementCount > 0;
    programChatLines.hidden = !hasLines;
    programChatHint.hidden = hasLines;
    programChatHint.textContent = twitchChatStatus === "open" ? "Waiting for the first message" : "Connecting to Twitch chat";
    programChatSlot.dataset.liveFeed = "1";
    programChatSlot.hidden = false;
    return;
  }
  programChatLines.hidden = true;
  const url = streamIncludeChat && overlayPlatform() === "youtube" ? platformChatUrl() : null;
  if (!url) {
    programChatView.removeAttribute("src");
    programChatView.hidden = true;
    programChatSlot.dataset.liveFeed = "0";
    programChatHint.hidden = false;
    programChatHint.textContent = overlayPlatform() === "youtube" ? "YouTube chat uses the link saved on the YouTube button" : "Twitch chat uses the link saved on the Twitch button";
    return;
  }
  if (programChatView.src !== url) programChatView.src = url;
  programChatView.hidden = false;
  programChatHint.hidden = true;
  programChatSlot.dataset.liveFeed = "1";
  programChatSlot.hidden = false;
}
function syncChatFeed() {
  syncTwitchFeed();
  paintChatFeed();
}
if (sceneGameplay) {
  sceneGameplay.addEventListener("click", () => selectScene("gaming-cam"));
}
if (sceneChatting) {
  sceneChatting.addEventListener("click", () => selectScene("desk-only"));
}
if (sceneStarting) {
  sceneStarting.addEventListener("click", () => selectScene("starting-soon"));
}
if (sceneIntermission) {
  sceneIntermission.addEventListener("click", () => selectScene("intermission"));
}
if (sceneEnding) {
  sceneEnding.addEventListener("click", () => selectScene("ending"));
}
function openSceneImageMenuFromTarget(menu) {
  const id = menu.dataset.sceneMenu;
  if (!id) return;
  const custom = isCustomSceneId(id);
  const timer = id === "intermission";
  const image = sceneSupportsImageUpload(id);
  if (!custom && !timer && !image) return;
  sceneImageMenuTargetId = id;
  for (const row of sceneMenuTimerRows) row.hidden = !timer;
  sceneMenuImagePickRow.hidden = !image;
  sceneMenuImageClearRow.hidden = !image;
  sceneMenuDeleteRow.hidden = !custom;
  sceneImageMenuClear.disabled = !sceneImagePaths[id];
  sceneImageMenuDialog.showModal();
}
studioScenesList.addEventListener(
  "click",
  (event) => {
    const target = event.target.closest("[data-scene-menu]");
    if (!target || target.classList.contains("studio-list-menu--static")) return;
    event.preventDefault();
    event.stopPropagation();
    openSceneImageMenuFromTarget(target);
  },
  true
);
studioScenesList.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest("[data-scene-menu]");
    if (!target || target.classList.contains("studio-list-menu--static")) return;
    event.preventDefault();
    event.stopPropagation();
    openSceneImageMenuFromTarget(target);
  },
  true
);
sceneImageMenuPick.addEventListener("click", () => {
  sceneImageMenuDialog.close();
  const target = sceneImageMenuTargetId;
  if (!target) return;
  void chooseSceneImage(target);
});
sceneImageMenuClear.addEventListener("click", () => {
  sceneImageMenuDialog.close();
  const target = sceneImageMenuTargetId;
  if (!target) return;
  void persistSceneImage(target, null);
});
sceneImageMenuCancel.addEventListener("click", () => {
  sceneImageMenuDialog.close();
});
sceneImageMenuDialog.addEventListener("click", (event) => {
  const button = event.target.closest("[data-intermission-min]");
  if (!button) return;
  const minutes = Number(button.dataset.intermissionMin);
  sceneImageMenuDialog.close();
  startIntermissionTimer(minutes);
});
sceneMenuTimerStop.addEventListener("click", () => {
  sceneImageMenuDialog.close();
  stopIntermissionTimer();
  void selectScene("intermission");
});
sceneImageMenuDelete.addEventListener("click", () => {
  sceneImageMenuDialog.close();
  const target = sceneImageMenuTargetId;
  if (!target) return;
  void deleteCustomScene(target);
});
btnSceneImagePick.addEventListener("click", () => {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) return;
  void chooseSceneImage(activeSceneTemplateId);
});
btnSceneImageClear.addEventListener("click", () => {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) return;
  void persistSceneImage(activeSceneTemplateId, null);
});
syncAddSceneButtons();
if (btnAddSceneAlt) {
  btnAddSceneAlt.addEventListener("click", () => {
    void addCustomScene();
  });
}
const goLiveWizardDialog = document.getElementById("go-live-wizard-dialog");
const goLiveWizard = new GoLiveWizard(
  goLiveWizardDialog,
  {
    isLive: () => isSessionLive(),
    readUi: () => ({
      destTwitch: destTwitch.checked,
      destYoutube: destYoutube.checked,
      twitchKey: twitchKey.value,
      youtubeKey: youtubeKey.value
    }),
    applyPlatform: applyWizardPlatform,
    applyKeys: (partial) => {
      if (partial.twitchKey !== void 0) twitchKey.value = partial.twitchKey;
      if (partial.youtubeKey !== void 0) youtubeKey.value = partial.youtubeKey;
      syncDestinationInputs();
      void persistStreamDestinationsFromUi();
    },
    validate: async () => {
      if (labMode) {
        return { ok: true, message: "Demo mode — skipped relay verification." };
      }
      return verifyStreamKeys();
    },
    goLive: async () => {
      await goLive();
    },
    endLive: async () => {
      await endLive();
    },
    readEncodeProfile: () => selectedProfile(),
    applyEncodeProfile: (id) => onEncodeProfileChanged(id),
    readPreferredPlatform: () => lastStreamPlatform,
    readStreamInfo: () => ({
      title: relayStudioSettings.streamTitle,
      game: relayStudioSettings.streamCategory || "Just Chatting",
      description: relayStudioSettings.streamDescription,
      channel: streamChannel,
      includeChat: streamIncludeChat,
      twitchChatLink: streamTwitchChatLink,
      youtubeChatLink: streamYoutubeChatLink
    }),
    applyStreamInfo: (info) => {
      const nextChannel = info.channel.trim().replace(/^@/, "");
      const overlaysChanged = nextChannel !== streamChannel || info.includeChat !== streamIncludeChat;
      relayStudioSettings = {
        ...relayStudioSettings,
        streamTitle: sanitizeStreamTitle(info.title),
        streamCategory: sanitizeStreamCategory(info.game),
        streamDescription: info.description.replace(/\r\n/g, "\n").slice(0, 200)
      };
      streamTwitchChatLink = info.twitchChatLink.trim().slice(0, 120);
      streamYoutubeChatLink = info.youtubeChatLink.trim().slice(0, 512);
      streamChannel = nextChannel;
      streamIncludeChat = info.includeChat;
      layerEnabled.chat = info.includeChat;
      layerEnabled.notifications = info.includeChat;
      syncStreamInfoFields();
      if (overlaysChanged) {
        syncChatFeed();
        syncPlatformAlerts();
      }
      void window.maka.setSettings({
        streamTitle: relayStudioSettings.streamTitle,
        streamCategory: relayStudioSettings.streamCategory,
        streamDescription: relayStudioSettings.streamDescription,
        streamChannel,
        streamTwitchChatLink,
        streamYoutubeChatLink,
        streamIncludeChat
      });
    }
  }
);
populateEncodeProfileSelect(
  document.getElementById("go-live-wizard-quality")
);
openGoLiveFlow = () => {
  void window.maka.getSettings().then((s) => {
    lastStreamPlatform = s.lastStreamPlatform ?? "none";
    goLiveWizard.open();
  });
};
function droppedFramesFromRelay(snapshot) {
  const status = snapshot?.status;
  if (!status || typeof status !== "object") return 0;
  const raw = status.droppedFrames;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}
function relayLatencyMs(snapshot) {
  const status = snapshot?.status;
  if (!status) return void 0;
  const raw = status.latencyMs;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : void 0;
}
function programLatencyMs(snapshot, whipMetrics) {
  const relay = relayLatencyMs(snapshot);
  if (relay != null) return relay;
  const whipRtt = whipMetrics?.roundTripMs ?? null;
  if (whipRtt != null && whipRtt >= 0) return whipRtt;
  return void 0;
}
function formatLatencyStat(ms) {
  return `${ms} ms`;
}
function droppedFramesForProgramStats(snapshot, whipMetrics) {
  const relayDropped = droppedFramesFromRelay(snapshot);
  const whipDropped = whipMetrics?.outboundVideoFramesDropped ?? null;
  const whipEncoded = whipMetrics?.outboundVideoFramesEncoded ?? null;
  if (relayDropped > 0) return { dropped: relayDropped, encoded: whipEncoded };
  if (typeof whipDropped === "number" && whipDropped > 0) {
    return { dropped: whipDropped, encoded: whipEncoded };
  }
  return { dropped: relayDropped, encoded: whipEncoded };
}
function formatDropPercent(dropped, encoded) {
  if (encoded != null && encoded > 0) return (dropped / encoded * 100).toFixed(1);
  return dropped === 0 ? "0.0" : "—";
}
function viewerCountFromRelay(snapshot) {
  const status = snapshot?.status;
  if (!status) return null;
  const aggregate = status.viewerCount ?? status.viewers;
  if (typeof aggregate === "number" && Number.isFinite(aggregate) && aggregate >= 0) {
    return Math.floor(aggregate);
  }
  const platforms = status.platforms;
  if (!platforms) return null;
  let sum = 0;
  let any = false;
  for (const key of ["twitch", "youtube", "custom"]) {
    const entry = platforms[key];
    if (entry && typeof entry === "object" && typeof entry.viewers === "number" && entry.viewers >= 0) {
      sum += Math.floor(entry.viewers);
      any = true;
    }
  }
  return any ? sum : null;
}
function formatViewerCount(count) {
  return count.toLocaleString(void 0, { maximumFractionDigits: 0 });
}
function formatMbpsLabel(mbps) {
  const text = Number.isInteger(mbps) ? String(mbps) : mbps.toFixed(1);
  return `${text} Mbps`;
}
function relayObservedBitrateMbps(snapshot) {
  const status = snapshot?.status;
  if (!status || typeof status !== "object") return void 0;
  const raw = status.bitrateMbps;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : void 0;
}
function updateProgramStats(snapshot) {
  const profile = selectedProfile();
  const spec = encodeProfileSpec(profile);
  const sessionLive = snapshot?.lifecycle === "live" || isSessionLive();
  const whipMetrics = sessionLive ? whipStreamMetrics : null;
  const playbackActive = playbackTotalFrames > 0;
  const { dropped, encoded } = playbackActive && !sessionLive ? { dropped: playbackDroppedFrames, encoded: playbackTotalFrames } : droppedFramesForProgramStats(snapshot, whipMetrics);
  const dropPct = playbackActive && !sessionLive ? dropPercentLabel(playbackDroppedFrames, playbackTotalFrames) : formatDropPercent(dropped, encoded);
  const targetMbps = spec.bitrateMbps;
  const observedMbps = relayObservedBitrateMbps(snapshot);
  const displayMbps = sessionLive && measuredWhipMbps != null ? measuredWhipMbps : sessionLive && observedMbps != null ? observedMbps : targetMbps;
  const measuredFpsNow = measuredCaptureFps ?? (sessionLive ? whipMetrics?.outboundVideoFramesPerSecond ?? null : null);
  const fpsLabel = measuredFpsNow ?? spec.fps;
  const fpsMeasured = measuredFpsNow != null;
  if (statDropped) {
    statDropped.textContent = `Dropped Frames: ${dropped} (${dropPct}%)`;
    statDropped.title = playbackActive ? "Dropped frames from the program video element" : "Dropped frames from the relay or WHIP sender";
  }
  if (statFps) {
    statFps.textContent = `FPS: ${fpsLabel}`;
    statFps.title = fpsMeasured ? "Measured capture or outbound frame rate" : `${spec.menuLabel} encode target`;
  }
  if (statLatency) {
    const networkMs = sessionLive ? programLatencyMs(snapshot, whipMetrics) : void 0;
    const localMs = frameIntervalMs(measuredFpsNow);
    if (networkMs != null) {
      statLatency.textContent = formatLatencyStat(networkMs);
      statLatency.title = relayLatencyMs(snapshot) != null ? "Stream latency reported by relay" : "WHIP round-trip time to local relay";
    } else if (localMs != null) {
      statLatency.textContent = formatLatencyStat(localMs);
      statLatency.title = "Local frame interval from the capture clock. Network RTT appears after go-live.";
    } else {
      statLatency.textContent = "—";
      statLatency.title = "Latency appears once a capture or live session reports frames";
    }
  }
  if (statBitrate) {
    const measuredBits = sessionLive && (measuredWhipMbps != null || observedMbps != null);
    statBitrate.textContent = measuredBits ? formatMbpsLabel(displayMbps) : `${formatMbpsLabel(targetMbps)} target`;
    statBitrate.title = measuredBits ? "Measured from WHIP bytes sent or relay status" : `${spec.menuLabel} encode target until the session reports a bitrate`;
  }
  if (programQualitySelect) {
    programQualitySelect.title = sessionLive ? `${spec.menuLabel} · transmitting at ${formatMbpsLabel(displayMbps)}` : `${spec.menuLabel} · ${formatMbpsLabel(targetMbps)} target`;
  }
  const whipEncoded = whipMetrics?.outboundVideoFramesEncoded ?? null;
  const whipDropped = whipMetrics?.outboundVideoFramesDropped ?? 0;
  const dropPercent = sessionLive && whipEncoded != null && whipEncoded >= 0 ? windowedDropPercent(whipDropped, whipEncoded) : null;
  maybeAdaptEncode({
    dropPercent,
    roundTripMs: sessionLive ? whipMetrics?.roundTripMs ?? null : null,
    measuredMbps: sessionLive ? measuredWhipMbps : null,
    targetMbps
  });
}
initEncodeProfileControls();
const btnStartRecording = document.getElementById("btn-start-recording");
const btnStartVcam = document.getElementById("btn-start-vcam");
const btnVcamLabel = document.getElementById("btn-vcam-label");
const btnRecordingLabel = document.getElementById("btn-recording-label");
const statRecording = document.getElementById("stat-recording");
const statVcam = document.getElementById("stat-vcam");
const vcamUnavailableDialog = document.getElementById("vcam-unavailable-dialog");
const vcamInfoLimitation = document.getElementById("vcam-info-limitation");
const vcamInfoFallbackPanel = document.getElementById("vcam-info-fallback-panel");
const vcamOpenFallbackUrl = document.getElementById("vcam-open-fallback-url");
const vcamCopyFrame = document.getElementById("vcam-copy-frame");
const vcamInfoStatus = document.getElementById("vcam-info-status");
const programOutputDeps = {
  getProgramVideo: () => programVideo,
  getWebcamVideo: () => programCamVideo,
  hasGameplayVideo: () => Boolean(programStream?.getVideoTracks().some((track) => track.readyState === "live")),
  getMicStream: () => micStream,
  getDesktopAudioStream: () => desktopAudioStream,
  getGameAudioStream: () => gameAudioStream,
  getEncodeSpec: () => encodeProfileSpec(selectedProfile())
};
const programOutputCompositor = createProgramOutputCompositor(programOutputDeps);
const programRecording = createProgramRecording({
  ...programOutputDeps,
  compositor: programOutputCompositor
});
const programVirtualCamera = createProgramVirtualCamera({
  ...programOutputDeps,
  compositor: programOutputCompositor,
  publishFrame: (jpeg) => window.maka.pushVcamFrame(jpeg)
});
let vcamCapability = null;
let vcamInfoSeen = false;
function stopProgramOutputCompositorIfIdle() {
  if (!programRecording.isRecording() && !programVirtualCamera.isActive()) {
    programOutputCompositor.stop();
  }
}
function setVcamUi(active) {
  if (btnStartVcam) btnStartVcam.dataset.vcam = active ? "1" : "0";
  if (btnVcamLabel) {
    btnVcamLabel.textContent = active ? "Stop Virtual Camera" : "Start Virtual Camera";
  }
  if (statVcam) {
    statVcam.hidden = !active;
    statVcam.dataset.vcam = active ? "1" : "0";
    statVcam.textContent = active ? "Virtual cam preview" : "Virtual cam off";
  }
  if (btnStartVcam) {
    const previewNote = vcamCapability?.canOutputToDevice ? "Outputs to a system virtual camera device." : "Preview mode: program compositor only (no system camera device in this build). Shift+click for help.";
    btnStartVcam.title = active ? `Stop virtual camera preview. ${previewNote}` : `Start virtual camera preview. ${previewNote}`;
  }
}
function setVcamInfoStatus(message, state) {
  if (!vcamInfoStatus) return;
  vcamInfoStatus.textContent = message;
  if (state) vcamInfoStatus.dataset.state = state;
  else delete vcamInfoStatus.dataset.state;
}
function hydrateVcamInfoDialog(cap) {
  if (vcamInfoLimitation) vcamInfoLimitation.textContent = cap.limitationMessage;
  if (vcamInfoFallbackPanel) {
    vcamInfoFallbackPanel.hidden = !cap.recommendedFallback;
  }
}
async function ensureVcamCapability() {
  if (vcamCapability) return vcamCapability;
  const cap = await window.maka.getVcamCapability();
  vcamCapability = cap;
  hydrateVcamInfoDialog(cap);
  setVcamUi(programVirtualCamera.isActive());
  return cap;
}
function openVcamInfoDialog() {
  void ensureVcamCapability().then(() => {
    setVcamInfoStatus("", "");
    vcamUnavailableDialog?.showModal();
  });
}
function setRecordingUi(active) {
  if (btnStartRecording) btnStartRecording.dataset.recording = active ? "1" : "0";
  if (btnRecordingLabel) {
    btnRecordingLabel.textContent = active ? "Stop Recording" : "Start Recording";
  }
  if (statRecording) {
    statRecording.dataset.recording = active ? "1" : "0";
    statRecording.textContent = active ? "Now recording" : "Not recording";
  }
}
function syncRecordingButtonHint() {
  if (!btnStartRecording) return;
  const base = "Record program output locally (not streaming).";
  if (recordingSaveFolder.trim()) {
    btnStartRecording.title = `${base} Stops save to your recording folder. Shift+click Stop to choose location.`;
  } else {
    btnStartRecording.title = `${base} Shift+click Stop to choose save location.`;
  }
}
if (btnStartRecording) {
  btnStartRecording.addEventListener("click", (ev) => {
    void (async () => {
      if (programRecording.isRecording()) {
        const blob = await programRecording.stop();
        setRecordingUi(false);
        stopProgramOutputCompositorIfIdle();
        if (!blob) {
          setDestError("Recording produced no data.");
          return;
        }
        const ext = recordingFileExtension(blob);
        const defaultName = buildRecordingFileName(selectedProfile(), ext);
        const data = await blob.arrayBuffer();
        const forceDialog = ev.shiftKey;
        const saved = await window.maka.saveRecording({
          data,
          defaultName,
          ext,
          forceDialog
        });
        if (!saved.canceled) {
          setDestError(null);
          destHint.textContent = `Recording saved: ${saved.filePath}`;
        }
        return;
      }
      try {
        setDestError(null);
        await programRecording.start();
        setRecordingUi(true);
        destHint.textContent = "Recording program video (canvas compositor). PiP, browser overlay, and scene PNG masks are not in the file yet.";
      } catch (err) {
        setDestError(err instanceof Error ? err.message : String(err));
      }
    })();
  });
}
if (btnStartVcam) {
  btnStartVcam.addEventListener("click", (ev) => {
    void (async () => {
      if (ev.shiftKey) {
        openVcamInfoDialog();
        return;
      }
      await ensureVcamCapability();
      if (programVirtualCamera.isActive()) {
        programVirtualCamera.stop();
        await window.maka.closeVcamOutput();
        stopProgramOutputCompositorIfIdle();
        setVcamUi(false);
        destHint.textContent = "Virtual camera stopped.";
        return;
      }
      try {
        setDestError(null);
        const output = await window.maka.openVcamOutput();
        programVirtualCamera.start();
        setVcamUi(true);
        if (!vcamInfoSeen && vcamCapability && !vcamCapability.canOutputToDevice) {
          vcamInfoSeen = true;
          openVcamInfoDialog();
        }
        destHint.textContent = output.devicePath ? `Virtual camera writing to ${output.devicePath} and the Maka Virtual Camera window.` : "Virtual camera window is open. Other apps can capture that window. Shift+click for a system-camera fallback.";
      } catch (err) {
        setDestError(err instanceof Error ? err.message : String(err));
      }
    })();
  });
}
if (vcamOpenFallbackUrl) {
  vcamOpenFallbackUrl.addEventListener("click", () => {
    void ensureVcamCapability().then((cap) => {
      const url = cap.recommendedFallback?.url;
      if (url) void window.maka.openExternal(url);
    });
  });
}
if (vcamCopyFrame) {
  vcamCopyFrame.addEventListener("click", () => {
    void (async () => {
      try {
        setVcamInfoStatus("", "");
        await programVirtualCamera.copyProgramFrameToClipboard();
        setVcamUi(programVirtualCamera.isActive());
        setVcamInfoStatus("Program frame copied to clipboard as PNG.", "ok");
      } catch (err) {
        setVcamInfoStatus(err instanceof Error ? err.message : String(err), "error");
      }
    })();
  });
}
void ensureVcamCapability();
function setGoLiveButtonLabel(text) {
  if (btnGoLiveLabel) btnGoLiveLabel.textContent = text;
}
function updateGoLiveLabel(isLive) {
  setGoLiveButtonLabel(isLive ? "End Stream" : "Go Live");
}
let liveSessionStartedAt = null;
let streamDurationTimer = null;
function formatStreamDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1e3));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec % 3600 / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
function syncStreamInfoFields() {
  const title = relayStudioSettings.streamTitle.trim();
  const game = relayStudioSettings.streamCategory.trim();
  streamTitleText.textContent = title;
  streamCategoryText.textContent = game;
  const image = game ? gameArtByName.get(game.toLowerCase()) : "";
  if (image) {
    if (streamThumbImg.getAttribute("src") !== image) streamThumbImg.src = image;
    streamThumbImg.alt = `${game} box art`;
    streamThumbImg.hidden = false;
  } else {
    streamThumbImg.hidden = true;
    streamThumbImg.removeAttribute("src");
    streamThumbImg.alt = "";
  }
}
async function loadGameArt() {
  try {
    const response = await fetch(new URL("data/game-catalogue.json", window.location.href).toString());
    if (!response.ok) return;
    const data = await response.json();
    for (const game of data.games ?? []) {
      if (game.name && game.image) gameArtByName.set(game.name.toLowerCase(), game.image);
    }
    syncStreamInfoFields();
  } catch {
  }
}
function applyRelayStudioSettingsFromAppSettings(s) {
  relayStudioSettings = { streamTitle: sanitizeStreamTitle(s.streamTitle ?? ""), streamCategory: sanitizeStreamCategory(s.streamCategory ?? ""), streamDescription: (s.streamDescription ?? "").replace(/\r\n/g, "\n").slice(0, 200), audioMicBitrateKbps: s.audioMicBitrateKbps, audioDesktopBitrateKbps: s.audioDesktopBitrateKbps, videoEncoderPreference: s.videoEncoderPreference, gpuPreference: s.gpuPreference || "default" };
  streamChannel = (s.streamChannel ?? "").trim().replace(/^@/, "");
  streamTwitchChatLink = (s.streamTwitchChatLink ?? "").trim();
  streamYoutubeChatLink = (s.streamYoutubeChatLink ?? "").trim();
  streamAlertBoxUrl = alertBoxPageUrl(s.streamAlertBoxUrl ?? "") ?? "";
  streamIncludeChat = Boolean(s.streamIncludeChat);
  layerEnabled.chat = streamIncludeChat;
  syncStreamInfoFields();
  syncChatFeed();
  syncPlatformAlerts();
}
async function persistStreamMetaFromInputs() {
  await window.maka.setSettings({
    streamTitle: relayStudioSettings.streamTitle,
    streamCategory: relayStudioSettings.streamCategory,
    streamDescription: relayStudioSettings.streamDescription,
    streamChannel,
    streamAlertBoxUrl,
    streamIncludeChat
  });
  syncStreamInfoFields();
}
function syncStreamInfoMeta() {
  syncStreamInfoFields();
}
function stopPlatformViewerPoll() {
  if (platformViewerTimer) {
    clearInterval(platformViewerTimer);
    platformViewerTimer = null;
  }
  platformViewers = { twitch: null, youtube: null };
}
async function refreshPlatformViewers() {
  if (!isSessionLive()) return;
  const twitchLogin = destTwitch.checked ? normalizeTwitchChannel(streamChannel) : "";
  const youtubeId = destYoutube.checked ? youtubeVideoId(streamYoutubeChatLink || streamChannel) : "";
  try {
    platformViewers = await window.maka.getPlatformViewers({
      twitchLogin,
      youtubeVideoId: youtubeId
    });
  } catch {
    platformViewers = { twitch: null, youtube: null };
  }
  if (isSessionLive()) updateStreamInfo(true, lastRelaySnapshot);
}
function startPlatformViewerPoll() {
  stopPlatformViewerPoll();
  void refreshPlatformViewers();
  platformViewerTimer = setInterval(() => {
    void refreshPlatformViewers();
  }, 2e4);
}
function setLiveDurationClock(active) {
  if (streamDurationTimer) {
    clearInterval(streamDurationTimer);
    streamDurationTimer = null;
  }
  if (!active) {
    liveSessionStartedAt = null;
    if (streamDuration) streamDuration.textContent = "—";
    return;
  }
  liveSessionStartedAt = liveSessionStartedAt ?? Date.now();
  streamDurationTimer = setInterval(() => {
    if (!streamDuration || liveSessionStartedAt === null) return;
    streamDuration.textContent = formatStreamDuration(Date.now() - liveSessionStartedAt);
  }, 1e3);
  if (streamDuration && liveSessionStartedAt !== null) {
    streamDuration.textContent = formatStreamDuration(Date.now() - liveSessionStartedAt);
  }
}
function updateStreamInfo(isLive, snapshot) {
  syncStreamInfoMeta();
  if (streamLivePill) {
    streamLivePill.dataset.live = isLive ? "true" : "false";
    streamLivePill.textContent = isLive ? "Live" : "Offline";
  }
  if (streamViewers) {
    const relayViewers = isLive ? viewerCountFromRelay(snapshot ?? lastRelaySnapshot) : null;
    const platformTotal = isLive ? sumPlatformViewers(platformViewers) : null;
    const viewers = relayViewers ?? platformTotal;
    const label = viewerStatusLabel(isLive, viewers);
    streamViewers.textContent = viewers != null && isLive ? `Viewers: ${formatViewerCount(viewers)}` : label.text;
    streamViewers.title = relayViewers != null ? "Live viewer count from the relay" : formatPlatformViewerTitle(platformViewers);
  }
  setLiveDurationClock(isLive);
}
void initSystemAudioCapture();
audioDesktopLabel.addEventListener("click", () => {
  if (!systemAudioCaptureSupported(capturePlatform)) return;
  if (!desktopAudioStream) {
    void refreshDesktopAudioCapture(true);
    return;
  }
  desktopAudioMuted = !desktopAudioMuted;
  applyDesktopGameAudioTrackEnabled();
  syncWhipAvTracks();
  syncSystemAudioChannelUi();
});
audioGameLabel.addEventListener("click", () => {
  if (capturePlatform !== "win32") return;
  if (!gameAudioStream) {
    void refreshGameAudioCapture();
    return;
  }
  gameAudioMuted = !gameAudioMuted;
  applyDesktopGameAudioTrackEnabled();
  syncWhipAvTracks();
  syncSystemAudioChannelUi();
});
btnDesktopAudioSettings.addEventListener("click", () => {
  if (!systemAudioCaptureSupported(capturePlatform)) return;
  if (!desktopAudioStream) {
    void refreshDesktopAudioCapture(true);
    return;
  }
  const show = desktopAudioOutputSelect.hidden;
  desktopAudioOutputSelect.hidden = !show;
  btnDesktopAudioSettings.setAttribute("aria-expanded", show ? "true" : "false");
  if (show) void refreshDesktopAudioOutputDevices();
});
desktopAudioOutputSelect.addEventListener("change", () => {
  preferredDesktopOutputDeviceId = desktopAudioOutputSelect.value;
  void window.maka.setSettings({
    preferredDesktopAudioOutputDeviceId: preferredDesktopOutputDeviceId
  });
  void refreshDesktopAudioCapture();
});
btnGameAudioSettings.addEventListener("click", () => {
  if (capturePlatform !== "win32") return;
  void refreshGameAudioCapture();
  studioSourceGame.scrollIntoView({ block: "nearest", behavior: "smooth" });
});
function paintQosScore() {
  const el = document.getElementById("qos-score");
  if (!el) return;
  if (!isSessionLive()) {
    el.textContent = "QoS — go live to score this session";
    return;
  }
  const whip = whipStreamMetrics;
  const status = lastRelaySnapshot?.status;
  const scored = scoreQos({
    rttMs: whip?.roundTripMs ?? status?.latencyMs ?? null,
    dropPercent: dropPercentFromCounts(
      whip?.outboundVideoFramesDropped ?? null,
      whip?.outboundVideoFramesEncoded ?? null
    ),
    relayError: status?.error ?? lastRelaySnapshot?.error ?? null
  });
  el.textContent = `QoS ${scored.score} (${scored.grade}) — ${scored.reasons[0]}`;
}
function noteWhipLoad() {
  if (!isSessionLive() || !whipPublisher) return;
  const metrics = whipStreamMetrics;
  const encoded = metrics?.outboundVideoFramesEncoded ?? null;
  const dropped = metrics?.outboundVideoFramesDropped ?? 0;
  let dropPercent = null;
  if (encoded != null && whipLoadFrameMark && encoded > whipLoadFrameMark.encoded) {
    dropPercent = Math.max(0, dropped - whipLoadFrameMark.dropped) / (encoded - whipLoadFrameMark.encoded) * 100;
  }
  if (encoded != null) whipLoadFrameMark = { dropped, encoded };
  const targetFps = encodeProfileSpec(selectedProfile()).fps;
  const outboundFps = metrics?.outboundVideoFramesPerSecond ?? null;
  const fpsReady = encoded != null && encoded > targetFps * 2;
  const sample = whipLoadSample({
    dropPercent,
    captureFps: fpsReady ? outboundFps : null,
    targetFps,
    compositorSkip: programOutputCompositor.isActive() ? programOutputCompositor.getSkip() : 0
  });
  const previous = whipLoadState.applied;
  whipLoadState = observeWhipLoad(whipLoadState, sample);
  if (whipLoadState.applied === previous) return;
  syncWhipAvTracks();
  const detail = whipLoadState.applied === "shed-webcam" ? "Webcam and overlay tracks paused" : whipLoadState.applied === "shed-browser" ? "Overlay track paused" : "Extra tracks restored";
  if (whipLoadState.applied !== "normal") destHint.textContent = `CPU is behind — ${detail}. Gameplay stays.`;
  recordQos("encode", `backpressure:${whipLoadState.applied}`, {
    label: "Encode backpressure",
    detail
  });
}
function sampleCaptureClock() {
  const videos = [programVideo, programCamVideo, programBrowserVideo];
  let frames = 0;
  let dropped = 0;
  for (const video of videos) {
    if (typeof video.getVideoPlaybackQuality !== "function") continue;
    const quality = video.getVideoPlaybackQuality();
    frames += quality.totalVideoFrames;
    dropped += quality.droppedVideoFrames;
  }
  playbackTotalFrames = frames;
  playbackDroppedFrames = dropped;
  noteWhipLoad();
  paintQosScore();
  const now = performance.now();
  if (captureClockStartedAt > 0 && frames > captureClockFrames) {
    measuredCaptureFps = measuredFps(frames - captureClockFrames, now - captureClockStartedAt);
  } else if (frames === captureClockFrames) {
    const track = [programStream, cameraStream, browserStream].flatMap((stream) => stream?.getVideoTracks() ?? []).find((item) => item.readyState === "live");
    const reported = track?.getSettings().frameRate;
    if (typeof reported === "number" && reported > 0) measuredCaptureFps = Math.round(reported);
  }
  captureClockFrames = frames;
  captureClockStartedAt = now;
  if (currentMode !== "studio" || !document.hasFocus()) {
    captureStallState = emptyCaptureStallState();
    return;
  }
  const programFrames = programVideo.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
  const gameplayLive = Boolean(programStream?.getVideoTracks().some((track) => track.readyState === "live"));
  const previousFrames = captureStallState.lastFrames;
  const stall = observeCaptureFrames(captureStallState, programFrames, gameplayLive);
  captureStallState = stall.state;
  if (previousFrames != null && programFrames > previousFrames) {
    captureStallNotified = false;
    noteBlackProgramFrame();
  }
  if (!stall.stalled) return;
  if (!captureRetryUsed && lastCaptureSource) {
    captureRetryUsed = true;
    void retryFrozenCapture();
    return;
  }
  if (!captureStallNotified) {
    captureStallNotified = true;
    programEmpty.hidden = false;
    programEmpty.textContent = "Capture is still frozen. Pick the game window instead of the whole screen. Cloud gaming often captures black on the desktop.";
    recordQos("capture", "capture:still-frozen", {
      label: "Capture still frozen",
      detail: "720p30 retry did not restore frames"
    });
  }
}
document.getElementById("btn-export-qos")?.addEventListener("click", () => {
  const whip = whipStreamMetrics;
  const status = lastRelaySnapshot?.status;
  void window.maka.exportQosBundle({
    whip: {
      roundTripMs: whip?.roundTripMs ?? null,
      framesDropped: whip?.outboundVideoFramesDropped ?? null,
      framesEncoded: whip?.outboundVideoFramesEncoded ?? null,
      framesPerSecond: whip?.outboundVideoFramesPerSecond ?? null,
      mbps: measuredWhipMbps
    },
    relay: {
      status: status?.status ?? null,
      lifecycle: lastRelaySnapshot?.lifecycle ?? null,
      latencyMs: status?.latencyMs ?? null,
      droppedFrames: status?.droppedFrames ?? null,
      bitrateMbps: status?.bitrateMbps ?? null,
      error: status?.error ?? lastRelaySnapshot?.error ?? null
    }
  }).then((result) => {
    const el = document.getElementById("qos-score");
    if (!el || !result.ok) return;
    el.textContent = `QoS ${result.score} (${result.grade}) — saved ${result.path}`;
  }).catch(() => void 0);
});
setInterval(() => {
  sampleCaptureClock();
  updateProgramStats(lastRelaySnapshot);
}, 500);
void loadGameArt();
highlightSceneSelection(activeSceneTemplateId);
syncChatSourceRow();
syncSceneProgramPresentation();
syncOverlaySourceRow();
refreshProgramPreviewLayout();
updateGoLiveLabel(false);
updateStreamInfo(false);
void window.maka.getRelay().then((snap) => {
  renderRelay(snap);
  if (snap.lifecycle === "stopped" && !snap.error) {
    void window.maka.startRelay().then(renderRelay);
  }
});
