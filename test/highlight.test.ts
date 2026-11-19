// 코드 색칠: 파일 이름으로 언어 고르기, 한 줄 색칠과 HTML 이스케이프
import { describe, expect, it } from 'vitest'
import { highlightLine, languageFor } from '../src/renderer/src/highlight'

describe('highlight', () => {
  it('picks a language from the file name', () => {
    expect(languageFor('src/main/repo.ts')).toBe('typescript')
    expect(languageFor('App.tsx')).toBe('typescript')
    expect(languageFor('build/Dockerfile')).toBe('dockerfile')
    expect(languageFor('docs/README.md')).toBe('markdown')
    expect(languageFor('a/b/스타일.css')).toBe('css')
    expect(languageFor('LICENSE')).toBeNull()
    expect(languageFor('photo.png')).toBeNull()
  })

  it('colors keywords and escapes HTML', () => {
    expect(highlightLine('export const a = 1', 'typescript')).toContain('hljs-keyword')
    const html = highlightLine('const s = "<img src=x onerror=alert(1)>"', 'typescript')!
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(highlightLine('', 'typescript')).toBeNull()
  })
})
