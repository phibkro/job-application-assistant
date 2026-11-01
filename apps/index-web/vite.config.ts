import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { foldkit } from "@foldkit/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The Foldkit scaffold's config (create-foldkit-app templates/base) plus the
 * two workspace aliases the client needs to import the Worker's `HttpApi`
 * contract. The root tsconfig `paths` declare the same aliases; Vite reads
 * neither tsconfig nor Bun's resolution, so they are repeated here.
 */
export default defineConfig({
  plugins: [tailwindcss(), foldkit()],
  resolve: {
    alias: [
      { find: /^@job-index\/domain\/(.*)$/, replacement: from("../../packages/domain/src/$1.ts") },
      { find: /^@job-index\/worker\/(.*)$/, replacement: from("../worker/src/$1.ts") },
    ],
  },
  optimizeDeps: { entries: ["src/entry.ts"] },
  build: { outDir: "dist", emptyOutDir: true },
});
