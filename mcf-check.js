/* ============================================================================
   mcf-check.js  —  MCF 문항 파일 통합 검사 게이트  (v1, 2026-08-04)

   지침서의 "최종 통과 기준" 12개를 한 번에 재고 PASS / FAIL 을 낸다.
   파일을 만질 때마다 돌린다. 18파일 × 500문제에 5초도 안 걸린다.

     node mcf-check.js                      (폴더의 모든 *.html)
     node mcf-check.js "Unit 1 Lesson 4.html"
     N=3000 node mcf-check.js               (표본 수 조절, 기본 1500)

   ── 왜 texleak.js 를 대체하나 ────────────────────────────────────────────
   예전 texleak.js 는 필드 구분 없이 "\ 로 시작하는 것"을 전부 누출로 봤다.
   그래서 mcf-core.js 가 렌더 시점에 자동으로 감싸주는 필드(step.math,
   보기 본문)까지 100% 누출로 찍혔다. 전부 오탐이었다.
   이 스크립트는 core 의 렌더 계약을 알고 있다:

     자동 래핑됨 (맨몸 LaTeX 허용)   : step.math, 보기 본문
     산문 필드 (M() 로 감싸야 함)     : fullStatement, prompt, hint,
                                        step.title, step.rule, step.explanation

   산문 필드는 18파일 전수 조사에서 수식 혼합률이 14~76% 였다. 통째로 감쌀
   수 없다는 뜻이라, 자동 래핑이 구조적으로 불가능하다. 그래서 이 검사가
   유일한 방어선이다.
   ========================================================================== */

const fs = require('fs'), vm = require('vm'), path = require('path');
const N = parseInt(process.env.N || '1500', 10);

/* ─────────────────── 로더 ─────────────────── */

function stubEl() {
  const el = {
    style: {}, dataset: {}, children: [], value: "", textContent: "", innerHTML: "",
    options: [], disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { return c; }, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return stubEl(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400 }; },
    focus() {}, remove() {}, closest() { return null; }, cloneNode() { return stubEl(); }
  };
  return el;
}

function load(p) {
  const src = fs.readFileSync(p, 'utf8');
  const dir = path.dirname(p);
  let pre = '';
  for (const m of src.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)) {
    const u = m[1];
    if (/^https?:/.test(u)) continue;
    if (/progress\.js$/.test(u)) continue;      /* 진도 스크립트는 문항과 무관 */
    for (const c of [path.join(dir, u), path.join(dir, path.basename(u))]) {
      if (fs.existsSync(c)) { pre += fs.readFileSync(c, 'utf8') + '\n;\n'; break; }
    }
  }
  const code = pre + [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n;\n');

  const doc = {
    getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [],
    createElement: () => stubEl(), createElementNS: () => stubEl(), createTextNode: () => stubEl(),
    addEventListener() {}, body: stubEl(), documentElement: stubEl(), head: stubEl(),
    readyState: 'complete', getElementsByClassName: () => [], getElementsByTagName: () => []
  };
  const sandbox = {
    Math, JSON, Date, Number, String, Array, Object, Boolean, RegExp, Error, Map, Set,
    parseInt, parseFloat, isNaN, isFinite, fetch: () => Promise.resolve(),
    setTimeout() {}, clearTimeout() {}, setInterval() {}, requestAnimationFrame() {},
    document: doc,
    localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, clear() { this._d = {}; } },
    renderMathInElement() {}, katex: { render() {}, renderToString: s => String(s) },
    console: { log() {}, warn() {}, error() {} },
    location: { href: "file:///x.html", pathname: "/x.html", search: "", hash: "" },
    navigator: { userAgent: "node" }, alert() {}, confirm() { return true; }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  let loadErr = null;
  try { vm.runInContext(code, ctx, { filename: p }); } catch (e) { loadErr = e; }
  /* 아직 전환하지 않은 파일 호환: generateProblem 이 없고 genType1..N +
     generateNewProblem 디스패처만 있는 구조에서 진입점을 합성한다.
     이걸 안 하면 Unit 1 계열 파일이 통째로 측정에서 빠진다. */
  vm.runInContext(`
    if (typeof generateProblem !== 'function') {
      var __m = {};
      for (var __i = 1; __i <= 40; __i++) {
        if (typeof globalThis['genType' + __i] === 'function') __m['t' + __i] = globalThis['genType' + __i];
      }
      if (Object.keys(__m).length) {
        globalThis.generateProblem = function (id) {
          var f = __m[id];
          if (!f) throw new Error('no generator for ' + id);
          return f();
        };
      }
    }
  `, ctx);
  vm.runInContext(`globalThis.__API = {
    gen: typeof generateProblem === 'function' ? generateProblem : null,
    ded: (typeof MCF === 'object' && MCF && MCF.dedupe) ? MCF.dedupe
       : (typeof mcfDedupe === 'function' ? mcfDedupe : (x => x))
  };`, ctx);
  return Object.assign({ loadErr }, ctx.__API);
}

/* 드롭다운 유형 id. t1 / q1 / u4_t1 등 어떤 형식이든 잡는다. */
function types(p) {
  const src = fs.readFileSync(p, 'utf8');
  return [...src.matchAll(/<option value="([A-Za-z0-9_]+)"[^>]*>([^<]*)</g)]
    .filter(m => m[1] !== '')
    .map(m => ({ id: m[1], label: m[2].replace(/&amp;/g, '&').trim() }));
}

/* ─────────────────── 판정 기준 ─────────────────── */

/* "Criss-Cross Matrix" 는 Dan 이 학생에게 쓰는 방법 이름이라 전문용어가 아니다.
   amplitude / period / midline / Sine Law 처럼 살려야 하는 실제 용어와 같은 취급. */
const ALLOW = /Criss-Cross Matrix|matrix box/i;
const JARGON = /\b(parameter|parameters|metric|metrics|execute|executes|extract|extracts|isolate|isolates|inject|injects|utilize|utilizes|deploy|deploys|configuration|structural|threshold|protocol|algorithm|matrix|anatomy|mechanics|accumulation|instantiate|normalize|coefficient|binomial|template|multiplier|entity|magnitude|locus)\b/i;

/* 학생이 읽는 방식: 렌더된 \(...\) 는 기호 한 개로 센다 */
const readAs = s => String(s || '').replace(/\\\([^)]*\\\)/g, 'X').replace(/\\[a-zA-Z]+/g, ' ').replace(/[\\{}$]/g, ' ');
/* 엄격 카운터: 수식을 토큰으로 풀어 센다. 둘 다 22단어 이하여야 한다. */
const strict = s => String(s || '')
  .replace(/\\text\{([^}]*)\}/g, '$1')
  .replace(/\\d?frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
  .replace(/\\(left|right|quad|qquad|;|,|!|:)/g, ' ')
  .replace(/\\([a-zA-Z]+)/g, ' $1 ')
  .replace(/[\\{}$()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();

/* 산문 필드에서 수식 구간을 걷어낸 나머지에 TeX 흔적이 남으면 누출이다. */
function proseLeak(s) {
  let str = String(s == null ? '' : s);
  str = str.replace(/\\\([\s\S]*?\\\)/g, ' ');       /* \( ... \) */
  str = str.replace(/\$\$[\s\S]*?\$\$/g, ' ');       /* $$ ... $$ */
  str = str.replace(/<[^>]+>/g, ' ');                /* HTML 태그는 정상 */
  str = str.replace(/&[a-zA-Z]+;|&#\d+;/g, ' ');     /* HTML 엔티티도 정상 */
  /* 통화 표시 $8 은 정상이다. KaTeX 에 등록된 델리미터는 $$ 뿐이라 한 개짜리 $ 는
     그냥 글자로 나온다. 진짜 문제는 $A = |a|$ 처럼 수식을 $ 로 감싼 경우이므로,
     $...$ 안에 수식 기호가 들어 있을 때만 잡는다. */
  /* 큰따옴표 문자열 안에 템플릿 문법을 쓰면 ${a} 가 그대로 학생 화면에 나온다.
     백틱을 안 써서 생기는 실수라 흔하다. */
  if (/\$\{[^}]*\}/.test(str)) return { hits: '${...}', ctx: str.replace(/\s+/g, ' ').trim().slice(0, 110) };
  const dollarMath = /\$[^$]*[\\^_=]{1}[^$]*\$/.test(str) || /\$\$/.test(str);
  /* `**굵게**` 는 코어의 rich() 가 <b> 로 바꿔주므로 화면에 별표가 안 남는다.
     (코어가 없던 시절에는 innerHTML 로 그대로 노출돼 결함이었다.) */
  const bad = str.match(/\\[a-zA-Z]+|\^\{|_\{|\\\(|\\\)/g) || (dollarMath ? ['$'] : null);
  return bad ? { hits: bad.slice(0, 3).join(' '), ctx: str.replace(/\s+/g, ' ').trim().slice(0, 110) } : null;
}

function optBody(o) { return String(o).replace(/^\s*[A-D]\)\s*/, ''); }

/* 값 키 — (x+2)(x-2) 와 (x-2)(x+2) 를 같게 본다 */
function valKey(s) {
  /* core 의 factorKey 와 같은 규칙. 뜻이 다른 명령(\\sin vs \\cos)은 남기고,
     곱셈 교환만 순서를 무시한다. 값 나열형 보기는 순서를 지킨다. */
  const str = String(s == null ? '' : s).replace(/^\s*[A-D]\)\s*/, '')
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$/g, '')
    .replace(/\\(left|right|quad|qquad|displaystyle|small|,|;|!|:|\s)/g, '')
    .replace(/\\[dt]frac/g, '\\frac')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\s|\{|\}/g, '');
  if (!/^[-+]?[0-9]*(\([^()]*\))+$/.test(str)) return str;
  const lead = str.slice(0, str.indexOf('('));
  return lead + '|' + (str.match(/\([^()]*\)/g) || []).map(p =>
    p.slice(1, -1).replace(/-/g, '+-').split('+').filter(x => x !== '').sort().join('+')
  ).sort().join('|');
}

const CMD = /^(Apply|Calculate|Substitute|Write|Use|Solve|Plug|Compute|Evaluate|Multiply|Divide|Add|Subtract|Set|Do|Take)\b/i;

/* ─────────────────── 검사 ─────────────────── */

function run(file) {
  const api = load(file);
  const ts = types(file);
  const rows = [];
  if (api.loadErr) return { file, loadErr: api.loadErr, rows, ts };
  if (!api.gen) return { file, loadErr: new Error('generateProblem 을 찾을 수 없다'), rows, ts };

  for (const t of ts) {
    const r = {
      id: t.id, label: t.label,
      err: 0, errMsg: null,
      optBad: 0, optUndef: 0, optCounts: {}, strDup: 0, valDup: 0, ansDup: 0, noAns: 0,
      leak: 0, leakWhere: {},
      jargon: 0, jargonWhere: {},
      long: 0, longList: [],
      missingExp: 0, shortExp: 0, withNum: 0, words: 0, stepCount: 0,
      pos: { A: 0, B: 0, C: 0, D: 0 },
      stmtShapes: new Set(), firstTitles: new Set(), modes: new Set()
    };
    for (let i = 0; i < N; i++) {
      let p;
      try { p = api.ded(api.gen(t.id)); }
      catch (e) { r.err++; if (!r.errMsg) r.errMsg = e.message; continue; }
      if (!p) { r.err++; if (!r.errMsg) r.errMsg = 'null problem'; continue; }

      const opts = p.options || [];
      const isGraph = p.optionType && p.optionType !== 'text';
      r.optCounts[opts.length] = (r.optCounts[opts.length] || 0) + 1;
      if (opts.length !== 4) r.optBad++;
      if (opts.some(o => /undefined|NaN/.test(String(o)))) r.optUndef++;

      if (!isGraph) {
        const bodies = opts.map(optBody);
        if (new Set(bodies.map(b => b.replace(/\s+/g, ' ').trim())).size !== bodies.length) r.strDup++;
        const vk = bodies.map(valKey);
        if (new Set(vk).size !== vk.length) r.valDup++;
        const ai = 'ABCD'.indexOf(String(p.ans || '').trim());
        if (ai >= 0 && vk.some((v, z) => z !== ai && v === vk[ai])) r.ansDup++;
      }

      const ansL = String(p.ans ?? '').trim();
      if (/^[A-D]$/.test(ansL)) r.pos[ansL]++; else r.noAns++;

      /* 산문 필드 누출 */
      const prose = [['stmt', p.fullStatement], ['prompt', p.prompt], ['hint', p.hint]];
      (p.steps || []).forEach((s, k) => {
        prose.push(['s' + k + '.title', s.title]);
        if (s.rule) prose.push(['s' + k + '.rule', s.rule]);
        prose.push(['s' + k + '.exp', s.explanation]);
      });
      for (const [k, v] of prose) {
        const L = proseLeak(v);
        if (L) { r.leak++; const key = k + ' :: ' + L.ctx; r.leakWhere[key] = (r.leakWhere[key] || 0) + 1; }
      }
      /* 맨몸 산문이 math 에 들어가면 코어가 감싸지 않지만(v1.1 이후),
         감싸도 안전한지 사람이 한 번 봐야 하므로 목록으로 남긴다. */
      (p.steps || []).forEach((s, k) => {
        if (s.isMatrix || !s.math) return;
        const v = String(s.math).trim();
        if (/^\\\(|^\$\$/.test(v) || /[\\^_{}]/.test(v)) return;
        if ((v.match(/[A-Za-z]{3,}/g) || []).length >= 2) {
          r.proseMath = (r.proseMath || 0) + 1;
          r.proseWhere = r.proseWhere || {};
          r.proseWhere['s' + k + '.math'] = v.slice(0, 60);
        }
      });
      /* 자동 래핑 필드는 맨몸 LaTeX 이 정상. undefined 만 본다. */
      (p.steps || []).forEach((s, k) => {
        if (!s.isMatrix && s.math !== undefined && /undefined|NaN/.test(String(s.math))) {
          r.leak++; r.leakWhere['s' + k + '.math = ' + s.math] = 1;
        }
      });

      for (const s of (p.steps || [])) {
        r.stepCount++;
        if (s.mode) r.modes.add(s.mode);
        const e = String(s.explanation || '');
        if (!e.trim()) { r.missingExp++; continue; }
        const w = readAs(e).split(/\s+/).filter(Boolean).length;
        r.words += w;
        if (w < 7) r.shortExp++;
        if (/\d/.test(e)) r.withNum++;
        const src = e + ' ' + String(s.title || '');
        const jm = src.replace(ALLOW, ' ').match(JARGON);
        if (jm) { r.jargon++; r.jargonWhere[jm[0].toLowerCase()] = (r.jargonWhere[jm[0].toLowerCase()] || 0) + 1; }
        for (const [tag, fn] of [['read', readAs], ['strict', strict]]) {
          fn(e).split(/(?<=[.!?])\s+/).forEach(sen => {
            const n = sen.trim().split(/\s+/).filter(Boolean).length;
            if (n > 22 && r.longList.length < 6) { r.long++; r.longList.push(n + 'w [' + tag + '] ' + sen.trim().slice(0, 90)); }
            else if (n > 22) r.long++;
          });
        }
      }
      if (p.fullStatement) r.stmtShapes.add(String(p.fullStatement).replace(/-?\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim());
      if (p.steps && p.steps[0]) r.firstTitles.add(String(p.steps[0].title || '').replace(/\d+(\.\d+)?/g, '#'));
    }
    rows.push(r);
  }
  return { file, rows, ts };
}

/* ─────────────────── 출력 ─────────────────── */

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync('.').filter(x => x.endsWith('.html') && x !== 'index.html');

let fail = 0, pass = 0;
const pct = (x, d) => (100 * x / Math.max(1, d)).toFixed(2) + '%';

for (const f of files) {
  const res = run(f);
  console.log('\n════════ ' + f);
  if (res.loadErr) { console.log('  ✗ 로드 실패: ' + res.loadErr.message); fail++; continue; }

  for (const r of res.rows) {
    const bad = [];
    const tot = r.pos.A + r.pos.B + r.pos.C + r.pos.D;
    const used = ['A', 'B', 'C', 'D'].map(k => r.pos[k]).filter((v, i) => i < (Object.keys(r.optCounts).map(Number)[0] || 4));
    const mx = Math.max.apply(null, used);
    const mn = Math.min.apply(null, used);
    const ratio = mn ? mx / mn : Infinity;
    const avgW = r.words / Math.max(1, r.stepCount);
    const jr = r.jargon / Math.max(1, r.stepCount);

    if (r.err) bad.push('예외 ' + pct(r.err, N) + ' :: ' + r.errMsg);
    /* 보기 개수가 항상 같은 값이면 설계 결정으로 본다(근의 개수 0/1/2 처럼).
       개수가 표본마다 흔들리면 그건 붕괴이므로 실패로 잡는다. */
    const counts = Object.keys(r.optCounts).map(Number);
    const stable = counts.length === 1;
    if (r.optBad && !stable) bad.push('보기 개수 불안정 ' + JSON.stringify(r.optCounts));
    else if (r.optBad && counts[0] < 3) bad.push('보기 ' + counts[0] + '개');
    if (r.optUndef) bad.push('보기에 undefined/NaN ' + pct(r.optUndef, N));
    if (r.strDup) bad.push('문자열 중복 보기 ' + pct(r.strDup, N));
    if (r.valDup) bad.push('값 중복 보기 ' + pct(r.valDup, N));
    if (r.ansDup) bad.push('정답과 같은 오답 ' + pct(r.ansDup, N));
    if (r.noAns) bad.push('정답이 보기에 없음 ' + pct(r.noAns, N));
    if (r.leak) bad.push('LaTeX 누출 ' + Object.keys(r.leakWhere).slice(0, 2).join(' | '));
    if (r.proseMath) bad.push('math 에 맨몸 산문 ' + JSON.stringify(r.proseWhere));
    if (jr > 0.001) bad.push('전문용어 ' + jr.toFixed(3) + ' ' + JSON.stringify(r.jargonWhere));
    if (r.long) bad.push('22단어 초과 문장 ' + r.long);
    if (r.missingExp) bad.push('설명 누락 ' + r.missingExp);
    if (r.shortExp) bad.push('7단어 미만 설명 ' + pct(r.shortExp, r.stepCount));
    if (ratio > 1.2) bad.push('정답 위치 편중 ' + (isFinite(ratio) ? ratio.toFixed(2) : 'INF') + '배');
    if (r.stmtShapes.size < 2) bad.push('문제문 문구 1종');
    if (avgW < 25) bad.push('설명 평균 ' + avgW.toFixed(1) + '단어 (25 이상 필요)');
    const ft = [...r.firstTitles][0] || '';
    if (CMD.test(ft.replace(/^Step\s*#?\s*[:.]?\s*/i, ''))) bad.push('1단계가 명령형: "' + ft.slice(0, 40) + '"');

    if (bad.length) {
      fail++;
      console.log('  ✗ ' + r.id + '  ' + r.label);
      bad.forEach(b => console.log('      - ' + b));
      r.longList.slice(0, 3).forEach(s => console.log('        ' + s));
    } else {
      pass++;
      console.log('  ✓ ' + r.id.padEnd(7) + ' avgW ' + avgW.toFixed(1).padStart(5) +
        ' | 숫자포함 ' + pct(r.withNum, r.stepCount).padStart(7) +
        ' | 문구 ' + String(r.stmtShapes.size).padStart(2) + '종' +
        ' | 위치 ' + ratio.toFixed(2) + '배' +
        (r.modes.size ? ' | 방법 ' + [...r.modes].join('/') : ''));
    }
  }
}

console.log('\n──────────────────────────────────────────');
console.log(fail === 0 ? `PASS — ${pass}개 유형 전부 통과` : `FAIL — ${fail}개 유형에 문제, ${pass}개 통과`);
process.exit(fail === 0 ? 0 : 1);
