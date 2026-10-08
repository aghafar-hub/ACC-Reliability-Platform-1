import './storagePrefix'
import './installPrompt'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/icons/tabler-icons-subset.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
