
import { render } from 'solid-js/web'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import './index.css'
import { App } from './App'
import { MetaProvider } from '@solidjs/meta'

const root = document.getElementById('root')
// Server injects a plain-HTML #server-notice into the shell when stats are
// unavailable (e.g. expired Stardance cookie) so the state shows on the page
// without JS. Once the client hydrates it renders its own banners, so drop
// the server one to avoid showing it twice.
document.getElementById('server-notice')?.remove()

if (root) {
const queryClient = new QueryClient()
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