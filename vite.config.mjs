import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';

// The application scripts are classic (non-module) files, so Vite leaves them untouched.
// Copy the assets folder into the build output so every <script>, model and image the page references exists in dist/.
export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: 'copy-assets',
      closeBundle() {
        cpSync('assets', 'dist/assets', { recursive: true });
        cpSync('Fly into the future.html', 'dist/Fly into the future.html');
      }
    }
  ]
});
