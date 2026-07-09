import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = path.resolve(rootDir, "src");
const presentationDir = path.resolve(srcDir, "presentation");

/**
 * TanStack Start (STACK-2) full-stack app. The presentation layer is relocated under
 * `src/presentation/` (ARCH-2) via `srcDirectory`, so routes / router / generated route tree live
 * beside the other layers rather than polluting `src/`. Server functions run the application
 * use-cases server-side, keeping the DeepSeek key (NET-7) and Neon (STACK-4) off the client.
 */
export default defineConfig({
  server: { port: 3000 },
  // `@/*` → src/presentation/* (shadcn-ui alias, STACK-5).
  // `~/*` → src/* — the cross-layer alias (DIR-7); must mirror tsconfig `paths`.
  // Order matters: longest/most specific prefix first is not required here since the two
  // prefixes are disjoint, but keep `@` first to match the shadcn convention.
  resolve: { alias: { "@": presentationDir, "~": srcDir } },
  plugins: [
    tailwindcss(),
    // The react plugin MUST come after the start plugin.
    tanstackStart({ srcDirectory: "src/presentation" }),
    viteReact(),
  ],
  // The Drizzle-only test strategy runs every persistence test against embedded pglite. Two costs to
  // tame: (1) each `makePgliteDb()` re-runs the migrations (~1–2s), so a default 5s test timeout is too
  // tight once many run at once — raise it generously; (2) at full 16-fork parallelism the simultaneous
  // migrations thrash and time out (a thundering herd), so cap the forks. The setup file frees each
  // instance's off-heap WASM memory after every test so the suite fits the process.
  test: {
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    poolOptions: { forks: { maxForks: 4 } },
  },
});
