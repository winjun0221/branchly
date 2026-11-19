// 번역: t()의 자리 채우기·언어 고르기, 그리고 src 전체에 번역 안 된 한글·영어 없는 키가 없는지(scripts/i18n-check.mjs)
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveLang, setLang, t, tk } from '../src/shared/i18n'

afterEach(() => setLang('ko'))

describe('i18n', () => {
  it('keeps Korean as the key and fills placeholders', () => {
    setLang('ko')
    expect(t('브랜치를 만들었어요: {name}', { name: 'main' })).toBe('브랜치를 만들었어요: main')
    expect(tk('병합')).toBe('병합')
  })

  it('translates to English and falls back to Korean when missing', () => {
    setLang('en')
    expect(t('히스토리')).toBe('History')
    expect(t('사전에 없는 문장 {x}', { x: 1 })).toBe('사전에 없는 문장 1')
  })

  it('resolves auto from the system locale', () => {
    expect(resolveLang('auto', 'ko-KR')).toBe('ko')
    expect(resolveLang('auto', 'en-US')).toBe('en')
    expect(resolveLang('auto', 'ja')).toBe('en')
    expect(resolveLang('ko', 'en-US')).toBe('ko')
    expect(resolveLang(undefined, 'ko')).toBe('ko')
  })

  it('has English for every key and no untranslated Korean in src', () => {
    const script = path.resolve(__dirname, '..', 'scripts', 'i18n-check.mjs')
    let out = ''
    try {
      out = execFileSync(process.execPath, [script], { encoding: 'utf8' })
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? e)
    }
    expect(out).toMatch(/^OK/m)
  })
})
