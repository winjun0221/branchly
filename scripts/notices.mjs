// 앱에 묶여 배포되는 외부 패키지의 라이선스 모음(THIRD_PARTY_NOTICES.md) 만들기
// 메인: esbuild 메타파일로 실제 묶인 패키지를 찾고, 화면: vite가 묶는 패키지 목록
// 사용: node scripts/notices.mjs   (npm run dist 전에 자동으로 돈다)
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RENDERER = ['react', 'react-dom', 'scheduler', '@tanstack/react-query', '@tanstack/query-core', 'lucide-react', 'pretendard', 'highlight.js']

const meta = await build({
  entryPoints: [path.join(root, 'src/main/main.ts'), path.join(root, 'src/main/preload.ts')],
  bundle: true, platform: 'node', format: 'cjs', external: ['electron'], write: false, metafile: true, outdir: 'out', logLevel: 'silent',
})
const pkgs = new Set(RENDERER)
for (const input of Object.keys(meta.metafile.inputs)) {
  const m = input.replace(/\\/g, '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)
  if (m) pkgs.add(m[m.length - 1].replace(/^node_modules\//, '').replace(/\/$/, ''))
}

const licenseText = (dir) => {
  const cands = fs.readdirSync(dir).filter((f) => /^(licen[cs]e|copying)/i.test(f))
  const sub = path.join(dir, 'dist')
  if (!cands.length && fs.existsSync(sub)) return licenseText(sub)
  return cands.length ? fs.readFileSync(path.join(dir, cands[0]), 'utf8').trim() : null
}

const parts = [
  '# Third-party notices',
  '',
  'Branchly includes the following third-party software. Electron and Chromium licenses are shipped separately with the app (LICENSE.electron.txt, LICENSES.chromium.html).',
  '',
]
for (const name of [...pkgs].sort()) {
  const dir = path.join(root, 'node_modules', name)
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const text = licenseText(dir)
  parts.push(`## ${name} ${p.version}`, '', `License: ${p.license ?? 'see below'}`, '')
  if (text) parts.push('```', text, '```', '')
}
fs.writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), parts.join('\n'))
console.log(`THIRD_PARTY_NOTICES.md: ${pkgs.size} packages`)
