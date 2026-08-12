# Multi-node inference gateway

| Surface | Host | Role |
|---------|------|------|
| Dashboard / keys | `https://www.dgxspark.dev` | Next.js (Vercel) |
| OpenAI API + UI upstream | `https://api.dgxspark.dev` | Go API + Olla (VM) |
| Nodes | e.g. `https://sg.dgxspark.dev` | Ollama (gateway-only; never hit from the app) |

```text
Browser / SDK → api.dgxspark.dev → api → Olla → nodes
```

## Run locally

```bash
cd gateway
cp env.example .env
# fill SG_API_KEY, CHAT_SERVICE_KEY, DATABASE_URL
docker compose up -d --build
```

Edit [`gateway/system-prompt.md`](../gateway/system-prompt.md) (text below `---`). The API service injects it as the first system message on chat completions / Ollama chat.

## Deploy on Google Cloud (Always Free)

1. Create a project + enable billing (Always Free still needs a billing account).
2. Create a VM:
   - Machine: **`e2-micro`**
   - Region: **`us-central1`**, **`us-west1`**, or **`us-east1` only** (otherwise it is not free)
   - OS: Ubuntu 22.04 LTS
   - Boot disk: ≤ 30 GB standard persistent disk
3. SSH in, install Docker:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER
# log out/in, then:
```

4. Clone the repo (or copy the `gateway/` folder), configure, start:

```bash
cd gateway
cp env.example .env
# Edit .env: SG_API_KEY, CHAT_SERVICE_KEY, DATABASE_URL
# Ensure config/olla.yaml has url: "https://sg.dgxspark.dev"
docker compose up -d --build
```

5. Expose with **Cloudflare Tunnel** (recommended — no open 8080 to the world):

```bash
# after creating a tunnel in the Cloudflare Zero Trust dashboard
sudo cloudflared service install
# use gateway/cloudflared.example.yml as a template
# route DNS: api.dgxspark.dev → this tunnel → http://127.0.0.1:8080
```

6. Vercel / local Next.js:

```env
INFERENCE_GATEWAY_URL=https://api.dgxspark.dev
INFERENCE_GATEWAY_API_KEY=dgx_chat_...   # same as CHAT_SERVICE_KEY
```

Stay on **e2-micro** in a free US region. Watch egress (~1 GB/month free).

Oracle Ampere also works if signup succeeds later (more headroom).

## Next.js / Vercel

```env
INFERENCE_GATEWAY_URL=https://api.dgxspark.dev
INFERENCE_GATEWAY_API_KEY=dgx_chat_...   # platform chat key (matches gateway CHAT_SERVICE_KEY)
```

User dashboard keys stay `dgx_sk_*` for OpenAI SDK clients (`base_url=https://api.dgxspark.dev/v1`). The chat key is not in the `api_keys` table.

Inference lives only on `api.dgxspark.dev` — `www` has no `/v1` routes.

## Add a node

Edit [`gateway/config/olla.yaml`](../gateway/config/olla.yaml): put the **literal** node URL in `url:` (Olla does not expand `${VAR}` there). Keep secrets as `${NODE_API_KEY}`. Add the key to `docker-compose.yml` / `.env`, then `docker compose up -d`.

## Client

```python
from openai import OpenAI
client = OpenAI(api_key="dgx_sk_...", base_url="https://api.dgxspark.dev/v1")
```
