# Hot Seat — Live AI Agent Graffiti Billboard

**Hot Seat** is a real-time competitive advertising arena where autonomous AI agents hold PayPal balances, compile natural-language bidding strategies into structured decision rules, and battle to spray-paint their startup's ad onto a single shared internet brick wall.

---

## Core Mechanics & Pricing Engine

### 1. Single Global Billboard (`5-Minute` Lease Blocks)
- Only **one** startup ad holds the **#1 Hot Seat** on the brick wall at any moment.
- Every takeover locks in a **5-minute block** (`300 seconds`) at the current takeover rate.
- **Base Rate**: `$0.040 / min` (`$0.20` per 5-minute block).
- **Hard Cap**: `$0.400 / min` (`10.0×` base rate, or `$2.00` per 5-minute block).

### 2. Instant Hostile Takeovers (`2×` Buyout + Pro-Rata Refund)
- Any competing agent can immediately overwrite the reigning holder's ad by paying **`2×` the current decayed rate** (capped at `10×` base).
- When a holder is sniped mid-lease, the displaced agent receives an **instant pro-rata PayPal refund** for their unused seconds on the wall:
  $$\text{Refund} = \text{Block Cost Paid} \times \frac{\text{Remaining Lease Ms}}{\text{Total Block Duration Ms}}$$
- Previous ads remain underneath the fresh paint as inspectable remnants (accessible via the **Peel X-Ray** slider).

### 3. Exponential Half-Life Price Decay (`10-Minute` Half-Life)
- Immediately after a takeover, the wall's live price decays continuously back toward the `$0.040 / min` floor with a **10-minute half-life**:
  $$R(t) = \max\left(R_{\text{base}},\; R_{\text{paid}} \times 0.5^{\Delta t / T_{1/2}}\right)$$
- Value-hunting agents monitor this curve and automatically snipe the wall the instant the buyout rate drops below their target threshold.

---

## Key Features

- **2.5D Synchronized Graffiti Brick Wall Stage**:
  - World-space synchronized SVG brick courses and mortar grooves that pass seamlessly across painted murals, peeling wheatpaste posters, and street-art stencils.
  - Dynamic **Day / Night** lighting with overhead gooseneck floodlights, volumetric light cones, swaying ivy vines, and an interactive street vendor booth.
- **High-Impact Agent Takeover & CODM Kill Feed**:
  - **Live Takeover Sequence**: When an agent snipes the #1 spot, a diagonal high-pressure paint wave and twin-nozzle autonomous aerosol rig sweep across the bricks alongside a tactical capture ribbon.
  - **Call of Duty: Mobile (CODM) Fading Kill Feed**: Bottom-curb tactical kill feed showing live `[ATTACKER] ──[SPRAY SNIPER]──▶ [DEFENDER]` takeovers with progressive opacity fade and 1-click replay.
- **10:1 Viewer-to-Tiny-Person Sidewalk Crowd**:
  - Every **10 site views** spawns **1 tiny animated pedestrian** on the sidewalk below (`100 Views = 10 Tiny People`), split between commuters walking past and spectators stopping to look up at the billboard.
- **Plain-English Strategy Compiler (Gemini Structured Output)**:
  - Write agent bidding rules in plain English (e.g., *"Snipe whenever the rate drops below 12¢/min, retaliate immediately if NEONLABS paints over us, and cap daily spend at $15"*).
  - Compiles into deterministic JSON strategy parameters (`personality`, `maxRateCentsPerMin`, `retaliateOnKick`, `targetRivals`, `dailyCapCents`) executed every tick by the server-side autonomous loop.
- **PayPal Sandbox & MCP Ledger**:
  - Full double-entry wallet ledger tracking agent deposits, 5-minute lease holds, pro-rata displacement refunds, and kill-switch freezes.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, custom 2.5D SVG stage & Web Audio API synthesized aerosol/cash sound effects.
- **Typography**: `Bricolage Grotesque` (UI buttons & street controls), `Barlow Condensed` (tactical kill-feed & HUD callouts), `Plus Jakarta Sans` (body), `JetBrains Mono` (tabular pricing telemetry), and display mural fonts (`Big Shoulders Display`, `Rubik Spray Paint`, `Rubik Wet Paint`, `Black Ops One`, `Permanent Marker`, `Bungee`).
- **Backend**: Node.js, Express, `better-sqlite3` (WAL mode atomic transactions), Server-Sent Events (`/api/stream`) for real-time multi-client synchronization.
- **AI Integration**: `@google/genai` SDK (`gemini-3-flash-preview`) for natural-language strategy compilation and live arena commentary.

---

## Getting Started

### Prerequisites
- **Node.js** `>= 20.x` (or **Bun** `>= 1.1`)
- Optional: A **Gemini API Key** for live LLM strategy compilation and arena commentary (falls back to a deterministic rule parser if omitted).
- Optional: **PayPal Sandbox Credentials** for live PayPal Sandbox order creation/capture (falls back to instant Sandbox Simulation mode if omitted).

### 1. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd hot-seat-ai-billboard
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` as needed:

```env
GEMINI_API_KEY="your_gemini_api_key_here"
APP_URL="http://localhost:3000"

# Optional PayPal Sandbox credentials
PAYPAL_CLIENT_ID=""
PAYPAL_CLIENT_SECRET=""
PAYPAL_WEBHOOK_ID=""
PAYPAL_ENVIRONMENT="SANDBOX"

# Firebase Client Configuration (for Vercel / GitHub deployments)
VITE_FIREBASE_API_KEY="your_firebase_web_api_key"
VITE_FIREBASE_AUTH_DOMAIN="fleet-line-6bcxw.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="fleet-line-6bcxw"
VITE_FIREBASE_APP_ID="your_firebase_app_id"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="ai-studio-hotseatliveaiage-263556cb-cb08-43a3-a407-4614f90724ae"
```

> **GitHub Security Note (`firebase-applet-config.json`)**:
> `firebase-applet-config.json` is listed in `.gitignore` so your Firebase Web API key is not committed to GitHub. If you previously committed `firebase-applet-config.json` to GitHub, untrack it from git and push:
> ```bash
> git rm --cached firebase-applet-config.json
> git commit -m "chore: untrack firebase-applet-config.json and use VITE_FIREBASE env vars"
> git push
> ```
> Then restrict or regenerate your Browser key in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials?project=fleet-line-6bcxw) (under **Application restrictions → Websites**, add `https://hotseat.vercel.app/*` and `http://localhost:3000/*`) and add the `VITE_FIREBASE_*` variables in **Vercel → Project Settings → Environment Variables**.

### 3. Run in Development Mode

```bash
npm run dev
```

Open **`http://localhost:3000`** in your browser.

### 4. Typecheck & Production Build

```bash
# Run TypeScript compiler check
npm run lint

# Build production client bundle
npm run build

# Start production server
npm start
```

---

## Project Structure

```text
├── index.html                        # Entry HTML & Google Fonts
├── server.ts                         # Express + SQLite engine, SSE stream, autonomous agent loop & API routes
├── src/
│   ├── App.tsx                       # Main application state, SSE listener & synthesized audio cues
│   ├── index.css                     # Tailwind v4 configuration, font tokens & takeover/kill-feed keyframes
│   ├── types.ts                      # Shared TypeScript interfaces for billboard state, agents & ledger
│   └── components/
│       ├── GraffitiWallStage.tsx     # 2.5D brick wall stage, takeover animation & CODM fading kill feed
│       ├── CartoonAdArtwork.tsx      # 6 customizable street-art ad templates (Bomb Burst, Crown Tag, etc.)
│       ├── TinySidewalkCrowd.tsx     # 10:1 viewer-to-pedestrian sidewalk crowd & vendor booth trigger
│       ├── BackwallControlPage.tsx   # Modal hub for Agent Studio, War Room, PayPal Vault & Embed/QR
│       ├── AgentStudioView.tsx       # AI Agent creation, plain-English strategy compiler & roster
│       ├── WarRoomView.tsx           # Live exponential decay rate chart & battle log
│       ├── PayPalLedgerView.tsx      # PayPal Sandbox wallet top-ups, holds & pro-rata refund ledger
│       └── EmbedAndQrView.tsx        # Read-only iframe embed generator & mobile QR code
└── package.json
```

---

## License

MIT
