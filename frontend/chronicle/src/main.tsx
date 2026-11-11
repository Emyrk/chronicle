import { HomeBootstrapContext, type HomeBootstrap } from "./home/bootstrap"
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

const bootstrapElement = window.location.pathname === '/' ? document.getElementById('home-bootstrap') : null
const homeBootstrap: HomeBootstrap | null = bootstrapElement?.textContent ? JSON.parse(bootstrapElement.textContent) : null

// Resolve the selected lazy homepage before hydration. Otherwise a fast live-config
// response can update its Suspense boundary before the chunk arrives and discard SSR DOM.
async function mount() {
  const homeLanding = homeBootstrap?.foreverLanding
    ? (await import('./pages/Landing/Start2Page')).Start2Page
    : undefined
  const application: ReactNode = isBlogRoute ? (
    <BlogApp />
  ) : (
    <QueryClientProvider client={queryClient}>
      <InferenceRuntimeProvider>
        <HomeBootstrapContext.Provider value={homeBootstrap}><App homeLanding={homeLanding} /></HomeBootstrapContext.Provider>
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

  if (root.hasChildNodes()) {
    hydrateRoot(root, tree)
  } else {
    createRoot(root).render(tree)
  }
}

void mount()
