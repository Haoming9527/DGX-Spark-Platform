# 🟢 DGX Spark Platform

A private, high-performance, and feature-rich chat interface optimized for **Nvidia DGX Spark** and local LLM execution via Ollama. 

Built with **Next.js 16**, **Tailwind CSS v4**, and **Framer Motion**, this platform provides a premium, Nvidia-themed GPT alternative with absolute privacy and zero data retention.

---

## 🚀 Key Features

- **🧠 Reasoning Mode (Thinking)**: Toggle internal reasoning for supported models to visualize the AI's thought process in a clean, expandable accordion.
- **🎙️ Voice-to-Text**: Built-in, high-fidelity browser voice recognition with real-time interim transcription and visual feedback.
- **🔐 Secure Authentication**: Multi-user account login and signup powered by Neon PostgreSQL database, password hashing (`bcryptjs`), and secure JWT-signed HTTP-Only cookies.
- **🎫 Timing-Safe Invite Codes**: Restricts user registration via a constant-time referral validation check (`crypto.timingSafeEqual`) to block length-based timing attacks.
- **🔑 Developer API Keys**: Generate, rename, and revoke custom API keys (e.g., `dgx_sk_...`) from a private dashboard page.
- **📊 Real-time Telemetry & Timeline**: Visualizes token and request volumes per key across dynamic intervals (Past 1h, 24h, 7d, 30d). Drill-down views display interactive SVG lines (Requests vs. Success Rates) and stacked bar charts for status code errors (400, 403, 404).
- **🔌 OpenAI-Compatible API**: Public inference at `https://api.dgxspark.dev/v1` (Olla gateway). Dashboard stays on `www.dgxspark.dev`.
- **🛰️ Multi-node inference (Olla)**: [`docs/multi-node-inference.md`](docs/multi-node-inference.md) — public API `https://api.dgxspark.dev/v1`.
- **🎨 Nvidia-Inspired UI**: Premium dark/light themes with signature neon-green accents, glassmorphism, and smooth Framer Motion transitions.
- **💤 DGX Offline Mode**: Intelligent handling of backend connectivity. If the DGX hardware is resting, the platform gracefully enters a "Resting" state.

---

## 🏗️ Backend Architecture

Control plane (Next.js) and inference data plane (Olla) are separate:

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

1. **Next.js (Vercel)** — dashboard, login, API key CRUD, usage charts at `www.dgxspark.dev`.
2. **Go API + Olla (GCP e2-micro / any VPS)** — validate `dgx_sk_*`, model-aware routing, streaming at `api.dgxspark.dev/v1`.
3. **Inference nodes** — Ollama behind Cloudflare Tunnel + Caddy (`X-API-Key`), starting with `sg.dgxspark.dev`.
4. **Neon** — shared users / API keys / usage (hashed keys only).

See [`docs/multi-node-inference.md`](docs/multi-node-inference.md).

---

## 🛠️ Tech Stack

- **Frontend**: [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/)
- **Database**: [Neon Serverless PostgreSQL](https://neon.tech/) via **Prisma** (Next.js) + raw SQL (Go gateway API)
- **Auth**: [bcryptjs](https://github.com/dcodeIO/bcrypt.js) (Password Hashing), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) (Session Tokens)
- **Inference gateway**: [Olla](https://thushan.github.io/olla/) + thin Go API-key front-door
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Markdown**: [React-Markdown](https://github.com/remarkjs/react-markdown) + [Remark-GFM](https://github.com/remarkjs/remark-gfm)
- **Code Highlighting**: [React-Syntax-Highlighter](https://github.com/react-syntax-highlighter/react-syntax-highlighter) (Prism)
- **Backend API**: [Ollama](https://ollama.com/) on DGX Spark nodes
- **Deployment**: Vercel (www) + GCP Always Free e2-micro or any VPS (api) + [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/) for `api.dgxspark.dev`

---

## ⚙️ Configuration

Copy [`env.example`](env.example) to `.env` in the project root:

```env
DATABASE_URL=postgresql://user:password@host-pooler/dbname?sslmode=require
# DIRECT_URL=postgresql://user:password@host/dbname?sslmode=require   # optional, Prisma CLI
JWT_SECRET=your-secure-jwt-signing-secret
REFERRAL_CODE=your-secret-invite-signup-code

# UI chat via Olla gateway (not direct to a DGX node)
INFERENCE_GATEWAY_URL=https://api.dgxspark.dev
INFERENCE_GATEWAY_API_KEY=dgx_chat_your_platform_chat_key
```

- `INFERENCE_GATEWAY_URL`: Public API+Olla gateway.
- `INFERENCE_GATEWAY_API_KEY`: Platform chat key (`dgx_chat_…`) — same as gateway `CHAT_SERVICE_KEY`. Not a user dashboard key.
- Node secrets (`SG_API_*`) live only on the VPS — see [`gateway/env.example`](gateway/env.example).
- SDK clients use `base_url=https://api.dgxspark.dev/v1` with a `dgx_sk_*` key from the dashboard.

---

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Haoming9527/DGX-Spark-Platform.git
   cd DGX-Spark-Platform
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to experience the platform.

---

## 🌙 Design System

The platform features a **Dynamic Design System** that automatically adapts according to your browser/system preference:

- **Nvidia Dark**: A sleek, high-contrast dark mode using `#0a0a0a` and neon green gradients.
- **Nvidia Light**: A crisp, clean professional light mode using `#f9fafb` with subtle green borders.

---

## 🔐 Security Disclaimer

The **DGX Spark Platform** is designed for private environments. All LLM processing is handled on private hardware to ensure total data sovereignty.

---

## ⚖️ Legal Disclaimer

**DGX Spark Platform** is a **personal, non-commercial project** developed for private infrastructure management and local LLM research.

- This project is **not affiliated, associated, authorized, endorsed by, or in any way officially connected** with **NVIDIA Corporation**, or any of its subsidiaries or its affiliates. 
- The name "NVIDIA" as well as related names, marks, emblems, and images are registered trademarks of their respective owners.
- The use of "NVIDIA" or "DGX" in this project is for descriptive purposes only to indicate compatibility with specific hardware environments.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](file:///e:/Projects/dgx-spark-platform/LICENSE) file for details.



