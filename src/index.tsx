
import { render } from 'solid-js/web'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import './index.css'
import { App } from './App'
import { MetaProvider } from '@solidjs/meta'

const root = document.getElementById('root')
const queryClient = new QueryClient()

if (root) {
  render(
    () => (
      <QueryClientProvider client={queryClient}>
            <MetaProvider>
          <App />
            </MetaProvider>
      </QueryClientProvider>
    ),
    root,
  )
}