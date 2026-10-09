import './storagePrefix'
import './installPrompt'
import './mobile/viewport'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/icons/tabler-icons-subset.css'
import './index.css'
import App from './App.tsx'
import { startTranslator } from './i18n/translator'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Arabic view: the language is kept on the device (i18n/translator.ts)
startTranslator()
