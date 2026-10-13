/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// La UI llama siempre a /api/... y el proxy reenvía a la API sin CORS (research D5).
const apiProxy = {
  "/api": {
    target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
})
