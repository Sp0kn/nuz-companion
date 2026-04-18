import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import RunDetail from './pages/RunDetail'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000, // static data stays fresh for 30s; live queries set their own interval
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/run" replace />} />
            <Route path="run" element={<RunDetail />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
