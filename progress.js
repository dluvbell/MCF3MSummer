/* ============================================================
   MCF3M Practice Portal — local progress saving
   ------------------------------------------------------------
   Drop this file in the SAME folder as index.html, then add
   one line before </body> in every page:

     index.html      ->  <script src="progress.js"></script>
     lesson pages    ->  <script src="../progress.js"></script>

   Nothing else in the lesson files needs to change.
   All data stays in the student's own browser (localStorage).
   ============================================================ */
(function () {
  "use strict";

  var NS         = "mcf3m.v1";
  var K_STUDENT  = NS + ".student";
  var K_PROGRESS = NS + ".progress";

  /* ---------- storage helpers (never throw) ---------- */

  var available = (function () {
    try {
      var t = NS + ".test";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  })();

  function load(key, fallback) {
    if (!available) return fallback;
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    if (!available) return false;
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* ---------- student ---------- */

  function getStudent() {
    var s = load(K_STUDENT, {});
    return { first: s.first || "", last: s.last || "" };
  }

  function setStudent(first, last) {
    save(K_STUDENT, { first: first || "", last: last || "" });
  }

  function displayName() {
    var s = getStudent();
    var n = (s.first + " " + s.last).trim();
    return n || "";
  }

  /* ---------- progress ---------- */
  /* progress[pathKey] = {
       visits, attempts, correct,
       topics: { t1: {a: 3, c: 1}, ... },
       lastAt: <ms>
     }                                                        */

  function getProgress() { return load(K_PROGRESS, {}); }
  function setProgress(p) { return save(K_PROGRESS, p); }

  /* A lesson is identified by its file path, so the index card
     and the lesson page itself always agree on the key. */
  function keyFor(href) {
    try {
      var p = new URL(href, window.location.href).pathname;
      return decodeURIComponent(p).toLowerCase().replace(/\/+/g, "/");
    } catch (e) {
      return String(href).toLowerCase();
    }
  }

  var PAGE_KEY = keyFor(window.location.href);

  function blank() {
    return { visits: 0, attempts: 0, correct: 0, topics: {}, lastAt: 0 };
  }

  function entry(key) {
    var all = getProgress();
    return all[key] || blank();
  }

  function topicsMastered(e) {
    var n = 0;
    for (var k in e.topics) {
      if (Object.prototype.hasOwnProperty.call(e.topics, k) && e.topics[k].c > 0) n++;
    }
    return n;
  }

  function markVisit() {
    var all = getProgress();
    var e = all[PAGE_KEY] || blank();
    e.visits += 1;
    e.lastAt = Date.now();
    all[PAGE_KEY] = e;
    setProgress(all);
  }

  function record(topicId, isCorrect) {
    var all = getProgress();
    var e = all[PAGE_KEY] || blank();
    e.attempts += 1;
    if (isCorrect) e.correct += 1;

    var id = topicId || "unknown";
    var t = e.topics[id] || { a: 0, c: 0 };
    t.a += 1;
    if (isCorrect) t.c += 1;
    e.topics[id] = t;

    e.lastAt = Date.now();
    all[PAGE_KEY] = e;
    setProgress(all);
    return e;
  }

  function resetAll() {
    if (!available) return;
    try {
      window.localStorage.removeItem(K_PROGRESS);
      window.localStorage.removeItem(K_STUDENT);
    } catch (e) {}
  }

  function timeAgo(ms) {
    if (!ms) return "";
    var d = Math.floor((Date.now() - ms) / 86400000);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 7)  return d + " days ago";
    if (d < 30) return Math.floor(d / 7) + " weeks ago";
    return Math.floor(d / 30) + " months ago";
  }

  /* ============================================================
     LESSON PAGE
     - fills in the name automatically
     - listens to the answer-logging fetch to record progress
     ============================================================ */

  function initLessonPage() {
    var first = document.getElementById("first-name");
    var last  = document.getElementById("last-name");
    if (!first || !last) return false;

    var s = getStudent();
    if (s.first && !first.value) first.value = s.first;
    if (s.last  && !last.value)  last.value  = s.last;

    function remember() { setStudent(first.value.trim(), last.value.trim()); }
    first.addEventListener("input", remember);
    last.addEventListener("input", remember);
    first.addEventListener("change", remember);
    last.addEventListener("change", remember);

    markVisit();
    buildChip();
    return true;
  }

  /* How many practice topics this page offers (from the dropdown). */
  function topicCount() {
    var sel = document.getElementById("topic-select");
    return sel ? sel.options.length : 0;
  }

  var chipEl = null;

  function buildChip() {
    var portal = window.MCF3M_PORTAL_URL || "../index.html";

    var box = document.createElement("div");
    box.id = "mcf3m-chip";
    box.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:9999",
      "background:#0f172a", "color:#e2e8f0",
      "font:600 12px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      "padding:10px 14px", "border-radius:12px",
      "box-shadow:0 6px 20px rgba(15,23,42,.28)",
      "max-width:230px"
    ].join(";");

    box.innerHTML =
      '<div id="mcf3m-chip-body"></div>' +
      '<a href="' + portal + '" style="display:inline-block;margin-top:8px;color:#93c5fd;' +
      'text-decoration:none;font-weight:700">&larr; Back to portal</a>';

    document.body.appendChild(box);
    chipEl = document.getElementById("mcf3m-chip-body");
    refreshChip();
  }

  function refreshChip() {
    if (!chipEl) return;
    var e = entry(PAGE_KEY);
    var total = topicCount();
    var mastered = topicsMastered(e);
    var who = displayName();

    var lines = [];
    if (!available) {
      lines.push('<span style="color:#fca5a5">Progress can\'t be saved in this browser mode.</span>');
    } else {
      lines.push('<div style="color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;font-size:10px">Saved on this device</div>');
      if (who) lines.push('<div style="margin-top:4px;color:#f8fafc;font-size:13px">' + escapeHtml(who) + '</div>');
      if (total) {
        lines.push('<div style="margin-top:4px">Topics correct: <span style="color:#34d399">' +
          mastered + " / " + total + "</span></div>");
      }
      if (e.attempts) {
        lines.push('<div style="color:#94a3b8;font-weight:500">' + e.correct + " right of " + e.attempts + " tries</div>");
      }
    }
    chipEl.innerHTML = lines.join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Intercept the existing answer-logging call. The lesson pages
     already POST {questionId, isCorrect, ...} for the teacher's
     spreadsheet, so we reuse that instead of touching their code. */
  function hookAnswerLogging() {
    if (typeof window.fetch !== "function") return;
    var original = window.fetch;

    window.fetch = function (input, init) {
      try {
        if (init && typeof init.body === "string") {
          var data = JSON.parse(init.body);
          if (data && typeof data.isCorrect === "boolean") {
            record(data.questionId, data.isCorrect);
            refreshChip();
          }
        }
      } catch (e) { /* not our payload — ignore */ }
      return original.apply(this, arguments);
    };
  }

  /* ============================================================
     INDEX PAGE
     - status badge on every lesson card
     - per-unit summary + overall panel
     ============================================================ */

  function initIndexPage() {
    var links = document.querySelectorAll('main a[href$=".html"]');
    if (!links.length) return false;

    renderCards(links);
    renderUnitSummaries();
    renderPanel();
    return true;
  }

  function cardStatus(key, totalTopics) {
    var e = entry(key);
    if (!e.attempts) {
      if (!e.visits) return { state: "new", e: e, mastered: 0 };
      return { state: "seen", e: e, mastered: 0 };
    }
    var mastered = topicsMastered(e);
    if (totalTopics && mastered >= totalTopics) return { state: "done", e: e, mastered: mastered };
    return { state: "doing", e: e, mastered: mastered };
  }

  var STYLES = {
    "new":   { bg: "#f8fafc", bd: "#e2e8f0", fg: "#64748b", label: "Not started yet" },
    "seen":  { bg: "#f8fafc", bd: "#e2e8f0", fg: "#64748b", label: "Opened, no questions yet" },
    "doing": { bg: "#fffbeb", bd: "#fde68a", fg: "#92400e", label: "In progress" },
    "done":  { bg: "#ecfdf5", bd: "#a7f3d0", fg: "#065f46", label: "All topics correct" }
  };

  function renderCards(links) {
    Array.prototype.forEach.call(links, function (a) {
      var card = a.closest(".group") || a.parentElement;
      if (!card) return;

      var m = card.textContent.match(/(\d+)\s+Problem Types/i);
      var totalTopics = m ? parseInt(m[1], 10) : 0;

      var key = keyFor(a.getAttribute("href"));
      var st = cardStatus(key, totalTopics);
      var s = STYLES[st.state];

      var badge = document.createElement("div");
      badge.className = "mcf3m-badge";
      badge.style.cssText =
        "background:" + s.bg + ";border:1px solid " + s.bd + ";color:" + s.fg +
        ";border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12px;font-weight:700;" +
        "display:flex;align-items:center;justify-content:space-between;gap:8px";

      var right = "";
      if (st.state === "doing" || st.state === "done") {
        if (totalTopics) right = st.mastered + " / " + totalTopics + " topics";
        else if (st.e.attempts) right = st.e.correct + " / " + st.e.attempts + " correct";
      }

      badge.innerHTML =
        "<span>" + (st.state === "done" ? "&#10003; " : "") + s.label + "</span>" +
        '<span style="font-weight:600;opacity:.85">' + right + "</span>";

      var footer = a.parentElement;
      footer.insertBefore(badge, a);

      if ((st.state === "doing" || st.state === "done") && st.e.lastAt) {
        var when = document.createElement("div");
        when.className = "mcf3m-badge";
        when.style.cssText = "font-size:11px;color:#94a3b8;font-weight:600;margin:-6px 0 10px 2px";
        when.textContent = "Last practised " + timeAgo(st.e.lastAt);
        footer.insertBefore(when, a);
      }
    });
  }

  function renderUnitSummaries() {
    var units = document.querySelectorAll("main details");
    Array.prototype.forEach.call(units, function (d) {
      var links = d.querySelectorAll('a[href$=".html"]');
      if (!links.length) return;

      var started = 0, done = 0;
      Array.prototype.forEach.call(links, function (a) {
        var card = a.closest(".group") || a.parentElement;
        var m = card ? card.textContent.match(/(\d+)\s+Problem Types/i) : null;
        var totalTopics = m ? parseInt(m[1], 10) : 0;
        var st = cardStatus(keyFor(a.getAttribute("href")), totalTopics);
        if (st.state === "doing" || st.state === "done") started++;
        if (st.state === "done") done++;
      });

      var summary = d.querySelector("summary");
      if (!summary) return;

      var pill = document.createElement("span");
      pill.className = "mcf3m-badge";
      pill.style.cssText =
        "font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;white-space:nowrap;" +
        (done === links.length
          ? "background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0"
          : started
            ? "background:#fffbeb;color:#92400e;border:1px solid #fde68a"
            : "background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0");
      pill.textContent = started
        ? started + " of " + links.length + " practised"
        : "Not practised yet";

      var tail = summary.lastElementChild;
      summary.insertBefore(pill, tail);
    });
  }

  function renderPanel() {
    var anchor = document.querySelector("main");
    if (!anchor) return;

    var panel = document.createElement("div");
    panel.id = "mcf3m-panel";
    panel.className = "bg-white border border-slate-200 rounded-xl p-6 mb-10 shadow-sm";
    var welcome = anchor.firstElementChild;
    anchor.insertBefore(panel, welcome ? welcome.nextSibling : anchor.firstChild);
    paintPanel(panel);
  }

  function paintPanel(panel) {
    if (!available) {
      panel.innerHTML =
        '<h2 class="text-xl font-bold text-[#0f172a]">Progress saving is off</h2>' +
        '<p class="text-slate-500 text-sm mt-1">This browser is blocking site storage, ' +
        "so your name and practice history can&rsquo;t be kept. Turn off private browsing " +
        "or allow site data, then reload.</p>";
      return;
    }

    var s = getStudent();
    var who = displayName();

    panel.innerHTML =
      '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">' +
        "<div>" +
          '<h2 class="text-xl font-bold text-[#0f172a]">' +
            (who ? "Welcome back, " + escapeHtml(s.first || who) : "Your name") +
          "</h2>" +
          '<p class="text-slate-500 text-sm mt-1">' +
            (who
              ? "Your name is filled in automatically on every lesson, and your practice history is kept on this device."
              : "Enter your name once. It will be filled in for you on every lesson from now on.") +
          "</p>" +
        "</div>" +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<input id="mcf3m-first" type="text" placeholder="First name" autocomplete="off" value="' + escapeHtml(s.first) + '" ' +
            'class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36">' +
          '<input id="mcf3m-last" type="text" placeholder="Last name" autocomplete="off" value="' + escapeHtml(s.last) + '" ' +
            'class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36">' +
          '<button id="mcf3m-save" class="bg-[#0f172a] hover:bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">Save name</button>' +
        "</div>" +
      "</div>" +
      '<div id="mcf3m-stats" class="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"></div>';

    paintStats();

    document.getElementById("mcf3m-save").addEventListener("click", function () {
      setStudent(
        document.getElementById("mcf3m-first").value.trim(),
        document.getElementById("mcf3m-last").value.trim()
      );
      paintPanel(panel);
    });
  }

  function paintStats() {
    var box = document.getElementById("mcf3m-stats");
    if (!box) return;

    var links = document.querySelectorAll('main a[href$=".html"]');
    var started = 0, done = 0, attempts = 0, correct = 0;

    Array.prototype.forEach.call(links, function (a) {
      var card = a.closest(".group") || a.parentElement;
      var m = card ? card.textContent.match(/(\d+)\s+Problem Types/i) : null;
      var totalTopics = m ? parseInt(m[1], 10) : 0;
      var key = keyFor(a.getAttribute("href"));
      var st = cardStatus(key, totalTopics);
      if (st.state === "doing" || st.state === "done") started++;
      if (st.state === "done") done++;
      attempts += st.e.attempts;
      correct += st.e.correct;
    });

    box.innerHTML =
      '<span class="text-slate-700 font-semibold">Lessons practised: <span class="text-blue-600">' + started + " of " + links.length + "</span></span>" +
      '<span class="text-slate-700 font-semibold">Finished: <span class="text-emerald-600">' + done + "</span></span>" +
      '<span class="text-slate-700 font-semibold">Questions answered: <span class="text-blue-600">' + attempts + "</span></span>" +
      '<span class="text-slate-700 font-semibold">Correct: <span class="text-emerald-600">' + correct + "</span></span>" +
      '<button id="mcf3m-reset" class="ml-auto text-slate-400 hover:text-red-600 text-xs font-bold underline">Clear my saved progress</button>';

    var btn = document.getElementById("mcf3m-reset");
    if (btn) {
      btn.addEventListener("click", function () {
        if (window.confirm("This clears your name and all practice history on this device. Continue?")) {
          resetAll();
          window.location.reload();
        }
      });
    }
  }

  /* ============================================================
     boot
     ============================================================ */

  hookAnswerLogging();

  function boot() {
    if (!initLessonPage()) initIndexPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* Keep other open tabs in sync. */
  window.addEventListener("storage", function (ev) {
    if (ev.key !== K_PROGRESS && ev.key !== K_STUDENT) return;
    if (document.getElementById("mcf3m-panel")) window.location.reload();
    else refreshChip();
  });

  /* Small public API, in case a page needs to record manually:
     MCF3M.record("t3", true);                                  */
  window.MCF3M = {
    getStudent: getStudent,
    setStudent: setStudent,
    getProgress: getProgress,
    record: function (topicId, isCorrect) { record(topicId, isCorrect); refreshChip(); },
    reset: resetAll,
    keyFor: keyFor,
    available: available
  };
})();
