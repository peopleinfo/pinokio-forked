# SKILLS.md — Pinokiod Development Skills Reference

This document catalogs the specialized skills and knowledge areas required for working with the pinokiod codebase.

---

## 1. Node.js Backend (CommonJS)

### Description

All code uses CommonJS (`require`/`module.exports`). No ESM, no TypeScript.

### Key Patterns

```javascript
// Class definition pattern used throughout
class MyModule {
  constructor(kernel) {
    this.kernel = kernel;
  }
  async run(params, ondata) {
    // Implementation
  }
}
module.exports = MyModule;
```

### Libraries

- **Express.js 4.x** — Web framework (`server/index.js`)
- **ws** — WebSocket server (`server/socket.js`)
- **axios** — HTTP client
- **lodash** — Utility functions
- **fs-extra** — Extended file system operations
- **semver** — Version comparison
- **uuid** — Unique ID generation

---

## 2. Terminal/PTY Management

### Description

Core competency — managing pseudo-terminal sessions across platforms.

### Key Files

- `kernel/shell.js` — Individual shell session (PTY lifecycle, I/O, env)
- `kernel/shells.js` — Shell registry (add, remove, get, emit, resize)
- `kernel/shell_parser.js` — Parse shell output for events
- `kernel/ansi_stream_tracker.js` — Track ANSI escape sequences
- `kernel/bracketed_paste_detector.js` — Detect bracketed paste mode

### Technologies

- **`@homebridge/node-pty-prebuilt-multiarch`** — Cross-platform PTY spawning
- **`@xterm/headless`** — Server-side terminal emulation (no DOM)
- **`xterm-addon-serialize`** — Serialize terminal state

### Platform Differences

| Feature         | Windows             | macOS/Linux                       |
| --------------- | ------------------- | --------------------------------- |
| Default shell   | `cmd.exe`           | `bash`                            |
| Shell args      | `/D`                | `--noprofile --norc`              |
| EOL             | `\r\n`              | `\n`                              |
| Bracketed paste | Disabled (cmd/pwsh) | Enabled                           |
| Conda hook      | `conda_hook`        | `eval "$(conda shell.bash hook)"` |

---

## 3. Git Operations

### Description

Built-in git client using `isomorphic-git` for managing AI app repositories.

### Key File

- `kernel/git.js` — 45KB of git operations

### Capabilities

- Clone repositories (with progress tracking)
- Pull/fetch updates
- Status/diff checking
- Commit history
- Branch management
- Git config management (`.gitconfig` templates)

### Libraries

- **`isomorphic-git`** — Pure JavaScript git implementation
- **`isomorphic-git/http/node`** — HTTP transport for git operations

---

## 4. Environment & Python Ecosystem

### Description

Manages isolated environments for each AI app — conda, venv, pip, and system-level variables.

### Key Files

- `kernel/environment.js` — Environment init, read, merge
- `kernel/bin/conda.js` — Miniconda installation & management
- `kernel/bin/python.js` — Python version detection
- `kernel/bin/torch.js` — PyTorch installation (CUDA/CPU/MPS)
- `kernel/bin/cuda.js` — NVIDIA CUDA detection
- `kernel/bin/uv.js` — `uv` package manager

### Environment Hierarchy

```
1. process.env             (system)
2. ~/pinokio/ENVIRONMENT   (global pinokio)
3. app/ENVIRONMENT          (per-app)
4. script params.env        (per-script)
```

### Common Environment Variables

- `HF_HOME`, `TORCH_HOME` — Model caches
- `GRADIO_TEMP_DIR`, `GRADIO_ALLOWED_PATHS` — Gradio settings
- `PINOKIO_DRIVE` — Virtual drive path
- `CONDA_SHORTCUTS`, `CONDA_CONSOLE` — Conda behavior
- `PIP_CACHE_DIR`, `UV_CACHE_DIR` — Package caches
- `PYTORCH_ENABLE_MPS_FALLBACK` — Apple Silicon fallback
- `PINOKIO_SHARE_*` — Sharing configuration

---

## 5. Pinokio Script System

### Description

JSON-based scripting language for automating AI app installations and workflows.

### Script Format

```json
{
  "run": [
    {
      "method": "shell.run",
      "params": {
        "message": "pip install torch",
        "conda": { "path": "env", "python": "python=3.10" }
      }
    },
    {
      "method": "fs.write",
      "params": {
        "path": "config.json",
        "body": { "key": "value" }
      }
    }
  ]
}
```

### Flow Control

- `goto` — Jump to a labeled step
- `jump` — Jump to a step index
- `if/else` — Conditional execution
- `local.set`/`local.get` — Script-scoped variables
- `global.set`/`global.get` — Global variables

### API Module Registration

API modules live in `kernel/api/<name>/index.js` and are auto-discovered by `kernel/api/index.js`.

---

## 6. Express.js Server & EJS Templates

### Description

The web dashboard for managing installed AI apps.

### Key Files

- `server/index.js` — ALL routes in one file (9,796 lines)
- `server/views/` — 57 EJS templates
- `server/public/` — Static assets (CSS, JS, fonts, sounds)
- `server/serveIndex.js` — Directory listing middleware

### Template System

- **EJS** for server-side rendering
- Templates include partials from `views/partials/`
- Layout system via `views/layout.ejs`
- Heavy use of inline JavaScript in EJS templates

### Client-Side Stack

- **Bootstrap 5** — CSS framework
- **Font Awesome** — Icon library
- **xterm.js** — Browser terminal
- **Ace Editor** — Code editing
- **SweetAlert2** — Modal dialogs
- **Tom Select** — Enhanced select inputs
- **Tippy.js** — Tooltips

---

## 7. WebSocket Communication

### Description

Real-time bidirectional communication between server and browser.

### Key File

- `server/socket.js` — WebSocket handler

### Protocol

```javascript
// Client → Server
{ uri: "~/api/myapp/start.json" }              // Run script
{ method: "kernel.api.stop", id: "..." }        // Stop process
{ emit: "some input", id: "shell_id" }          // Send terminal input
{ key: "Enter", id: "shell_id" }                // Send keypress
{ resize: { cols: 80, rows: 24 }, id: "..." }   // Resize terminal

// Server → Client
{ type: "connect", data: { id, state, shell } } // Connected to session
{ data: { id, raw: "terminal output" } }         // Terminal data
{ type: "notification", data: { ... } }          // Notification event
{ type: "resize", data: { id, cols, rows } }     // Resize broadcast
```

### Binary Messages

Binary WebSocket messages use a structured format:

1. JSON metadata (UTF-8)
2. Null byte separator (`0x00`)
3. Buffer data with length prefixes

### Subscription Model

- Clients subscribe to event IDs (script paths, shell IDs)
- The `subscriptions` Map tracks WebSocket → event ID sets
- Buffers are periodically persisted to log files every 5 seconds

---

## 8. Process Management

### Description

Tracking and controlling spawned processes and AI apps.

### Key Files

- `kernel/procs.js` — Process registry
- `kernel/index.js` — `Kernel.kill()` method
- `kernel/api/process/index.js` — Process API

### Patterns

- `kill-sync` for synchronous process tree killing
- Track running processes in `kernel.api.running` map
- Docker-aware cleanup in `shutdown()`
- Signal handling for SIGTERM, SIGINT, uncaughtException

---

## 9. Networking & Sharing

### Description

P2P networking and public URL sharing for local AI apps.

### Key Files

- `kernel/peer.js` — Peer discovery & communication (29KB)
- `kernel/lproxy.js` — Local network proxy
- `pipe/index.js` — Authenticated reverse proxy
- `kernel/api/cloudflare/index.js` — Cloudflare tunnel management
- `kernel/api/net/index.js` — Network scanning

### Sharing Methods

1. **Local Network** — LAN proxy with auto-discovered port
2. **Cloudflare Tunnel** — Public URL via `cloudflared`
3. **P2P** — Direct peer-to-peer connections

---

## 10. Docker & Deployment

### Description

Containerized deployment with multi-stage builds.

### Key Files

- `Dockerfile` — Multi-stage build (build → runtime)
- `docker-entrypoint.sh` — Bootstrap script with progress tracking

### Build Process

1. Install native deps (python3, make, g++)
2. `npm ci --omit=dev` in build stage
3. Pre-seed Pinokio home directory from GitHub repos
4. Create compressed archive (`.pinokio-seed.tgz`)
5. Runtime stage with system tools (git, curl, p7zip, etc.)

### Deployment Variables

- `PINOKIO_HOME=/data/pinokio`
- `PINOKIO_HTTPS_ACTIVE=1`
- `PINOKIO_NETWORK_ACTIVE=1`
- Volume mount at `/data/pinokio`
- Exposed port: `8080`

---

## 11. System Setup & Detection

### Description

Detecting and installing system-level dependencies across platforms.

### Key File

- `kernel/bin/index.js` — Main setup orchestrator (35KB)

### Detection Capabilities

- **GPU**: NVIDIA CUDA version, AMD ROCm, Apple MPS
- **Python**: System Python, conda Python, venv
- **Build Tools**: Visual Studio, Xcode CLT, CMake, g++
- **Package Managers**: pip, conda, uv, npm, brew
- **System Info**: RAM, disk space, OS version

### Platform Matrix

| Tool           | Windows | macOS | Linux |
| -------------- | ------- | ----- | ----- |
| Conda          | ✅      | ✅    | ✅    |
| CUDA           | ✅      | ❌    | ✅    |
| MPS            | ❌      | ✅    | ❌    |
| VS Build Tools | ✅      | ❌    | ❌    |
| Xcode CLT      | ❌      | ✅    | ❌    |
| Homebrew       | ❌      | ✅    | ❌    |
| g++            | ❌      | ✅    | ✅    |

---

## 12. Routing & Request Processing

### Description

Multi-layer request routing for localhost, peers, and custom domains.

### Key Files

- `kernel/router/index.js` — Main router (12KB)
- `kernel/router/pinokio_domain_router.js` — Pinokio domain resolution (8KB)
- `kernel/router/localhost_*.js` — Local routing variants
- `kernel/router/peer_*.js` — Peer routing variants
- `kernel/router/connector.js` — Connection management
- `kernel/router/processor.js` — Request processing
- `kernel/router/rewriter.js` — URL rewriting

### Routing Flow

```
Request → Router → Processor → Rewriter → Target
                ↗ localhost_home_router
                ↗ localhost_port_router
                ↗ localhost_static_router
                ↗ localhost_variable_router
                ↗ peer_home_router
                ↗ peer_port_router
                ↗ peer_static_router
                ↗ peer_variable_router
                ↗ custom_domain_router
                ↗ pinokio_domain_router
```
