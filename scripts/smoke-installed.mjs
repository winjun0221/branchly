// 설치된 Branchly.exe(설치 파일로 깐 것)를 그대로 띄워서 샘플 저장소가 열리는지 확인 → 창 캡처 → 닫기
// Playwright는 설치본(electron-builder로 묶은 exe)에 붙지 못해서, 창 제목(저장소 이름 — Branchly)으로 확인한다.
// 사용: node scripts/smoke-installed.mjs [스크린샷 폴더]   (Windows 전용)
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeSampleRepo } from './sample-repo.mjs'

const exe = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Branchly', 'Branchly.exe')
if (!fs.existsSync(exe)) {
  console.error('설치된 Branchly가 없습니다: ' + exe)
  process.exit(1)
}
const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'branchly-smoke'))
fs.mkdirSync(out, { recursive: true })
const name = `smoke-${Date.now()}`
const repo = makeSampleRepo(path.join(out, name)).dir

const child = spawn(exe, [], {
  env: { ...process.env, BRANCHLY_OPEN: repo, BRANCHLY_USER_DATA: path.join(out, 'userdata') },
  stdio: 'ignore',
})

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim()
let title = ''
for (let i = 0; i < 40 && !title.includes(`${name} — Branchly`); i++) {
  await new Promise((r) => setTimeout(r, 500))
  title = ps(`(Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue).MainWindowTitle`)
}
const ok = title.includes(`${name} — Branchly`)
console.log('window title:', title || '(없음)')

if (ok) {
  // 창 그대로 캡처 (사람이 보는 화면)
  const shot = path.join(out, 'installed.png').replace(/'/g, "''")
  ps(`Add-Type -AssemblyName System.Drawing
Add-Type 'using System; using System.Runtime.InteropServices; public class W { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); public struct RECT { public int L, T, R, B; } }'
$h = (Get-Process -Id ${child.pid}).MainWindowHandle
[W]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 800
$r = New-Object W+RECT; [W]::GetWindowRect($h, [ref]$r) | Out-Null
$b = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
[System.Drawing.Graphics]::FromImage($b).CopyFromScreen($r.L, $r.T, 0, 0, $b.Size)
$b.Save('${shot}')`)
}
execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED', '→', out)
process.exit(ok ? 0 : 1)
