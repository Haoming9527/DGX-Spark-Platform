# DGX Spark Platform

Private chat UI and OpenAI-compatible API for models on **NVIDIA DGX Spark** (via Ollama), with auth, API keys, usage telemetry, and a multi-node inference gateway.

Built with **Next.js**, **Tailwind CSS v4**, and a thin **Go** front-door in front of [Olla](https://thushan.github.io/olla/).

---

## Key features

- **Reasoning mode** — optional thinking stream for supported models
- **Voice input** — browser speech recognition with live interim text
- **Auth** — invite-gated signup, bcrypt passwords, JWT HTTP-only cookies
- **API keys** — create / rename / revoke `dgx_sk_*` keys; usage charts
- **OpenAI-compatible API** — `https://api.dgxspark.dev/v1`
- **Multi-node gateway** — Olla + Go API; see [`gateway/README.md`](gateway/README.md)
- **Sticker UI** — paper/asphalt + dot grid, selective stickers, EXIT go-back plate
- **Gateway / AI-server status** — sleeping vs offline handling in chat
- **Infrastructure** — admin-only live Pi power, voltage, current and energy readings; setup in [`gateway/README.md`](gateway/README.md#connect-the-frontend)

---

## Architecture

```mermaid
graph TD
    Browser([Browser]) --> WWW[www.dgxspark.dev Next.js]
    Client([OpenAI SDK]) --> API[api.dgxspark.dev]
    WWW --> Neon[(Neon PostgreSQL)]
    API --> FrontDoor[Go API front-door]
    FrontDoor --> Neon
    FrontDoor --> Olla[Olla gateway]
    Olla --> SG[sg.dgxspark.dev node]
    Olla --> N[node N]
    SG --> Ollama[Ollama]
    N --> OllamaN[Ollama]
```

1. **Next.js** — dashboard, login, keys, usage (`www`)
2. **Go API + Olla** — validate keys, route/stream inference (`api`)
3. **Inference nodes** — Ollama behind tunnel/Caddy
4. **Neon** — users, hashed API keys, usage

Details: [`gateway/README.md`](gateway/README.md).

---

## Tech stack

- **Frontend**: Next.js (App Router), React, Tailwind CSS v4, Framer Motion, Lucide
- **Database**: Neon PostgreSQL — Prisma (Next.js) + pgx (Go)
- **Auth**: bcryptjs, jsonwebtoken
- **Gateway**: Go API + [Olla](https://thushan.github.io/olla/)
- **Inference**: Ollama on DGX Spark nodes
- **Deploy**: Vercel (www) + VPS/Docker (api) + Cloudflare Tunnel

---

## Configuration

### Next.js (project root)

Copy [`env.example`](env.example) → `.env`:

```env
DATABASE_URL=postgresql://user:password@host-pooler/dbname?sslmode=require
JWT_SECRET=your-secure-jwt-signing-secret
REFERRAL_CODE=your-secret-invite-signup-code

INFERENCE_GATEWAY_URL=http://127.0.0.1:50080
INFERENCE_GATEWAY_API_KEY=dgx_chat_your_platform_chat_key
```

| Variable | Purpose |
|----------|---------|
| `INFERENCE_GATEWAY_URL` | Go API base URL (local `:50080` or `https://api.dgxspark.dev`) |
| `INFERENCE_GATEWAY_API_KEY` | Platform chat key (`dgx_chat_…`) — must match gateway `CHAT_SERVICE_KEY` |

User SDK keys are `dgx_sk_*` from the dashboard (`base_url=…/v1`). They are not the chat key.

### Gateway (`gateway/`)

Copy [`gateway/env.example`](gateway/env.example) → `gateway/.env`:

```env
SG_API_ENDPOINT=https://sg.dgxspark.dev
SG_API_KEY=replace-with-node-x-api-key
OLLA_PORT=40114
API_PORT=50080
CHAT_SERVICE_KEY=dgx_chat_your_platform_chat_key
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
```

> On Windows, low ports like `8000`/`8080` are often reserved by Hyper-V/WinNAT. Prefer a high host port such as `50080`.

---

## Run the Next.js app

```bash
git clone https://github.com/Haoming9527/DGX-Spark-Platform.git
cd DGX-Spark-Platform
cp env.example .env   # fill values
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Point `INFERENCE_GATEWAY_URL` at a running gateway (below) or production `https://api.dgxspark.dev`.

---

## Run the gateway

The gateway is Docker Compose under [`gateway/`](gateway/): **Olla** (model router) + **Go API** (auth, system prompt, proxy).

### 1. Configure

```bash
cd gateway
cp env.example .env
```

Edit `.env`:

- `SG_API_ENDPOINT` / `SG_API_KEY` — first inference node
- `CHAT_SERVICE_KEY` — same value as Next.js `INFERENCE_GATEWAY_API_KEY`
- `DATABASE_URL` — Neon (needed for `dgx_sk_*` user keys; optional if you only test the chat key)

Optional: edit [`gateway/system-prompt.md`](gateway/system-prompt.md) (text below `---`). The API injects it as the first system message on chat completions.

### 2. Start

```bash
docker compose up -d --build
```

| Service | Default | Role |
|---------|---------|------|
| `api` | `http://127.0.0.1:50080` | Public front-door (`/v1`, `/healthz`, status) |
| `olla` | `http://127.0.0.1:40114` | Internal router (usually not hit from the browser) |

Check health:

```bash
curl http://127.0.0.1:50080/healthz
```

### 3. Wire the UI

In the project root `.env`:

```env
INFERENCE_GATEWAY_URL=http://127.0.0.1:50080
INFERENCE_GATEWAY_API_KEY=dgx_chat_…   # same as CHAT_SERVICE_KEY
```

Restart `npm run dev` if it was already running.

### 4. Stop

```bash
cd gateway
docker compose down
```

### Production notes

- Expose only the API host port (local default `50080`, container still listens on `8080`) via Cloudflare Tunnel — see [`gateway/cloudflared.example.yml`](gateway/cloudflared.example.yml).
- Full VM / tunnel steps: [`gateway/README.md`](gateway/README.md).

---

## Design

Sticker-poster UI: dotted paper/asphalt field, die-cut stickers, corridor **EXIT** plate for go-back, logo green `#75B900`. Light/dark via manual toggle (persisted) with system preference as fallback.

---

## Security

Built for private infrastructure. Inference runs on your nodes; keep gateway and node secrets off the client and out of git.

---

## Legal

**DGX Spark Platform** is a personal, non-commercial project. It is **not affiliated with NVIDIA**. “NVIDIA” / “DGX” are used only to describe hardware compatibility.

---

## License

MIT — see [LICENSE](LICENSE).
