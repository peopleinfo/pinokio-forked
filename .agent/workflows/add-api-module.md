---
description: How to add a new API module to the pinokiod kernel
---

## Overview

API modules are the building blocks of Pinokio scripts. Each module handles a specific `method` (e.g., `shell.run`, `fs.write`, `notify`).

## Steps

1. Create a new directory under `kernel/api/`:

```bash
mkdir -p kernel/api/<module_name>
```

2. Create the module file at `kernel/api/<module_name>/index.js` with this template:

```javascript
class ModuleName {
  // Called when the API module is invoked from a Pinokio script
  // params: the 'params' object from the script step
  // kernel: reference to the Kernel instance
  // ondata: callback for streaming data to the UI
  async run(params, kernel, ondata) {
    try {
      // Your implementation here

      // Example: stream output to terminal
      if (ondata) {
        ondata({ raw: "Module output\r\n" });
      }

      // Return value becomes available as 'input' in the next step
      return { success: true };
    } catch (e) {
      console.error(`[module_name] Error:`, e);
      throw e;
    }
  }
}
module.exports = ModuleName;
```

3. Register the module in `kernel/api/index.js`:
   - Find the section where other modules are imported (top of file)
   - Add: `const ModuleName = require('./<module_name>')`
   - Find the dispatcher switch/if-chain and add your method handler

4. Test the module by creating a test script:

```json
{
  "run": [
    {
      "method": "<module_name>",
      "params": {
        "key": "value"
      }
    }
  ]
}
```

## Conventions

- Module names should be lowercase with underscores (e.g., `my_module`)
- Script method names use dots for namespacing (e.g., `my_module.action`)
- Always handle errors gracefully — don't crash the server
- Use `ondata({ raw: "..." })` for terminal output
- Return values are passed as `input` to the next script step
- Access kernel features via `kernel.path()`, `kernel.exists()`, `kernel.shell`, etc.

## Examples

Look at these existing modules for reference:

- `kernel/api/log/index.js` — Simple logging (small, good starting point)
- `kernel/api/notify/index.js` — Desktop notifications
- `kernel/api/fs/index.js` — File operations (more complex)
- `kernel/api/shell/index.js` — Shell execution (most complex)
