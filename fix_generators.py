"""
MCF3M Practice Portal — generator bug fixes (2026-07-29 audit)

사용법:  Random 폴더 안에 넣고
    Windows :  python fix_generators.py
    Mac     :  python3 fix_generators.py

고치는 것
  1. 깨진 셔플  sort(() => Math.random() - 0.5)  ->  Fisher-Yates      (11개 파일 23곳)
  2. Unit 1 shuffleMC : 정답 삭제 방지 + 정답 복제("(Alt 30)") 제거
  3. Unit 1 Lesson 1&2 genType3 : 정답이 사라지던 pop() 제거
  4. Unit 1 Practice Test t10 : 중첩 \text 렌더 깨짐
  5. 제목 MBF3C -> MCF3M
  6. index.html : Unit 2 Practice Test 유형 수 26 -> 13

파일마다 .bak 백업을 남긴다. 이미 고쳐진 파일은 건너뛴다.
"""

import os, re, io, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))

# 나머지 14개 파일이 쓰는 것과 동일한 주소
SHEET_URL = ("https://script.google.com/macros/s/"
            "AKfycbwygR6-l7XPRC1KL-Pqci33Yw_4pmCWa8mW7gNHJ_RsmN41ax15-d0sE-CrIxU0z22m/exec")
log = []

DEDUPE = """
        /* --- audit fix: 같은 보기가 두 번 나오면 하나로 합친다.
           정답과 글자가 똑같은 보기를 골랐는데 오답 처리되는 것을 막는다. --- */
        function mcfDedupe(p) {
            if (!p || !p.options || p.options.length < 2) return p;
            if (p.optionType && p.optionType !== "text") return p;
            var bodies = [];
            for (var i = 0; i < p.options.length; i++) {
                bodies.push(String(p.options[i]).replace(/^[A-D]\\)\\s*/, ""));
            }
            var allEmpty = true;
            for (var e = 0; e < bodies.length; e++) { if (bodies[e].trim() !== "") allEmpty = false; }
            if (allEmpty) return p;

            var letter = p.ans || p.ansLetter || "";
            var ansIdx = letter ? letter.charCodeAt(0) - 65 : -1;
            var seen = [], keep = [];
            for (var k = 0; k < bodies.length; k++) {
                var at = seen.indexOf(bodies[k]);
                if (at === -1) { seen.push(bodies[k]); keep.push({ body: bodies[k], isAns: k === ansIdx }); }
                else if (k === ansIdx) { keep[at].isAns = true; }
            }
            if (keep.length === bodies.length) return p;

            var letters = ["A) ", "B) ", "C) ", "D) "], out = [], newAns = "";
            for (var m = 0; m < keep.length; m++) {
                out.push(letters[m] + keep[m].body);
                if (keep[m].isAns) newAns = String.fromCharCode(65 + m);
            }
            p.options = out;
            if (p.ans !== undefined) p.ans = newAns;
            if (p.ansLetter !== undefined) p.ansLetter = newAns;
            return p;
        }
"""

HELPER = """
        /* --- audit fix: uniform in-place shuffle (Fisher-Yates) --- */
        function mcfShuffle(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        }
"""

def build_shufflemc(wrap):
    """wrap=True 면 보기를 \\( ... \\) 로 감싼다. 파일 원본 방식을 그대로 따른다."""
    push = ('finalOpts.push(letters[k] + "\\\\(" + opts[k] + "\\\\)");'
            if wrap else 'finalOpts.push(letters[k] + opts[k]);')
    return """        function shuffleMC(optionsArr, correctStr) {
            var uniq = [];
            for (var i = 0; i < optionsArr.length; i++) {
                if (uniq.indexOf(optionsArr[i]) === -1) uniq.push(optionsArr[i]);
            }
            if (uniq.indexOf(correctStr) === -1) uniq.unshift(correctStr);
            var opts = uniq.slice(0, 4);
            if (opts.indexOf(correctStr) === -1) opts[opts.length - 1] = correctStr;
            mcfShuffle(opts);
            var letters = ["A) ", "B) ", "C) ", "D) "];
            var finalOpts = [], ansLetter = "";
            for (var k = 0; k < opts.length; k++) {
                """ + push + """
                if (opts[k] === correctStr) ansLetter = String.fromCharCode(65 + k);
            }
            return { options: finalOpts, ans: ansLetter };
        }
"""


SORT_SHUFFLE = re.compile(
    r'([A-Za-z_$][\w$]*(?:\s*\.\s*slice\([^()]*\))?|\[[^\]\[]*\])'
    r'\s*\.sort\(\s*'
    r'(?:\(\s*\)\s*=>\s*|function\s*\(\s*\)\s*\{\s*return\s+)'
    r'\(?\s*(?:Math\.random\(\)\s*-\s*0\.5|0\.5\s*-\s*Math\.random\(\))\s*\)?'
    r'\s*;?\s*\}?\s*\)'
)


def fix_file(path):
    rel = os.path.relpath(path, ROOT)
    src = io.open(path, encoding='utf-8', errors='strict').read()
    orig = src
    notes = []

    # ---- 1. every broken sort-shuffle -> mcfShuffle(...) --------------
    n_sort = len(SORT_SHUFFLE.findall(src))
    if n_sort:
        src = SORT_SHUFFLE.sub(lambda m: 'mcfShuffle(%s)' % m.group(1).strip(), src)
        notes.append('셔플 %d곳' % n_sort)

    # ---- 1b. nested-bracket array literal the regex can't reach -----
    NESTED = 'let pts = [p0, p1, [topX, topY]].sort(()=>0.5-Math.random());'
    if NESTED in src:
        src = src.replace(NESTED, 'let pts = mcfShuffle([p0, p1, [topX, topY]]);')
        notes.append('셔플 1곳(중첩배열)')

    # ---- 2. Unit 1 shuffleMC: never delete or duplicate the answer ----
    old_start = src.find('function shuffleMC(optionsArr, correctStr)')
    if old_start != -1:
        end = src.find('\n        }\n', old_start)
        if end != -1:
            body = src[old_start:end]
            # 원본이 보기를 \( ... \) 로 감쌌는가?
            wrap = ('\\\\(' in body and 'finalOpts.push' in body)
            src = src[:old_start - 8] + build_shufflemc(wrap) + src[end + len('\n        }\n'):]
            notes.append('shuffleMC 교체(' + ('감쌈' if wrap else '원본유지') + ')')

    # ---- 3. genType3 pop() bug (Unit 1 Lesson 1 & 2) ------------------
    if 'mc.options.pop()' in src:
        src = re.sub(
            r'\n\s*mc\.options\.pop\(\);[^\n]*'
            r'(?:\n\s*if \(ansStr === "[^"]+"\) mc\.ans = [^\n]+)+',
            '\n            // audit fix: 4 real options, answer always present', src)
        notes.append('genType3 정답삭제 제거')

    # ---- 3b. Unit 2/3/4 shuffleMC : "Alt k3f" 쓰레기 보기 제거 -------
    JUNK = '''            while(opts.length < 4) {
                opts.push("Alt " + Math.random().toString(36).slice(2,5));
            }'''
    if JUNK.replace('\n', '\r\n') in src:
        src = src.replace(JUNK.replace('\n', '\r\n'),
                          '            // audit fix: 보기가 모자라면 개수를 줄인다 (쓰레기 보기 금지)')
        notes.append('Alt 쓰레기보기 제거')
    elif JUNK in src:
        src = src.replace(JUNK, '            // audit fix: 보기가 모자라면 개수를 줄인다 (쓰레기 보기 금지)')
        notes.append('Alt 쓰레기보기 제거')

    # ---- 4. nested \text in the discriminant step ---------------------
    if ".replace('zeros'" in src:
        src = re.sub(
            r"\.replace\('zeros',\s*'[^']*'\)\.replace\('zero',\s*'[^']*'\)",
            ".replace(/zeros?/, function (mm) { return '\\\\\\\\text{ real ' + mm + '}'; })",
            src)
        notes.append('중첩 \\text 수정')

    # ---- 4b. Unit 4 : 시트 URL 누락 + 정체성 값 정리 ------------------
    U4 = {
        'Unit 4 Lesson 1 and 2.html':  ('Unit_4', 'U4_Lesson_1_2'),
        'Unit 4 Lesson 3 and 4.html':  ('Unit_4', 'U4_Lesson_3_4'),
        'Unit 4 Lesson 5.html':        ('Unit_4', 'U4_Lesson_5'),
        'Unit 4 Practice Test.html':   ('Unit_4', 'U4_Practice_Test'),
    }
    base = os.path.basename(path)
    if base in U4:
        uid, lid = U4[base]
        if 'TEACHER_SPREADSHEET_SCRIPT_URL = ""' in src:
            src = src.replace('TEACHER_SPREADSHEET_SCRIPT_URL = ""',
                              'TEACHER_SPREADSHEET_SCRIPT_URL = "' + SHEET_URL + '"')
            notes.append('시트 URL 연결')
        src2 = re.sub(r'unitId:\s*"[^"]*"', 'unitId: "%s"' % uid, src)
        if src2 != src:
            src = src2; notes.append('unitId -> %s' % uid)
        if 'lessonId:' not in src:
            src = re.sub(r'(unitId:\s*"%s",)' % uid,
                         r'\1\n                lessonId: "%s",' % lid, src, count=1)
            notes.append('lessonId 추가')

    # ---- 6b. Type 8 오답 보기 부족 (Unit 1 Practice Test) --------------
    T8_OLD = "let optArr = [correctAns,"
    _g8 = src.find('function genType8')
    _g9 = src.find('function genType9') if _g8 != -1 else -1
    if base == 'Unit 1 Practice Test.html' and _g8 != -1 and T8_OLD in src[_g8:_g9]:
        i = src.index(T8_OLD, _g8, _g9)
        j = src.index("\n", i)
        new_t8 = (
            "            var _f = function (p, q, r, t) { return `\\\\((${fmtTerm(p, 'x', true)} "
            "${fmtTerm(q, '')})(${fmtTerm(r, 'x', true)} ${fmtTerm(t, '')})\\\\)`; };\n"
            "            var _nz = function (v) { return v === 0 ? v + 1 : v; };\n"
            "            // 후보를 넉넉히 만들어 중복/정답과 같은 것을 걸러낸다 (2지선다 방지)\n"
            "            var _cand = [ _f(a1, -c1, a2, -c2), _f(a1, c2, a2, c1), _f(a1, -c2, a2, -c1),\n"
            "                          _f(a1, _nz(c1 + 1), a2, c2), _f(a1, c1, a2, _nz(c2 + 1)),\n"
            "                          _f(a1, _nz(c1 - 1), a2, c2), _f(a2, c1, a1, c2),\n"
            "                          _f(a1, c1, a2, _nz(c2 - 1)) ];\n"
            "            var optArr = [correctAns];\n"
            "            for (var _i = 0; _i < _cand.length && optArr.length < 4; _i++) {\n"
            "                if (optArr.indexOf(_cand[_i]) === -1) optArr.push(_cand[_i]);\n"
            "            }"
        )
        src = src[:i - 12] + new_t8 + src[j:]
        notes.append('Type 8 오답 생성 보강')

    # ---- 6c. Type 10 은 유형을 먼저 고르고 계수를 역산 -------------------
    T10_OLD = """            let a = randInt(1, 4) * (Math.random() > 0.5 ? 1 : -1);
            let b = randInt(-5, 5);
            let c = randInt(-5, 5);
            let D = b*b - 4*a*c;"""
    for cand in (T10_OLD, T10_OLD.replace("\n", "\r\n")):
        if base == 'Unit 1 Practice Test.html' and cand in src:
            new_t10 = (
                "            // 0/1/2 zeros 를 먼저 균등하게 고르고 계수를 역산한다\n"
                "            let _kind = randInt(0, 2);\n"
                "            let a, b, c;\n"
                "            if (_kind === 1) {\n"
                "                a = randInt(1, 3) * (Math.random() > 0.5 ? 1 : -1);\n"
                "                let _k = randInt(1, 4) * (Math.random() > 0.5 ? 1 : -1);\n"
                "                b = 2 * a * _k; c = a * _k * _k;\n"
                "            } else if (_kind === 0) {\n"
                "                a = randInt(1, 4); c = randInt(1, 4);\n"
                "                let _mb = Math.floor(Math.sqrt(4 * a * c));\n"
                "                if (_mb * _mb === 4 * a * c) _mb--;\n"
                "                b = randInt(-_mb, _mb);\n"
                "                if (Math.random() > 0.5) { a = -a; c = -c; }\n"
                "            } else {\n"
                "                a = randInt(1, 4) * (Math.random() > 0.5 ? 1 : -1);\n"
                "                b = randInt(-5, 5);\n"
                "                c = randInt(1, 4) * (a > 0 ? -1 : 1);\n"
                "            }\n"
                "            let D = b*b - 4*a*c;"
            )
            src = src.replace(cand, new_t10.replace("\n", "\r\n") if "\r\n" in cand else new_t10)
            notes.append('Type 10 유형 균등화')
            break

    # ---- 5. course code in the page title -----------------------------
    if 'MBF3C' in src:
        n = src.count('MBF3C')
        src = src.replace('MBF3C', 'MCF3M')
        notes.append('MBF3C->MCF3M %d곳' % n)

    # ---- 6. index.html type count -------------------------------------
    if os.path.basename(path).lower() == 'index.html' and '26 Problem Types' in src:
        src = src.replace('26 Problem Types', '13 Problem Types')
        notes.append('유형 수 26->13')

    # ---- 8. U3 Practice Test q1/q13/q15 : 보기 길이 단서 제거 ----------
    #    원칙 - 정답만 길고 구체적이면 읽지 않고도 고른다.
    #    오답은 "명백히 틀린 서술"이어야 하고, 참이지만 답이 아닌 문장은 쓰지 않는다.
    PROSE = [
        # q1 : 정답을 짧게, 오답을 같은 길이로
        ('const correctStr = `The entire expression \\\\(${b}^{${x}}\\\\) or its evaluated value ${y}`;',
         'const correctStr = `The whole expression \\\\(${b}^{${x}}\\\\), whose value is ${y}`;'),
        ('const dist1 = `The base element ${b}`; const dist2 = `The exponent index ${x}`; '
         'const dist3 = `The intermediate product ${b * x}`;',
         'const dist1 = `Only the base ${b}, which is the number being repeated`; '
         'const dist2 = `Only the exponent ${x}, which counts the repeats`; '
         'const dist3 = `The product ${b * x}, found by multiplying base and exponent`;'),
        # q13 : 정답을 짧게
        ('const correctStr = "Positive base values raised to any real power remain strictly positive; '
         'the x-axis is a horizontal asymptote.";',
         'const correctStr = "A positive base stays positive for any exponent, so y = 0 is never reached.";'),
        ('const dist1 = "Exponents cannot be negative numbers; the x-axis is a vertical intercept boundary.";',
         'const dist1 = "A negative exponent produces a negative output, so the curve stops just above y = 0.";'),
        ('const dist2 = "Output values flip signs at zero points; the x-axis represents a vertex line floor.";',
         'const dist2 = "The output changes sign at x = 0, so the x-axis becomes the vertex of this curve.";'),
        ('const dist3 = `Base ${b} multiplication forces linear step progression; '
         'the x-axis represents a local minimum limit.`;',
         'const dist3 = `Multiplying by ${b} adds a fixed amount each step, so the curve flattens onto y = 0.`;'),
        # q15 : Dan 의 지적 반영 - 판단이 아니라 명백한 오류로
        ('const correctStr = "Compound interest, because it earns interest on accumulated interest, '
         'creating exponential growth over time.";',
         'const correctStr = "Compound interest, because it earns interest on the interest already added.";'),
        ('const dist1 = "Simple interest, because it maintains stable linear growth distributions.";',
         'const dist1 = "Simple interest, because it pays more interest than compound interest over a long term.";'),
        ('const dist2 = "Simple interest, because interest rate factors are not divided into periodic monthly cycles.";',
         'const dist2 = "Simple interest, because compound interest applies only to loans, not to savings.";'),
        ('const dist3 = "Compound interest, because initial principal requirements are lower for linear investment paths.";',
         'const dist3 = "Compound interest, because the interest rate itself goes up every year."; '),
    ]
    if base == 'Unit 3 Practice Test Random.html':
        hit = 0
        for a, b_ in PROSE:
            if a in src:
                src = src.replace(a, b_); hit += 1
        if hit:
            notes.append('q1/q13/q15 보기 재작성 %d곳' % hit)

    # ---- 7. 보기 중복 제거를 문제 생성 지점에 끼워넣는다 --------------
    if 'mcfDedupe(' not in src:
        n1 = len(re.findall(r'currentProblemData = (genType\d+\(\))', src))
        src = re.sub(r'currentProblemData = (genType\d+\(\))',
                     r'currentProblemData = mcfDedupe(\1)', src)
        n2 = len(re.findall(r'currentProblemData = (generateProblem\([^()]*\))', src))
        src = re.sub(r'currentProblemData = (generateProblem\([^()]*\))',
                     r'currentProblemData = mcfDedupe(\1)', src)
        if n1 + n2:
            notes.append('보기 중복제거 %d곳' % (n1 + n2))

    # ---- inject the helpers once --------------------------------------
    if 'function mcfDedupe' not in src and 'mcfDedupe(' in src:
        a = src.find('    <script>')
        if a == -1: a = src.find('<script>')
        if a != -1:
            cut = src.find('>', a) + 1
            src = src[:cut] + DEDUPE + src[cut:]

    if 'function mcfShuffle' not in src and 'mcfShuffle(' in src:
        anchor = src.find('    <script>')
        if anchor == -1:
            anchor = src.find('<script>')
        if anchor != -1:
            cut = src.find('>', anchor) + 1
            src = src[:cut] + HELPER + src[cut:]
            notes.append('헬퍼 삽입')

    if src == orig:
        return None
    shutil.copyfile(path, path + '.bak')
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    return rel + '   ' + ', '.join(notes)


targets = []
for folder, dirs, fnames in os.walk(ROOT):
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for f in sorted(fnames):
        if f.lower().endswith('.html'):
            targets.append(os.path.join(folder, f))

for t in sorted(targets):
    r = fix_file(t)
    if r:
        log.append(r)

print()
print('=' * 62)
print('수정한 파일: %d / %d' % (len(log), len(targets)))
for line in log:
    print('  + ' + line)
print('=' * 62)
print('원본은 각 파일 옆에 .bak 으로 남겨뒀다.')
print('되돌리려면 .bak 파일 이름에서 .bak 을 지우면 된다.')
print()
