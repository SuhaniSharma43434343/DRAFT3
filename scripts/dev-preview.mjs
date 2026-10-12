// Starts a second dev server beside one that is already running in this folder.
// `next dev` locks its build directory, so this one gets its own (.next-preview) and its own port.
// Usage: node scripts/dev-preview.mjs   (port from $PORT, default 3100)
import { spawn } from "node:child_process";

const port = process.env.PORT || "3100";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: ".next-preview" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
