# BEDES MikroTik Controller

> Multi-router MikroTik RouterOS management dashboard with built-in AI assistant
> for network diagnostics and troubleshooting.
>
> Forked from
> [JungleM0nkey/apehost-mikrotik-controller](https://github.com/JungleM0nkey/apehost-mikrotik-controller),
> re-branded to **BEDES MikroTik Controller** and extended with full
> multi-router support.

---

## ✨ Fitur

### 🛰️ Multi-router management
- Kelola banyak MikroTik dari satu dashboard.
- Tambah, edit, aktifkan, dan hapus profil router lewat UI atau REST API.
- Pilih router aktif dengan satu klik — connection, agent, terminal, dan AI
  otomatis switch ke router yang dipilih.
- Fallback ke konfigurasi single-router lama (`config.json` → `mikrotik{}`)
  supaya upgrade dari versi single-router mulus tanpa migrasi manual.
- Password disimpan terenkripsi di `config.json`; API response selalu
  masking dengan `********` dan form edit hanya overwrite jika user
  mengetik password baru (placeholder `********` artinya "jangan ubah").

### 🤖 AI assistant (opsional, 3 provider)
- 14 specialised MCP tools untuk network troubleshooting:
  firewall path analysis, ping/traceroute, ARP/DNS/DHCP diagnostics,
  security audit, WireGuard management, speed test, system metrics, dll.
- Plug-in LLM provider pilihan:
  - **Claude (Anthropic)** — kualitas premium, bayar.
  - **Cloudflare Workers AI** — murah, function-calling support.
  - **LM Studio / OpenAI-compatible endpoint** — gratis, self-hosted.
- 5-phase diagnostic workflow otomatis (Understand → Test → Analyze → Check
  → Trace) dengan confidence scoring & severity classification.

### 📊 Dashboard & monitoring
- Real-time router metrics, system resources, interface status, traffic
  statistics.
- Live WebSocket updates untuk interface data dengan visual traffic
  indicators.
- Network map interaktif (ReactFlow + Dagre) dengan traffic flow
  visualisation.
- Speed-test integration (Cloudflare / Google / custom URL).

### 🔌 WireGuard management
- Auto-generate key pair, peer management, QR code untuk mobile,
- Interface setup wizard.
- Persistent DB via better-sqlite3.

### 💾 Backup & restore
- Backup binary + export format (.rsc / .backup).
- Auto-backup sebelum setiap perubahan konfigurasi.
- Restore via web UI.

### 🔒 Security hardening (rilis saat ini)
- Optional Basic Auth via `BEDES_ADMIN_USER` / `BEDES_ADMIN_PASSWORD` (semua
  route, kecuali `/api/health`).
- HTTPS lewat Traefik + Let's Encrypt automatic certificate.
- Audit log untuk AI conversation & router command.
- Atomic write untuk `config.json` dengan retry + fallback untuk handle
  EBUSY di Docker bind-mount.

### 🐳 Production-ready container
- Multi-stage Docker build (frontend-builder → server-builder → production).
- Traefik-fronted via Docker labels, sharing network `hosting-public`
  dengan stack docker-hosting-panel.
- Health check, restart policy, persistent data + config volumes.
- Image `bedes-mikrotik-controller:latest`, container
  `bedes-mikrotik-controller`.

---

## 📋 Prasyarat

- **Node.js 18+** (untuk development lokal; production lewat Docker).
- **MikroTik router** dengan API access enabled (port default `8728`).
- **AI provider** (pilih salah satu dari Claude / Cloudflare / LM Studio) —
  opsional, dashboard tetap jalan tanpa AI.
- **Docker + Docker Compose** (untuk deployment via container).
- **Traefik v3.x** sebagai reverse-proxy + Let's Encrypt handler (opsional
  tapi direkomendasikan untuk HTTPS).

---

## 🚀 Instalasi

### Opsi A — Docker (production, direkomendasikan)

#### 1. Clone & masuk ke direktori
```bash
git clone https://github.com/ashadebi/bedes-mikrotik-controller.git
cd bedes-mikrotik-controller
```

#### 2. Copy & edit konfigurasi
```bash
cp .env.example .env
$EDITOR .env   # set BEDES_DOMAIN, BEDES_ADMIN_USER, BEDES_ADMIN_PASSWORD, LLM_*
```

Variabel wajib:
| Variable                  | Contoh                       | Keterangan                                |
| ------------------------- | ---------------------------- | ----------------------------------------- |
| `BEDES_DOMAIN`            | `bedes.example.com`          | Domain publik yang di-route Traefik       |
| `BEDES_ADMIN_USER`        | `admin`                      | Basic Auth user (kosongkan untuk disable) |
| `BEDES_ADMIN_PASSWORD`    | `random-32-chars`            | Basic Auth password                       |
| `PUBLIC_NETWORK`          | `hosting-public`             | Network Docker yang di-share dengan Traefik |
| `CORS_ORIGIN`             | `https://bedes.example.com`  | Allowed origin untuk API                  |
| `LLM_PROVIDER`            | `lmstudio`                   | `claude` / `lmstudio` / `cloudflare`      |

#### 3. Buat `config.json` pertama (opsional)
Kalau kamu sudah punya router MikroTik, set kredensial-nya:
```bash
cp config.json.example config.json
$EDITOR config.json
```
Strukturnya (lihat bagian **Konfigurasi** di bawah).

#### 4. Build & jalankan
```bash
docker-compose build bedes-mikrotik-controller
docker-compose up -d bedes-mikrotik-controller
docker-compose logs -f bedes-mikrotik-controller
```

#### 5. Verifikasi
```bash
# Health endpoint (no auth)
curl -u admin:<password> https://$BEDES_DOMAIN/api/health

# Lihat router profiles
curl -u admin:<password> https://$BEDES_DOMAIN/api/router/profiles
```

#### 6. Setup router pertama via UI
Buka `https://$BEDES_DOMAIN/` di browser, login dengan Basic Auth,
masuk ke **Settings → Router Profiles → Add Router**, isi:
- Name, Host (IP MikroTik), Port, Username, Password
- Klik **Save** lalu **Activate**.

#### 7. (Opsional) Traefik labels
`docker-compose.yml` sudah include labels lengkap. Pastikan VPS/host punya
Traefik di network yang sama (`hosting-public` by default). DNS A record
untuk `$BEDES_DOMAIN` harus menunjuk ke IP publik VPS tempat Traefik
listen 443.

### Opsi B — Development lokal (tanpa Docker)

```bash
git clone https://github.com/ashadebi/bedes-mikrotik-controller.git
cd bedes-mikrotik-controller
npm install
cd server && npm install && cp .env.example .env && cd ..
npm run dev:full   # jalanin frontend (5173) + backend (3000) paralel
```

Frontend: http://localhost:5173
Backend: http://localhost:3000

---

## 🧭 Cara pakai

### Multi-router workflow

1. **Buka Settings → Router Profiles** di sidebar.
2. **Tambah router**: klik "Add Router", isi host/port/username/password,
   klik Save. Profile baru otomatis menjadi active kalau belum ada active
   router.
3. **Switch active router**: klik "Activate" di profile yang dikehendaki.
   Backend akan refresh koneksi RouterOS API ke router baru.
4. **Edit profile**: ubah field apapun. Password kosong / `********` artinya
   "pertahankan password lama".
5. **Hapus profile**: klik delete di profile yang tidak dipakai lagi. Kalau
   router yang dihapus adalah active, system auto-switch ke router pertama
   yang tersisa.
6. **Verify**: lihat sidebar → "Connected Router" panel → IP, status,
   uptime, last error.

### AI assistant chat
1. Buka menu **AI Assistant** di sidebar.
2. Tulis pertanyaan natural language, misal:
   - "Kenapa client 192.168.1.100 tidak bisa akses HTTPS ke 10.0.0.50?"
   - "Cek health router sekarang, ada issue ga?"
   - "Buatin WireGuard peer baru untuk user A dengan IP 10.10.0.2/24."
3. AI otomatis pilih tool yang relevan, tanyakan ke router aktif, kasih
   jawaban + rekomendasi + severity.

### Backup & restore
1. Menu **Backups**: lihat list backup (auto-backup dibuat setiap kali
   settings di-update).
2. Klik **Create Backup** untuk backup on-demand.
3. Klik **Download** untuk download `.backup` binary atau `.rsc` export.
4. Klik **Restore** untuk upload backup kembali ke router.

### WireGuard setup
1. Menu **WireGuard** → klik "Create Interface".
2. Tulis interface name, port, address range.
3. Klik "Add Peer" untuk tambah device — QR code langsung tersedia untuk
   scan dari mobile.

---

## ⚙️ Konfigurasi

### `config.json` (data layer, persistent)

```json
{
  "version": "1.0.0",
  "server":    { "port": 3000, "corsOrigin": "https://...", "nodeEnv": "production" },
  "mikrotik":  { "host": "192.168.88.1", "port": 8728, "username": "admin", "password": "..." },
  "routers":   [],
  "activeRouterId": null,
  "llm":       { "provider": "lmstudio", "lmstudio": { "endpoint": "https://...", "model": "qwen3-8b" } },
  "assistant": { "temperature": 0.7, "maxTokens": 2048, "systemPrompt": "..." }
}
```

Field baru di multi-router:
- `routers`: array of `RouterProfile` (id, name, host, port, username,
  password, timeout, keepaliveInterval, speedTest, enabled).
- `activeRouterId`: ID router yang sedang dipilih.

Backend otomatis fallback ke `mikrotik{}` (single-router) kalau
`routers[]` kosong.

### `.env` (runtime, container)

Lihat [`.env.example`](./.env.example) untuk semua opsi. Highlights:
- `BEDES_DOMAIN` — domain publik Traefik.
- `BEDES_ADMIN_USER` / `BEDES_ADMIN_PASSWORD` — Basic Auth (kosong = off).
- `LLM_PROVIDER` + `*_ENDPOINT` / `*_API_KEY` — AI provider.

---

## 🔌 REST API

Semua endpoint di-prefix `/api`. Jika Basic Auth enabled, sertakan
`Authorization: Basic <base64(user:pass)>` header.

### Health
- `GET /api/health` — status server, uptime, memory, router connection,
  LLM config.

### Router profiles (multi-router)
- `GET    /api/router/profiles` — list semua profile + active selection.
- `POST   /api/router/profiles` — tambah router baru.
- `PUT    /api/router/profiles/:id` — update profile.
- `POST   /api/router/profiles/:id/activate` — pilih active router.
- `DELETE /api/router/profiles/:id` — hapus profile.

### Settings
- `GET /api/settings` — current settings (masked passwords).
- `PUT /api/settings` — update settings (server / mikrotik / routers / llm
  / assistant).

### Backup
- `GET    /api/backups` — list backups.
- `POST   /api/backups` — create backup on-demand.
- `GET    /api/backups/:id/download` — download binary.
- `POST   /api/backups/restore` — upload & restore.

### AI agent
- `POST /api/agent/chat` — natural language query (streaming).
- `GET  /api/agent/issues` — list detected issues.

### Terminal
- `POST /api/terminal/exec` — eksekusi perintah RouterOS (whitelisted).

### WireGuard
- `GET    /api/wireguard/interfaces`
- `POST   /api/wireguard/interfaces`
- `GET    /api/wireguard/peers`
- `POST   /api/wireguard/peers`

Lihat [server/README.md](./server/README.md) untuk detail lengkap.

---

## 🐛 Troubleshooting

| Symptom                                       | Penyebab                                     | Fix |
|----------------------------------------------|----------------------------------------------|-----|
| Container restart loop                       | Module missing di production deps            | Cek log: `docker logs bedes-mikrotik-controller` — biasanya error `ERR_MODULE_NOT_FOUND`. Tambah package ke `server/package.json` & rebuild. |
| 502 Bad Gateway dari Traefik                 | Container tidak healthy / Traefik tidak bisa resolve IP | Cek `docker logs hosting-traefik`. Pastiin `traefik.docker.network=hosting-public` di label. |
| 401 Authentication required                  | Basic Auth enabled tapi tidak dikirim         | Set `BEDES_ADMIN_USER`/`PASSWORD` di `.env`, atau sertakan Basic Auth header. |
| `EBUSY` saat save settings                   | File watcher (chokidar) hold file lock        | `atomicWrite` sudah ada retry + fallback direct write (commit terbaru). |
| AI Assistant not responding                  | LLM provider credentials salah / endpoint unreachable | Cek `/api/health` → `llm.configured`. Coba hit endpoint LLM manual. |
| Cannot connect to MikroTik                   | API port blocked / wrong credentials         | Pastikan port 8728 (atau 8729 SSL) terbuka. Test pakai `node-routeros` CLI. |

---

## 🛠️ Development

```bash
# Frontend only (Vite dev server)
npm run dev

# Backend only (with hot reload)
cd server && npm run dev

# Both concurrently with port cleanup
npm run dev:full

# Build production
npm run build:all

# Type check
cd server && npm run typecheck

# Config management CLI
cd server && npm run validate-config
cd server && npm run backup-config
cd server && npm run list-backups
```

### Code structure
```
.
├── src/                         # React frontend (atomic design: atoms/molecules/organisms)
│   ├── components/
│   │   ├── atoms/               # Button, Input, Slider, Toggle, dll
│   │   ├── molecules/           # FormField, ToggleField, dll
│   │   └── organisms/           # Sidebar, SettingsSection, NetworkMap, dll
│   ├── pages/                   # Dashboard, AIAssistantPage, RouterPage, SettingsPage, SetupWizardPage
│   ├── contexts/                # React contexts
│   ├── hooks/                   # Custom React hooks
│   ├── services/                # API client wrappers
│   └── types/                   # TypeScript types
├── server/                      # Express backend
│   └── src/
│       ├── routes/              # router.ts, agent.ts, backups.ts, health.ts, dll
│       ├── services/
│       │   ├── ai/              # 14 MCP tools + 3 LLM providers
│       │   ├── agent/           # Health monitor, issue detector, learning
│       │   ├── config/          # Zod-validated schema + atomic write + migrator
│       │   ├── wireguard/       # WireGuard DB + service
│       │   └── *.service.ts     # MikroTik, terminal, backup, settings
│       └── utils/               # Terminal formatters
├── Dockerfile                   # Multi-stage build
├── docker-compose.yml           # Traefik-fronted service
├── .env.example                 # Runtime configuration template
└── config.json.example          # Persistent data template
```

---

## 📜 License & Credits

### Upstream
Project ini di-fork dari
[**JungleM0nkey/apehost-mikrotik-controller**](https://github.com/JungleM0nkey/apehost-mikrotik-controller).
Terima kasih kepada upstream author dan semua kontributor untuk fondasi
multi-router MikroTik management + AI assistant yang solid. Versi upstream
juga berlisensi MIT.

Modifikasi utama yang dilakukan di fork ini:
- **Rename** ke `BEDES MikroTik Controller` (codebase + image + container +
  Traefik labels + env var prefix).
- **Multi-router CRUD**: schema `RouterProfile[]` + `activeRouterId`,
  endpoint `/api/router/profiles` lengkap, fallback ke single-router
  legacy `mikrotik{}` block.
- **Frontend Router Profiles section** di Settings page dengan
  add/edit/activate/delete UI.
- **Optional Basic Auth** via `BEDES_ADMIN_USER` / `BEDES_ADMIN_PASSWORD`
  env var, dengan fallback ke env lama untuk transisi mulus.
- **Containerization**: multi-stage Dockerfile + Traefik labels +
  `docker-compose.yml` siap production.
- **Bug fixes**:
  - Tambah `uuid` dependency di `server/package.json` (sebelumnya bocor ke
    backup routes tapi tidak di-declare).
  - Hapus `react-markdown`/`remark-gfm` yang nyasar dari server deps.
  - Dockerfile copy `.sql` schema files ke dist (runtime read dari
    `__dirname`).
  - `atomicWrite()` retry + fallback ke direct write untuk handle EBUSY
    pada Docker bind-mount (chokidar watcher lock).
- **Dokumentasi**: README komprehensif (install, pakai, API, troubleshooting).

### Lisensi
MIT License — lihat [LICENSE.txt](./LICENSE.txt).

Logo & branding "BEDES" adalah trademark dari fork maintainer.

---

## 🤝 Contributing

PR & issue welcome di
[ashadebi/bedes-mikrotik-controller](https://github.com/ashadebi/bedes-mikrotik-controller).
Untuk perubahan besar, buka issue dulu untuk diskusi.