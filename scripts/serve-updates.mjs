// 자동 업데이트 시험용 서버: release/의 latest.yml과 거기 적힌 설치 파일만 이 PC(127.0.0.1)에서 내준다.
// 사용: node scripts/serve-updates.mjs [포트=8765]  → 앱 설정 > 업데이트 주소에 http://127.0.0.1:8765/
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'release')
const port = Number(process.argv[2] || 8765)

/** latest.yml에 적힌 파일과 그 .blockmap만 */
function allowed() {
  const yml = fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8')
  const files = new Set(['latest.yml'])
  for (const m of yml.matchAll(/^\s*(?:-\s*url|path):\s*(.+)$/gm)) {
    const f = m[1].trim().replace(/^['"]|['"]$/g, '')
    files.add(f)
    files.add(f + '.blockmap')
  }
  return files
}

http.createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+/, ''))
  const file = path.join(dir, name)
  if (!allowed().has(name) || !fs.existsSync(file)) {
    console.log('404', name)
    res.writeHead(404).end()
    return
  }
  const size = fs.statSync(file).size
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/) // 범위 하나만 (여러 범위면 전체를 줌)
  if (range) {
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : size - 1
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(file, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(file).pipe(res)
  }
  console.log(range ? '206' : '200', name)
}).listen(port, '127.0.0.1', () => console.log(`업데이트 서버: http://127.0.0.1:${port}/  (${dir})`))
