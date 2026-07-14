import { dirname, resolve } from "node:path";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  resolve: {
    alias: {
      "styled-system": resolve(root, "styled-system"),
    },
  },
  root: "src/app/frontend",
  server: {
    strictPort: false,
  },
});
