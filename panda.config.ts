import { defineConfig } from "@pandacss/dev";
import { createPreset } from "@park-ui/panda-preset";
import neutral from "@park-ui/panda-preset/colors/neutral";

export default defineConfig({
  preflight: true,

  include: ["./src/app/frontend/**/*.{js,jsx,ts,tsx}"],

  exclude: [],

  presets: [
    createPreset({
      accentColor: neutral,
      grayColor: neutral,
      radius: "none",
    }),
  ],

  theme: {
    extend: {
      tokens: {
        colors: {
          canvas: { value: "#000000" },
          panel: { value: "#050505" },
          line: { value: "#262626" },
          text: { value: "#f2f2f2" },
          muted: { value: "#9a9a9a" },
        },
        fonts: {
          body: {
            value: "ui-monospace, SFMono-Regular, Consolas, monospace",
          },
          mono: { value: "ui-monospace, SFMono-Regular, Consolas, monospace" },
        },
      },
    },
  },

  globalCss: {
    "html, body, #root": {
      background: "canvas",
      minHeight: "100%",
      margin: "0",
    },
    body: {
      overflow: "hidden",
    },
    "*": {
      boxSizing: "border-box",
    },
  },

  outdir: "styled-system",
});
