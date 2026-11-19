// 번역 확인: 1) t()/tx()/tk() 밖에 남은 한글  2) 영어 사전(locales/en/*.json)에 없는 키  3) {자리} 불일치
// 사용: node scripts/i18n-check.mjs [파일...]   (없으면 src 전체)
//       node scripts/i18n-check.mjs --prune    (src 전체를 보고 안 쓰는 영어 항목을 json에서 지움)
// 일부러 한글을 남길 줄에는 주석으로 i18n-ignore
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localeDir = path.join(root, 'src', 'shared', 'locales', 'en')
const EN = {}
for (const f of fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'))) Object.assign(EN, JSON.parse(fs.readFileSync(path.join(localeDir, f), 'utf8')))

const SKIP = [path.join('src', 'shared', 'i18n.ts'), path.join('src', 'renderer', 'src', 'i18n.tsx')]
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'locales' ? [] : walk(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}
const PRUNE = process.argv.includes('--prune')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const files = (args.length ? args.map((f) => path.resolve(f)) : walk(path.join(root, 'src')))
  .filter((f) => !SKIP.some((s) => f.endsWith(s)))

const HANGUL = /[가-힣ㄱ-ㆎ]/
const unescape = (s) => s.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' })[c] ?? c)
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

let problems = 0
const usedKeys = new Set()
for (const file of files) {
  const rel = path.relative(root, file)
  let src = fs.readFileSync(file, 'utf8')
  // 블록 주석 지우기 (줄 수는 유지)
  src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const lineOf = (i) => src.slice(0, i).split('\n').length
  const out = []
  // 번역 호출의 첫 인자(글자 그대로)
  src = src.replace(/\b(t|tx|tk)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g, (m, fn, q, body, idx) => {
    if (q === '`' && body.includes('${')) out.push(`${rel}:${lineOf(idx)}  ${fn}()에 \${} 대신 {자리}와 값을 쓰세요`)
    const key = unescape(body)
    usedKeys.add(key)
    if (HANGUL.test(key)) {
      if (!(key in EN)) out.push(`${rel}:${lineOf(idx)}  영어 없음: ${JSON.stringify(key)}`)
      else if (holes(key) !== holes(EN[key])) out.push(`${rel}:${lineOf(idx)}  {자리} 다름: ${JSON.stringify(key)} → ${JSON.stringify(EN[key])}`)
    }
    return m.replace(/[^\n]/g, ' ')
  })
  src.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('i18n-ignore')) return
    const code = line.replace(/(^|\s)\/\/.*$/, '')
    if (HANGUL.test(code)) out.push(`${rel}:${i + 1}  번역 안 됨: ${code.trim().slice(0, 120)}`)
  })
  if (out.length) {
    problems += out.length
    console.log(out.join('\n'))
  }
}

if (args.length === 0) {
  const unused = Object.keys(EN).filter((k) => !usedKeys.has(k))
  if (unused.length && PRUNE) {
    for (const f of fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'))) {
      const file = path.join(localeDir, f)
      const d = JSON.parse(fs.readFileSync(file, 'utf8'))
      const kept = Object.fromEntries(Object.entries(d).filter(([k]) => usedKeys.has(k)))
      fs.writeFileSync(file, JSON.stringify(kept, null, 2) + '\n')
    }
    console.log(`안 쓰는 영어 항목 ${unused.length}개를 지웠어요: ${unused.map((k) => JSON.stringify(k)).join(', ').slice(0, 400)}`)
  } else if (unused.length) console.log(`(참고) 쓰이지 않는 영어 항목 ${unused.length}개 — --prune으로 지울 수 있어요`)
}
console.log(problems ? `\n문제 ${problems}개` : `OK — 파일 ${files.length}개, 키 ${usedKeys.size}개`)
process.exit(problems ? 1 : 0)
