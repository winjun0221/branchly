// 개발 실행: 화면은 Vite 개발 서버(고치면 바로 반영), 메인 프로세스는 esbuild watch(고치면 앱 다시 시작)
// 사용: npm run dev [-- <저장소 폴더>]
import { spawn } from 'node:child_process'
import { context } from 'esbuild'
import { createServer } from 'vite'
import electron from 'electron'

const server = await createServer({ configFile: 'vite.config.ts' })
await server.listen()
const url = server.resolvedUrls.local[0]
console.log(`renderer: ${url}`)

let child = null
let restarting = false
const start = () => {
  child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } })
  child.on('exit', (code) => {
    if (restarting) return
    void server.close()
    process.exit(code ?? 0)
  })
}

const ctx = await context({
  entryPoints: ['src/main/main.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  outdir: 'dist/main',
  outExtension: { '.js': '.cjs' },
  logLevel: 'info',
  plugins: [{
    name: 'restart-electron',
    setup(build) {
      build.onEnd((r) => {
        if (r.errors.length > 0) return
        if (child) {
          restarting = true
          child.kill()
          restarting = false
        }
        start()
      })
    },
  }],
})
await ctx.watch()
