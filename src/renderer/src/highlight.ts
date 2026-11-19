// 변경 내용 코드 색칠 (highlight.js, 자주 쓰는 언어만 넣어 크기를 줄임)
// diff는 줄 조각이라 줄마다 따로 색칠한다(여러 줄 주석·문자열은 가끔 틀릴 수 있음).
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dart from 'highlight.js/lib/languages/dart'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import lua from 'highlight.js/lib/languages/lua'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const LANGS = { bash, cpp, csharp, css, dart, dockerfile, go, ini, java, javascript, json, kotlin, lua, markdown, php, powershell, python, ruby, rust, scss, sql, swift, typescript, xml, yaml }
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def)

const BY_EXT: Record<string, keyof typeof LANGS> = {
  sh: 'bash', bash: 'bash', zsh: 'bash',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', css: 'css', dart: 'dart', go: 'go',
  ini: 'ini', toml: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini', editorconfig: 'ini', gitconfig: 'ini',
  java: 'java', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json', kt: 'kotlin', kts: 'kotlin', lua: 'lua', md: 'markdown', markdown: 'markdown',
  php: 'php', ps1: 'powershell', psm1: 'powershell', py: 'python', rb: 'ruby', rs: 'rust',
  scss: 'scss', sass: 'scss', less: 'scss', sql: 'sql', swift: 'swift',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', csproj: 'xml', xaml: 'xml',
  yml: 'yaml', yaml: 'yaml',
}

/** 파일 이름으로 언어 (모르면 null) */
export function languageFor(path: string): string | null {
  const name = path.split('/').pop()!.toLowerCase()
  if (name === 'dockerfile' || name.endsWith('.dockerfile')) return 'dockerfile'
  if (name === 'makefile') return 'bash'
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return BY_EXT[ext] ?? null
}

/** 한 줄을 색칠한 HTML (highlight.js가 글자를 이스케이프한다). 실패하면 null */
export function highlightLine(text: string, lang: string): string | null {
  if (!text || text.length > 2000) return null
  try {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
  } catch {
    return null
  }
}
