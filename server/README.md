# BEDES MikroTik Controller — Backend

Express + TypeScript API server untuk BEDES MikroTik Controller. Bagian
dari project monorepo — lihat [README utama](../README.md) untuk overview,
fitur, dan instalasi.

---

## Stack

- **Runtime**: Node.js 22 (production image: `node:22-bookworm-slim`).
- **HTTP**: Express 4 + Socket.IO 4.
- **TypeScript**: 5.x, strict mode, NodeNext module resolution.
- **MikroTik**: `node-routeros` 1.6.x untuk RouterOS API.
- **AI**: Anthropic SDK, OpenAI SDK (untuk LM Studio & OpenAI-compatible),
  custom Claude/Cloudflare adapters.
- **Persistence**: better-sqlite3 (agent DB, wireguard DB, backups metadata).
- **Validation**: Zod schemas (`config.schema.ts`).

---

## Struktur kode

```
server/
├── src/
│   ├── index.ts                         # Express app, Basic Auth, route mounting, SPA fallback
│   ├── routes/
│   │   ├── agent.ts                     # AI agent / MCP chat streaming
│   │   ├── backups.ts                   # Backup list / create / download / restore
│   │   ├── health.ts                    # /api/health (uptime, memory, router, LLM)
│   │   ├── router.ts                    # **Multi-router CRUD** (profiles)
│   │   ├── service.ts                   # Backend service control
│   │   ├── settings.ts                  # Settings get/update (server / mikrotik / llm / routers)
│   │   ├── setup.ts                     # Setup wizard
│   │   ├── terminal.ts                  # RouterOS terminal command execution
│   │   └── wireguard.ts                 # WireGuard interface + peers + QR codes
│   └── services/
│       ├── ai/
│       │   ├── conversation-manager.ts  # AI conversation orchestration
│       │   ├── provider-factory.ts      # Provider selection
│       │   ├── providers/
│       │   │   ├── base.ts              # LLMProvider interface
│       │   │   ├── claude.ts            # Anthropic Claude
│       │   │   ├── cloudflare.ts        # Cloudflare Workers AI
│       │   │   └── lmstudio.ts          # LM Studio / OpenAI-compatible
│       │   └── mcp/                     # **14 MCP tools** for network diagnostics
│       │       ├── tools/
│       │       │   ├── firewall-tool.ts, connectivity-tool.ts, dhcp-tool.ts, …
│       │       ├── mcp-executor.ts      # Tool dispatch + orchestration
│       │       ├── command-whitelist.ts # RouterOS command safety
│       │       └── rate-limiter.ts      # Per-session rate limit
│       ├── agent/
│       │   ├── monitor/health-monitor.ts      # Background health polling
│       │   ├── detector/issue-detector.ts     # Issue rules engine
│       │   ├── database/agent-db.ts           # SQLite issue tracker
│       │   └── rules/                         # 10+ rule modules
│       ├── config/
│       │   ├── config.schema.ts               # Zod schemas (AppConfig, RouterProfile, …)
│       │   ├── config.defaults.ts             # DEFAULT_CONFIG
│       │   ├── config.validator.ts            # Runtime validation
│       │   ├── config.migrator.ts             # .env → config.json migration
│       │   ├── unified-config.service.ts      # Load/save + atomic write + watcher
│       │   └── config.backup.ts               # Auto-backup before save
│       ├── wireguard/
│       │   ├── wireguard.service.ts
│       │   ├── wireguard-db.ts                # better-sqlite3
│       │   └── wireguard-schema.sql
│       ├── backup-management.service.ts       # Binary + .rsc backup lifecycle
│       ├── config-manager.ts                  # Single source of truth (AppConfig)
│       ├── mikrotik.ts                        # RouterOS connection + cache
│       ├── settings.ts                        # Web-UI managed settings
│       ├── setup.service.ts
│       └── terminal-session.ts                # Real-time WebSocket terminal
├── data/                                       # SQLite DBs + backups (bind-mounted)
├── dist/                                       # tsc output
├── package.json
└── tsconfig.json
```

---

## Configuration

### `.env` (container, lihat root [`.env.example`](../.env.example))

| Variable                | Default          | Keterangan                                                |
|-------------------------|------------------|-----------------------------------------------------------|
| `PORT`                  | `3000`           | Internal port (Traefik routing only)                      |
| `NODE_ENV`              | `production`     | Set `development` untuk verbose error messages           |
| `FRONTEND_DIST_DIR`     | `/app/dist`      | Path ke built React assets                                |
| `BEDES_DOMAIN`          | —                | Domain publik (untuk CORS)                                |
| `CORS_ORIGIN`           | —                | Allowed origin (wajib match browser URL)                  |
| `BEDES_ADMIN_USER`      | —                | Basic Auth user (kosong = disable auth)                   |
| `BEDES_ADMIN_PASSWORD`  | —                | Basic Auth password                                       |
| `LLM_PROVIDER`          | `lmstudio`       | `claude` / `lmstudio` / `cloudflare`                      |
| `LMSTUDIO_ENDPOINT`     | —                | OpenAI-compatible base URL                                |
| `LMSTUDIO_MODEL`        | —                | Model id                                                 |
| `LMSTUDIO_CONTEXT_WINDOW` | `32768`        | Context window token count                                |
| `ANTHROPIC_API_KEY`     | —                | Claude API key                                             |
| `CLAUDE_MODEL`          | `claude-3-5-sonnet-20241022` | Claude model id                                |
| `CLOUDFLARE_ACCOUNT_ID` | —                | Cloudflare account id                                      |
| `CLOUDFLARE_API_TOKEN`  | —                | Cloudflare API token                                       |
| `CLOUDFLARE_AI_MODEL`   | `@cf/meta/llama-4-scout-17b-16e-instruct` | Workers AI model              |

### `config.json` (persistent, bind-mounted)

Lihat [`config.json.example`](../config.json.example) untuk struktur
lengkap. Multi-router fields:

```jsonc
{
  "routers": [
    {
      "id": "uuid-v4",
      "name": "Router Kantor Pusat",
      "host": "10.244.244.10",
      "port": 8728,
      "username": "admin",
      "password": "...",
      "timeout": 10000,
      "keepaliveInterval": 30000,
      "speedTest": { "fileSizeMB": 250, "testServer": "cloudflare", "...": "..." },
      "enabled": true
    }
  ],
  "activeRouterId": "uuid-v4"
}
```

Backend otomatis fallback ke single `mikrotik{}` block kalau `routers[]`
kosong — backward compatible dengan versi single-router lama.

---

## Scripts

| Command                       | Keterangan                                       |
|-------------------------------|--------------------------------------------------|
| `npm run dev`                 | Dev server dengan hot reload (tsx watch)         |
| `npm run build`               | Compile TS ke `dist/`                            |
| `npm start`                   | Run production build                             |
| `npm run typecheck`           | Cek types tanpa build                            |
| `npm run migrate-config`      | Migrate format config (.env → config.json)       |
| `npm run validate-config`     | Validate `config.json` terhadap schema           |
| `npm run backup-config`       | Backup `config.json`                             |
| `npm run restore-config`      | Restore dari backup                              |
| `npm run list-backups`        | List semua config backups                        |

---

## REST API

Lihat dokumentasi lengkap di root [README.md → REST API](../README.md#-rest-api).
Highlights:

### Multi-router
- `GET    /api/router/profiles` — list + active selection.
- `POST   /api/router/profiles` — tambah profile.
- `PUT    /api/router/profiles/:id` — update.
- `POST   /api/router/profiles/:id/activate` — pilih active, refresh koneksi.
- `DELETE /api/router/profiles/:id` — hapus.

### AI
- `POST   /api/agent/chat` — natural language query (streaming).
- `GET    /api/agent/issues` — list issues.
- `POST   /api/agent/scan` — trigger diagnostic scan.

### Backup
- `GET    /api/backups`
- `POST   /api/backups`
- `GET    /api/backups/:id/download`
- `POST   /api/backups/restore`

### Settings
- `GET /api/settings`
- `PUT /api/settings`

### WireGuard
- `GET    /api/wireguard/interfaces`
- `POST   /api/wireguard/interfaces`
- `GET    /api/wireguard/peers`
- `POST   /api/wireguard/peers`
- `GET    /api/wireguard/peers/:id/qr`

### Terminal
- `POST /api/terminal/exec`

### Setup wizard
- `GET  /api/setup/status`
- `POST /api/setup/complete`

---

## Catatan multi-router

1. **`config-manager.ts`** adalah single source of truth. Setiap kali
   settings di-update (via `PUT /api/settings` atau
   `POST /api/router/profiles`), `refreshConfig()` dipanggil sehingga
   service lain (MikroTik connection, agent, terminal) otomatis pakai
   router aktif yang baru.
2. **Activate router**: `POST /api/router/profiles/:id/activate`
   menyalin profile ke legacy `mikrotik{}` block juga, supaya service
   layer yang masih baca single config tetap dapat nilai benar.
3. **Password masking**: response API selalu mask password jadi
   `********`. Form edit mengirim `********` untuk instruksi
   "pertahankan password lama"; backend akan compare dan skip update
   kalau placeholder.
4. **Backward compatibility**: kalau `routers[]` kosong, sistem
   otomatis treat `mikrotik{}` (single-router) sebagai fallback single
   profile, jadi upgrade dari versi lama mulus tanpa migrasi manual.

---

## Catatan security

- **Basic Auth** di `index.ts`: optional via env vars, semua route kecuali
  `/api/health`. Backward-compatible: env var lama
  `APECONTROL_ADMIN_USER`/`APECONTROL_ADMIN_PASSWORD` masih dikenali.
- **Atomic write**: `unified-config.service.ts` → `atomicWrite()`
  pakai rename untuk atomicity, dengan retry 5× lalu fallback ke direct
  write kalau rename kena EBUSY (umum di Docker bind-mount dengan
  chokidar watcher hold file lock).
- **Command whitelist**: `ai/mcp/command-whitelist.ts` membatasi perintah
  RouterOS yang boleh dijalankan via AI agent.
- **Rate limiting**: `ai/mcp/rate-limiter.ts` 20 calls/menit/session.
- **Audit logging**: `ai/mcp/security/audit-logger.ts` log semua
  eksekusi tool.
- **CORS**: configurable via `CORS_ORIGIN`, default ke `BEDES_DOMAIN`.
- **Zod validation**: semua input API di-validasi sebelum diproses.

---

## Upstream credit

Server ini fork dari
[JungleM0nkey/apehost-mikrotik-controller](https://github.com/JungleM0nkey/apehost-mikrotik-controller).
Lihat root [README.md → Credits](../README.md#-license--credits) untuk
daftar modifikasi yang dilakukan di fork.

Lisensi: MIT.