# AGENTS.md — Pinokiod Codebase Guide for AI Assistants

## Project Identity

This is **pinokiod** (v6.0.16), the backend daemon for [Pinokio](https://pinokio.co) — an AI Browser / one-click AI app launcher. It was forked from the npm registry package `pinokiod@6.0.16`.

**This is NOT a web frontend project.** It is a **Node.js backend server** that manages AI application installations, terminal sessions, and system toolchain setup.

---

## Critical Conventions

### Module System

- **CommonJS exclusively** — `require()` / `module.exports` everywhere
- **No ESM** — Do not use `import`/`export` syntax
- **No TypeScript** — Pure JavaScript throughout

### Code Style

- No linter/formatter configured — match existing style
- 2-space indentation
- Single quotes for strings (mostly)
- Semicolons are inconsistent — match surrounding code
- Heavy use of `async/await` with `try/catch`

### Architecture Patterns

- **Class-based** — `Kernel`, `Server`, `Shell`, `Socket`, `Pipe` are all ES5-style classes
- **Singleton pattern** — One `Kernel` instance, one `Server` instance
- **Event-driven** — WebSocket pub/sub for real-time updates
- **Queue-based** — `fastq` for sequential shell command processing
- **Callback + Promise hybrid** — Many functions support both patterns

---

## File Size Warning ⚠️

Several files are **extremely large**. Do NOT attempt to rewrite them entirely:

| File                   | Lines | Size  | Notes                             |
| ---------------------- | ----- | ----- | --------------------------------- |
| `server/index.js`      | 9,796 | 336KB | Main server — contains ALL routes |
| `server/views/app.ejs` | —     | 348KB | Main app template                 |
| `kernel/api/index.js`  | —     | 52KB  | API dispatcher                    |
| `kernel/shell.js`      | 1,678 | 53KB  | Shell/PTY management              |
| `kernel/util.js`       | —     | 35KB  | Shared utilities                  |
| `kernel/index.js`      | 1,212 | 37KB  | Kernel orchestrator               |
| `kernel/bin/index.js`  | —     | 35KB  | System setup scripts              |

**Always use targeted edits on these files.** Never try to replace the full content.

---

## Key Classes & Their Roles

### `Kernel` (`kernel/index.js`)

The core orchestrator. Manages:

- System paths (`kernel.path()`, `kernel.homedir`)
- File existence checks (`kernel.exists()`)
- Environment setup
- Git operations
- Process management
- System info refresh cycles
- API routing

**Important fields:**

- `this.homedir` — Pinokio home directory (e.g., `~/pinokio`)
- `this.api` — API module instance
- `this.shell` — Shell registry
- `this.git` — Git client
- `this.store` — Persistent key-value store

### `Server` (`server/index.js`)

Express.js web server. Contains:

- ALL HTTP routes (no route splitting except `files.js`)
- EJS template rendering
- Git status/diff views
- App installation/uninstallation
- Menu system
- File serving

**Important:**

- Default port: `42000`
- Uses `this.kernel` for all backend operations
- The entire routing is in ONE file — be very careful with edits

### `Shell` (`kernel/shell.js`)

Manages individual PTY (pseudo-terminal) sessions:

- Spawns processes with `node-pty`
- Tracks terminal state with `@xterm/headless`
- Handles conda/venv activation
- Manages environment variables per session
- Queue-based command execution

### `Socket` (`server/socket.js`)

WebSocket handler for real-time communication:

- Terminal output streaming to browser
- Script execution events
- Notification system
- Session/subscription management
- Log file persistence

### `Pipe` (`pipe/index.js`)

Authenticated reverse proxy for sharing local apps:

- Creates proxy endpoints with passcode protection
- Session-based authentication
- Used for Cloudflare tunnel + local sharing

---

## API Module System (`kernel/api/`)

Each API module follows this pattern:

```javascript
// kernel/api/<name>/index.js
class ModuleName {
  async run(params, kernel, ondata) {
    // Implementation
    return result;
  }
}
module.exports = ModuleName;
```

API modules are dispatched by `kernel/api/index.js` based on the `method` field in script steps.

### Common API Methods

- `shell.run` — Execute shell commands in PTY
- `shell.start` — Start persistent shell
- `shell.stop` — Stop shell
- `fs.write` / `fs.read` / `fs.download` — File operations
- `local.set` / `local.get` — Per-script variables
- `global.set` / `global.get` — Global variables
- `notify` — Desktop notifications
- `input` — User input prompts
- `goto` / `jump` — Script flow control

---

## Environment System (`kernel/environment.js`)

Each app has an `ENVIRONMENT` file with key-value pairs:

```
HF_HOME=./cache/HF_HOME
TORCH_HOME=./cache/TORCH_HOME
PINOKIO_DRIVE=./drive
```

**Key functions:**

- `Environment.init()` — Create ENVIRONMENT file for new app
- `Environment.get()` — Read ENVIRONMENT as object (resolves relative paths)
- `Environment.get2()` — Get merged environment (process + system + app)
- `Environment.get_root()` — Find app root (check for `pinokio/` subfolder)

**Important:** The `init()` function also creates AI agent instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, etc.) from templates.

---

## System Setup (`kernel/bin/`)

Each file handles installing a specific system dependency:

- `conda.js` — Miniconda (cross-platform)
- `python.js` — Python version management
- `cuda.js` — NVIDIA CUDA detection
- `torch.js` — PyTorch with CUDA/CPU/MPS variants
- `git.js` — Git installation
- `node.js` — Node.js
- `vs.js` — Visual Studio Build Tools (Windows only)
- `brew.js` — Homebrew (macOS only)
- `xcode-tools.js` — Xcode CLT (macOS only)

The main setup orchestrator is `kernel/bin/index.js` (~35KB).

---

## Common Pitfalls

### 1. Path Handling

- Windows uses backslashes, but many paths are normalized with `normalize-path`
- Use `path.resolve()` for absolute paths, never string concatenation
- `kernel.path()` resolves relative to `homedir`

### 2. Shell/PTY

- The shell is platform-dependent: `cmd.exe` on Windows, `bash` on Unix
- Environment variables are sanitized — invalid keys are deleted
- The `prompt()` detection works by echoing a marker and detecting the pattern
- **Bracketed paste** is disabled for `cmd.exe` and PowerShell

### 3. Large Files

- `server/index.js` is a monolith — do NOT try to split it without careful planning
- `server/views/app.ejs` (348KB) is the main dashboard template
- These files will OOM if loaded fully into context — use targeted searches

### 4. Process Management

- `kill-sync` is used for synchronous process tree killing
- Always check `this.parent.kernel.api.running[id]` before starting a new process
- Child processes inherit the kernel's modified environment

### 5. WebSocket Protocol

- Messages are JSON-encoded: `{ uri, method, params, id, emit, key, resize }`
- Binary messages use a metadata+buffer protocol with null byte separator
- Subscriptions are per-WebSocket, per-event-ID

---

## Testing

There is **no test suite** in this codebase. Manual testing is done by:

1. Starting the server with `npm start`
2. Opening `http://localhost:42000`
3. Installing and running AI apps through the UI

---

## Docker

The Dockerfile uses a multi-stage build:

1. **Build stage** — Install native dependencies with `npm ci`
2. **Runtime stage** — Slim image with system tools (git, curl, p7zip, etc.)
3. **Seed archive** — Pre-bakes the Pinokio home directory structure

Environment variables for Docker:

- `PINOKIO_HOME=/data/pinokio`
- `PINOKIO_HTTPS_ACTIVE=1`
- `PINOKIO_NETWORK_ACTIVE=1`

---

## Directory Conventions

```
~/pinokio/                    # PINOKIO_HOME
├── api/                      # Installed AI apps (git repos)
├── bin/                      # System binaries (conda, node, etc.)
├── cache/                    # Shared caches (HF, pip, torch, etc.)
├── drive/                    # Virtual drive (symlinks)
├── logs/                     # System logs
├── network/                  # P2P network data
├── plugin/                   # Plugins (code editor, etc.)
├── prototype/                # Templates & documentation
└── ENVIRONMENT               # Global environment variables
```
