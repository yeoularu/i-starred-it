import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({}),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "I Starred It - AI-Powered GitHub Stars Search",
        short_name: "I Starred It",
        description:
          "Search your GitHub starred repositories using natural language queries powered by AI",
        theme_color: "#0c0c0c",
        start_url: "/",
        display: "standalone",
        background_color: "#0c0c0c",
        categories: ["developer", "productivity", "utilities"],
      },
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: true },
    }),
    cloudflare(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
