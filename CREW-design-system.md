# CREW Design System

**Version:** 1.0 · **Product:** CREW (live location for small hangouts)  
**Tagline:** Live · Together · Located  
**Reference implementation:** `src/app/globals.css`, `tailwind.config.ts`, `public/brand-mockup.html`

This document is the canonical color and layout reference for the CREW visual language. Use it as a baseline when starting new Harbor Works / CREW-adjacent projects so neon-on-court-black stays consistent across web, native shell, and store assets.

---

## 1. Design philosophy

CREW is **map-first, mobile-first, nightlife-sports HUD** — not a generic SaaS dashboard.

| Principle | What it means |
|-----------|-----------------|
| **Court Black base** | Deep blue-black backgrounds; UI floats on top of a live map, not white cards on grey. |
| **Neon signals** | Cyan, pink, lime, and orange are *functional* — live status, distance bands, crew identity — not decoration. |
| **Bold headline type** | League Spartan (italic, heavy) for brand, labels, and HUD chrome; Inter for body and forms. |
| **Pills & sheets** | Rounded-full buttons and badges; bottom sheet for secondary info (Find My / Life360 pattern). |
| **Motion = live** | Leash dash animation, captain pulse, marker ease — static UI feels broken. |

**Avoid:** light mode as default, flat Material greys, tiny grey text on busy maps, watermarked map tiles, demo/mock chrome in production.

---

## 2. Core color palette (Neon Four)

These four colors are the **brand signature**. Each crew member on the map gets one (plus captain treatment). Range rings and leashes reuse the same hues.

| Token | Name | Hex | HSL | Role |
|-------|------|-----|-----|------|
| `--crew-cyan` | **Signal Cyan** | `#2AF5FF` | `184 100% 58%` | Primary brand, captain accent, “you”, links, selection |
| `--crew-pink` | **Flare Pink** | `#FF2AD4` | `312 100% 58%` | Gradient mid-point, straying / outer ring |
| `--crew-lime` | **Field Lime** | `#C6FF2A` | `73 100% 58%` | Live badge, close band, taglines, Captain pill |
| `--crew-orange` | **Alert Orange** | `#FF7A2A` | `22 100% 58%` | Watch / edge band, secondary warnings |

### CSS variables (app)

```css
:root {
  --crew-cyan: 184 100% 58%;
  --crew-pink: 312 100% 58%;
  --crew-lime: 73 100% 58%;
  --crew-orange: 22 100% 58%;
}
```

### Tailwind usage

```html
<!-- Prefer semantic tokens when possible -->
<div class="text-[hsl(var(--crew-lime))]" />
<div class="bg-[hsl(var(--crew-cyan))]" />

<!-- Headline font -->
<p class="font-headline font-bold" />
```

---

## 3. Neutral / surface palette (Court Black family)

Surfaces are **cool blue-blacks**, not pure `#000000`, so neon pops without harsh contrast.

| Token | Name | Hex | HSL | Usage |
|-------|------|-----|-----|--------|
| `--background` | **Court Black** | `#0A0E14` | `215 28% 6%` | App background, theme-color, status bar |
| Map canvas | **Map Black** | `#05070A` | — | Leaflet container, phone frame interior |
| `--card` | **Panel** | `#10151D` | `215 24% 9%` | Cards, elevated panels |
| `--secondary` | **Raised** | `#1A2029` approx | `215 20% 14%` | Secondary buttons, ghost borders |
| `--muted` | **Inset** | `#161B22` approx | `215 18% 12%` | Muted fills |
| `--border` | **Line** | `#262D38` approx | `215 16% 18%` | Dividers, input borders |
| `--foreground` | **Primary text** | `#F2F4F6` approx | `210 20% 96%` | Headings, body on dark |
| `--muted-foreground` | **Secondary text** | `#939DA8` approx | `210 10% 62%` | Timestamps, hints |
| Brand grey (mockup) | **Signal Grey** | `#9AA5B1` | — | Section labels in marketing mockups |
| Sheet / divider | **Hairline** | `rgba(255,255,255,0.08–0.10)` | — | Roster rows, sheet top edge |

### Page background treatment

Body uses a **fixed multi-layer gradient** (not flat fill):

```css
background-color: hsl(var(--background));
background-image:
  radial-gradient(ellipse 90% 55% at 15% -10%, hsl(var(--crew-cyan) / 0.14), transparent 55%),
  radial-gradient(ellipse 80% 50% at 95% 0%, hsl(var(--crew-pink) / 0.12), transparent 50%),
  linear-gradient(180deg, hsl(215 28% 7%) 0%, hsl(215 28% 5%) 100%);
background-attachment: fixed;
```

Welcome screen adds a centered cyan/pink glow:

```css
radial-gradient(ellipse 100% 70% at 50% -20%, rgba(42,245,255,0.18), transparent 55%),
radial-gradient(ellipse 80% 50% at 100% 20%, rgba(255,42,212,0.12), transparent 50%),
#0a0e14
```

---

## 4. Semantic UI tokens (shadcn / Tailwind)

Mapped in `globals.css` and consumed via Tailwind `background`, `primary`, etc.

| Semantic | Maps to | Foreground on top |
|----------|---------|-------------------|
| `primary` | Signal Cyan | Court Black `#0A0E14` |
| `accent` | Field Lime | Court Black |
| `destructive` | `#E54D42` approx (`4 78% 52%`) | White |
| `ring` | Signal Cyan | — |
| `radius` | `1.25rem` (20px) | Base corner radius |

**Primary CTA pattern:** cyan → pink gradient, dark text (`.crew-cta`).

**Live / success:** lime fill, dark text (`#05070a`).

**Danger / SOS:** destructive red — never reuse pink for errors (pink = straying/distance).

---

## 5. Gradients

### Wordmark gradient (`.crew-wordmark`)

Full CREW logotype — **100deg**, three stops:

```css
background: linear-gradient(
  100deg,
  hsl(var(--crew-cyan)) 10%,
  hsl(var(--crew-pink)) 55%,
  hsl(var(--crew-lime)) 95%
);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
```

| Property | Value |
|----------|--------|
| Font | League Spartan 900 **italic** |
| Letter-spacing | `-0.02em` |
| Line-height | ~`0.85` on hero |

**Alternate lockups (marketing):**

- **Solid cyan** — small sizes / single-color export  
- **Split two-tone** — `CR` cyan + `EW` pink  
- **Icon gradient** — radial cyan → pink at 120% 120%, anchor 30% 20%

### CTA gradient (`.crew-cta`)

```css
background: linear-gradient(100deg, hsl(var(--crew-cyan)), hsl(var(--crew-pink)));
color: hsl(215 28% 6%);
```

Used for: Start, primary buttons, welcome “Start”, gradient pills.

### Captain marker gradient

```css
radial-gradient(120% 120% at 30% 20%, #2af5ff, #ff2ad4 75%)
```

White 2px border; optional pulse ring `#2af5ff`.

---

## 6. Typography

| Role | Family | Weights | CSS / Tailwind |
|------|--------|---------|----------------|
| **Headline / brand** | [League Spartan](https://fonts.google.com/specimen/League+Spartan) | 500–900 | `font-headline`, `--font-crew` |
| **Body / UI** | [Inter](https://fonts.google.com/specimen/Inter) | 400–700 | `font-body`, `--font-inter` |
| **Code** | System monospace | — | `font-code` |

### Scale & usage

| Element | Font | Size | Weight | Extras |
|---------|------|------|--------|--------|
| Hero wordmark | League Spartan | `clamp(4.5rem, 22vw, 6.5rem)` | 900 italic | `.crew-wordmark` |
| Live map CREW link | League Spartan | ~1.3rem | 900 italic | gradient text |
| Hangout title | League Spartan | ~0.95–1.05rem | 700 | white |
| Tagline | League Spartan | 0.7rem | 700 | uppercase, `tracking-[0.35em]`, **lime** |
| Section label (mockup) | League Spartan | 0.85–1.1rem | 800 | uppercase, `tracking-[0.08em]`, grey |
| Body / hints | Inter | 0.72–0.85rem | 400–500 | `text-muted-foreground` |
| Distance number (roster) | League Spartan | 1.15rem | 800 | tabular-nums, band color |
| Button label | League Spartan | 0.72–0.75rem | 700–800 | uppercase, wide tracking |
| Input fields | Inter | **16px min** | 400 | prevents iOS zoom |

### Wordmark note (W terminal)

Production wordmark uses League Spartan italic with a **diagonal slice** on the top-right of **W** in some lockups. When generating icons or AI assets, specify: *“top-right tip of W clipped on a diagonal”* to match welcome screen typography.

---

## 7. Spacing, radius, and touch

| Token | Value | Notes |
|-------|-------|-------|
| `--radius` | `1.25rem` | Cards, large buttons |
| `rounded-2xl` | 1rem | Standard buttons, inputs |
| `rounded-full` | 9999px | Pills: Live, End, Captain, CTA |
| Sheet top radius | `28px` | Bottom sheet (`rounded-t-[28px]`) |
| Phone frame radius | `48px` outer / `36px` inner | Desktop preview chrome |
| Min tap target | **48px** | Leaflet zoom; buttons `min-h-12` |
| Safe areas | `env(safe-area-inset-*)` | `.safe-top`, `.safe-bottom`, sheet padding |

**Mobile-first:** max content width ~`max-w-md` (448px) on onboarding; live map is **full-bleed** on device.

**Desktop preview:** centered phone frame 390×844, `(hover: hover) and (pointer: fine) and (min-width: 700px)` — map stays edge-to-edge inside frame.

---

## 8. Component patterns

### 8.1 Buttons

| Variant | Background | Text | Border |
|---------|------------|------|--------|
| **Primary CTA** | cyan → pink gradient | `#05070a` / `#0a0e14` | none |
| **Start (live)** | same as CTA | dark | none |
| **End / ghost** | `white/8–10%` | white | `white/18–20%` |
| **Secondary** | `secondary` token | `secondary-foreground` | subtle |
| **Destructive** | `destructive` | white | none |

Active state: `active:scale-[0.98]` on primary CTAs.

### 8.2 Status pills

| Pill | Background | Text | Typography |
|------|------------|------|------------|
| **Live** | Field Lime `#C6FF2A` | `#05070a` | 0.62–0.65rem, extrabold, uppercase |
| **Captain** | Field Lime | `#05070a` | 0.65rem, uppercase |
| **Idle / Light** | muted dot + lime or grey label | — | sheet header |

### 8.3 Cards & sheets

- **Card:** `bg-card`, border `border`, radius from `--radius`
- **Bottom sheet:** `rgba(10,14,20,0.94)` + `backdrop-blur-[18px]`, shadow `0 -10px 40px rgba(0,0,0,0.5)`
- **Grabber:** 36×4px, `bg-white/25`, centered
- **Coach tip:** white fill, dark text, lime “Got it” button on `#0a0e14`

### 8.4 Map header (flagship)

Single row: **CREW** (gradient) + hangout name + **Live** pill | **Start** / **End**

Header fade: `bg-gradient-to-b from-black/70 via-black/35 to-transparent`

### 8.5 Crew chips (map + sheet)

| Role | Fill | Border | Label |
|------|------|--------|-------|
| Member A (demo) | `#C6FF2A` | `#0A0E14` 2px | initial, `#05070a` |
| Member B | `#FF7A2A` | same | same |
| Member C | `#FF2AD4` | same | same |
| Captain / You | cyan→pink radial | white 2px | “Y” or initial |

Chip size: **42–44px** on map; **40px** in roster. Overlap: `-ml-3` with `border-[#0a0e14]` cutout.

Selected chip: `ring-2 ring-[hsl(var(--crew-cyan))] scale-110`.

---

## 9. Map & location HUD

### Basemap

- **Provider:** Esri `Canvas/World_Dark_Gray_Base` (no API key; avoids CARTO watermark)
- **Canvas color:** `#05070A`
- **Attribution:** hidden in flagship HUD
- **Zoom:** ~16 flagship (readable rings); maxZoom 16 HUD / 19 standard

### Range rings (Follow Me / fixed location)

Concentric dashed circles, center = zone anchor:

| Ring | Color | Meaning |
|------|-------|---------|
| Inner | `#C6FF2A` | Close band (~⅓ of limit) |
| Middle | `#FF7A2A` | Watch band (~⅔) |
| Outer | `#FF2AD4` | Edge / limit |

Opacity: ~0.55 stroke, ~0.03 fill (HUD mode). Dash: `4 10`.

### Leash lines (Follow Me mode)

- **Stroke:** member `mapColor` or band color  
- **Glow layer:** same color, weight 8, opacity 0.22  
- **Dash layer:** weight 2.5, `stroke-dasharray: 2 12`, animated (`.crew-leash-flow`, 1.1s linear infinite)

### Distance bands (roster text color)

| Band | Label | Color |
|------|-------|-------|
| `close` | Close | Field Lime |
| `watch` | Nearby | Alert Orange |
| `far` | Edge | Alert Orange |
| `straying` | Straying | Flare Pink |
| `unknown` | No GPS | Muted foreground |

### Captain / self marker

- Radial gradient fill, white border  
- **Pulse:** `.crew-marker-pulse`, 1.8s ease-out  
- **Heading arrow:** `#2AF5FF`, rotated via device heading  

---

## 10. Motion & animation

| Name | Duration | Easing | Use |
|------|----------|--------|-----|
| `crew-leash-dash` | 1.1s | linear infinite | Leash flow |
| `crew-marker-pulse` | 1.8s | ease-out infinite | Captain / live dot |
| `welcome-rise` | 0.7s | ease-out | Welcome stagger |
| `welcome-fade-in` | 0.9s | ease-out | Welcome |
| Sheet snap | 0.25s | ease-out | Bottom sheet height |
| Marker ease | 900ms | cubic ease-out | GPS position updates |

**Selection highlight:** `hsl(var(--crew-cyan) / 0.28)`.

---

## 11. Iconography & app icon

**Production icon:** Pin shape with cyan→pink gradient, black italic **C** (League Spartan feel).

| Asset | Path | Notes |
|-------|------|-------|
| Favicon | `src/app/favicon.ico`, `public/favicon-32.png` | Transparent pin |
| PWA | `public/icon-192.png`, `apple-touch-icon.png` | Same pin |
| Android adaptive | `mipmap-*`, `ic_launcher_foreground` | Cyan notification tint `#2af5ff` |

**Marketing alternates:** `marketing/icons/` — gradient C, lime outline, four-dot leash, pin, split CREW wordmark.

---

## 12. Layout templates

### Welcome (`/`)

- Centered column, max-w-md  
- Wordmark + lime tagline + muted subtitle  
- Full-width gradient CTA  

### Home

- CREW card above crew list  
- Empty state: Create / Join  

### Live map (`/live-map/[id]`)

```
┌─────────────────────────────────┐
│ CREW · Hangout name · LIVE  End│  ← gradient fade header
├─────────────────────────────────┤
│                                 │
│         MAP (full bleed)        │
│    pins · rings · leashes       │
│                                 │
├─────────────────────────────────┤
│ ═══ grabber                     │
│ [chip][chip][chip][chip]  Live  │
│ ─── roster rows + SOS ───       │
└─────────────────────────────────┘
```

Sheet snap heights: peek **300px**, half **~46%**, full **~86%** of frame.

---

## 13. Native shell (Capacitor)

| Setting | Value |
|---------|--------|
| `themeColor` / StatusBar | `#0A0E14` |
| StatusBar style | DARK |
| Notification icon color | `#2AF5FF` |
| WebView URL | `https://crew-self.vercel.app/` |

App Links hosts: `crew-self.vercel.app` (+ legacy `app-team-up.vercel.app`).

---

## 14. Accessibility & contrast

- **Primary text on Court Black:** foreground ~96% lightness — passes for body copy.  
- **Lime on dark:** use for labels/badges; avoid lime small text on lime backgrounds.  
- **CTA gradient:** always pair with **dark** text (`#05070a`), not white.  
- **Touch:** 16px minimum input font size; 48px map controls.  
- **Color-blind:** do not rely on color alone — pair band colors with text labels (`ft · Straying`).  
- **Reduced motion:** consider `prefers-reduced-motion` for leash/pulse (not yet in codebase — add when porting).

---

## 15. Implementation checklist (new project)

1. Copy CSS variables from `globals.css` `:root` block.  
2. Add League Spartan + Inter via `next/font` or Google Fonts.  
3. Extend Tailwind `fontFamily.headline` and map `colors` to HSL vars.  
4. Add utilities `.crew-wordmark`, `.crew-cta`, `.crew-scroll-hide`.  
5. Set `theme-color` / Capacitor StatusBar to `#0A0E14`.  
6. Use **Esri dark** or equivalent key-free dark tiles for map surfaces.  
7. Assign **Neon Four** to people/metrics consistently; keep pink for “straying” only.  
8. Prefer **bottom sheet** over modals for map-adjacent actions.  
9. Keep production free of demo banners and debug panels.  

---

## 16. File reference

| Purpose | Path |
|---------|------|
| CSS tokens & utilities | `src/app/globals.css` |
| Tailwind theme | `tailwind.config.ts` |
| Static brand mockup | `public/brand-mockup.html` |
| 4-person UI mockup | `public/crew-mockup-4person.html` |
| Logo component | `src/components/logo.tsx` |
| Map HUD | `src/components/client-map.tsx` |
| Flagship shell | `src/components/live-crew-map.tsx` |
| Marketing assets | `marketing/` |
| Design review notes | `docs/live-crew-map-ui-review.md` |

---

## 17. Quick copy-paste: minimum viable theme

```css
:root {
  --crew-cyan: 184 100% 58%;
  --crew-pink: 312 100% 58%;
  --crew-lime: 73 100% 58%;
  --crew-orange: 22 100% 58%;
  --background: 215 28% 6%;
  --foreground: 210 20% 96%;
  --primary: 184 100% 58%;
  --primary-foreground: 215 28% 6%;
  --accent: 73 100% 58%;
  --accent-foreground: 215 28% 6%;
  --muted-foreground: 210 10% 62%;
  --border: 215 16% 18%;
  --radius: 1.25rem;
}

.crew-wordmark {
  font-family: 'League Spartan', system-ui, sans-serif;
  font-weight: 900;
  font-style: italic;
  letter-spacing: -0.02em;
  background: linear-gradient(100deg, #2af5ff 10%, #ff2ad4 55%, #c6ff2a 95%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.crew-cta {
  background: linear-gradient(100deg, #2af5ff, #ff2ad4);
  color: #0a0e14;
}
```

---

*Harbor Works Digital · CREW design system — use as the default dark neon HUD language for sibling apps unless a product explicitly requires a different palette.*
