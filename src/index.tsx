
import { render } from 'solid-js/web'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import './index.css'
import { App } from './App'

const root = document.getElementById('root')
const queryClient = new QueryClient()

if (root) {
  render(
    () => (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    ),
    root,
  )
}