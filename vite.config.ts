import { defineConfig } from "vite";
import { corsProxy } from "./server/cors-proxy.ts";

export default defineConfig({
  plugins: [corsProxy()],
});
