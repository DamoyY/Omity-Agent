import { createPreset } from "@park-ui/panda-preset";
import { defineConfig } from "@pandacss/dev";
import neutral from "@park-ui/panda-preset/colors/neutral";

export default defineConfig({
  conditions: {
    extend: {
      coarse: "@media (pointer: coarse)",
      largeCanvas: "@media (min-width: 160rem) and (min-height: 90rem)",
      short: "@media (max-height: 40rem)",
      topNav: "@media (max-aspect-ratio: 1 / 1)",
    },
  },
  exclude: [],
  globalCss: {
    "*": {
      boxSizing: "border-box",
    },
    body: {
      color: "text",
      colorScheme: "dark",
      overflow: "hidden",
    },
    html: {
      fontSize: {
        _largeCanvas: "125%",
        base: "100%",
      },
    },
    "html, body, #root": {
      margin: "0",
      minHeight: "100%",
    },
  },
  include: ["./src/app/frontend/**/*.{js,jsx,ts,tsx}"],
  logLevel: "warn",
  outdir: "styled-system",
  preflight: true,
  presets: [
    createPreset({
      accentColor: neutral,
      grayColor: neutral,
      radius: "none",
    }),
  ],
  theme: {
    extend: {
      semanticTokens: {
        colors: {
          activeLine: {
            value: "color-mix(in srgb, {colors.ink.900} 20%, transparent)",
          },
          canvas: { value: "{colors.ink.1000}" },
          control: { value: "{colors.ink.900}" },
          controlHover: { value: "{colors.ink.875}" },
          line: { value: "{colors.ink.850}" },
          lineStrong: { value: "{colors.ink.800}" },
          muted: { value: "{colors.ink.500}" },
          mutedStrong: { value: "{colors.ink.300}" },
          selection: { value: "{colors.accent.selection}" },
          sidebar: { value: "{colors.ink.975}" },
          statusError: { value: "{colors.accent.red}" },
          statusIdle: { value: "{colors.ink.600}" },
          statusModel: { value: "{colors.accent.blue}" },
          statusPaused: { value: "{colors.accent.orange}" },
          statusTool: { value: "{colors.accent.green}" },
          surface: { value: "{colors.ink.950}" },
          surfaceInset: { value: "{colors.ink.990}" },
          surfaceRaised: { value: "{colors.ink.925}" },
          syntaxAddition: { value: "{colors.accent.green}" },
          syntaxComment: { value: "{colors.accent.indigo}" },
          syntaxDeletion: { value: "{colors.accent.red}" },
          syntaxKeyword: { value: "{colors.accent.purple}" },
          syntaxMeta: { value: "{colors.accent.blue}" },
          syntaxNumber: { value: "{colors.accent.orange}" },
          syntaxProperty: { value: "{colors.accent.blue}" },
          syntaxString: { value: "{colors.accent.green}" },
          syntaxTitle: { value: "{colors.accent.cyan}" },
          text: { value: "{colors.ink.50}" },
        },
      },
      tokens: {
        colors: {
          accent: {
            blue: { value: "#7dcfff" },
            cyan: { value: "#2ac3de" },
            green: { value: "#9ece6a" },
            indigo: { value: "#565f89" },
            orange: { value: "#ff9e64" },
            purple: { value: "#bb9af7" },
            red: { value: "#f7768e" },
            selection: { value: "#405d9e" },
          },
          ink: {
            1000: { value: "#000000" },
            300: { value: "#b8b8b8" },
            50: { value: "#f2f2f2" },
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
          chatCanvas: { value: "120rem" },
          composerEditor: { value: "12rem" },
          content: { value: "52rem" },
          controlColumn: { value: "9rem" },
          detailHeader: { value: "2.25rem" },
          toolOutput: { value: "16rem" },
        },
      },
    },
  },
});
