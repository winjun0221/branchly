import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import App from './App'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    // 다른 프로그램(에디터·터미널)에서 바꾼 것도 창으로 돌아오면 바로 반영
    queries: { retry: false, refetchOnWindowFocus: true, staleTime: 2_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
