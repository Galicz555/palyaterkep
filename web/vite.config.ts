import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// adapter-node, not a static adapter: phase 6 adds a server route for reading CVs. Every page that
// can be is prerendered (src/routes/+layout.ts); that route opts out.
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
});
