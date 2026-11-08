import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Load early: Chrome's install prompt fires once, right after the page loads.
import './lib/platform'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
