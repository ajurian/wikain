import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const presentationDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "src/presentation");

/**
 * TanStack Start (STACK-2) full-stack app. The presentation layer is relocated under
 * `src/presentation/` (ARCH-2) via `srcDirectory`, so routes / router / generated route tree live
 * beside the other layers rather than polluting `src/`. Server functions run the application
 * use-cases server-side, keeping the DeepSeek key (NET-7) and Neon (STACK-4) off the client.
 */
export default defineConfig({
  server: { port: 3000 },
  // `@/*` → src/presentation/* (shadcn-ui alias, STACK-5).
  resolve: { alias: { "@": presentationDir } },
  plugins: [
    tailwindcss(),
    // The react plugin MUST come after the start plugin.
    tanstackStart({ srcDirectory: "src/presentation" }),
    viteReact(),
  ],
});
