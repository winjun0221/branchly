// 화면에서 넘어온 값 검사. 화면(renderer)이 잘못되거나 뚫려도 메인 프로세스가 엉뚱한 폴더·명령을 실행하지 않게.
// 규칙: git에 넘기는 값은 '-'로 시작하면 거부(옵션으로 해석되는 것 방지), NUL·줄바꿈 거부, 길이 제한.
import fs from 'node:fs'
import path from 'node:path'
import { t, tk } from '../shared/i18n'

/** 이번 실행에서 사용자가 연 저장소만 다룬다 */
const opened = new Set<string>()
/** 이번 실행에서 사용자가 폴더 고르기 창으로 고른 폴더 (복제·새 저장소 위치) */
const picked = new Set<string>()

export function allowRepo(repoPath: string) {
  opened.add(path.resolve(repoPath))
}

export function allowDir(dir: string) {
  picked.add(path.resolve(dir))
}

export function checkRepo(repo: unknown): string {
  if (typeof repo !== 'string' || !opened.has(path.resolve(repo))) throw new Error(t('열지 않은 저장소입니다'))
  return path.resolve(repo)
}

/** 고른 폴더 또는 그 안 (새 저장소를 고른 폴더 아래 새 폴더에 만들 수 있게) */
export function checkDir(dir: unknown): string {
  if (typeof dir !== 'string' || dir.includes('\0') || !path.isAbsolute(dir)) throw new Error(t('잘못된 폴더'))
  const full = path.resolve(dir)
  for (const p of picked) {
    const rel = path.relative(p, full)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return full
  }
  throw new Error(t('폴더 고르기로 고른 폴더만 쓸 수 있습니다'))
}

/** 저장소 안의 상대 경로만 (절대 경로·.. 로 밖으로 나가기 금지) */
export function checkFile(file: unknown): string {
  if (typeof file !== 'string' || file.length === 0 || file.length > 4096 || file.includes('\0')) throw new Error(t('잘못된 파일 경로'))
  if (path.isAbsolute(file) || /^[a-zA-Z]:/.test(file)) throw new Error(t('잘못된 파일 경로'))
  const norm = path.posix.normalize(file.replace(/\\/g, '/'))
  if (norm === '..' || norm.startsWith('../') || norm.startsWith('-')) throw new Error(t('잘못된 파일 경로'))
  return file
}

export function checkFiles(files: unknown): string[] {
  if (!Array.isArray(files) || files.length > 10000) throw new Error(t('잘못된 파일 목록'))
  return files.map(checkFile)
}

export function checkOptionalFile(file: unknown): string | null {
  return file === null || file === undefined ? null : checkFile(file)
}

export function checkSha(sha: unknown): string {
  if (typeof sha !== 'string' || !/^[0-9a-f]{7,64}$/i.test(sha)) throw new Error(t('잘못된 커밋'))
  return sha
}

export function checkShas(shas: unknown): string[] {
  if (!Array.isArray(shas) || shas.length === 0 || shas.length > 1000) throw new Error(t('잘못된 커밋 목록'))
  return shas.map(checkSha)
}

/** 브랜치·태그·원격 브랜치·커밋 이름 (HEAD~1 같은 표현 포함). 공백·제어 문자·'-' 시작 금지 */
export function checkRef(ref: unknown): string {
  if (typeof ref !== 'string' || ref.length === 0 || ref.length > 400) throw new Error(t('잘못된 브랜치 이름'))
  if (ref.startsWith('-') || /[\s\x00-\x1f\x7f]/.test(ref) || ref.includes('..')) throw new Error(t('잘못된 브랜치 이름: {ref}', { ref }))
  return ref
}

export function checkRefs(refs: unknown): string[] {
  if (!Array.isArray(refs) || refs.length > 1000) throw new Error(t('잘못된 브랜치 목록'))
  return refs.map(checkRef)
}

export function checkOptionalRef(ref: unknown): string | null {
  return ref === null || ref === undefined || ref === '' ? null : checkRef(ref)
}

/** 원격 이름 (origin 등) */
export function checkName(name: unknown, what = tk('이름|field')): string {
  if (typeof name !== 'string' || !/^[\p{L}\p{N}._][\p{L}\p{N}._/-]{0,199}$/u.test(name) || name.includes('..')) {
    throw new Error(t('쓸 수 없는 {what}입니다', { what: t(what) }))
  }
  return name
}

/** 새로 만들 폴더 이름 하나 (복제 대상) */
export function checkFolderName(name: unknown): string {
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) throw new Error(t('잘못된 폴더 이름'))
  const n = name.trim()
  if (/[<>:"/\\|?*\x00-\x1f]/.test(n) || n.startsWith('-') || n === '.' || n === '..' || /[. ]$/.test(n)) throw new Error(t('쓸 수 없는 폴더 이름입니다'))
  return n
}

/** 원격 주소: https·http·ssh·git·file 또는 user@host:path. 'ext::' 같은 명령 실행 전송 방식은 거부 */
export function checkUrl(url: unknown): string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000 || /[\s\x00-\x1f\x7f]/.test(url) || url.startsWith('-')) {
    throw new Error(t('잘못된 원격 주소'))
  }
  if (/^(https?|ssh|git|file):\/\//i.test(url)) return url
  if (/^[^@\s/:]+@[^:/\s]+:[^\s]+$/.test(url)) return url // scp 형식
  if (path.isAbsolute(url) && fs.existsSync(url)) return url // 로컬 저장소 경로
  throw new Error(t('지원하지 않는 원격 주소입니다 (https://, ssh://, git@host:경로)'))
}

/** .gitignore·LFS 패턴 한 줄 */
export function checkPattern(p: unknown): string {
  if (typeof p !== 'string' || p.trim().length === 0 || p.length > 1000 || /[\r\n\0]/.test(p) || p.startsWith('-')) {
    throw new Error(t('잘못된 패턴'))
  }
  return p.trim()
}

export function checkMessage(msg: unknown): string {
  if (typeof msg !== 'string' || msg.trim().length === 0) throw new Error(t('커밋 메시지를 입력하세요'))
  if (msg.length > 100_000) throw new Error(t('커밋 메시지가 너무 깁니다'))
  return msg
}

/** 비어도 되는 글 (태그 메시지, 스태시 메시지 등) */
export function checkText(v: unknown, max = 100_000): string {
  if (typeof v !== 'string' || v.length > max || v.includes('\0')) throw new Error(t('잘못된 글'))
  return v
}

export function checkBool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Error(t('잘못된 요청'))
  return v
}

export function checkInt(v: unknown, min = 0, max = 1_000_000): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(t('잘못된 요청'))
  return v
}

export function checkOneOf<T extends string>(v: unknown, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new Error(t('잘못된 요청'))
  return v as T
}

export function checkObject(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(t('잘못된 요청'))
  return v as Record<string, unknown>
}
