/* ============================================================================
   mcf-core.js  —  MCF3M 연습 포털 공용 엔진   (v1, 2026-08-04)

   왜 있나:
     같은 엔진 코드가 레슨 파일 18개에 각각 복사돼 있었고, 복붙하는 사이에
     버전이 갈라졌다. evaluateStudentAnswer 는 18파일에 18가지, mcfPick 은
     17파일에 12가지, shuffleMC 는 4가지였다. 그래서 Unit 2 에서 고친 결함이
     Unit 4 에 없고, Unit 4 에서 고친 결함이 Unit 1 에 그대로 남았다.
     이 파일은 그 공통부를 한 곳으로 모은 것이다. 여기를 고치면 전부 고쳐진다.

   어떻게 붙이나 (레슨 HTML) — 순서가 중요하다:
       1. katex + auto-render (CDN)
       2. ../mcf-core.js          (이 파일)
       3. 인라인 문항 생성기      (끝에서 MCF.init({generate: generateProblem}) 호출)
       4. ../progress.js          (반드시 마지막)
     progress.js 가 generateNewProblem / triggerNewQuestion /
     evaluateStudentAnswer / unlockSolutionPanel / selectMcOptionCard 을
     감싸므로, 그것들이 progress.js 로드 시점에 전역에 있어야 한다.

   다른 코스(MCR3U/MHF4U)로 확장할 때:
     이 파일은 코스 지식이 없다. 문항 파일이 아래 계약대로 객체를 돌려주기만
     하면 된다. 새 자산이 필요하면 MCF.registerAsset(name, fn) 으로 등록한다.

   ── 문항 객체 계약 ──────────────────────────────────────────────────────────
   {
     title            : "Type 2: Trinomial Factoring (a = 1)"
     type             : "mc"                       // 지금은 객관식만
     assetType        : "none"|"svg"|"graph"|"table"|"tov"|"custom"
     assetHtml        : 위가 none 이 아닐 때 그릴 HTML
     optionType       : "text"|"graph"
     options          : ["A) ...","B) ...","C) ...","D) ..."]
     optionSpecs      : 그래프 보기일 때 숫자 사양 (기계 감사용)
     fullStatement    : 문제문     (innerHTML)
     prompt           : 보기 위 라벨
     hint             : 힌트       (innerHTML)
     ans              : "A"|"B"|"C"|"D"
     rawAns           : 정답 본문 (선택)
     hasMethods       : true 면 풀이 방법 토글 바를 띄운다
     methods          : [{key:"ps",label:"Product & Sum Method"}, ...]
     steps            : [{
                          title       : 단계 제목
                          math        : 수식 (렌더 시 \( \) 로 자동 래핑)
                          rule        : 규칙 줄 (선택, math-rule 로 렌더)
                          explanation : 설명문 (산문 + \( \) 조각 혼합 가능)
                          mode        : 없거나 "common" 이면 항상 보임.
                                        "ps"/"cc" 등이면 그 방법일 때만 보임
                          isMatrix    : true 면 대각선 곱 상자로 렌더
                          matrixData  : {lt,lb,rt,rb,pt,pb,sum}
                        }]
   }
   ── 수식 안전 규칙 ─────────────────────────────────────────────────────────
     설명문·문제문·힌트·보기는 innerHTML 로 들어간다. 그 안의 수식 조각은
     반드시 MCF.M() / MCF.Mu() 로 감싼다. 맨몸 \text{} 나 $...$ 는 학생 화면에
     글자로 그대로 노출된다. ($...$ 는 KaTeX 델리미터로 등록돼 있지 않다.)
   ========================================================================== */

(function (global) {
  "use strict";

  /* 레슨 파일이 폴더 위치를 몰라 ../mcf-core.js 와 mcf-core.js 를 둘 다 걸어둔다.
     둘 다 존재하면 이 파일이 두 번 실행되므로, 두 번째는 아무 일도 하지 않는다. */
  if (global.MCF && global.MCF.__version) return;

  var MCF = { __version: "1.0" };
  var state = {
    generate: null,
    problem: null,
    quiz: null,
    method: null,
    methods: [],
    steps: [],            // 현재 방법에서 보이는 단계 DOM
    stepIndex: 0,
    score: 0,
    attempts: 0,
    logUrl: null,
    unitId: "",
    lessonId: "",
    assets: {}
  };

  /* ───────────────────────── 1. 기본 유틸 ───────────────────────── */

  /* 세 번째 인자는 뽑으면 안 되는 값들이다. Unit 2·3·4 문항이 a 계수에서 0 을
     빼려고 이걸 쓴다. 이 인자를 무시하면 a = 0 이 나와 식이 통째로 NaN 이 된다. */
  function randInt(min, max, exclude) {
    var val, safety = 0;
    do {
      val = Math.floor(Math.random() * (max - min + 1)) + min;
      safety++;
    } while (exclude && exclude.indexOf(val) !== -1 && safety < 100);
    return val;
  }
  function gcd(a, b) { return b === 0 ? Math.abs(a) : gcd(b, a % b); }
  function gcd3(a, b, c) { return gcd(a, gcd(b, c)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 수식 조각을 산문 안에 넣을 때 쓴다. 이걸 쓰면 LaTeX 누출이 날 수 없다. */
  function M(x) { return "\\(" + x + "\\)"; }

  /* 수식 안에서 항을 이어붙일 때 쓴다. 값만 꽂으면 양수일 때 부호가 빠져
     "-3(x^2 - 4x + 4) 12 -23" 처럼 붙어버린다. signed(12) 는 "+ 12" 를 준다. */
  function signed(n, unit) {
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    return (v < 0 ? "- " : "+ ") + Math.abs(v) + (unit || "");
  }
  function Mu(v, unit) { return "\\(" + v + "\\text{ " + unit + "}\\)"; }

  /* **굵게** → <b>. innerHTML 주입이라 별표가 그대로 보이는 것을 막는다. */
  function rich(s) {
    return String(s == null ? "" : s).replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>");
  }

  /* 부호가 붙은 항을 사람이 쓰듯 찍는다. isFirst 면 앞의 + 를 생략한다. */
  function fmtTerm(c, v, isFirst) {
    if (c === 0) return "";
    var sign = c > 0 ? (isFirst ? "" : "+ ") : (isFirst ? "-" : "- ");
    var mag = Math.abs(c);
    var num = (mag === 1 && v) ? "" : String(mag);
    return sign + num + (v || "");
  }

  /* ───────────────────── 2. 보기 중복 방어 (3층) ─────────────────────
     Unit 1 의 값 기준 정규화 + Unit 2 의 3단 리필을 합친 것이다.
     예전에는 유닛마다 이 중 한 층씩만 있어서 "정답이 두 개"가 반복해서 났다. */

  /* 층1 — 문자열 키 (공백만 정리) */
  function key(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  /* 층2 — 값 키. (x+2)(x-2) 와 (x-2)(x+2) 를 같은 것으로 본다.
     괄호 순서와 괄호 안 항 순서를 모두 정렬해서 비교한다. */
  function factorKey(s) {
    var str = String(s == null ? "" : s)
      .replace(/^\s*[A-D]\)\s*/, "")
      /* 보이기용 명령과 감싸개만 걷어낸다. \sin 과 \cos 처럼 뜻이 다른 명령은
         반드시 남겨야 한다. 예전에는 \\[a-zA-Z]+ 를 통째로 지워서
         sin^-1(...) 과 cos^-1(...) 이 같은 보기로 취급됐다. */
      .replace(/\\\(|\\\)|\\\[|\\\]|\$\$/g, "")
      .replace(/\\(left|right|quad|qquad|displaystyle|small|,|;|!|:|\s)/g, "")
      .replace(/\\[dt]frac/g, "\\frac")
      .replace(/\\text\{([^}]*)\}/g, "$1")
      .replace(/\s|\{|\}/g, "");

    /* 곱셈은 순서를 바꿔도 같다. 단, 문자열 전체가 "계수 + 괄호묶음들"
       형태일 때만 그렇게 본다. 좌표나 여러 값을 나열한 보기까지 정렬해 버리면
       (x=17.2, Y=55.2, X=34.8) 과 (x=17.2, Y=34.8, X=55.2) 가 같아진다. */
    if (!/^[-+]?[0-9]*(\([^()]*\))+$/.test(str)) return str;
    var lead = str.slice(0, str.indexOf("("));
    var parts = str.match(/\([^()]*\)/g) || [];
    return lead + "|" + parts.map(function (p) {
      return p.slice(1, -1).replace(/-/g, "+-").split("+")
              .filter(function (x) { return x !== ""; }).sort().join("+");
    }).sort().join("|");
  }

  /* 값이 같은 후보를 걸러 서로 다른 것만 남긴다. 생성기에서 후보를 넉넉히
     만들어 이걸 통과시키면 "정답과 같은 오답"이 원천적으로 안 생긴다. */
  function uniqueByValue(list) {
    var seen = [], out = [];
    for (var i = 0; i < list.length; i++) {
      var k = factorKey(list[i]);
      if (seen.indexOf(k) !== -1) continue;
      seen.push(k); out.push(list[i]);
    }
    return out;
  }

  /* 층3 — 그래도 4개가 안 되면 정답의 숫자를 밀어 예비 보기를 만든다.
     소수 자릿수를 보존한다. 8.50 → 9.50 이지 9 가 아니다. */
  function spareOption(base, n) {
    var hit = false;
    var out = String(base).replace(/-?\d+(?:\.\d+)?/, function (m) {
      hit = true;
      var dec = (m.split(".")[1] || "").length;
      var v = parseFloat(m) + n;
      return dec ? v.toFixed(dec) : String(v);
    });
    return hit ? out : null;
  }

  /* 정답 1개 + 오답들 → A~D 4개. 값 중복 제거 → 예비 후보 → 숫자 밀기 순으로
     채운다. 끝내 못 채우면 쓰레기 보기를 넣는 대신 개수를 줄인다.
     ("D) undefined" 가 학생 화면에 뜨는 것보다 3지선다가 낫다.) */
  function shuffleMC(correct, distractors, fallbacks) {
    /* 호출 방식 두 가지를 모두 받는다.
         shuffleMC(정답, [오답들], [예비])        <- 표준
         shuffleMC([후보배열], 정답)              <- 옛 Unit 1 방식
       옛 파일을 기계적으로 전환할 때 호출부를 일일이 고치지 않아도 되게 한다. */
    if (Array.isArray(correct)) {
      var arr = correct, ans = distractors;
      correct = ans;
      distractors = arr.filter(function (x) { return String(x) !== String(ans); });
      fallbacks = null;
    }
    var pool = uniqueByValue([correct].concat(distractors || []));
    var ck = factorKey(correct);

    if (pool.length < 4 && fallbacks) {
      fallbacks.forEach(function (f) {
        if (pool.length >= 4) return;
        if (f == null || f === "") return;
        if (factorKey(f) === ck) return;
        if (pool.some(function (p) { return factorKey(p) === factorKey(f); })) return;
        pool.push(f);
      });
    }
    for (var n = 1; pool.length < 4 && n <= 8; n++) {
      [n, -n].forEach(function (d) {
        if (pool.length >= 4) return;
        var s = spareOption(correct, d);
        if (!s) return;
        if (factorKey(s) === ck) return;
        if (pool.some(function (p) { return factorKey(p) === factorKey(s); })) return;
        pool.push(s);
      });
    }

    pool = pool.slice(0, 4);
    var mixed = shuffle(pool);
    var letters = ["A", "B", "C", "D"];
    var options = [], ans = "";
    for (var i = 0; i < mixed.length; i++) {
      options.push(letters[i] + ") " + mixed[i]);
      if (factorKey(mixed[i]) === ck) ans = letters[i];
    }
    /* 유닛마다 키 이름이 달랐다. Unit 1·2·3 은 ans, Unit 4 는 ansLetter 를 읽는다.
       둘 다 돌려줘서 어느 파일이든 그대로 돌아가게 한다. */
    return { options: options, ans: ans, ansLetter: ans, rawAns: correct };
  }

  /* 마지막 그물. 생성기가 위를 안 썼더라도 여기서 한 번 더 거른다.
     그래프 보기 유형은 본문이 비어 있으므로 통과시킨다(설계대로). */
  function dedupe(p) {
    if (!p || !p.options) return p;
    if (p.optionType && p.optionType !== "text") return p;

    var letters = ["A", "B", "C", "D"];
    var bodies = p.options.map(function (o) { return String(o).replace(/^\s*[A-D]\)\s*/, ""); });
    var ansIdx = letters.indexOf(String(p.ans || "").trim());
    if (ansIdx < 0) return p;

    var seen = {}, changed = false;
    for (var i = 0; i < bodies.length; i++) {
      var k = factorKey(bodies[i]);
      if (!seen[k]) { seen[k] = true; continue; }
      if (i === ansIdx) continue;               /* 정답은 건드리지 않는다 */
      for (var n = 1; n <= 12; n++) {
        var cand = spareOption(bodies[i], n) || spareOption(bodies[i], -n);
        if (cand && !seen[factorKey(cand)]) {
          bodies[i] = cand; seen[factorKey(cand)] = true; changed = true; break;
        }
      }
    }
    if (changed) {
      p.options = bodies.map(function (b, i) { return letters[i] + ") " + b; });
    }
    return p;
  }

  /* 풀이 방법 묶음. 문항 파일이 p.methods 로 그대로 쓴다.
       FACTORING : 삼항식 인수분해 (중간항을 쪼개는 것). special case 는 제외.
       SOLVING   : 근의공식으로도 풀고 인수분해로도 풀 수 있는 것. 탭 3개. */
  var METHODS_FACTORING = [
    { key: "ps", label: "Product &amp; Sum Method" },
    { key: "cc", label: "Criss-Cross Matrix Method" }
  ];
  var METHODS_SOLVING = [
    { key: "qf", label: "Quadratic Formula" },
    { key: "ps", label: "Product &amp; Sum Method" },
    { key: "cc", label: "Criss-Cross Matrix Method" }
  ];

  /* 판별식이 완전제곱이 아니면 정수로 인수분해되지 않는다.
     그럴 때도 탭은 그대로 띄우고, 탭 안에서 왜 안 되는지 알려준다.
     (탭 개수가 문제마다 달라지면 학생이 더 헷갈린다.) */
  function factorable(a, b, c) {
    var D = b * b - 4 * a * c;
    if (D < 0) return false;
    var r = Math.round(Math.sqrt(D));
    return r * r === D;
  }

  /* ax^2+bx+c 를 정수로 쪼갤 때 쓰는 값들을 한 번에 돌려준다.
     m, n  : 중간항을 쪼갤 두 수 (m+n=b, mn=ac)
     a1..c2: 대각선 곱 상자의 네 칸. (a1x + c1)(a2x + c2) 가 원식이다.
     인수분해가 안 되면 null. */
  function splitPair(a, b, c) {
    if (!factorable(a, b, c)) return null;
    var root = Math.round(Math.sqrt(b * b - 4 * a * c));
    var m = (b + root) / 2, n = (b - root) / 2;
    if (!Number.isInteger(m) || !Number.isInteger(n)) return null;
    var g1 = gcd(a, m);
    if (!g1) return null;
    if (a < 0) g1 = -Math.abs(g1);
    var a2 = a / g1, c2 = m / g1;
    if (!Number.isInteger(a2) || !Number.isInteger(c2) || a2 === 0) return null;
    var c1 = n / a2;
    if (!Number.isInteger(c1)) return null;
    if (g1 * c2 + a2 * c1 !== b || c1 * c2 !== c) return null;
    return { m: m, n: n, a1: g1, a2: a2, c1: c1, c2: c2 };
  }

  function noFactorStep(mode, a, b, c) {
    var D = b * b - 4 * a * c;
    return {
      title: "This one does not factor",
      mode: mode,
      math: "b^2 - 4ac = (" + b + ")^2 - 4(" + a + ")(" + c + ") = " + D,
      explanation: "Splitting the middle term only works when " + M("b^2 - 4ac") +
        " is a perfect square. Here it comes to " + M(D) +
        (D < 0 ? ", which is negative, so there are no real answers to find. "
               : ", and no whole number squares to give that. ") +
        "So no pair of whole numbers will split this middle term. " +
        "Use the Quadratic Formula tab instead, which works on every quadratic."
    };
  }

  /* ───────────────────────── 3. 렌더 ───────────────────────── */

  var KATEX_DELIMS = [
    { left: "$$", right: "$$", display: true },
    { left: "\\(", right: "\\)", display: false }
  ];

  function renderMath(root) {
    if (global.renderMathInElement) {
      global.renderMathInElement(root || document.body,
        { delimiters: KATEX_DELIMS, throwOnError: false });
    }
  }

  function el(id) { return document.getElementById(id); }

  /* Unit 1 은 topic-select, Unit 2~4 는 question-select 를 썼다.
     통일 목표는 question-select 지만 옛 파일도 계속 돌아야 하므로 둘 다 본다. */
  function selectEl() {
    return el("question-select") || el("topic-select");
  }

  /* 이미 \( \) 나 $$ 로 감싸져 있으면 그대로 두고, 맨몸이면 감싼다.
     step.math 는 18파일 전수 조사에서 산문 혼합률이 0% 였다. 그래서
     이 필드에 한해 자동 래핑이 안전하다. 설명문·문제문은 혼합이라
     자동 래핑이 불가능하므로 생성기가 M() 을 써야 한다. */
  function wrapMath(s) {
    var v = String(s == null ? "" : s).trim();
    if (!v) return "";
    if (/^\\\(/.test(v) || /^\$\$/.test(v)) return v;
    /* 산문을 수식으로 감싸면 안 된다. LaTeX 는 공백을 무시하기 때문에
       "Range = all the y-values" 가 "Range=allthey-values" 로 붙어버린다.
       그래서 LaTeX 흔적이 하나도 없으면서 영어 단어가 둘 이상이면
       문장으로 보고 그대로 둔다. (\text{...} 로 감싼 것은 흔적이 있으므로 감싼다.) */
    if (!/[\\^_{}]/.test(v)) {
      var words = v.match(/[A-Za-z]{3,}/g) || [];
      if (words.length >= 2) return v;
    }
    return "\\(" + v + "\\)";
  }

  var markerSeq = 0;

  /* 대각선 곱 상자. Unit 1 Lesson 4 / 연습시험에 각각 하드코딩돼 있던 것을
     한 곳으로 모았다. 화살표 방향과 모양은 원본과 동일하다. */
  function matrixBox(d) {
    var mid = "mcf-arrow-" + (++markerSeq);
    /* 칸 값 정리. 두 가지가 학생 화면에 그대로 새던 것들이다:
         "--5"  : 음수 앞에 마이너스를 또 붙여 만든 값
         ""     : 합이 0 이라 fmtTerm 이 빈 문자열을 돌려준 경우 (칸이 비어 보인다) */
    d = Object.keys(d).reduce(function (o, k) {
      var v = String(d[k] == null ? "" : d[k]).trim();
      v = v.replace(/^\+?-\s*-\s*/, "+").replace(/^-\s*-\s*/, "+");
      v = v.replace(/^\+\s*\+\s*/, "+");
      if (v === "" || v === "+" || v === "-") v = "0";
      o[k] = v;
      return o;
    }, {});
    return '' +
      '<div class="criss-cross-box"><div class="matrix-grid">' +
        '<div>' + wrapMath(d.lt) + '</div>' +
        '<div class="svg-intersection-container">' +
          '<svg width="70" height="70" viewBox="0 0 70 70" style="overflow: visible;">' +
            '<defs><marker id="' + mid + '" viewBox="0 0 10 10" refX="5" refY="5" ' +
              'markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
              '<path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" /></marker></defs>' +
            '<line x1="5" y1="10" x2="65" y2="60" stroke="#2563eb" stroke-width="2.5" marker-end="url(#' + mid + ')" />' +
            '<line x1="5" y1="60" x2="65" y2="10" stroke="#2563eb" stroke-width="2.5" marker-end="url(#' + mid + ')" />' +
          '</svg>' +
        '</div>' +
        '<div>' + wrapMath(d.rt) + '</div> <div class="grid-arrow-label">&rarr;</div> <div>' + wrapMath(d.pt) + '</div>' +
        '<div>' + wrapMath(d.lb) + '</div> <div>' + wrapMath(d.rb) + '</div> <div class="grid-arrow-label">&rarr;</div> <div>' + wrapMath(d.pb) + '</div>' +
        '<div class="matrix-total-line"><strong>Sum of Diagonal Products:</strong> ' +
          wrapMath("(" + d.pt + ") + (" + d.pb + ") = " + d.sum) + '</div>' +
      '</div></div>';
  }

  function stepHTML(s) {
    var cls = "step-block";
    if (s.mode && s.mode !== "common") cls += " " + s.mode + "-only";
    else cls += " common-step";

    var body = "";
    if (s.isMatrix) body += matrixBox(s.matrixData || {});
    else if (s.math) body += '<div class="step-math">' + wrapMath(s.math) + '</div>';
    if (s.rule) body += '<span class="math-rule">' + rich(s.rule) + '</span>';

    return '<div class="' + cls + '">' +
      '<span class="step-title">' + rich(s.title || "") + '</span>' +
      body +
      '<span class="step-explanation">' + rich(s.explanation || "") + '</span>' +
      '</div>';
  }

  function buildOptionsHTML(p, selectedLetter) {
    if (p.optionType && p.optionType !== "text") {
      /* 그래프 보기. 본문이 SVG 라 수식 래핑을 하지 않는다.
         유닛에 따라 보기 SVG 를 만드는 방법이 다르다.
           보기 문자열에 SVG 가 이미 들어 있는 경우  -> 그대로 쓴다
           optionSpecs 를 렌더러에 넘겨 그리는 경우   -> MCF.init 의 renderOption 을 쓴다 */
      return '<div class="mc-options-list graph-grid">' + p.options.map(function (opt, i) {
        var L = opt.charAt(0);
        var sel = L === selectedLetter ? " selected" : "";
        var body = "";
        if (state.renderOption) { try { body = state.renderOption(p, i); } catch (e) { body = ""; } }
        if (!body) body = opt.substring(3);
        return '<div class="mc-option-card graph-card' + sel + '" onclick="selectMcOptionCard(\'' + L + '\')">' +
          '<span class="mc-badge">' + L + '</span><div class="option-graph">' + body + '</div></div>';
      }).join("") + '</div>';
    }
    return '<div class="mc-options-list">' + p.options.map(function (opt) {
      var L = opt.charAt(0);
      var sel = L === selectedLetter ? " selected" : "";
      var bodyText = opt.substring(3);
      /* 보기 본문은 대부분 순수 수식이다. 이미 감싸져 있으면 그대로 두고,
         맨몸이면 감싼다. 감싸지 않으면 \text{...} 가 글자로 노출된다. */
      return '<div class="mc-option-card' + sel + '" onclick="selectMcOptionCard(\'' + L + '\')">' +
        '<span class="mc-badge">' + L + '</span>' +
        '<span>' + wrapMath(bodyText) + '</span></div>';
    }).join("") + '</div>';
  }

  /* ───────────────────────── 4. 문제 진행 ───────────────────────── */

  function newProblem() {
    var sel = selectEl();
    if (!sel || !state.generate) return;
    var typeId = sel.value;
    if (!typeId) return;

    var p = dedupe(state.generate(typeId));
    if (!p) return;
    state.problem = p;
    state.quiz = {
      answered: false, selectedMcOption: "", isCorrect: false,
      currentStep: 0, solRevealed: false,
      selectedMethod: (p.methods && p.methods[0] ? p.methods[0].key : "ps"),
      attempts: 0
    };
    /* hasMethods 만 켜고 methods 목록을 빠뜨린 파일이 많다. 그대로 두면
       토글 바가 안 그려지고 필터도 안 걸려서 두 방법 단계가 한꺼번에 보인다.
       목록이 없으면 단계에 실제로 쓰인 mode 로 만들어 준다. */
    var ms = p.methods && p.methods.length ? p.methods : null;
    if (!ms && p.hasMethods) {
      var used = {};
      (p.steps || []).forEach(function (s) { if (s.mode && s.mode !== "common") used[s.mode] = 1; });
      var order = ["qf", "ps", "cc"];
      var lbl = { qf: "Quadratic Formula", ps: "Product &amp; Sum Method", cc: "Criss-Cross Matrix Method" };
      ms = order.filter(function (k) { return used[k]; })
               .map(function (k) { return { key: k, label: lbl[k] }; });
    }
    state.methods = ms || [];
    state.method = state.quiz.selectedMethod;

    /* progress.js 가 currentState / currentProblemData 를 들여다본다 */
    global.currentProblemData = p;
    global.currentState = state.quiz;
    global.currentMethod = state.method;

    if (el("placeholder")) el("placeholder").style.display = "none";
    if (el("quiz-station")) el("quiz-station").style.display = "block";
    if (el("solution-reveal-layer")) el("solution-reveal-layer").style.display = "none";
    if (el("method-toggle-bar")) el("method-toggle-bar").style.display = "none";
    if (el("hint-box")) el("hint-box").style.display = "none";
    if (el("feedback-msg")) el("feedback-msg").style.display = "none";

    var assetMount = el("asset-viewport-mount-point");
    if (assetMount) {
      if (p.assetType && p.assetType !== "none") {
        assetMount.style.display = "flex";
        /* 자산을 만드는 방법이 유닛마다 다르다.
             Unit 1 : 문항이 p.assetHtml 에 HTML 을 직접 담는다
             Unit 4 : renderDynamicSVG(p.graphSpec) 처럼 별도 렌더러가 그린다
           그래서 assetHtml 이 없으면 등록된 렌더러에게 넘긴다. */
        var html = p.assetHtml;
        if (!html && state.renderAsset) { try { html = state.renderAsset(p); } catch (e) { html = ""; } }
        if (!html && state.assets[p.assetType]) {
          try { html = state.assets[p.assetType](p); } catch (e) { html = ""; }
        }
        assetMount.innerHTML = html || "";
      } else {
        assetMount.style.display = "none";
        assetMount.innerHTML = "";
      }
    }

    if (el("question-statement-display")) el("question-statement-display").innerHTML = rich(p.fullStatement);
    if (el("input-prompt-label")) el("input-prompt-label").innerHTML = rich(p.prompt);
    if (el("dynamic-input-mount-point")) el("dynamic-input-mount-point").innerHTML = buildOptionsHTML(p, "");

    paintMethodBar();
    unlockQuiz();
    renderMath();
  }

  function paintMethodBar() {
    var bar = el("method-toggle-bar");
    if (!bar) return;
    var ms = state.methods;
    /* 이전 문제의 버튼이 DOM 에 남아 있으면 안 된다. 숨기는 것만으로는 부족하다. */
    if (!ms.length) { bar.innerHTML = ""; bar.style.display = "none"; return; }
    bar.innerHTML = ms.map(function (m) {
      return '<button id="mode-' + m.key + '" class="method-btn' +
        (m.key === state.method ? " active" : "") +
        '" onclick="changeMethod(\'' + m.key + '\')">' + m.label + '</button>';
    }).join("");
  }

  function selectMcOptionCard(letter) {
    if (!state.problem || state.quiz.answered) return;
    state.quiz.selectedMcOption = letter;
    if (el("feedback-msg")) el("feedback-msg").style.display = "none";
    if (el("dynamic-input-mount-point")) {
      el("dynamic-input-mount-point").innerHTML = buildOptionsHTML(state.problem, letter);
    }
    renderMath();
  }

  function evaluateStudentAnswer() {
    if (!state.problem || state.quiz.answered) return;

    var first = el("first-name") ? el("first-name").value.trim() : "";
    var last = el("last-name") ? el("last-name").value.trim() : "";
    if (first === "" || last === "") { alert("Please enter your first and last name first."); return; }
    if (!state.quiz.selectedMcOption) { alert("Please choose an answer first."); return; }

    var correct = (state.quiz.selectedMcOption === state.problem.ans);

    state.attempts++;
    state.quiz.attempts++;
    if (correct && !state.quiz.isCorrect) state.score++;
    state.quiz.isCorrect = correct;

    if (el("hud-score")) el("hud-score").innerText = state.score;
    if (el("hud-attempts")) el("hud-attempts").innerText = state.attempts;

    if (correct) { state.quiz.answered = true; lockQuiz(true); }
    else { showTryAgain(); }

    /* 로깅은 부가 기능이다. fetch 가 없거나 실패해도 채점은 계속돼야 한다. */
    if (state.logUrl && typeof fetch === "function") {
      var sel = selectEl();
      var method = "";
      if (state.methods.length) {
        var m = state.methods.filter(function (x) { return x.key === state.method; })[0];
        method = m ? m.label : state.method;
      }
      try {
      fetch(state.logUrl, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: state.unitId, lessonId: state.lessonId,
          firstName: first, lastName: last,
          questionId: sel ? sel.value : "",
          userAnswer: "Option " + state.quiz.selectedMcOption,
          isCorrect: correct, attempts: state.quiz.attempts,
          methodUsed: method, totalScore: state.score
        })
      }).catch(function (e) { console.error("Database cloud logging failure:", e); });
      } catch (e) { console.error("Database cloud logging failure:", e); }
    }
  }

  function toggleHint() {
    if (!state.problem) return;
    var box = el("hint-box");
    if (!box) return;
    if (box.style.display === "block") { box.style.display = "none"; return; }
    box.innerHTML = "<strong>Hint:</strong> " + rich(state.problem.hint || "");
    box.style.display = "block";
    renderMath();
  }

  function showTryAgain() {
    if (el("reveal-sol-btn")) el("reveal-sol-btn").disabled = false;
    var f = el("feedback-msg");
    if (!f) return;
    f.style.display = "block";
    f.className = "feedback-msg-area feedback-error";
    f.innerHTML = "Not quite yet - pick another answer, or tap Hint for a clue. (You can tap Show Solution Steps any time.)";
  }

  function lockQuiz(isCorrect) {
    Array.prototype.forEach.call(document.querySelectorAll(".mc-option-card"),
      function (c) { c.classList.add("disabled"); });
    if (el("check-ans-btn")) el("check-ans-btn").disabled = true;
    if (el("reveal-sol-btn")) el("reveal-sol-btn").disabled = false;
    var f = el("feedback-msg");
    if (!f) return;
    f.style.display = "block";
    f.className = "feedback-msg-area " + (isCorrect ? "feedback-success" : "feedback-error");
    f.innerHTML = isCorrect ? "Correct! Nice work." : "Not quite - review the steps below.";
  }

  function unlockQuiz() {
    if (el("check-ans-btn")) el("check-ans-btn").disabled = false;
    if (el("reveal-sol-btn")) el("reveal-sol-btn").disabled = true;
    if (el("feedback-msg")) el("feedback-msg").style.display = "none";
  }

  /* ───────────────────── 5. 풀이 단계 + 방법 토글 ───────────────────── */

  function buildSolution() {
    var p = state.problem;
    var target = el("solution-workspace-injected");
    if (!target || !p) return;

    var html = "<h2>Solution for " + rich(p.title || "") + "</h2>";
    html += (p.steps || []).map(stepHTML).join("");
    if (p.rawAns || p.ansBox) {
      html += '<div class="final-answer-box">' +
        '<span class="final-answer-label">' + (p.finalLabel || "Final Answer") + '</span>' +
        '<span class="final-answer-math">' + wrapMath(p.ansBox || p.rawAns) + '</span></div>';
    }
    target.innerHTML = html;
  }

  function renderSteps() {
    var cont = el("solution-workspace-injected");
    if (!cont) return;
    var all = Array.prototype.slice.call(cont.querySelectorAll(".step-block, .final-answer-box"));
    all.forEach(function (s) { s.style.display = "none"; });

    state.steps = all.filter(function (s) {
      if (!state.methods.length) return true;
      for (var i = 0; i < state.methods.length; i++) {
        var k = state.methods[i].key;
        if (k !== state.method && s.classList.contains(k + "-only")) return false;
      }
      return true;
    });

    state.stepIndex = state.quiz.currentStep;
    if (state.stepIndex > state.steps.length - 1) state.stepIndex = state.steps.length - 1;
    if (state.stepIndex < 0) state.stepIndex = 0;
    state.quiz.currentStep = state.stepIndex;

    for (var i = 0; i <= state.stepIndex; i++) {
      if (state.steps[i]) state.steps[i].style.display = "block";
    }
    if (el("restart-btn")) el("restart-btn").disabled = (state.stepIndex === 0);
    if (el("next-btn")) el("next-btn").disabled = (state.stepIndex >= state.steps.length - 1);
  }

  function showNextStep() {
    if (state.stepIndex < state.steps.length - 1) {
      state.stepIndex++;
      state.quiz.currentStep = state.stepIndex;
      state.steps[state.stepIndex].style.display = "block";
      if (state.steps[state.stepIndex].scrollIntoView) {
        state.steps[state.stepIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      if (el("restart-btn")) el("restart-btn").disabled = false;
    }
    if (state.stepIndex >= state.steps.length - 1 && el("next-btn")) el("next-btn").disabled = true;
    renderMath();
  }

  function restartSolution() {
    state.quiz.currentStep = 0;
    renderSteps();
    renderMath();
  }

  function revealSolutionWorkspace() {
    buildSolution();
    if (el("solution-reveal-layer")) el("solution-reveal-layer").style.display = "block";
    if (state.methods.length && el("method-toggle-bar")) {
      el("method-toggle-bar").style.display = "flex";
      paintMethodBar();
    }
    renderSteps();
    renderMath();
  }

  function unlockSolutionPanel() {
    state.quiz.solRevealed = true;
    revealSolutionWorkspace();
  }

  function changeMethod(k) {
    if (state.method === k) return;
    state.method = k;
    state.quiz.selectedMethod = k;
    state.quiz.currentStep = 0;
    global.currentMethod = k;
    paintMethodBar();
    renderSteps();
    renderMath();
  }

  /* ───────────────────────── 6. 등록 ───────────────────────── */

  function init(cfg) {
    state.generate = cfg.generate;
    state.logUrl = cfg.logUrl || null;
    state.unitId = cfg.unitId || "";
    state.lessonId = cfg.lessonId || "";
    state.renderAsset = cfg.renderAsset || null;
    state.renderOption = cfg.renderOption || null;
  }

  function registerAsset(name, fn) { state.assets[name] = fn; }

  /* progress.js 가 감싸는 전역들. progress.js 보다 먼저 로드되어야 한다. */
  global.generateNewProblem = newProblem;
  global.triggerNewQuestion = newProblem;
  global.selectMcOptionCard = selectMcOptionCard;
  global.evaluateStudentAnswer = evaluateStudentAnswer;
  global.unlockSolutionPanel = unlockSolutionPanel;
  global.revealSolutionWorkspace = revealSolutionWorkspace;
  global.showNextStep = showNextStep;
  global.restartSolution = restartSolution;
  global.changeMethod = changeMethod;
  global.toggleHint = toggleHint;

  MCF.init = init;
  MCF.registerAsset = registerAsset;
  MCF.randInt = randInt;
  MCF.gcd = gcd;
  MCF.gcd3 = gcd3;
  MCF.pick = pick;
  MCF.shuffle = shuffle;
  MCF.M = M;
  MCF.signed = signed;
  MCF.Mu = Mu;
  MCF.rich = rich;
  MCF.fmtTerm = fmtTerm;
  MCF.key = key;
  MCF.factorKey = factorKey;
  MCF.uniqueByValue = uniqueByValue;
  MCF.spareOption = spareOption;
  MCF.shuffleMC = shuffleMC;
  MCF.dedupe = dedupe;
  MCF.METHODS_FACTORING = METHODS_FACTORING;
  MCF.METHODS_SOLVING = METHODS_SOLVING;
  MCF.factorable = factorable;
  MCF.noFactorStep = noFactorStep;
  MCF.splitPair = splitPair;
  MCF.renderMath = renderMath;
  MCF.newProblem = newProblem;

  global.MCF = MCF;

  /* 옛 파일 호환: 이 이름들을 직접 부르던 문항 코드가 그대로 돌게 한다. */
  if (typeof global.randInt !== "function") global.randInt = randInt;
  if (typeof global.mcfPick !== "function") global.mcfPick = pick;
  if (typeof global.mcfRich !== "function") global.mcfRich = rich;
  if (typeof global.mcfKey !== "function") global.mcfKey = key;
  if (typeof global.mcfDedupe !== "function") global.mcfDedupe = dedupe;
  if (typeof global.mcfFactorKey !== "function") global.mcfFactorKey = factorKey;
  if (typeof global.mcfUniqueByValue !== "function") global.mcfUniqueByValue = uniqueByValue;

})(typeof window !== "undefined" ? window : globalThis);
