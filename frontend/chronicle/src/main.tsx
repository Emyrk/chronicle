import { StrictMode, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './debug/sizes'
import './index.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlogApp } from './blog/BlogApp'

const queryClient = new QueryClient()
const root = document.getElementById('root')!
const isBlogRoute = window.location.pathname === '/blog' || window.location.pathname.startsWith('/blog/')
const isPrerenderedGuide = root.dataset.prerender === 'guide'

// Guide pages contain a server-rendered summary for crawlers and no-JavaScript
// visitors. The interactive client owns a different tree, so replace the
// summary instead of attempting to hydrate it.
if (isPrerenderedGuide) root.replaceChildren()

const application: ReactNode = isBlogRoute ? (
  <BlogApp />
) : (
  <QueryClientProvider client={queryClient}>
    <App />
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