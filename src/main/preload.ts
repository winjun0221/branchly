// 화면(window.api)에 열어 주는 기능. Node·Electron 자체는 화면에 노출하지 않는다(contextIsolation + sandbox).
// 메서드 이름 = IPC 채널 이름 (shared/types.ts의 API_METHODS, main.ts의 handlers와 같은 목록)
import { contextBridge, ipcRenderer } from 'electron'
import { API_METHODS, type Api } from '../shared/types'

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as { ok: true; data: unknown } | { ok: false; error: string }
  if (!r.ok) throw new Error(r.error)
  return r.data
}

const api = Object.fromEntries(API_METHODS.map((name) => [name, (...args: unknown[]) => call(name, ...args)])) as unknown as Api

contextBridge.exposeInMainWorld('api', api)
