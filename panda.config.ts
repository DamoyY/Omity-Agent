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
          ink: {
            50: { value: "#f2f2f2" },
            300: { value: "#b8b8b8" },
            500: { value: "#8a8a8a" },
            600: { value: "#737373" },
            800: { value: "#303030" },
            850: { value: "#1b1b1b" },
            875: { value: "#171717" },
            900: { value: "#101010" },
            925: { value: "#0b0b0b" },
            950: { value: "#070707" },
            975: { value: "#030303" },
            990: { value: "#020202" },
            1000: { value: "#000000" },
          },
          accent: {
            blue: { value: "#7dcfff" },
            cyan: { value: "#2ac3de" },
            green: { value: "#9ece6a" },
            indigo: { value: "#565f89" },
            orange: { value: "#ff9e64" },
            purple: { value: "#bb9af7" },
            red: { value: "#f7768e" },
          },
        },
        fonts: {
          body: {
            value: "ui-monospace, SFMono-Regular, Consolas, monospace",
          },
          mono: { value: "ui-monospace, SFMono-Regular, Consolas, monospace" },
        },
        sizes: {
          appSidebar: { value: "clamp(15rem, 22vw, 20rem)" },
          content: { value: "52rem" },
          composerEditor: { value: "12rem" },
          controlColumn: { value: "9rem" },
          detailHeader: { value: "2.25rem" },
          toolOutput: { value: "16rem" },
        },
      },
      semanticTokens: {
        colors: {
          canvas: { value: "{colors.ink.1000}" },
          sidebar: { value: "{colors.ink.975}" },
          surface: { value: "{colors.ink.950}" },
          surfaceRaised: { value: "{colors.ink.925}" },
          surfaceInset: { value: "{colors.ink.990}" },
          control: { value: "{colors.ink.900}" },
          controlHover: { value: "{colors.ink.875}" },
          line: { value: "{colors.ink.850}" },
          lineStrong: { value: "{colors.ink.800}" },
          text: { value: "{colors.ink.50}" },
          muted: { value: "{colors.ink.500}" },
          mutedStrong: { value: "{colors.ink.300}" },
          syntaxAddition: { value: "{colors.accent.green}" },
          syntaxComment: { value: "{colors.accent.indigo}" },
          syntaxDeletion: { value: "{colors.accent.red}" },
          syntaxKeyword: { value: "{colors.accent.purple}" },
          syntaxMeta: { value: "{colors.accent.blue}" },
          syntaxNumber: { value: "{colors.accent.orange}" },
          syntaxProperty: { value: "{colors.accent.blue}" },
          syntaxString: { value: "{colors.accent.green}" },
          syntaxTitle: { value: "{colors.accent.cyan}" },
          statusError: { value: "{colors.accent.red}" },
          statusIdle: { value: "{colors.ink.600}" },
          statusModel: { value: "{colors.accent.blue}" },
          statusPaused: { value: "{colors.accent.orange}" },
          statusTool: { value: "{colors.accent.green}" },
        },
      },
    },
  },

  globalCss: {
    "html, body, #root": {
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
