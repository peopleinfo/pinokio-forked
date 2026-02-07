---
description: How to set up and run the pinokiod development server locally
---

## Prerequisites

1. Ensure **Node.js 20+** is installed:

```bash
node --version
```

2. Ensure **Git** is installed:

```bash
git --version
```

## Setup Steps

// turbo

1. Install dependencies from the project root:

```bash
npm install
```

2. Start the development server:

```bash
npm start
```

3. Open the browser at `http://localhost:42000`

## Notes

- The server runs on **port 42000** by default (configured in `script/index.js`)
- The server requires a `PINOKIO_HOME` directory — it will be auto-created on first run
- If port 42000 is in use, check for existing Pinokio processes
- On Windows, some native modules (`node-pty`) may require Visual Studio Build Tools
