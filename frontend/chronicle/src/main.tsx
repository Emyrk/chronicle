import { StrictMode, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './debug/sizes'
import './index.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const app: ReactNode = (
  <QueryClientProvider client={queryClient}>
    <InferenceRuntimeProvider>
      <App />
    </InferenceRuntimeProvider>
  </QueryClientProvider>
)

function mount(application: ReactNode) {
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

// The blog is its own app; load it only on /blog so it stays out of the entry chunk.
// It is imported before mounting so the prerendered blog markup hydrates as before.
if (isBlogRoute) {
  void import('./blog/BlogApp').then(({ BlogApp }) => mount(<BlogApp />))
} else {
  mount(app)
}
