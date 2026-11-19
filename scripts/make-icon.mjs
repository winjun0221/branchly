// build/icon.svg → build/icon.png (1024px, 투명 배경). 설치 파일·exe 아이콘은 electron-builder가 이 PNG로 .ico를 만든다.
// 사용: npx electron scripts/make-icon.mjs
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8')
const SIZE = 1024

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: true },
  })
  win.webContents.setZoomFactor(1)
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const out = path.join(root, 'build', 'icon.png')
  fs.writeFileSync(out, img.resize({ width: SIZE, height: SIZE, quality: 'best' }).toPNG())
  console.log('icon:', out, img.getSize())
  app.quit()
})
