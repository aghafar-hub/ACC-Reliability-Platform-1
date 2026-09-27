import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Dev server needs to serve source from the sibling app projects too —
      // EmbeddedOilAnalysis.tsx / EmbeddedVibrationAnalysis.tsx dynamically
      // import them directly from ../apps/*/src (see docs there for why).
      allow: ['..'],
    },
  },
})
