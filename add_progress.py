"""
MCF3M Practice Portal — add progress.js to every page at once.

사용법:
  1) 이 파일을 index.html 이 있는 폴더에 저장
  2) progress.js 도 같은 폴더에 저장
  3) 그 폴더에서 터미널을 열고:
        Windows :  python add_progress.py
        Mac     :  python3 add_progress.py

하는 일: 각 .html 파일의 </body> 바로 위에 <script src=".../progress.js"></script>
한 줄을 넣는다. 그게 전부다. 다른 내용은 건드리지 않는다.
파일을 바이트 단위로 다루므로 한글/인코딩이 깨지지 않는다.
이미 처리된 파일은 건너뛰므로 여러 번 실행해도 안전하다.
"""

import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SKIP_DIRS = {".git", "node_modules", "__pycache__"}

patched, skipped, problems = [], [], []

for folder, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]

    for name in files:
        if not name.lower().endswith((".html", ".htm")):
            continue

        path = os.path.join(folder, name)
        rel = os.path.relpath(path, ROOT)

        with open(path, "rb") as f:
            data = f.read()

        if b"progress.js" in data:
            skipped.append(rel + "  (이미 처리됨)")
            continue

        # </body> 를 찾는다 (대소문자 무시)
        lower = data.lower()
        pos = lower.rfind(b"</body>")
        if pos == -1:
            problems.append(rel + "  (</body> 태그를 못 찾음)")
            continue

        # 폴더 깊이에 맞춰 ../ 개수를 정한다
        depth = 0 if folder == ROOT else os.path.relpath(folder, ROOT).count(os.sep) + 1
        src = "../" * depth + "progress.js"

        eol = b"\r\n" if b"\r\n" in data else b"\n"
        tag = b'    <script src="' + src.encode("ascii") + b'"></script>' + eol

        data = data[:pos] + tag + data[pos:]

        with open(path, "wb") as f:
            f.write(data)

        patched.append(rel + "  ->  " + src)

print()
print("=" * 60)
print("추가 완료: %d 개" % len(patched))
for line in patched:
    print("   + " + line)

if skipped:
    print()
    print("건너뜀: %d 개" % len(skipped))
    for line in skipped:
        print("   . " + line)

if problems:
    print()
    print("!! 확인 필요: %d 개" % len(problems))
    for line in problems:
        print("   ! " + line)

print("=" * 60)
print()
if not os.path.exists(os.path.join(ROOT, "progress.js")):
    print("!! progress.js 가 이 폴더에 없다. 넣어야 작동한다.")
else:
    print("progress.js 확인됨. 이제 로컬 테스트:")
    print("    python -m http.server 8000     (Mac: python3)")
    print("    브라우저에서 http://localhost:8000 열기")
print()
