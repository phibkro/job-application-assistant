import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Tailwind v4 is CSS-first: `@tailwindcss/vite` reads the `@import
// "tailwindcss"` in `src/styles.css` directly, no `tailwind.config.js` and
// no PostCSS pipeline to hand-wire. `optimizeDeps.entries` points esbuild's
// dependency scan at the real entry module (mirrors the upstream
// `create-foldkit-app` template) since `index.html` is the only other root
// esbuild would otherwise crawl from.
export default defineConfig({
  plugins: [tailwindcss()],
  optimizeDeps: {
    entries: ["src/entry.ts"],
  },
});
