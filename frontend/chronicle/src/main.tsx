import { StrictMode, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlogApp } from './blog/BlogApp'

const queryClient = new QueryClient()
const root = document.getElementById('root')!
const isBlogRoute = window.location.pathname === '/blog' || window.location.pathname.startsWith('/blog/')

const application: ReactNode = isBlogRoute ? (
  <BlogApp />
) : (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)

const tree = (
  <StrictMode>
    <BrowserRouter>
      {application}
    </BrowserRouter>
  </StrictMode>
)

if (root.hasChildNodes()) {
  hydrateRoot(root, tree)
} else {
  createRoot(root).render(tree)
}