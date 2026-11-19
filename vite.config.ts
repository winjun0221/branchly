import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** 개발 서버(npm run dev)에서만 CSP를 푼다: React 새로고침 기능이 인라인 스크립트와 ws 연결을 쓰기 때문 */
function devCsp(): Plugin {
  return {
    name: 'dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
  }
}

// 화면(renderer)만 Vite로 묶는다. 메인 프로세스·preload는 esbuild(package.json build:main).
export default defineConfig({
  root: 'src/renderer',
  base: './', // file://로 열리므로 상대 경로
  plugins: [react(), devCsp()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: { port: 5199, strictPort: true },
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // 실제 git으로 복제·Push·Pull을 연달아 하는 테스트가 있어서, 느린 서버(GitHub Actions)에서도 넉넉하게
    testTimeout: 30_000,
  },
})
