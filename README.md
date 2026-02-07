# Pinokiod (Forked)

> **Forked from [`pinokiod@6.0.16`](https://www.npmjs.com/package/pinokiod)** — the backend daemon for [Pinokio](https://pinokio.co), an AI Browser that lets you install and run open-source AI applications locally with one click.

## Overview

Pinokiod is the core backend engine that powers the Pinokio AI application launcher. It provides:

- **Script Execution Engine** — A JSON/YAML-based scripting system for automating AI app installations
- **Shell/Terminal Management** — Pseudo-terminal (PTY) management via `node-pty` with xterm.js integration
- **Git Operations** — Built-in git client using `isomorphic-git` for cloning and managing AI app repositories
- **Environment Management** — Isolated environment variables per app (Conda, venv, pip, HuggingFace, PyTorch)
- **Web Server & UI** — Express.js server with EJS-templated dashboard for managing installed apps
- **WebSocket Communication** — Real-time terminal streaming and event pub/sub via `ws`
- **P2P Networking** — Peer-to-peer connectivity and Cloudflare tunnel sharing
- **Proxy System** — HTTP proxy middleware for routing to locally running AI app ports

---

## Tech Stack

| Layer               | Technology                                      | Details                                       |
| ------------------- | ----------------------------------------------- | --------------------------------------------- |
| **Runtime**         | Node.js 20                                      | CommonJS modules (`require`/`module.exports`) |
| **Web Framework**   | Express.js 4.x                                  | REST API + EJS server-side rendering          |
| **Template Engine** | EJS                                             | 57+ view templates for the dashboard UI       |
| **WebSocket**       | `ws`                                            | Real-time terminal output streaming + events  |
| **Terminal**        | `@homebridge/node-pty-prebuilt-multiarch`       | Cross-platform PTY (pseudo-terminal)          |
| **Terminal Parser** | `@xterm/headless`                               | Server-side xterm.js for terminal state       |
| **Git Client**      | `isomorphic-git`                                | Pure JS git implementation                    |
| **Process Mgmt**    | `kill-sync`, `fastq`                            | Process tree killing, async job queues        |
| **Python/Conda**    | Custom scripts in `kernel/bin/`                 | Conda, venv, pip, uv, torch setup             |
| **File System**     | `fs-extra`, `glob`, `rimraf`, `compressing`     | Extended FS operations                        |
| **HTTP**            | `axios`, `cross-fetch`, `http-proxy-middleware` | HTTP client + reverse proxy                   |
| **Tunneling**       | Cloudflare (`cloudflared`)                      | Public URL sharing for local apps             |
| **Docker**          | Multi-stage Dockerfile                          | Production containerization                   |
| **Config**          | `dotenv`, `yaml`, `ini`, `gray-matter`          | Multiple config format support                |
| **Utilities**       | `lodash`, `semver`, `uuid`, `marked`            | General purpose helpers                       |

---

## Architecture

```
pinokiod/
├── index.js                    # Entry point — re-exports ./server
├── worker.js                   # Child process worker for async FS operations
├── package.json                # v6.0.16, MIT license, ~70 dependencies
├── Dockerfile                  # Multi-stage production build (Node 20)
├── docker-entrypoint.sh        # Docker bootstrap with seed archive extraction
│
├── kernel/                     # 🧠 Core Engine
│   ├── index.js                # Kernel class — main orchestrator (1212 lines)
│   ├── shell.js                # Shell/PTY management (1678 lines)
│   ├── shells.js               # Multi-shell registry & lifecycle
│   ├── git.js                  # Git operations (clone, pull, status, diff)
│   ├── environment.js          # Environment variable management per app
│   ├── peer.js                 # P2P networking & peer discovery
│   ├── procs.js                # Process tracking & management
│   ├── util.js                 # Shared utilities (35KB)
│   ├── sysinfo.js              # System information (GPU, RAM, disk)
│   ├── workspace_status.js     # Workspace/app status tracking
│   ├── favicon.js              # App favicon extraction
│   ├── plugin.js               # Plugin system
│   ├── prototype.js            # Prototype/template system
│   ├── lproxy.js               # Local proxy management
│   ├── store.js                # Key-value store
│   ├── key.js                  # API key management
│   ├── kv.js                   # Key-value helpers
│   ├── loader.js               # Script loader
│   ├── script.js               # Script parsing
│   ├── info.js                 # System info queries
│   ├── shell_parser.js         # Shell output parsing
│   ├── ansi_stream_tracker.js  # ANSI escape sequence tracking
│   ├── bracketed_paste_detector.js # Terminal paste detection
│   │
│   ├── api/                    # 📡 36 API Modules
│   │   ├── index.js            # API router & dispatcher (51KB)
│   │   ├── shell/              # shell.run, shell.start, shell.stop
│   │   ├── fs/                 # File system operations + download worker
│   │   ├── exec/               # Command execution
│   │   ├── env/                # Environment variable CRUD
│   │   ├── gradio/             # Gradio app integration
│   │   ├── hf/                 # HuggingFace model management
│   │   ├── net/                # Network operations
│   │   ├── process/            # Process lifecycle
│   │   ├── terminal/           # Terminal I/O
│   │   ├── browser/            # Browser automation
│   │   ├── clipboard/          # System clipboard
│   │   ├── cloudflare/         # Cloudflare tunnel management
│   │   ├── notify/             # Desktop notifications
│   │   ├── proxy/              # Proxy configuration
│   │   ├── input/              # User input handling
│   │   ├── modal/              # Modal dialog management
│   │   ├── htmlmodal/          # HTML-based modals
│   │   ├── tab/                # Tab management
│   │   ├── import/             # Script importing
│   │   ├── json/               # JSON operations
│   │   ├── key/                # API key management
│   │   ├── load/               # Dynamic loading
│   │   ├── loading/            # Loading state management
│   │   ├── local/              # Local variable storage
│   │   ├── global/             # Global variable storage
│   │   ├── log/                # Logging
│   │   ├── goto/               # Navigation
│   │   ├── jump/               # Flow control
│   │   ├── push/               # Push notifications
│   │   ├── rm/                 # File/dir removal
│   │   ├── script/             # Script lifecycle
│   │   ├── self/               # Self-reference utilities
│   │   ├── set/                # Variable setting
│   │   ├── web/                # Web operations
│   │   ├── app/                # App management
│   │   └── filepicker/         # File picker dialog
│   │
│   ├── bin/                    # 🔧 System Setup Scripts (31 files)
│   │   ├── index.js            # Setup orchestrator (35KB)
│   │   ├── setup.js            # Main setup logic
│   │   ├── conda.js            # Miniconda installation
│   │   ├── python.js           # Python management
│   │   ├── cuda.js             # CUDA toolkit detection
│   │   ├── torch.js            # PyTorch installation
│   │   ├── git.js              # Git installation
│   │   ├── node.js             # Node.js setup
│   │   ├── ffmpeg.js           # FFmpeg installation
│   │   ├── cmake.js            # CMake installation
│   │   ├── vs.js               # Visual Studio Build Tools (Windows)
│   │   ├── brew.js             # Homebrew (macOS)
│   │   ├── caddy.js            # Caddy web server
│   │   ├── cloudflared.js      # Cloudflare daemon
│   │   ├── aria2.js            # aria2 downloader
│   │   ├── playwright.js       # Playwright browser
│   │   ├── puppeteer.js        # Puppeteer browser
│   │   ├── uv.js               # uv package manager
│   │   └── ...                 # More system tools
│   │
│   ├── router/                 # 🔀 Request Routing (16 files)
│   │   ├── index.js            # Main router
│   │   ├── pinokio_domain_router.js  # Pinokio domain resolution
│   │   ├── localhost_*_router.js     # Local routing variants
│   │   ├── peer_*_router.js          # Peer routing variants
│   │   ├── connector.js        # Connection management
│   │   ├── processor.js        # Request processing
│   │   └── rewriter.js         # URL rewriting
│   │
│   ├── python/                 # 🐍 Python Integration
│   ├── scripts/                # 📜 Built-in Scripts
│   ├── vars/                   # 📊 Variable Templates
│   └── connect/                # 🔗 External Service Connectors
│
├── server/                     # 🌐 Web Server
│   ├── index.js                # Server class — Express app (9796 lines, 336KB)
│   ├── socket.js               # WebSocket handler (700 lines)
│   ├── serveIndex.js           # Directory listing middleware
│   ├── routes/
│   │   └── files.js            # File serving routes
│   ├── views/                  # 📄 57 EJS Templates
│   │   ├── app.ejs             # Main app view (348KB!)
│   │   ├── terminal.ejs        # Terminal view (84KB)
│   │   ├── shell.ejs           # Shell view (60KB)
│   │   ├── index.ejs           # Home page (52KB)
│   │   ├── net.ejs             # Network management
│   │   ├── agents.ejs          # Agent management
│   │   ├── settings.ejs        # Settings page
│   │   ├── editor.ejs          # Code editor
│   │   ├── tools.ejs           # Tools page
│   │   ├── layout.ejs          # Base layout
│   │   ├── partials/           # Shared partial templates
│   │   ├── connect/            # Connection views
│   │   └── ...                 # Many more views
│   └── public/                 # 📁 Static Assets
│       ├── style.css           # Main styles
│       ├── xterm.js            # xterm.js client
│       ├── bootstrap5.min.css  # Bootstrap 5
│       ├── fontawesome*        # Font Awesome icons
│       ├── ace/                # Ace code editor
│       ├── sound/              # Notification sounds
│       ├── webfonts/           # Web fonts
│       └── ...                 # More static files
│
├── script/                     # 🚀 Standalone Runner
│   ├── index.js                # Script entry point (starts Server on port 42000)
│   ├── install-mode.js         # Installation mode handler
│   └── pinokio.json            # Script configuration
│
└── pipe/                       # 🔌 Proxy Pipe Server
    ├── index.js                # Pipe class — authenticated reverse proxy
    └── views/
        └── login.ejs           # Passcode login page
```

---

## Getting Started

### Prerequisites

- **Node.js 20+**
- **Git**
- **Python 3.10+** (for AI apps)
- **Windows**: Visual Studio Build Tools (for native modules)
- **macOS**: Xcode Command Line Tools

### Install Dependencies

```bash
npm install
```

### Run in Development Mode

```bash
npm start
```

This starts the server on **port 42000**. Open `http://localhost:42000` in your browser.

### Run with Docker

```bash
docker build -t pinokiod .
docker run -p 8080:8080 -v pinokio_data:/data/pinokio pinokiod
```

---

## Key Concepts

### Pinokio Scripts

Pinokio uses JSON-based scripts (`.json` files) to automate AI app installation and execution. Scripts can:

- Run shell commands (`shell.run`)
- Download files (`fs.download`)
- Manage conda/venv environments
- Set environment variables
- Show UI modals and forms
- Control flow with `goto`, `jump`, `if/else`

### Environment System

Each app has an isolated `ENVIRONMENT` file with variables like:

- `HF_HOME` — HuggingFace cache
- `TORCH_HOME` — PyTorch cache
- `GRADIO_TEMP_DIR` — Gradio uploads
- `PINOKIO_DRIVE` — Virtual drive path
- Custom per-app variables

### API Modules

The kernel exposes 36+ API modules that can be called from scripts:

- `shell.run` — Execute shell commands
- `fs.write`, `fs.read`, `fs.download` — File operations
- `gradio.predict` — Call Gradio endpoints
- `notify` — Desktop notifications
- `net.scan` — Network scanning
- And many more...

---

## Environment Variables

| Variable                   | Default     | Description               |
| -------------------------- | ----------- | ------------------------- |
| `PINOKIO_HOME`             | OS-specific | Root data directory       |
| `PINOKIO_HTTPS_ACTIVE`     | `0`         | Enable HTTPS              |
| `PINOKIO_NETWORK_ACTIVE`   | `0`         | Enable P2P networking     |
| `PINOKIO_SETUP_MODE`       | —           | `prod_dev` for Docker     |
| `PINOKIO_DRIVE`            | `./drive`   | Virtual drive path        |
| `PINOKIO_SHARE_CLOUDFLARE` | `false`     | Enable Cloudflare sharing |
| `PINOKIO_SHARE_LOCAL`      | `false`     | Enable LAN sharing        |

---

## License

MIT — Original by [Pinokio Computer](https://github.com/pinokiocomputer)
