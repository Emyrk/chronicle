import { StrictMode, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './debug/sizes'
import './index.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlogApp } from './blog/BlogApp'
import { InferenceRuntimeProvider } from './features/chat/runtime'
import { reloadAfterRouteLoadFailure } from './lib/routeLoadRecovery'

window.addEventListener('vite:preloadError', (event) => {
  if (reloadAfterRouteLoadFailure()) {
    event.preventDefault()
  }
})

const queryClient = new QueryClient()
const root = document.getElementById('root')!
const isBlogRoute = window.location.pathname === '/blog' || window.location.pathname.startsWith('/blog/')

const application: ReactNode = isBlogRoute ? (
  <BlogApp />
) : (
  <QueryClientProvider client={queryClient}>
    <InferenceRuntimeProvider>
      <App />
    </InferenceRuntimeProvider>
  </QueryClientProvider>
)

const tree = (
  <StrictMode>
    {/* Show Suspense fallbacks immediately instead of keeping the previous route visible. */}
    <BrowserRouter useTransitions={false}>
      {application}
    </BrowserRouter>
  </StrictMode>
)

function mount() {
  if (root.hasChildNodes()) {
    hydrateRoot(root, tree)
  } else {
    createRoot(root).render(tree)
  }
}

// On /start the app stylesheet does not block first paint (see vite.config.ts): mount once it has loaded.
const deferredStylesheet = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][media="print"]')
if (deferredStylesheet) {
  deferredStylesheet.addEventListener('load', mount, { once: true })
  deferredStylesheet.addEventListener('error', mount, { once: true })
} else {
  mount()
}