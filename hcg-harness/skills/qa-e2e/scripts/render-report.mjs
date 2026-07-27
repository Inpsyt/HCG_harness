#!/usr/bin/env node
/**
 * qa-e2e 리포트 렌더러 — results.json 하나로 report.md + report.html 을 동시 생성한다.
 *
 * 사용:
 *   node render-report.mjs <results.json> [--out-dir DIR] [--quiet]
 *
 * 왜 스크립트인가: 모델이 매번 HTML 을 손으로 쓰면 인코딩(Windows cp949 ↔ UTF-8)·집계·
 * 레이아웃이 실행마다 흔들린다. 렌더는 결정적이어야 하므로 여기 한 곳에 고정한다.
 * 출력은 항상 UTF-8 로 기록하고 HTML 에는 <meta charset="utf-8"> 를 강제한다.
 *
 * 스키마는 ../references/reporting.md 가 정본이다.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 결과 상태 4종. blocked 는 pass 도 fail 도 아닌 1급 상태다(환경 제약으로 검증 자체가 불가). */
export const STATUS = {
  pass: { icon: '✅', label: 'PASS', cls: 'st-pass' },
  fail: { icon: '❌', label: 'FAIL', cls: 'st-fail' },
  blocked: { icon: '⚠️', label: '검증 불가', cls: 'st-blocked' },
  skip: { icon: '⏭', label: '스킵', cls: 'st-skip' },
}

const SEVERITY = { high: '높음', medium: '중간', low: '낮음' }

/**
 * 판정(스위트/전체) 배지. 케이스 상태와 라벨이 다르다.
 * blocked 판정은 통과 건이 섞여 있으면 "부분"이다 — "검증 불가"로 쓰면
 * 실제로 확인한 것까지 못 본 것처럼 읽힌다.
 */
export function verdictBadge(verdict, counts) {
  const base = STATUS[verdict]
  if (verdict === 'blocked') {
    return { ...base, label: counts?.pass > 0 ? '부분' : '검증 불가' }
  }
  return base
}

// ─────────────────────────────────────────────────────────── 집계

/**
 * results 를 스위트별로 묶고 스위트/전체 판정을 계산한다.
 * 스위트 판정: fail 1건이라도 → fail · blocked 있으면 → blocked(부분) · 전부 skip → skip · 그 외 pass
 */
export function summarize(data) {
  const results = data.results ?? []
  const declared = data.suites ?? []
  const meta = new Map(declared.map((s, i) => [s.id, { ...s, order: i }]))

  const groups = new Map()
  for (const r of results) {
    const key = r.suite ?? '기타'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  const suites = [...groups.entries()]
    .map(([key, items]) => {
      const m = meta.get(key)
      return {
        id: key,
        name: m?.name ?? key,
        note: m?.note ?? '',
        order: m?.order ?? Number.MAX_SAFE_INTEGER,
        items,
        counts: countBy(items),
        verdict: verdictOf(items),
      }
    })
    .sort((a, b) => a.order - b.order)

  return { suites, totals: countBy(results), verdict: verdictOf(results), total: results.length }
}

function countBy(items) {
  const c = { pass: 0, fail: 0, blocked: 0, skip: 0 }
  for (const r of items) {
    const s = normalizeStatus(r.status)
    c[s] += 1
  }
  return c
}

function verdictOf(items) {
  if (!items.length) return 'skip'
  const c = countBy(items)
  if (c.fail > 0) return 'fail'
  if (c.blocked > 0) return 'blocked'
  if (c.pass === 0) return 'skip'
  return 'pass'
}

function normalizeStatus(s) {
  const v = String(s ?? '').toLowerCase()
  if (v in STATUS) return v
  throw new Error(
    `알 수 없는 status: ${JSON.stringify(s)} — 허용값: ${Object.keys(STATUS).join(' | ')}`,
  )
}

// ─────────────────────────────────────────────────────────── 문자열 유틸

const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** HTML 이스케이프 후 최소 인라인 마크다운(**굵게**, `코드`, 줄바꿈)만 되살린다. */
export function inlineMd(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replaceAll('\n', '<br>')
}

/** 마크다운 표 셀: 파이프와 줄바꿈이 표를 깨뜨리므로 무력화한다. */
const mdCell = (s) => String(s ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, '<br>')

const nz = (s) => (s === undefined || s === null || String(s).trim() === '' ? '' : String(s))

function fmtDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  return `${m}분 ${Math.round(sec - m * 60)}초`
}

function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function stackLine(stack) {
  if (!stack) return ''
  if (typeof stack === 'string') return stack
  return [stack.language, stack.framework, stack.unitRunner, stack.e2eRunner].filter(Boolean).join(' · ')
}

// ─────────────────────────────────────────────────────────── 공통 블록 조립

/** 헤더 메타를 [라벨, 값] 배열로. 값이 빈 항목은 애초에 렌더하지 않는다. */
function metaRows(m) {
  const rows = [
    ['작성일', fmtDateTime(m.finishedAt ?? m.startedAt) || m.date],
    ['환경', [nz(m.env), nz(m.baseUrl)].filter(Boolean).join(' · ')],
    ['대상', m.target],
    ['드라이버', m.driver],
    ['스택', stackLine(m.stack)],
    ['커밋', m.commit],
  ]
  for (const a of m.accounts ?? []) {
    rows.push(['테스트 계정', [a.role, a.id, a.note].filter(Boolean).join(' · ')])
  }
  for (const [k, v] of Object.entries(m.extra ?? {})) rows.push([k, v])
  return rows.filter(([, v]) => nz(v) !== '')
}

/** 요약 문단이 없으면 집계에서 한 문장을 만들어 준다(리포트가 절대 비지 않게). */
function summaryText(data, sum) {
  if (nz(data.meta?.summary)) return data.meta.summary
  const t = sum.totals
  const parts = [`총 ${sum.total}건 중 ✅ ${t.pass}건 통과`]
  if (t.fail) parts.push(`❌ ${t.fail}건 실패`)
  if (t.blocked) parts.push(`⚠️ ${t.blocked}건 검증 불가`)
  if (t.skip) parts.push(`⏭ ${t.skip}건 스킵`)
  const issues = data.issues?.length ?? 0
  return `${parts.join(' · ')}. 발견된 이슈 ${issues}건.`
}

const evidenceLine = (e) =>
  typeof e === 'string' ? e : [e.type ? `[${e.type}]` : '', e.detail ?? e.path ?? ''].filter(Boolean).join(' ')

// ─────────────────────────────────────────────────────────── Markdown

export function renderMarkdown(data) {
  const m = data.meta ?? {}
  const sum = summarize(data)
  const L = []

  L.push(`# ${m.title ?? m.project ?? 'QA'} — QA 리포트`, '')
  for (const [k, v] of metaRows(m)) L.push(`- **${k}**: ${v}`)
  L.push('', '---', '')

  // 1. 요약
  L.push('## 1. 요약 (Executive Summary)', '', summaryText(data, sum), '')
  L.push('| 스위트 | 통과 | 실패 | 검증불가 | 스킵 | 판정 |', '|---|---|---|---|---|---|')
  for (const s of sum.suites) {
    const c = s.counts
    const v = verdictBadge(s.verdict, c)
    L.push(`| ${mdCell(s.name)} | ${c.pass} | ${c.fail} | ${c.blocked} | ${c.skip} | ${v.icon} ${v.label} |`)
  }
  const t = sum.totals
  const tv = verdictBadge(sum.verdict, t)
  L.push(
    `| **전체 (${sum.total}건)** | **${t.pass}** | **${t.fail}** | **${t.blocked}** | **${t.skip}** | **${tv.icon} ${tv.label}** |`,
    '',
  )

  if (data.layers?.length) {
    L.push('### 자동화 테스트 레이어', '')
    L.push('| 레이어 | 명령 | 통과 | 실패 | 스킵 | 소요 | 비고 |', '|---|---|---|---|---|---|---|')
    for (const l of data.layers) {
      L.push(
        `| ${mdCell(l.name)} | \`${mdCell(l.command)}\` | ${l.passed ?? '-'} | ${l.failed ?? '-'} | ${l.skipped ?? '-'} | ${fmtDuration(l.durationMs) || '-'} | ${mdCell(l.note) || ''} |`,
      )
    }
    L.push('')
  }
  L.push('---', '')

  // 2. 상세
  L.push('## 2. 스위트별 상세', '')
  for (const s of sum.suites) {
    L.push(`### ${s.name}`, '')
    if (nz(s.note)) L.push(s.note, '')
    for (const r of s.items) {
      const st = STATUS[normalizeStatus(r.status)]
      L.push(`#### ${st.icon} ${nz(r.id) ? `${r.id} · ` : ''}${r.title ?? ''}`, '')
      if (nz(r.expected)) L.push(`- **기대**: ${r.expected}`)
      if (nz(r.actual)) L.push(`- **실제**: ${r.actual}`)
      if (r.steps?.length) {
        L.push('- **단계**:')
        r.steps.forEach((x, i) => L.push(`  ${i + 1}. ${typeof x === 'string' ? x : JSON.stringify(x)}`))
      }
      if (r.evidence?.length) {
        L.push('- **증거**:')
        for (const e of r.evidence) L.push(`  - ${evidenceLine(e)}`)
      }
      if (nz(r.note)) L.push(`- **비고**: ${r.note}`)
      L.push('')
    }
  }
  L.push('---', '')

  // 3. 이슈
  L.push('## 3. 발견된 이슈', '')
  if (!data.issues?.length) {
    L.push('발견된 이슈 없음.', '')
  } else {
    data.issues.forEach((i, n) => {
      L.push(`${n + 1}. **[${SEVERITY[i.severity] ?? i.severity ?? '미분류'}] ${i.title ?? ''}**`)
      if (nz(i.repro)) L.push(`   - 재현: ${i.repro}`)
      if (nz(i.expected)) L.push(`   - 기대: ${i.expected}`)
      if (nz(i.actual)) L.push(`   - 실제: ${i.actual}`)
      if (i.refs?.length) L.push(`   - 관련: ${i.refs.join(', ')}`)
    })
    L.push('')
  }

  if (data.nextSteps?.length) {
    L.push('---', '', '## 4. 다음 테스트 권장', '')
    data.nextSteps.forEach((s, n) => L.push(`${n + 1}. ${s}`))
    L.push('')
  }

  L.push('---', '')
  L.push(`*${footerText(m)}*`, '')
  return L.join('\n')
}

function footerText(m) {
  const bits = [`대상 ${m.baseUrl ?? m.env ?? '—'}`]
  if (m.driver) bits.push(`드라이버 ${m.driver}`)
  bits.push(`생성 ${fmtDateTime(m.finishedAt ?? new Date().toISOString())}`)
  return `본 리포트는 실제로 실행·관찰한 내용만 기재한다. ${bits.join(' · ')}`
}

// ─────────────────────────────────────────────────────────── HTML

const CSS = `
:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--muted:#6b7280;--line:#d1d5db;--line2:#e5e7eb;
--th:#f1f5f9;--zebra:#fafafa;--h1:#1e3a8a;--h2:#1e40af;--h3:#374151;--accent:#2563eb;
--code-bg:#f3f4f6;--code-fg:#be123c;--pass:#15803d;--fail:#b91c1c;--blocked:#b45309;--skip:#6b7280;}
@media (prefers-color-scheme:dark){:root{--fg:#e5e7eb;--bg:#111318;--muted:#9ca3af;--line:#374151;
--line2:#2a2f3a;--th:#1b2230;--zebra:#161a22;--h1:#93c5fd;--h2:#bfdbfe;--h3:#d1d5db;--accent:#60a5fa;
--code-bg:#1f2430;--code-fg:#fda4af;--pass:#4ade80;--fail:#f87171;--blocked:#fbbf24;--skip:#9ca3af;}}
:root[data-theme=dark]{--fg:#e5e7eb;--bg:#111318;--muted:#9ca3af;--line:#374151;--line2:#2a2f3a;
--th:#1b2230;--zebra:#161a22;--h1:#93c5fd;--h2:#bfdbfe;--h3:#d1d5db;--accent:#60a5fa;
--code-bg:#1f2430;--code-fg:#fda4af;--pass:#4ade80;--fail:#f87171;--blocked:#fbbf24;--skip:#9ca3af;}
:root[data-theme=light]{--fg:#1a1a1a;--bg:#fff;--muted:#6b7280;--line:#d1d5db;--line2:#e5e7eb;
--th:#f1f5f9;--zebra:#fafafa;--h1:#1e3a8a;--h2:#1e40af;--h3:#374151;--accent:#2563eb;
--code-bg:#f3f4f6;--code-fg:#be123c;--pass:#15803d;--fail:#b91c1c;--blocked:#b45309;--skip:#6b7280;}
body{font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;line-height:1.65;
max-width:900px;margin:40px auto;padding:0 24px;color:var(--fg);background:var(--bg);
overflow-wrap:anywhere;}
h1{border-bottom:3px solid var(--accent);padding-bottom:8px;color:var(--h1);}
h2{border-bottom:1px solid var(--line2);padding-bottom:6px;margin-top:36px;color:var(--h2);}
h3{margin-top:24px;color:var(--h3);}
h4{margin-top:20px;margin-bottom:6px;color:var(--fg);font-size:15px;}
.tw{overflow-x:auto;margin:16px 0;}
table{border-collapse:collapse;width:100%;font-size:14px;}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;}
th{background:var(--th);font-weight:600;}
tr:nth-child(even) td{background:var(--zebra);}
code{background:var(--code-bg);padding:2px 6px;border-radius:4px;font-size:13px;color:var(--code-fg);}
hr{border:none;border-top:1px solid var(--line2);margin:28px 0;}
ul,ol{padding-left:22px;}li{margin:4px 0;}
.meta{color:var(--muted);font-size:13px;}
.st-pass{color:var(--pass);font-weight:600;}
.st-fail{color:var(--fail);font-weight:600;}
.st-blocked{color:var(--blocked);font-weight:600;}
.st-skip{color:var(--skip);font-weight:600;}
.case{border-left:3px solid var(--line);padding-left:14px;margin:18px 0;}
.case.fail{border-left-color:var(--fail);}
.case.blocked{border-left-color:var(--blocked);}
.case.pass{border-left-color:var(--pass);}
.sev{font-weight:700;}
`.trim()

const badge = (verdict, counts) => {
  const v = verdictBadge(verdict, counts)
  return `<span class="${v.cls}">${v.icon} ${v.label}</span>`
}

export function renderHtml(data) {
  const m = data.meta ?? {}
  const sum = summarize(data)
  const H = []

  H.push('<!DOCTYPE html>', '<html lang="ko">', '<head>')
  H.push('<meta charset="utf-8">')
  H.push('<meta name="viewport" content="width=device-width, initial-scale=1">')
  H.push(`<title>${escapeHtml(m.title ?? m.project ?? 'QA')} — QA 리포트</title>`)
  H.push(`<style>${CSS}</style>`, '</head>', '<body>')

  H.push(`<h1>${inlineMd(m.title ?? m.project ?? 'QA')} — QA 리포트</h1>`)
  H.push('<ul>')
  for (const [k, v] of metaRows(m)) H.push(`<li><strong>${escapeHtml(k)}</strong>: ${inlineMd(v)}</li>`)
  H.push('</ul>', '<hr>')

  // 1. 요약
  H.push('<h2>1. 요약 (Executive Summary)</h2>')
  H.push(`<p>${inlineMd(summaryText(data, sum))}</p>`)
  H.push('<div class="tw"><table>')
  H.push('<tr><th>스위트</th><th>통과</th><th>실패</th><th>검증불가</th><th>스킵</th><th>판정</th></tr>')
  for (const s of sum.suites) {
    const c = s.counts
    H.push(
      `<tr><td>${inlineMd(s.name)}</td><td>${c.pass}</td><td>${c.fail}</td><td>${c.blocked}</td><td>${c.skip}</td><td>${badge(s.verdict, c)}</td></tr>`,
    )
  }
  const t = sum.totals
  H.push(
    `<tr><td><strong>전체 (${sum.total}건)</strong></td><td><strong>${t.pass}</strong></td><td><strong>${t.fail}</strong></td><td><strong>${t.blocked}</strong></td><td><strong>${t.skip}</strong></td><td>${badge(sum.verdict, t)}</td></tr>`,
  )
  H.push('</table></div>')

  if (data.layers?.length) {
    H.push('<h3>자동화 테스트 레이어</h3>', '<div class="tw"><table>')
    H.push('<tr><th>레이어</th><th>명령</th><th>통과</th><th>실패</th><th>스킵</th><th>소요</th><th>비고</th></tr>')
    for (const l of data.layers) {
      H.push(
        `<tr><td>${inlineMd(l.name)}</td><td><code>${escapeHtml(l.command)}</code></td><td>${l.passed ?? '-'}</td><td>${l.failed ?? '-'}</td><td>${l.skipped ?? '-'}</td><td>${escapeHtml(fmtDuration(l.durationMs) || '-')}</td><td>${inlineMd(l.note ?? '')}</td></tr>`,
      )
    }
    H.push('</table></div>')
  }
  H.push('<hr>')

  // 2. 상세
  H.push('<h2>2. 스위트별 상세</h2>')
  for (const s of sum.suites) {
    H.push(`<h3>${inlineMd(s.name)}</h3>`)
    if (nz(s.note)) H.push(`<p>${inlineMd(s.note)}</p>`)
    for (const r of s.items) {
      const st = normalizeStatus(r.status)
      H.push(`<div class="case ${st}">`)
      H.push(`<h4>${STATUS[st].icon} ${nz(r.id) ? `${escapeHtml(r.id)} · ` : ''}${inlineMd(r.title ?? '')}</h4>`)
      H.push('<ul>')
      if (nz(r.expected)) H.push(`<li><strong>기대</strong>: ${inlineMd(r.expected)}</li>`)
      if (nz(r.actual)) H.push(`<li><strong>실제</strong>: ${inlineMd(r.actual)}</li>`)
      if (r.steps?.length) {
        H.push('<li><strong>단계</strong><ol>')
        for (const x of r.steps) H.push(`<li>${inlineMd(typeof x === 'string' ? x : JSON.stringify(x))}</li>`)
        H.push('</ol></li>')
      }
      if (r.evidence?.length) {
        H.push('<li><strong>증거</strong><ul>')
        for (const e of r.evidence) H.push(`<li>${inlineMd(evidenceLine(e))}</li>`)
        H.push('</ul></li>')
      }
      if (nz(r.note)) H.push(`<li><strong>비고</strong>: ${inlineMd(r.note)}</li>`)
      H.push('</ul>', '</div>')
    }
  }
  H.push('<hr>')

  // 3. 이슈
  H.push('<h2>3. 발견된 이슈</h2>')
  if (!data.issues?.length) {
    H.push('<p>발견된 이슈 없음.</p>')
  } else {
    H.push('<ol>')
    for (const i of data.issues) {
      H.push(
        `<li><span class="sev">[${escapeHtml(SEVERITY[i.severity] ?? i.severity ?? '미분류')}]</span> <strong>${inlineMd(i.title ?? '')}</strong><ul>`,
      )
      if (nz(i.repro)) H.push(`<li>재현: ${inlineMd(i.repro)}</li>`)
      if (nz(i.expected)) H.push(`<li>기대: ${inlineMd(i.expected)}</li>`)
      if (nz(i.actual)) H.push(`<li>실제: ${inlineMd(i.actual)}</li>`)
      if (i.refs?.length) H.push(`<li>관련: ${escapeHtml(i.refs.join(', '))}</li>`)
      H.push('</ul></li>')
    }
    H.push('</ol>')
  }

  if (data.nextSteps?.length) {
    H.push('<hr>', '<h2>4. 다음 테스트 권장</h2>', '<ol>')
    for (const s of data.nextSteps) H.push(`<li>${inlineMd(s)}</li>`)
    H.push('</ol>')
  }

  H.push('<hr>', `<p class="meta">${inlineMd(footerText(m))}</p>`)
  H.push('</body>', '</html>')
  return H.join('\n')
}

// ─────────────────────────────────────────────────────────── CLI

export function render(data) {
  return { markdown: renderMarkdown(data), html: renderHtml(data) }
}

function main(argv) {
  const args = argv.slice(2)
  const quiet = args.includes('--quiet')
  const oi = args.indexOf('--out-dir')
  const outDir = oi >= 0 ? args[oi + 1] : null
  const input = args.find((a) => !a.startsWith('--') && a !== outDir)

  if (!input) {
    console.error('사용: node render-report.mjs <results.json> [--out-dir DIR] [--quiet]')
    process.exit(2)
  }

  const src = resolve(input)
  let data
  try {
    data = JSON.parse(readFileSync(src, 'utf8'))
  } catch (e) {
    console.error(`results.json 을 읽을 수 없다: ${src}\n  ${e.message}`)
    process.exit(1)
  }

  let out
  try {
    out = render(data)
  } catch (e) {
    console.error(`렌더 실패: ${e.message}`)
    process.exit(1)
  }

  const dir = resolve(outDir ?? dirname(src))
  mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const htmlPath = join(dir, 'report.html')
  writeFileSync(mdPath, out.markdown, 'utf8')
  writeFileSync(htmlPath, out.html, 'utf8')

  if (!quiet) {
    const s = summarize(data)
    console.log(`${mdPath}\n${htmlPath}`)
    console.log(
      `판정 ${verdictBadge(s.verdict, s.totals).label} — 총 ${s.total}건 (통과 ${s.totals.pass} · 실패 ${s.totals.fail} · 검증불가 ${s.totals.blocked} · 스킵 ${s.totals.skip})`,
    )
  }
  // 실패가 있어도 리포트 생성 자체는 성공이다. 게이트 판정은 호출자가 한다.
  return 0
}

// 직접 실행일 때만 CLI 로 동작한다(테스트에서 import 하면 실행되지 않게). Windows 경로 포함 안전.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exit(main(process.argv))
