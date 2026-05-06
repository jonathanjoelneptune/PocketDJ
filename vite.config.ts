import { defineConfig } from "vite";

// Static-first build for GitHub Pages.
// Relative asset paths let the same build work at:
//   https://USERNAME.github.io/REPO/
// without needing a localhost server or repo-specific base-path edits.
export default defineConfig({
  base: "./"
});
