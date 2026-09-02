import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // The PWA manifest is generated at build time, so it can't read the runtime
  // config module — pull the same vars straight from the env file instead.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appName = env.VITE_APP_NAME?.trim() || 'SuperCove'
  const tagline = env.VITE_APP_TAGLINE?.trim() || 'Personal ops'

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // injectManifest (Vite-built SW), deliberately not generateSW: workbox's
        // generateSW bundler breaks when the project's absolute path contains an
        // apostrophe or other shell-special character. injectManifest does not.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: appName,
          short_name: appName,
          description: `${tagline} — ventures, tasks, finance, notes, contacts in one place.`,
          theme_color: '#10162A',
          background_color: '#FAFAF7',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
      }),
    ],
    server: {
      port: 5173,
    },
  }
})
