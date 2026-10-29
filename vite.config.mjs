import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

// The application scripts are classic (non-module) files, so Vite leaves them untouched.
// Copy the assets folder into the build output so every <script>, model and image the page references exists in dist/.
// Every HTML entry point is listed: without them dist/ only held index.html, so the Partner link
// (/partners -> partners.html), the admin portal and the partner dashboard 404'd on a static deployment.
export default defineConfig({
  publicDir: false,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        partners: resolve(__dirname, 'partners.html'),
        partnerDashboard: resolve(__dirname, 'partner-dashboard.html'),
        admin: resolve(__dirname, 'admin.html'),
        adminPartners: resolve(__dirname, 'admin-partners.html')
      }
    }
  },
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
