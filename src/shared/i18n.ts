// 화면·메인 공용 번역. 한국어 문장 자체가 키이고, 영어는 locales/en/*.json에 있다.
//   t('브랜치를 만들었어요: {name}', { name })  → 영어면 'Created branch: main'
//   tk('병합')  → 그대로 돌려줌. 모듈 맨 위 표 같은 곳에 키 표시만 하고, 그릴 때 t(값)으로 번역
// 규칙: 모듈 맨 위(불러올 때)에서 t()를 부르지 않는다 — 그때는 아직 언어가 정해지기 전이다.
// 확인: node scripts/i18n-check.mjs (번역 안 된 한글, 영어가 없는 키, {자리} 불일치)
import app from './locales/en/app.json'
import history from './locales/en/history.json'
import dialogs from './locales/en/dialogs.json'
import main from './locales/en/main.json'
import settings from './locales/en/settings.json'

export type Lang = 'ko' | 'en'
export type LangSetting = 'auto' | Lang

const EN: Record<string, string> = { ...main, ...settings, ...dialogs, ...history, ...app }

let current: Lang = 'ko'

export function setLang(l: Lang) {
  current = l
}

export function getLang(): Lang {
  return current
}

/** 'auto'면 시스템 언어(ko로 시작하면 한국어, 아니면 영어) */
export function resolveLang(setting: LangSetting | undefined, locale: string): Lang {
  if (setting === 'ko' || setting === 'en') return setting
  return locale.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

/**
 * 같은 한국어인데 뜻이 다를 때는 키 뒤에 '|구분'을 붙인다: '되돌리기|reset'(리셋 버튼) vs '되돌리기'(revert).
 * '|' 뒤는 화면에 나오지 않는다.
 */
const plain = (ko: string) => {
  const i = ko.indexOf('|')
  return i < 0 ? ko : ko.slice(0, i)
}

/** 지금 언어의 문장 (번역이 없으면 한국어 그대로) */
export function template(ko: string): string {
  return current === 'en' ? EN[ko] ?? plain(ko) : plain(ko)
}

export function t(ko: string, vars?: Record<string, string | number>): string {
  const s = template(ko)
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** 키 표시만 (번역은 그릴 때 t(값)으로). 그대로 화면에 쓰지 말 것('|구분'이 남을 수 있음) */
export const tk = (ko: string) => ko
