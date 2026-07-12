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
          sidebar: { value: "#030303" },
          surface: { value: "#070707" },
          surfaceRaised: { value: "#0b0b0b" },
          surfaceInset: { value: "#020202" },
          control: { value: "#101010" },
          controlHover: { value: "#171717" },
          line: { value: "#1b1b1b" },
          lineStrong: { value: "#303030" },
          text: { value: "#f2f2f2" },
          muted: { value: "#8a8a8a" },
          mutedStrong: { value: "#b8b8b8" },
          syntaxAddition: { value: "#9ece6a" },
          syntaxComment: { value: "#565f89" },
          syntaxDeletion: { value: "#f7768e" },
          syntaxKeyword: { value: "#bb9af7" },
          syntaxMeta: { value: "#7dcfff" },
          syntaxNumber: { value: "#ff9e64" },
          syntaxProperty: { value: "#7dcfff" },
          syntaxString: { value: "#9ece6a" },
          syntaxTitle: { value: "#2ac3de" },
          statusError: { value: "#f7768e" },
          statusIdle: { value: "#737373" },
          statusModel: { value: "#7dcfff" },
          statusPaused: { value: "#ff9e64" },
          statusTool: { value: "#9ece6a" },
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
      color: "text",
      colorScheme: "dark",
      overflow: "hidden",
    },
    "*": {
      boxSizing: "border-box",
    },
  },

  outdir: "styled-system",
});
