/* ============================================================
   MCF3M Practice Portal — local progress + practice tools  (v2)
   ------------------------------------------------------------
   Install: keep progress.js in the site root. Every page already
   loads it, so nothing in the 19 HTML files needs to change.

   v2 adds
     - streak shelf  : every past run of consecutive days is kept
     - stars         : correct +1, first try +1, timer bonus +1..+6
     - mastery       : a topic turns green after 3 first-try
                       correct answers in a row
     - review queue  : a missed topic comes back a few questions later
     - keyboard      : A-D / 1-4 select, Enter check, N new, H hint
                       (touch and mouse keep working exactly as before)
     - timed challenge (optional, student sets the limit; running out
                       only costs the bonus, never the question)

   Everything stays in the student's own browser.
   ============================================================ */
(function () {
  "use strict";

  /* ==========================================================
     THEME LOADER  (2026-08-06)
     ----------------------------------------------------------
     The engine below is theme-neutral. Everything a theme can
     rename or restyle arrives in window.MCF3M_THEME, which lives
     in a sibling file of this one (theme-battle.js, theme-farm.js,
     theme-avatar.js).

     The lesson files only load ../progress.js, so this file has to
     fetch its own theme. That is asynchronous, which is why the
     whole engine sits inside MCF3M_MAIN() and only runs once the
     theme has landed (or failed, in which case the built-in battle
     defaults take over and nothing breaks).
     ========================================================== */

  var NS0 = "mcf3m.v1";

  var SELF = document.currentScript || (function () {
    var s = document.querySelectorAll("script[src]");
    for (var i = s.length - 1; i >= 0; i--) {
      if (/progress\.js(\?|#|$)/.test(s[i].getAttribute("src") || "")) return s[i];
    }
    return null;
  })();

  /* theme files sit next to progress.js, whatever folder that is */
  function sibling(name) {
    var src = SELF ? (SELF.getAttribute("src") || "") : "";
    var cut = src.lastIndexOf("/");
    return (cut < 0 ? "" : src.slice(0, cut + 1)) + name;
  }

  function readTheme() {
    try {
      var m = JSON.parse(window.localStorage.getItem(NS0 + ".meta") || "{}");
      return m.theme || "";
    } catch (e) { return ""; }
  }

  var KNOWN = { battle: 1, farm: 1, avatar: 1 };

  /* The portal is the only page allowed to send a student to the
     picker. Yanking someone out of a half-finished lesson would cost
     them the question they are on. */
  function isPortal() {
    return !!document.querySelector('main a[href$=".html"]:not([data-mcf3m-ui])');
  }

  function go() {
    var id = readTheme();

    if (!KNOWN[id]) {
      if (isPortal()) {
        try {
          window.location.replace(sibling("theme.html"));
          return;
        } catch (e) { /* fall through to battle */ }
      }
      id = "battle";
    }

    var tag = document.createElement("script");
    tag.src = sibling("theme-" + id + ".js");
    tag.onload = MCF3M_MAIN;
    tag.onerror = function () {
      /* a missing theme file must never take the portal down */
      if (window.console) window.console.warn("MCF3M: theme-" + id + ".js not found; using built-in defaults");
      MCF3M_MAIN();
    };
    (document.head || document.documentElement).appendChild(tag);
  }

  go();

  function MCF3M_MAIN() {
    if (window.MCF3M) return;          /* never boot twice */

  var NS         = "mcf3m.v1";
  var K_STUDENT  = NS + ".student";
  var K_PROGRESS = NS + ".progress";
  var K_META     = NS + ".meta";      // stars, active days, timer settings

  var MASTERY_RUN = 3;                // first-try correct answers in a row
  var REVIEW_GAP  = 2;                // questions to wait before a re-ask

  /* ============================================================
     theme
     ------------------------------------------------------------
     Everything a theme is allowed to change lives here. The engine
     never hard-codes a word a theme might want to rename.

     BATTLE is both the default theme and the fallback: if the theme
     file is missing or only fills in half the map, the missing parts
     come from here, so the portal cannot end up with blank labels.
     ============================================================ */

  var BATTLE = {
    id: "battle",
    name: "Battle",
    ui: {
      stars:     "stars earned",
      shopHead:  "SHOP \u2014 SPEND YOUR STARS",
      shopNote:  "Take these into a boss fight. Hints and solution steps can also be bought mid-fight.",
      bagHead:   "BAG \u2014 WHAT YOU ARE CARRYING",
      bagNote:   "Items are spent automatically when they apply. Buy more in the shop.",
      bagEmpty:  "Nothing here yet. Anything you buy in the shop shows up here.",
      tabShop:   "Shop",
      tabBag:    "Bag",
      tabTroph:  "Trophies",
      tabBadge:  "Badges",
      tabCode:   "Save code",
      switch:    "Change world"
    },
    boss: {
      lesson:  "Lesson Boss",
      unit:    "Unit Boss",
      final:   "Final Boss",
      stand:   "LAST STAND",
      retreat: "Retreat",
      tiring:  "boss is tiring (double damage)",
      retreatAsk: "Retreat? The boss heals back to full, but you keep every star you have."
    },
    shop: {
      powerCore:   { name: "Power Core",    cost: 60,  desc: "Double damage for your next 3 questions." },
      secondWind:  { name: "Second Wind",   cost: 80,  desc: "Turns one missed question back into a first-try hit." },
      starLens:    { name: "Star Lens",     cost: 100, desc: "Doubles the stars you win from this boss." },
      streakFreeze:{ name: "Streak Freeze", cost: 120, desc: "Miss a day without losing your streak. 7-day cooldown." }
    }
  };

  /* shallow two-level merge: a theme may override one label without
     having to restate the other twenty */
  var T = (function () {
    var given = window.MCF3M_THEME || {};
    var out = { id: given.id || BATTLE.id, name: given.name || BATTLE.name };
    ["ui", "boss"].forEach(function (grp) {
      out[grp] = {};
      Object.keys(BATTLE[grp]).forEach(function (k) { out[grp][k] = BATTLE[grp][k]; });
      Object.keys((given[grp] || {})).forEach(function (k) {
        if (given[grp][k]) out[grp][k] = given[grp][k];
      });
    });
    /* the four shop ids are the engine's, because their effects are wired
       into the fight. A theme renames and reprices them; it cannot invent
       a fifth one here (decoration catalogues come later, separately). */
    out.shop = {};
    Object.keys(BATTLE.shop).forEach(function (k) {
      var b = BATTLE.shop[k], g = (given.shop || {})[k] || {};
      out.shop[k] = {
        name: g.name || b.name,
        cost: (typeof g.cost === "number" ? g.cost : b.cost),
        desc: g.desc || b.desc
      };
    });
    /* a world may also bring a whole subsystem of its own — the farm hands
       over a catalogue. It is passed through untouched; there is no battle
       default to merge it against. */
    if (given.farm) out.farm = given.farm;
    return out;
  })();

  /* ============================================================
     storage
     ============================================================ */

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

  function getStudent() {
    var s = load(K_STUDENT, {});
    return { first: s.first || "", last: s.last || "" };
  }
  function setStudent(first, last) {
    save(K_STUDENT, { first: first || "", last: last || "" });
  }
  function displayName() {
    var s = getStudent();
    return (s.first + " " + s.last).trim();
  }

  function getProgress() { return load(K_PROGRESS, {}); }
  function setProgress(p) { return save(K_PROGRESS, p); }

  function getMeta() {
    var m = load(K_META, {});
    return {
      stars: m.stars || 0,
      days: m.days || [],
      frozen: m.frozen || [],          /* days bridged by a Streak Freeze */
      freezeUsedAt: m.freezeUsedAt || 0,
      freezeNotice: m.freezeNotice || "",
      timerOn: !!m.timerOn,
      timerSecs: m.timerSecs || 60,
      combo: m.combo || 0,             /* first-try answers in a row */
      comboAt: m.comboAt || 0,
      cleanRun: m.cleanRun || 0,       /* ... with no hint and no steps */
      cleanBest: m.cleanBest || 0,
      /* the balance goes down when they buy something, so a separate
         running total is the only honest thing to hang on a trophy wall.
         For anyone who was already playing, today's balance is the floor. */
      earnedTotal: (m.earnedTotal === undefined ? (m.stars || 0) : m.earnedTotal),
      backupAt: m.backupAt || 0,       /* last time a save code was taken */
      theme: m.theme || ""             /* battle | farm | avatar */
    };
  }
  function setMeta(m) { return save(K_META, m); }

  /* ============================================================
     dates and streaks
     ============================================================ */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function dayStamp(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function dayNumber(stamp) {          // days since epoch, DST-proof
    var p = stamp.split("-");
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }

  function prettyDay(stamp) {
    var p = stamp.split("-");
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[+p[1] - 1] + " " + (+p[2]);
  }

  /* Every run of consecutive active days, oldest first. Nothing is
     ever thrown away: a broken streak simply becomes a finished one. */
  function streakRuns(days) {
    var sorted = days.slice().sort();
    var runs = [], cur = null;

    sorted.forEach(function (ds) {
      if (cur && dayNumber(ds) === dayNumber(cur.end) + 1) {
        cur.end = ds; cur.len += 1;
      } else if (cur && ds === cur.end) {
        /* duplicate, ignore */
      } else {
        if (cur) runs.push(cur);
        cur = { start: ds, end: ds, len: 1 };
      }
    });
    if (cur) runs.push(cur);
    return runs;
  }

  function liveRun(runs) {            // the run still going today / yesterday
    if (!runs.length) return null;
    var last = runs[runs.length - 1];
    var gap = dayNumber(dayStamp()) - dayNumber(last.end);
    return gap <= 1 ? last : null;
  }

  function stampFromNumber(n) {      // inverse of dayNumber
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  var FREEZE_COOLDOWN = 7 * 86400000;

  /* A Streak Freeze spends itself automatically: if exactly one day was
     missed and the student owns one (and the cooldown has passed), that
     day is bridged so the run survives. */
  function markToday() {
    var m = getMeta();
    var t = dayStamp();
    if (m.days.indexOf(t) !== -1) return;

    var all = m.days.concat(m.frozen).sort();
    if (all.length) {
      var gap = dayNumber(t) - dayNumber(all[all.length - 1]);
      if (gap === 2) {
        var inv = getInv();
        var ready = !m.freezeUsedAt || (Date.now() - m.freezeUsedAt) > FREEZE_COOLDOWN;
        if (inv.streakFreeze && ready) {
          inv.streakFreeze -= 1;
          if (!inv.streakFreeze) delete inv.streakFreeze;
          setInv(inv);
          var bridged = stampFromNumber(dayNumber(t) - 1);
          m.frozen.push(bridged);
          m.freezeUsedAt = Date.now();
          m.freezeNotice = bridged;
        }
      }
    }
    m.days.push(t);
    setMeta(m);
  }

  function addStars(n) {
    if (!n) return getMeta().stars;
    var m = getMeta();
    m.stars += n;
    if (n > 0) m.earnedTotal += n;      /* spending never lowers the total */
    setMeta(m);
    return m.stars;
  }

  /* ============================================================
     BADGES
     ------------------------------------------------------------
     A badge is earned, never bought, and every tier of one hands
     over a shop artifact for free. That is what closes the economy:
     before this, stars were the only way to own anything.

     Almost every badge is a pure function of what is already
     stored, so syncBadges() can recompute it from scratch. That
     keeps them honest after a save code is merged, and it means a
     student who mastered a whole lesson before badges existed is
     given the credit anyway. Only "No Hints" needs live counting,
     because nothing in the old records remembers a hint.

     A tier is handed out once. The count can be recomputed freely,
     but `tier` only ever moves up, so no artifact is granted twice.
     ============================================================ */

  var K_BADGE = NS + ".badges";

  var BADGES = {
    comeback: {
      name: "Comeback", unit: "topics",
      desc: "Master a topic that was beating you.",
      tiers: [1, 4, 10], gives: ["secondWind", "secondWind", "starLens"]
    },
    sweep: {
      name: "Clean Sweep", unit: "lessons",
      desc: "Master every single type in one lesson.",
      tiers: [1, 5, 18], gives: ["powerCore", "starLens", "streakFreeze"]
    },
    nohints: {
      name: "No Hints", unit: "in a row",
      desc: "First-try correct answers in a row, with no hint and no solution steps.",
      tiers: [10, 25, 50], gives: ["powerCore", "powerCore", "starLens"]
    },
    ring: {
      name: "Back in the Ring", unit: "returns",
      desc: "Lose a streak of three days or more, then come back within three days.",
      tiers: [1, 3, 6], gives: ["streakFreeze", "streakFreeze", "starLens"]
    },
    slayer: {
      name: "Boss Slayer", unit: "bosses",
      desc: "Beat a boss with all three stars.",
      tiers: [1, 5, 12], gives: ["powerCore", "starLens", "streakFreeze"]
    },
    marathon: {
      name: "Marathon", unit: "days",
      desc: "Every day you have practised, added up.",
      tiers: [7, 30, 100], gives: ["streakFreeze", "powerCore", "starLens"]
    }
  };

  var ROMAN = ["", "I", "II", "III"];

  function getBadges() { return load(K_BADGE, {}); }
  function setBadges(b) { return save(K_BADGE, b); }

  function badgeRow(all, id) {
    var b = all[id] || {};
    return { n: b.n || 0, tier: b.tier || 0, at: b.at || 0 };
  }

  var badgeQueue = [];      /* tiers earned since the last time we looked */

  /* Raise a badge's count and hand over anything that unlocks. Every read
     and write goes through the shared ctx so that one sync touches storage
     twice at most, not twice per badge. */
  function creditIn(ctx, id, count) {
    var cfg = BADGES[id];
    if (!cfg) return;
    var b = badgeRow(ctx.badges, id);
    if (count <= b.n && b.tier >= cfg.tiers.length) return;
    if (count > b.n) { b.n = count; ctx.badgesDirty = true; }

    while (b.tier < cfg.tiers.length && b.n >= cfg.tiers[b.tier]) {
      var gift = cfg.gives[b.tier];
      ctx.inv[gift] = (ctx.inv[gift] || 0) + 1;
      ctx.invDirty = true;
      b.tier += 1;
      b.at = Date.now();
      ctx.badgesDirty = true;
      badgeQueue.push({ id: id, name: cfg.name, tier: b.tier, gift: gift });
    }
    ctx.badges[id] = b;
  }

  /* kept for the console and for one-off credits */
  function creditBadge(id, count) {
    var ctx = { badges: getBadges(), inv: getInv() };
    creditIn(ctx, id, count);
    if (ctx.invDirty) setInv(ctx.inv);
    if (ctx.badgesDirty) setBadges(ctx.badges);
  }

  /* ---------- everything a badge count can be read from ---------- */

  /* One pass over the manifest instead of a lookup per file. */
  function totalMap() {
    var out = {};
    getManifest().forEach(function (m) { if (m.total) out[m.key] = m.total; });
    /* audit fix 2026-07-31: 레슨에 유형을 추가하면 index.html 의 "N Problem Types"
       가 옛 숫자로 남아 5/6 인데도 완료로 뜬다. 지금 페이지는 실제 유형 수와
       비교해 큰 쪽을 쓴다. */
    var n = topicIds().length;
    if (n && (!out[PAGE_KEY] || n > out[PAGE_KEY])) out[PAGE_KEY] = n;
    return out;
  }

  /* A topic mastered while the record still shows a rough start. */
  function comebackCount(all) {
    var n = 0;
    Object.keys(all).forEach(function (key) {
      var e = normalise(all[key]);
      Object.keys(e.topics).forEach(function (id) {
        var t = e.topics[id];
        if (t.mastered && t.a >= 6 && (t.c / t.a) <= 0.6) n++;
      });
    });
    return n;
  }

  function sweepCount(all, totals) {
    var n = 0;
    Object.keys(all).forEach(function (key) {
      var total = totals[key];
      if (total && masteredCount(normalise(all[key])) >= total) n++;
    });
    return n;
  }

  function slayerCount() {
    var cleared = getBoss().cleared || {};
    var n = 0;
    Object.keys(cleared).forEach(function (k) { if (cleared[k].grade >= 3) n++; });
    return n;
  }

  /* Runs are already kept for the streak shelf. A return is a run of
     three days or more that ended, followed by a restart inside three
     days. A day bridged by a Streak Freeze never broke, so it never
     shows up here. */
  function ringCount(runs) {
    var n = 0;
    for (var i = 1; i < runs.length; i++) {
      var gap = dayNumber(runs[i].start) - dayNumber(runs[i - 1].end);
      if (runs[i - 1].len >= 3 && gap >= 2 && gap <= 4) n++;
    }
    return n;
  }

  /* Called after every answer, so it has to stay cheap. The four counters
     that read small records always run. Comeback and Clean Sweep have to
     walk every topic on every file, and nothing but a fresh mastery (or an
     arriving save code) can move them, so they are asked for by name. */
  function syncBadges(opts) {
    if (!available) return;
    opts = opts || {};
    var m = getMeta();
    var ctx = { badges: getBadges(), inv: getInv() };

    creditIn(ctx, "nohints", m.cleanBest);
    creditIn(ctx, "marathon", m.days.length);
    creditIn(ctx, "ring", ringCount(streakRuns(m.days.concat(m.frozen))));
    creditIn(ctx, "slayer", slayerCount());

    if (opts.scan) {
      var all = getProgress();
      var totals = totalMap();
      creditIn(ctx, "comeback", comebackCount(all));
      creditIn(ctx, "sweep", sweepCount(all, totals));
    }

    if (ctx.invDirty) setInv(ctx.inv);
    if (ctx.badgesDirty) setBadges(ctx.badges);
  }

  function badgeTally() {
    var all = getBadges(), have = 0, of = 0;
    Object.keys(BADGES).forEach(function (id) {
      have += badgeRow(all, id).tier;
      of += BADGES[id].tiers.length;
    });
    return { have: have, of: of };
  }

  /* ============================================================
     combo — first-try answers in a row multiply the base stars
     ============================================================ */

  var COMBO_STEPS = [3, 6];              /* x2 at 3 in a row, x3 at 6 */
  var COMBO_IDLE  = 3 * 3600 * 1000;     /* a combo left alone cools off */

  function comboMult(n) {
    if (n >= COMBO_STEPS[1]) return 3;
    if (n >= COMBO_STEPS[0]) return 2;
    return 1;
  }

  function readCombo() {
    var m = getMeta();
    if (m.combo && m.comboAt && (Date.now() - m.comboAt) > COMBO_IDLE) return 0;
    return m.combo;
  }

  /* clean = correct on the very first try. Anything else ends the run. */
  function bumpCombo(clean) {
    var before = comboMult(readCombo());
    var n = clean ? readCombo() + 1 : 0;
    var m = getMeta();
    m.combo = n;
    m.comboAt = Date.now();
    setMeta(m);
    var mult = comboMult(n);
    return { n: n, mult: mult, up: mult > before, broke: !clean && before > 1 };
  }

  /* ============================================================
     per-lesson records
     ============================================================ */

  /* A page is identified by its file name alone, never by its full path.
     The same site opened from a disk folder and from a web address has
     different paths, so a path key would make one student look like two
     and a saved code would not survive the move. Every file name on this
     site is unique, so the name is enough. */
  function keyFor(href) {
    var raw;
    try { raw = new URL(href, window.location.href).pathname; }
    catch (e) { raw = String(href); }
    try { raw = decodeURIComponent(raw); } catch (e2) {}
    var name = raw.replace(/\\/g, "/").split("/").pop();
    /* audit fix 2026-07-31: 같은 레슨이라도 "Unit_1_Lesson_3.html" 과
       "Unit 1 Lesson 3.html" 이 다른 키가 되어 학생 진도가 통째로 끊겼다.
       밑줄/하이픈을 공백과 같게 보고 하나의 키로 합친다. */
    return name.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  var PAGE_KEY = keyFor(window.location.href);

  /* ---------- one-time move from path keys to file-name keys ---------- */

  var K_KEYS2 = NS + ".keys3";  /* audit fix 2026-07-31: 키 규칙이 바뀌어 재실행 */

  function mergeEntry(a, b) {
    var out = normalise(a);
    b = normalise(b);
    out.visits   = Math.max(out.visits, b.visits);
    out.attempts = Math.max(out.attempts, b.attempts);
    out.correct  = Math.max(out.correct, b.correct);
    out.lastAt   = Math.max(out.lastAt || 0, b.lastAt || 0);
    Object.keys(b.labels).forEach(function (id) {
      if (!out.labels[id]) out.labels[id] = b.labels[id];
    });
    Object.keys(b.topics).forEach(function (id) {
      var t = b.topics[id], o = out.topics[id];
      if (!o) { out.topics[id] = t; return; }
      out.topics[id] = {
        a: Math.max(o.a, t.a),
        c: Math.max(o.c, t.c),
        run: Math.max(o.run, t.run),
        best: Math.max(o.best, t.best),
        mastered: !!(o.mastered || t.mastered)
      };
    });
    return out;
  }

  function betterClear(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (b.grade > a.grade) return b;
    if (b.grade === a.grade && b.questions < a.questions) return b;
    return a;
  }

  function migrateKeys() {
    if (!available || load(K_KEYS2, false)) return;

    var all = getProgress(), out = {}, touched = false;
    Object.keys(all).forEach(function (k) {
      var nk = keyFor(k);
      if (nk !== k) touched = true;
      out[nk] = out[nk] ? mergeEntry(out[nk], all[k]) : normalise(all[k]);
    });
    if (touched) setProgress(out);

    var b = load(K_BOSS, null);
    if (b) {
      var cl = {};
      Object.keys(b.cleared || {}).forEach(function (id) {
        var i = id.indexOf(":");
        var nid = i < 0 ? id : id.slice(0, i + 1) + keyFor(id.slice(i + 1));
        cl[nid] = betterClear(cl[nid], b.cleared[id]);
      });
      b.cleared = cl;
      if (b.final && b.final.done) {
        b.final.done = b.final.done.map(keyFor);
        b.final.phase = b.final.done.length;
      }
      delete b.active;            /* a fight saved under an old key */
      setBoss(b);
    }

    var mf = load(K_MAP, null);
    if (mf && mf.length) {
      mf.forEach(function (m) { m.key = keyFor(m.key); });
      manifestCache = mf;
      save(K_MAP, mf);
    }

    save(K_KEYS2, true);
  }

  function blank() {
    return {
      visits: 0, attempts: 0, correct: 0,
      topics: {},        // id -> {a, c, run, best, mastered}
      labels: {},        // id -> dropdown text
      queue: [],         // [{topic, dueAt}]
      lastAt: 0
    };
  }

  function normalise(e) {
    e = e || blank();
    e.topics = e.topics || {};
    e.labels = e.labels || {};
    e.queue  = e.queue  || [];
    for (var k in e.topics) {
      if (!Object.prototype.hasOwnProperty.call(e.topics, k)) continue;
      var t = e.topics[k];
      if (typeof t.run  !== "number") t.run = 0;
      if (typeof t.best !== "number") t.best = 0;
      if (typeof t.mastered !== "boolean") t.mastered = false;
    }
    return e;
  }

  function entry(key) { return normalise(getProgress()[key]); }

  function commit(key, e) {
    var all = getProgress();
    all[key] = e;
    setProgress(all);
  }

  function masteredCount(e) {
    var n = 0;
    for (var k in e.topics) {
      if (Object.prototype.hasOwnProperty.call(e.topics, k) && e.topics[k].mastered) n++;
    }
    return n;
  }

  /* Weakest topic on a lesson: lowest accuracy with at least 3 tries. */
  function weakestTopic(e) {
    var worst = null;
    for (var k in e.topics) {
      if (!Object.prototype.hasOwnProperty.call(e.topics, k)) continue;
      var t = e.topics[k];
      if (t.a < 3 || t.mastered) continue;
      var rate = t.c / t.a;
      if (!worst || rate < worst.rate) {
        worst = { id: k, rate: rate, a: t.a, c: t.c, label: e.labels[k] || k };
      }
    }
    return worst;
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

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function resetAll() {
    if (!available) return;
    try {
      window.localStorage.removeItem(K_PROGRESS);
      window.localStorage.removeItem(K_STUDENT);
      window.localStorage.removeItem(K_META);
      window.localStorage.removeItem(K_BADGE);
    } catch (e) {}
  }

  /* ============================================================
     recording an answer
     ============================================================ */

  var lastResult = null;   // for the lesson UI to react to

  function record(topicId, isCorrect, firstTry, secondsTaken) {
    var e = entry(PAGE_KEY);
    var id = normTopic(topicId);

    e.attempts += 1;
    if (isCorrect) e.correct += 1;

    var t = e.topics[id] || { a: 0, c: 0, run: 0, best: 0, mastered: false };
    t.a += 1;

    var justMastered = false;
    if (isCorrect) {
      t.c += 1;
      if (firstTry) {
        t.run += 1;
        if (t.run > t.best) t.best = t.run;
        if (t.run >= MASTERY_RUN && !t.mastered) { t.mastered = true; justMastered = true; }
      } else {
        t.run = 0;                       /* needed help, run restarts */
      }
    } else {
      t.run = 0;
      /* bring this topic back in a couple of questions */
      var already = e.queue.some(function (q) { return q.topic === id; });
      if (!already) e.queue.push({ topic: id, dueAt: e.attempts + REVIEW_GAP });
    }

    if (t.mastered) {
      e.queue = e.queue.filter(function (q) { return q.topic !== id; });
    }

    e.topics[id] = t;
    e.lastAt = Date.now();
    commit(PAGE_KEY, e);

    /* a run with no help at all, for the No Hints badge */
    var mc = getMeta();
    mc.cleanRun = (isCorrect && firstTry && !helpUsedThisQ) ? mc.cleanRun + 1 : 0;
    if (mc.cleanRun > mc.cleanBest) mc.cleanBest = mc.cleanRun;
    setMeta(mc);

    /* stars — the combo multiplies the base, never the clock bonus */
    var combo = bumpCombo(isCorrect && firstTry);
    var earned = 0;
    if (isCorrect) {
      earned += (firstTry ? 2 : 1) * combo.mult;
      if (timer.active && !timer.expired && !timer.forfeited) earned += bonusFor(timer.limit);
    }
    if (earned) addStars(earned);
    if (isCorrect && firstTry) farmGrow();
    markToday();
    syncBadges({ scan: justMastered });

    lastResult = {
      topic: id, isCorrect: isCorrect, firstTry: firstTry,
      earned: earned, justMastered: justMastered, run: t.run,
      beatClock: isCorrect && timer.active && !timer.expired && !timer.forfeited,
      combo: combo.n, mult: combo.mult, comboUp: combo.up, comboBroke: combo.broke,
      badges: badgeQueue.splice(0),
      seconds: secondsTaken
    };
    return lastResult;
  }

  /* ============================================================
     timed challenge
     ============================================================ */

  var timer = {
    active: false, limit: 60, startedAt: 0, expired: false,
    forfeited: false, handle: null
  };

  function bonusFor(sec) {
    if (sec >= 120) return 1;
    if (sec >= 90)  return 2;
    if (sec >= 60)  return 3;
    if (sec >= 45)  return 4;
    if (sec >= 30)  return 5;
    return 6;
  }

  function stopTimer() {
    if (timer.handle) { window.clearInterval(timer.handle); timer.handle = null; }
  }

  function startTimer() {
    stopTimer();
    var m = getMeta();
    timer.active = m.timerOn;
    timer.limit = m.timerSecs;
    timer.startedAt = Date.now();
    timer.expired = false;
    timer.forfeited = false;
    paintTimer();
    if (!timer.active) return;
    timer.handle = window.setInterval(paintTimer, 250);
  }

  function secondsLeft() {
    return Math.max(0, timer.limit - Math.floor((Date.now() - timer.startedAt) / 1000));
  }

  /* ============================================================
     LESSON PAGE
     ============================================================ */

  var els = {};          // injected elements
  var onLesson = false;

  function initLessonPage() {
    var first = document.getElementById("first-name");
    var last  = document.getElementById("last-name");
    if (!first || !last) return false;
    onLesson = true;

    var s = getStudent();
    if (s.first && !first.value) first.value = s.first;
    if (s.last  && !last.value)  last.value  = s.last;

    function remember() { setStudent(first.value.trim(), last.value.trim()); }
    ["input", "change"].forEach(function (ev) {
      first.addEventListener(ev, remember);
      last.addEventListener(ev, remember);
    });

    var e = entry(PAGE_KEY);
    e.visits += 1;
    e.lastAt = Date.now();

    /* remember what the topics are actually called, so the portal
       can name a weak topic instead of showing "t3" */
    var sel = topicSelect();
    if (sel) {
      Array.prototype.forEach.call(sel.options, function (o) {
        if (o.value) e.labels[normTopic(o.value)] = o.textContent.trim();
      });
    }
    commit(PAGE_KEY, e);

    buildLessonUI();
    hookLessonFunctions();
    watchHelpButtons();
    bindKeyboard();
    refreshLessonUI();
    bossOnLoad();
    return true;
  }

  /* Unit 1 uses #topic-select + generateNewProblem();
     Units 2-4 use #question-select + triggerNewQuestion(). */
  function topicSelect() {
    return document.getElementById("topic-select") ||
           document.getElementById("question-select");
  }

  function topicIds() {
    var sel = topicSelect();
    return sel ? Array.prototype.map.call(sel.options, function (o) { return o.value; }) : [];
  }

  function currentTopic() {
    var sel = topicSelect();
    return sel ? normTopic(sel.value) : "unknown";
  }

  /* Units 2-4 log "t3_Dynamic"; Unit 1 logs "t3". Same topic. */
  function normTopic(id) {
    return String(id || "unknown").replace(/_Dynamic$/, "");
  }

  /* ---------- injected panels ---------- */

  function buildLessonUI() {
    /* #quiz-station is the one anchor that exists in every file --
       some practice tests use a completely different layout with no
       .selector-box or .container at all. */
    var anchor = document.getElementById("quiz-station");
    var host = document.querySelector(".selector-box");
    if (!host || !host.parentNode) host = document.querySelector(".container");
    if (!host && !anchor) return;

    var wrap = document.createElement("div");
    wrap.id = "mcf3m-tools";
    wrap.style.cssText = "margin:18px 0;display:flex;flex-direction:column;gap:12px";
    wrap.innerHTML =
      '<div id="mcf3m-mastery" style="border-radius:14px;padding:16px 18px;border:2px solid #e2e8f0;background:#f8fafc"></div>' +
      '<div id="mcf3m-combo" style="border-radius:14px;padding:11px 16px;border:1px solid #e2e8f0;background:#fff"></div>' +
      '<div id="mcf3m-review" style="display:none;border-radius:14px;padding:14px 18px;border:2px solid #fdba74;background:#fff7ed"></div>' +
      '<div id="mcf3m-timerbar" style="border-radius:14px;padding:12px 16px;border:1px solid #e2e8f0;background:#ffffff"></div>' +
      '<div id="mcf3m-exits" style="display:flex;gap:14px;flex-wrap:wrap;padding:0 2px"></div>';

    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
    else if (host.nextSibling) host.parentNode.insertBefore(wrap, host.nextSibling);
    else host.parentNode.appendChild(wrap);

    els.mastery = document.getElementById("mcf3m-mastery");
    els.combo   = document.getElementById("mcf3m-combo");
    els.review  = document.getElementById("mcf3m-review");
    els.timer   = document.getElementById("mcf3m-timerbar");

    buildTimerBar();
    buildChip();
    buildExits();

    var sel = topicSelect();
    if (sel) sel.addEventListener("change", function () { refreshLessonUI(); });
  }

  /* ---------- mastery: 3 first-try correct in a row ---------- */

  /* Every lesson is a dead end without these: the portal is only ever a
     browser Back away, but a student who arrived by a bookmark has no
     Back to press, and nothing on the page said the picker existed. */
  function buildExits() {
    var box = document.getElementById("mcf3m-exits");
    if (!box) return;
    var portal = window.MCF3M_PORTAL_URL || "../index.html";
    var picker = portal.replace(/index\.html$/i, "theme.html");
    var link = "font-size:.82rem;font-weight:700;color:#64748b;text-decoration:underline";
    box.innerHTML =
      '<a href="' + esc(portal) + '" style="' + link + '">&larr; Practice portal</a>' +
      '<a href="' + esc(picker) + '" style="' + link + '">' + esc(T.ui.switch) + "</a>";
  }

  function paintMastery(flash) {
    if (!els.mastery) return;
    var e = entry(PAGE_KEY);
    var id = currentTopic();
    var t = e.topics[id] || { a: 0, c: 0, run: 0, mastered: false };
    var label = e.labels[id] || id;

    var dots = "";
    for (var i = 0; i < MASTERY_RUN; i++) {
      var on = t.mastered || i < t.run;
      dots +=
        '<span style="display:inline-block;width:20px;height:20px;border-radius:50%;margin-right:8px;' +
        "vertical-align:middle;background:" + (on ? (t.mastered ? "#10b981" : "#2563eb") : "#ffffff") +
        ";border:3px solid " + (on ? (t.mastered ? "#10b981" : "#2563eb") : "#cbd5e1") + '"></span>';
    }

    var headline, sub, border, bg, colour;

    if (t.mastered) {
      headline = "&#10003; Topic mastered";
      sub = "You got " + MASTERY_RUN + " in a row on the first try. Keep going for stars, or switch topics.";
      border = "#6ee7b7"; bg = "#ecfdf5"; colour = "#065f46";
    } else if (t.run === MASTERY_RUN - 1) {
      headline = "ONE MORE!";
      sub = "Get this one right on the first try to master " + esc(label) + ".";
      border = "#60a5fa"; bg = "#eff6ff"; colour = "#1d4ed8";
    } else if (t.run > 0) {
      headline = (MASTERY_RUN - t.run) + " more in a row";
      sub = "First-try correct answers count. A miss starts the row again.";
      border = "#93c5fd"; bg = "#eff6ff"; colour = "#1d4ed8";
    } else {
      headline = "Mastery: " + MASTERY_RUN + " in a row";
      sub = t.a
        ? "The row restarted. Get " + MASTERY_RUN + " right on the first try to master this topic."
        : "Answer " + MASTERY_RUN + " in a row correctly on the first try to master this topic.";
      border = "#e2e8f0"; bg = "#f8fafc"; colour = "#475569";
    }

    els.mastery.style.border = "2px solid " + border;
    els.mastery.style.background = bg;
    els.mastery.innerHTML =
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
        "<div>" + dots + "</div>" +
        '<div style="flex:1;min-width:200px">' +
          '<div style="font-size:1.55rem;font-weight:900;letter-spacing:-.01em;color:' + colour + '">' + headline + "</div>" +
          '<div style="font-size:.95rem;font-weight:600;color:#64748b;margin-top:3px">' + sub + "</div>" +
        "</div>" +
        '<div style="text-align:right;min-width:96px">' +
          '<div style="font-size:.7rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">THIS LESSON</div>' +
          '<div style="font-size:1.3rem;font-weight:900;color:#0f172a">' + masteredCount(e) + " / " + topicIds().length + "</div>" +
          '<div style="font-size:.7rem;font-weight:700;color:#94a3b8">topics mastered</div>' +
        "</div>" +
      "</div>";

    /* Element.animate is missing on older Safari, and a missing flourish
       must never take the panel down with it. */
    if (flash && !reduceMotion() && els.mastery.animate) {
      els.mastery.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }],
        { duration: 420, easing: "ease-out" }
      );
    }
  }

  /* ---------- combo meter ---------- */

  function paintCombo(flash) {
    if (!els.combo) return;
    var n = readCombo();
    var mult = comboMult(n);
    var next = mult === 1 ? COMBO_STEPS[0] : (mult === 2 ? COMBO_STEPS[1] : 0);

    var pips = "";
    var target = next || COMBO_STEPS[1];
    for (var i = 0; i < target; i++) {
      var on = i < n;
      var col = !on ? "#e2e8f0" : (mult === 3 ? "#7c3aed" : (mult === 2 ? "#ea580c" : "#f59e0b"));
      pips += '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;' +
              "margin-right:5px;vertical-align:middle;background:" + col + '"></span>';
    }

    var bd, bg, fg, right;
    if (mult === 3)      { bd = "#c4b5fd"; bg = "#f5f3ff"; fg = "#5b21b6"; }
    else if (mult === 2) { bd = "#fdba74"; bg = "#fff7ed"; fg = "#c2410c"; }
    else if (n > 0)      { bd = "#fde68a"; bg = "#fffbeb"; fg = "#b45309"; }
    else                 { bd = "#e2e8f0"; bg = "#ffffff"; fg = "#94a3b8"; }

    if (!n) {
      right = COMBO_STEPS[0] + " first-try answers in a row doubles your stars";
    } else if (next) {
      right = (next - n) + " more first-try in a row for &times;" + (mult + 1);
    } else {
      right = "Maximum combo &mdash; keep it alive";
    }

    els.combo.style.border = "1px solid " + bd;
    els.combo.style.background = bg;
    els.combo.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<span style="font-size:.7rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">COMBO</span>' +
        '<span style="font-size:1.35rem;font-weight:900;color:' + fg + '">&times;' + mult + "</span>" +
        "<span>" + pips + "</span>" +
        '<span style="flex:1;min-width:170px;font-size:.82rem;font-weight:700;color:' + fg + '">' + right + "</span>" +
        (n ? '<span style="font-size:.78rem;font-weight:700;color:#94a3b8">' + n + " in a row</span>" : "") +
      "</div>";

    if (flash && !reduceMotion() && els.combo.animate) {
      els.combo.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }],
        { duration: 380, easing: "ease-out" }
      );
    }
  }

  function newProblem() {
    var fn = window.generateNewProblem || window.triggerNewQuestion;
    if (typeof fn !== "function") return false;
    fn();
    return true;
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ---------- review queue: a missed topic comes back ---------- */

  function paintReview() {
    if (!els.review) return;
    var e = entry(PAGE_KEY);
    var due = e.queue.filter(function (q) { return e.attempts >= q.dueAt; });

    if (!due.length) { els.review.style.display = "none"; return; }

    var q = due[0];
    var label = e.labels[q.topic] || q.topic;
    els.review.style.display = "block";
    els.review.innerHTML =
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:200px">' +
          '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#c2410c">TIME TO REVISIT</div>' +
          '<div style="font-size:1.1rem;font-weight:800;color:#7c2d12;margin-top:2px">' + esc(label) + "</div>" +
          '<div style="font-size:.9rem;font-weight:600;color:#9a3412;margin-top:2px">You missed this one earlier. Try it again now while it is fresh.</div>' +
        "</div>" +
        '<button id="mcf3m-review-go" style="background:#ea580c;color:#fff;border:0;border-radius:10px;' +
        'padding:11px 18px;font-size:.95rem;font-weight:800;cursor:pointer">Practise it &rarr;</button>' +
      "</div>";

    var btn = document.getElementById("mcf3m-review-go");
    if (btn) btn.addEventListener("click", function () {
      var sel = document.getElementById("topic-select");
      if (sel) sel.value = q.topic;
      newProblem();
    });
  }

  /* ---------- timed challenge ---------- */

  function buildTimerBar() {
    if (!els.timer) return;
    var m = getMeta();

    els.timer.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<button id="mcf3m-timer-toggle" style="border:0;border-radius:10px;padding:9px 16px;' +
        'font-size:.9rem;font-weight:800;cursor:pointer"></button>' +
        '<label style="font-size:.9rem;font-weight:700;color:#475569;display:flex;align-items:center;gap:7px">' +
          "Limit" +
          '<input id="mcf3m-timer-secs" type="number" min="15" max="300" step="5" value="' + m.timerSecs + '" ' +
          'style="width:74px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;font-size:.9rem;font-weight:700">' +
          "sec" +
        "</label>" +
        '<div id="mcf3m-timer-bonus" style="font-size:.85rem;font-weight:800;color:#b45309"></div>' +
        '<div id="mcf3m-timer-read" style="margin-left:auto;font-size:1.25rem;font-weight:900;color:#0f172a;' +
        'font-variant-numeric:tabular-nums"></div>' +
      "</div>" +
      '<div id="mcf3m-timer-note" style="font-size:.82rem;font-weight:600;color:#94a3b8;margin-top:7px"></div>';

    document.getElementById("mcf3m-timer-toggle").addEventListener("click", function () {
      var mm = getMeta();
      mm.timerOn = !mm.timerOn;
      setMeta(mm);
      startTimer();
      paintTimerControls();
    });

    document.getElementById("mcf3m-timer-secs").addEventListener("change", function () {
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 60;
      v = Math.min(300, Math.max(15, v));
      this.value = v;
      var mm = getMeta();
      mm.timerSecs = v;
      setMeta(mm);
      timer.limit = v;
      paintTimerControls();
      paintTimer();
    });

    paintTimerControls();
    paintTimer();
  }

  function paintTimerControls() {
    var m = getMeta();
    var btn = document.getElementById("mcf3m-timer-toggle");
    var bonus = document.getElementById("mcf3m-timer-bonus");
    var note = document.getElementById("mcf3m-timer-note");
    if (!btn) return;

    if (m.timerOn) {
      btn.textContent = "Timed challenge: ON";
      btn.style.background = "#f59e0b"; btn.style.color = "#78350f";
    } else {
      btn.textContent = "Timed challenge: OFF";
      btn.style.background = "#f1f5f9"; btn.style.color = "#64748b";
    }
    if (bonus) bonus.innerHTML = m.timerOn
      ? "Beat the clock for <strong>+" + bonusFor(m.timerSecs) + " &#9733;</strong>"
      : "";
    if (note) note.textContent = m.timerOn
      ? "The clock only controls the bonus. When it runs out the question stays open and you can still answer it."
      : "Optional. Turn it on to earn extra stars for quick answers. A shorter limit is worth more.";
  }

  function paintTimer() {
    var read = document.getElementById("mcf3m-timer-read");
    if (!read) return;

    if (!timer.active) { read.textContent = ""; return; }

    var left = secondsLeft();
    if (left <= 0 && !timer.expired) {
      timer.expired = true;
      stopTimer();
      var note = document.getElementById("mcf3m-timer-note");
      if (note) {
        note.style.color = "#0f766e";
        note.textContent = "Bonus time is up, but the question is still yours. Take as long as you need.";
      }
    }

    if (timer.expired) {
      read.textContent = "no rush";
      read.style.color = "#0d9488";
      read.style.fontSize = "1rem";
    } else {
      read.textContent = Math.floor(left / 60) + ":" + pad(left % 60);
      read.style.fontSize = "1.25rem";
      read.style.color = left <= 10 ? "#dc2626" : "#0f172a";
    }
  }

  /* ---------- corner chip ---------- */

  var chipEl = null;

  function buildChip() {
    var portal = window.MCF3M_PORTAL_URL || "../index.html";
    var box = document.createElement("div");
    box.id = "mcf3m-chip";
    box.style.cssText = [
      "position:fixed", "right:14px", "bottom:14px", "z-index:9999",
      "background:#0f172a", "color:#e2e8f0",
      "font:600 12px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      "padding:10px 13px", "border-radius:12px",
      "box-shadow:0 6px 20px rgba(15,23,42,.28)", "max-width:210px"
    ].join(";");
    box.innerHTML =
      '<div id="mcf3m-chip-body"></div>' +
      '<a href="' + portal + '" style="display:inline-block;margin-top:7px;color:#93c5fd;' +
      'text-decoration:none;font-weight:700">&larr; Back to portal</a>';
    document.body.appendChild(box);
    chipEl = document.getElementById("mcf3m-chip-body");
  }

  function paintChip() {
    if (!chipEl) return;
    if (!available) {
      chipEl.innerHTML = '<span style="color:#fca5a5">Progress can\'t be saved in this browser mode.</span>';
      return;
    }
    var e = entry(PAGE_KEY);
    var m = getMeta();
    var runs = streakRuns(m.days.concat(m.frozen));
    var live = liveRun(runs);
    var who = displayName();

    var out =
      '<div style="color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;font-size:10px">Saved on this device</div>';
    if (who) out += '<div style="margin-top:3px;color:#f8fafc;font-size:13px">' + esc(who) + "</div>";
    /* the title follows them into every lesson, not just the win screen */
    var title = topTitle();
    if (title) out += '<div style="color:#fcd34d;font-weight:800;font-size:11px">' + esc(title) + "</div>";
    out += '<div style="margin-top:5px;color:#fbbf24;font-weight:800">' + m.stars + " &#9733;</div>";
    var cN = readCombo();
    if (cN) out += '<div style="color:#fdba74">Combo: <strong>&times;' + comboMult(cN) + "</strong> (" + cN + " in a row)</div>";
    out += '<div style="color:#cbd5e1">Mastered: <strong style="color:#34d399">' +
           masteredCount(e) + " / " + topicIds().length + "</strong></div>";
    if (live) out += '<div style="color:#cbd5e1">Streak: <strong>' + live.len + " day" + (live.len > 1 ? "s" : "") + "</strong></div>";
    chipEl.innerHTML = out;
  }

  function refreshLessonUI(flash, comboFlash) {
    paintMastery(flash);
    paintCombo(comboFlash);
    paintReview();
    paintChip();
    /* The boss entry panel is the largest thing on the page and the only
       figure on it -- topics mastered -- moves when a topic is mastered.
       Redrawing it after every answer was rebuilding it for nothing. */
    if (flash && bossScreen === "entry" && !activeFight()) renderBossEntry();
  }

  /* ---------- toast for stars earned ---------- */

  var toastsUp = 0;

  function toast(text, colour) {
    var slot = toastsUp++;
    var t = document.createElement("div");
    t.style.cssText =
      "position:fixed;left:50%;top:" + (22 + slot * 56) + "px;transform:translateX(-50%);z-index:10000;" +
      "background:" + (colour || "#0f172a") + ";color:#fff;padding:12px 22px;border-radius:999px;" +
      "font:800 1.05rem system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
      "box-shadow:0 8px 26px rgba(15,23,42,.3);pointer-events:none";
    t.innerHTML = text;
    document.body.appendChild(t);
    window.setTimeout(function () {
      t.style.transition = "opacity .4s, transform .4s";
      t.style.opacity = "0";
      t.style.transform = "translateX(-50%) translateY(-12px)";
      window.setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
        toastsUp = Math.max(0, toastsUp - 1);
      }, 420);
    }, 1500 + slot * 250);
  }

  /* ---------- hooks into the page's own functions ---------- */

  var recordedThisAttempt = false;
  var helpUsedThisQ = false;      /* a hint or a solution step was opened */

  /* Buying help is gated during a boss fight, but the No Hints badge has
     to notice it everywhere. These listeners sit after the fight's own
     capture-phase guard, so a purchase that was refused never counts. */
  function watchHelpButtons() {
    ["hint-btn", "reveal-sol-btn"].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b || b.dataset.mcfWatched) return;
      b.dataset.mcfWatched = "1";
      b.addEventListener("click", function () {
        helpUsedThisQ = true;
        var m = getMeta();
        if (m.cleanRun) { m.cleanRun = 0; setMeta(m); }
      });
    });
  }

  /* Reading the page's own state, so progress works even on pages that
     have no teacher-spreadsheet URL configured. Top-level `let` bindings
     live in the global lexical scope, which window.eval can see. */
  function peek(name) {
    try {
      return window.eval('typeof ' + name + ' !== "undefined" ? ' + name + ' : null');
    } catch (e) { return null; }
  }

  function hookLessonFunctions() {
    var evalFn = window.evaluateStudentAnswer;
    if (typeof evalFn === "function") {
      window.evaluateStudentAnswer = function () {
        recordedThisAttempt = false;
        var r = evalFn.apply(this, arguments);
        if (!recordedThisAttempt) {
          var st = peek("currentState"), pd = peek("currentProblemData");
          if (st && pd && st.selectedMcOption) {
            var right = st.selectedMcOption === (pd.ans || pd.ansLetter);
            var secs = timer.startedAt ? Math.round((Date.now() - timer.startedAt) / 1000) : 0;
            var sel = topicSelect();
            celebrate(record(sel ? sel.value : "unknown", right, st.attempts === 1, secs));
          }
        }
        return r;
      };
    }

    ["generateNewProblem", "triggerNewQuestion"].forEach(function (name) {
      var gen = window[name];
      if (typeof gen !== "function") return;
      window[name] = function () {
        var r = gen.apply(this, arguments);
        helpUsedThisQ = false;
        startTimer();
        refreshLessonUI();
        return r;
      };
    });

    var reveal = window.unlockSolutionPanel;
    if (typeof reveal === "function") {
      window.unlockSolutionPanel = function () {
        timer.forfeited = true;      /* reading the steps gives up the bonus */
        return reveal.apply(this, arguments);
      };
    }
  }

  /* The lesson pages already POST each check to the teacher's sheet.
     We listen in rather than editing their code. */
  function hookAnswerLogging() {
    if (typeof window.fetch !== "function") return;
    var original = window.fetch;

    window.fetch = function (input, init) {
      try {
        if (init && typeof init.body === "string") {
          var data = JSON.parse(init.body);
          if (data && typeof data.isCorrect === "boolean") {
            var _bf = activeFight();
            if (_bf || bonus) {
              data.mode = bonus ? "bonus" : ("boss:" + _bf.kind);
              try { init.body = JSON.stringify(data); } catch (e2) {}
            }
            var secs = timer.startedAt ? Math.round((Date.now() - timer.startedAt) / 1000) : 0;
            recordedThisAttempt = true;
            var res = record(data.questionId, data.isCorrect, data.attempts === 1, secs);
            if (onLesson) celebrate(res);
          }
        }
      } catch (e) { /* not our payload */ }
      return original.apply(this, arguments);
    };
  }

  function announceBadges(res) {
    (res.badges || []).forEach(function (b) {
      toast("Badge earned &mdash; " + b.name + " " + ROMAN[b.tier] +
            "<br><span style=\"font-size:.85rem;font-weight:700;opacity:.85\">" +
            SHOP[b.gift].name + " added to your items</span>", "#7c3aed");
    });
  }

  function celebrate(res) {
    if (res.isCorrect) stopTimer();
    paintCombo(res.comboUp);
    announceBadges(res);

    if (resolveBonus(res.isCorrect, res.firstTry)) return;

    if (activeFight()) {
      var br = bossResolve(res.isCorrect, res.firstTry, res.beatClock);
      if (br) {
        var weak = bossWeak(br.fight.kind, bossTier(br.fight.kind));
        var shot = fireSkill(br.fight, weak);
        saveFight(br.fight);
        artHit(br.dmg, br.heal, br.beaten, shot);
        artHudSync();
        if (br.beaten) {
          var out = finishFight(br.fight);
          showVictory(br.fight, out);
          toast("Boss defeated! &nbsp;+" + out.stars + " \u2605", "#059669");
          announceBadges({ badges: badgeQueue.splice(0) });
        } else {
          bossAwaiting = true;
          renderBoss();
          toast("&minus;" + br.dmg + " HP" + (br.heal ? " &nbsp;boss +" + br.heal : "") +
                (res.mult > 1 ? " &nbsp;&times;" + res.mult + " combo" : "") +
                (shot && shot.staggered ? " &nbsp;STARFALL!" :
                 (shot && shot.weak ? " &nbsp;weak point " + (br.fight.stagger || 0) + "/3" : "")) +
                (br.secondWindUsed ? " &nbsp;Second Wind!" : ""),
                shot && shot.staggered ? "#be123c" : "#dc2626");
        }
      }
      return;
    }

    refreshLessonUI(res.justMastered, res.comboUp);

    var comboTag = res.mult > 1 ? " &nbsp;&times;" + res.mult + " combo" : "";

    if (res.justMastered) {
      toast("&#10003; Topic mastered &nbsp;+" + res.earned + " &#9733;" + comboTag, "#059669");
    } else if (res.comboUp) {
      toast("COMBO &times;" + res.mult + " &nbsp;+" + res.earned + " &#9733;",
            res.mult === 3 ? "#6d28d9" : "#ea580c");
    } else if (res.earned) {
      var msg = "+" + res.earned + " &#9733;" + comboTag;
      if (res.beatClock) msg += " &nbsp;beat the clock!";
      else if (res.firstTry) msg += " &nbsp;first try";
      toast(msg, res.beatClock ? "#d97706" : "#2563eb");
    } else if (res.comboBroke) {
      toast("Combo lost &mdash; start a new one", "#64748b");
    }
  }

  /* ---------- keyboard, on top of touch and mouse ---------- */

  function bindKeyboard() {
    document.addEventListener("keydown", function (ev) {
      var tag = (ev.target && ev.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      var k = ev.key;
      var cards = document.querySelectorAll(".mc-option-card");

      /* A-D or 1-4 pick an option */
      var idx = -1;
      if (/^[a-zA-Z]$/.test(k)) idx = k.toUpperCase().charCodeAt(0) - 65;
      else if (/^[1-9]$/.test(k)) idx = parseInt(k, 10) - 1;

      if (idx >= 0 && idx < cards.length && typeof window.selectMcOptionCard === "function") {
        window.selectMcOptionCard(String.fromCharCode(65 + idx));
        ev.preventDefault();
        return;
      }

      if (k === "Enter") {
        var check = document.getElementById("check-ans-btn");
        if (check && !check.disabled) { check.click(); ev.preventDefault(); }
        return;
      }
      if (k === "n" || k === "N") {
        if (newProblem()) ev.preventDefault();
        return;
      }
      if (k === "h" || k === "H") {
        var hint = document.getElementById("hint-btn");
        if (hint && !hint.disabled) { hint.click(); ev.preventDefault(); }
        return;
      }
      if (k === "s" || k === "S") {
        var sol = document.getElementById("reveal-sol-btn");
        if (sol && !sol.disabled) { sol.click(); ev.preventDefault(); }
      }
    });

    /* only show the hint line on devices that have a keyboard */
    var touchOnly = window.matchMedia && window.matchMedia("(hover: none)").matches;
    if (touchOnly) return;

    var bar = document.querySelector(".quiz-action-bar") || document.querySelector(".selector-box");
    if (!bar || !bar.parentNode) return;
    var legend = document.createElement("div");
    legend.style.cssText = "font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:9px";
    legend.innerHTML = "Keyboard: <strong>A&ndash;D</strong> or <strong>1&ndash;4</strong> choose &nbsp;&middot;&nbsp; " +
      "<strong>Enter</strong> check &nbsp;&middot;&nbsp; <strong>N</strong> new question &nbsp;&middot;&nbsp; " +
      "<strong>H</strong> hint &nbsp;&middot;&nbsp; <strong>S</strong> steps";
    bar.parentNode.insertBefore(legend, bar.nextSibling);
  }

  /* ============================================================
     INDEX PAGE
     ============================================================ */

  /* Our own Continue / weak-topic links are anchors too, so every
     lesson count must exclude anything we injected ourselves. */
  function lessonLinks(scope) {
    return (scope || document).querySelectorAll('main a[href$=".html"]:not([data-mcf3m-ui])');
  }

  function initIndexPage() {
    var links = lessonLinks();
    if (!links.length) return false;
    saveManifest(links);
    syncBadges({ scan: true });   /* the manifest is only readable here, so
                                     Clean Sweep totals are only sound here */
    renderCards(links);
    renderUnitSummaries();
    renderPanel();
    return true;
  }

  function lessonMeta(a) {
    var card = a.closest(".group") || a.parentElement;
    var m = card ? card.textContent.match(/(\d+)\s+Problem Types/i) : null;
    var h3 = card ? card.querySelector("h3") : null;
    return {
      card: card,
      total: m ? parseInt(m[1], 10) : 0,
      title: h3 ? h3.textContent.trim() : (a.textContent || "").trim(),
      key: keyFor(a.getAttribute("href")),
      href: a.getAttribute("href")
    };
  }

  function cardStatus(key, totalTopics) {
    var e = entry(key);
    if (!e.attempts) {
      return { state: e.visits ? "seen" : "new", e: e, mastered: 0 };
    }
    var mastered = masteredCount(e);
    if (totalTopics && mastered >= totalTopics) return { state: "done", e: e, mastered: mastered };
    return { state: "doing", e: e, mastered: mastered };
  }

  var STYLES = {
    "new":   { bg: "#f8fafc", bd: "#e2e8f0", fg: "#64748b", label: "Not started yet" },
    "seen":  { bg: "#f8fafc", bd: "#e2e8f0", fg: "#64748b", label: "Opened, no questions yet" },
    "doing": { bg: "#fffbeb", bd: "#fde68a", fg: "#92400e", label: "In progress" },
    "done":  { bg: "#ecfdf5", bd: "#a7f3d0", fg: "#065f46", label: "All topics mastered" }
  };

  /* The boss system needs to know which files make up a unit,
     and which of them is the practice test. Only the portal can see that. */
  function saveManifest(links) {
    var out = [];
    Array.prototype.forEach.call(links, function (a) {
      var info = lessonMeta(a);
      var det = a.closest("details");
      var sum = det ? det.querySelector("summary") : null;
      var unit = sum ? sum.textContent.replace(/\s+/g, " ").replace(/^[^A-Za-z0-9]+/, "").trim().slice(0, 40) : "";
      out.push({
        key: info.key, href: info.href, title: info.title, total: info.total, unit: unit,
        isTest: /practice\s*test/i.test(info.title) || /practice\s*test/i.test(info.href)
      });
    });
    manifestCache = out;
    save(K_MAP, out);
  }

  function renderCards(links) {
    Array.prototype.forEach.call(links, function (a) {
      var info = lessonMeta(a);
      if (!info.card) return;
      var st = cardStatus(info.key, info.total);
      var s = STYLES[st.state];

      var badge = document.createElement("div");
      badge.className = "mcf3m-badge";
      badge.style.cssText =
        "background:" + s.bg + ";border:1px solid " + s.bd + ";color:" + s.fg +
        ";border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12px;font-weight:700;" +
        "display:flex;align-items:center;justify-content:space-between;gap:8px";

      var right = "";
      if (st.state === "doing" || st.state === "done") {
        right = st.mastered + " / " + (info.total || "?") + " mastered";
      }
      badge.innerHTML =
        "<span>" + (st.state === "done" ? "&#10003; " : "") + s.label + "</span>" +
        '<span style="font-weight:600;opacity:.85">' + right + "</span>";

      var footer = a.parentElement;
      footer.insertBefore(badge, a);

      var bk = /practice\s*test/i.test(info.title) ? "unit" : "lesson";
      var bd = getBoss().cleared[bk + ":" + info.key];
      var breq = requirementFor(bk, info.key);
      var bb = document.createElement("div");
      bb.className = "mcf3m-badge";
      bb.style.cssText = "border-radius:10px;padding:7px 12px;margin-bottom:10px;font-size:12px;font-weight:800;" +
        "display:flex;align-items:center;justify-content:space-between;gap:8px;" +
        (bd ? "background:#0f172a;color:#fbbf24"
            : (breq.have >= breq.need ? "background:#fef2f2;color:#b91c1c;border:1px solid #fecaca"
                                      : "background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0"));
      bb.innerHTML = "<span>" + (bk === "unit" ? "Unit Boss" : "Lesson Boss") + "</span><span>" +
        (bd ? "\u2605".repeat(bd.grade) + " " + bd.questions + "q"
            : (breq.have >= breq.need ? "Ready to fight" : breq.have + " / " + breq.need + " to unlock")) +
        "</span>";
      footer.insertBefore(bb, a);

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
    Array.prototype.forEach.call(document.querySelectorAll("main details"), function (d) {
      var links = d.querySelectorAll('a[href$=".html"]:not([data-mcf3m-ui])');
      if (!links.length) return;

      var started = 0, done = 0;
      Array.prototype.forEach.call(links, function (a) {
        var info = lessonMeta(a);
        var st = cardStatus(info.key, info.total);
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
      pill.textContent = started ? started + " of " + links.length + " practised" : "Not practised yet";
      summary.insertBefore(pill, summary.lastElementChild);
    });
  }

  function renderPanel() {
    var main = document.querySelector("main");
    if (!main) return;
    var panel = document.createElement("div");
    panel.id = "mcf3m-panel";
    panel.className = "bg-white border border-slate-200 rounded-xl p-6 mb-10 shadow-sm";
    /* Above the Welcome box and at its heading size. Tucked under the
       buttons it read as fine print and nobody found it. */
    var door = document.createElement("div");
    door.id = "mcf3m-door";
    door.setAttribute("data-mcf3m-ui", "1");
    door.className = "mb-4";
    door.innerHTML =
      '<a href="' + esc(themeHref()) + '" data-mcf3m-ui="1" ' +
      'class="text-xl font-bold text-[#0f172a] hover:text-blue-600 underline">' +
      esc(T.ui.switch) + "</a>";
    main.insertBefore(door, main.firstChild);

    var welcome = door.nextElementSibling;
    main.insertBefore(panel, welcome ? welcome.nextSibling : null);
    paintPanel(panel);
  }

  function paintPanel(panel) {
    if (!available) {
      panel.innerHTML =
        '<h2 class="text-xl font-bold text-[#0f172a]">Progress saving is off</h2>' +
        '<p class="text-slate-500 text-sm mt-1">This browser is blocking site storage, so your name and ' +
        "practice history can&rsquo;t be kept. Turn off private browsing or allow site data, then reload.</p>";
      return;
    }

    var s = getStudent();
    var who = displayName();
    var m = getMeta();

    panel.innerHTML =
      '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">' +
        "<div>" +
          '<h2 class="text-xl font-bold text-[#0f172a]">' +
            (who ? "Welcome back, " + esc(s.first || who) : "Your name") + "</h2>" +
          '<p class="text-slate-500 text-sm mt-1">' +
            (who ? "Your name fills in automatically on every lesson, and your practice history stays on this device."
                 : "Enter your name once. It will be filled in for you on every lesson from now on.") + "</p>" +
        "</div>" +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<input id="mcf3m-first" type="text" placeholder="First name" autocomplete="off" value="' + esc(s.first) + '" class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36">' +
          '<input id="mcf3m-last" type="text" placeholder="Last name" autocomplete="off" value="' + esc(s.last) + '" class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36">' +
          '<button id="mcf3m-save" class="bg-[#0f172a] hover:bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">Save name</button>' +
        "</div>" +
      "</div>" +
      '<div id="mcf3m-stars" class="mt-5"></div>' +
      '<div id="mcf3m-alert" class="mt-4"></div>' +
      '<div id="mcf3m-menu" class="mt-5"></div>' +
      '<div id="mcf3m-continue" class="mt-5"></div>' +
      '<div id="mcf3m-weak" class="mt-5"></div>' +
      '<div id="mcf3m-streaks" class="mt-5"></div>' +
      '<div id="mcf3m-stats" class="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"></div>';

    farmFinishBonus();
    paintStars(m);
    paintAlert();
    paintMenu();
    paintContinue();
    paintWeak();
    paintStreaks(m);
    paintStats();
    if (m.freezeNotice) { var mm = getMeta(); mm.freezeNotice = ""; setMeta(mm); }

    document.getElementById("mcf3m-save").addEventListener("click", function () {
      setStudent(document.getElementById("mcf3m-first").value.trim(),
                 document.getElementById("mcf3m-last").value.trim());
      paintPanel(panel);
    });
  }

  /* ============================================================
     drawers
     ------------------------------------------------------------
     The shop, the bag, the trophy case, the badges and the save
     code used to be stacked down the portal, all open at once. That
     is a lot of noise before a student has even picked a lesson, so
     they now sit behind buttons and open in a sheet.

     Each drawer creates the very div its painter already looks for
     (#mcf3m-shop and friends), so not one of those painters had to
     change. Only their address did.
     ============================================================ */

  var DRAWERS = [
    { id: "shop",     host: "mcf3m-shop",     label: function () { return T.ui.tabShop;  }, glyph: "\u2605", paint: function () { paintShop(); } },
    { id: "bag",      host: "mcf3m-bag",      label: function () { return T.ui.tabBag;   }, glyph: "\u25C6", paint: function () { paintBag(); } },
    { id: "trophies", host: "mcf3m-trophies", label: function () { return T.ui.tabTroph; }, glyph: "\u2691", paint: function () { paintTrophies(); } },
    { id: "badges",   host: "mcf3m-badges",   label: function () { return T.ui.tabBadge; }, glyph: "\u25CF", paint: function () { paintBadges(); } },
    { id: "code",     host: "mcf3m-code",     label: function () { return T.ui.tabCode;  }, glyph: "\u21BB", paint: function () { paintCode(); } },
    /* only in the farm world; theme-battle and theme-avatar never see it */
    { id: "farm", host: "mcf3m-farm", hidden: true,
      label: function () { return T.ui.tabFarm || "Farm"; }, glyph: "\u2618",
      paint: function () {
        var host = document.getElementById("mcf3m-farm");
        if (host && !document.getElementById("mcf3m-farm-info")) {
          var info = document.createElement("div");
          info.id = "mcf3m-farm-info";
          var deco = document.createElement("div");
          deco.id = "mcf3m-farm-deco";
          host.parentNode.appendChild(info);
          host.parentNode.appendChild(deco);
        }
        artLoad(function () { farmMount(); paintFarmPanel(); paintFarmDeco(); });
      } },

    /* not on the portal menu; opened from the fight itself */
    { id: "arena", host: "mcf3m-arena-win", hidden: true,
      label: function () { return BOSS[art.kind] ? BOSS[art.kind].label : "Fight"; },
      glyph: "\u2694", paint: function () { artMount(); } }
  ];

  /* ------------------------------------------------------------
     One window per drawer, several open at once.

     A student buying something wants to see what they already own,
     so the shop and the bag have to be readable side by side. That
     rules out a single modal sheet: these are windows, not modals.
     They centre on open, cascade so a second one does not hide the
     first, come to the front when clicked, and can be dragged by
     their title bar.

     Narrow screens get none of that. Two floating windows on a phone
     is worse than one, so below the breakpoint each drawer opens as
     a single full-width sheet, exactly as before.
     ------------------------------------------------------------ */

  var WIN_MIN = 780;                 /* below this, one sheet at a time */
  var wins = {};                     /* id -> element */
  var winTop = 9000;
  var winStyled = false;

  function roomy() { return window.innerWidth >= WIN_MIN; }

  function winStyles() {
    if (winStyled) return;
    winStyled = true;
    var s = document.createElement("style");
    s.textContent =
      "#mcf3m-windows{position:fixed;inset:0;z-index:9000;pointer-events:none}" +
      ".mcf3m-win{pointer-events:auto;background:#fff;border-radius:16px;overflow:hidden;" +
        "box-shadow:0 18px 60px rgba(15,23,42,.28);border:1px solid #e2e8f0;display:flex;flex-direction:column}" +
      ".mcf3m-win-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;" +
        "padding:13px 14px 13px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex:0 0 auto}" +
      ".mcf3m-win-title{font-size:1.05rem;font-weight:900;color:#0f172a}" +
      ".mcf3m-win-body{padding:16px 18px 22px;overflow:auto;flex:1 1 auto}" +
      ".mcf3m-win-x{border:0;background:#e2e8f0;color:#334155;border-radius:9px;width:34px;height:34px;" +
        "font-size:1.05rem;font-weight:900;cursor:pointer;line-height:1}" +
      ".mcf3m-win-x:hover{background:#cbd5e1}" +
      ".mcf3m-win-stars{font-size:.9rem;font-weight:900;color:#b45309;white-space:nowrap}" +
      "#mcf3m-scrim{position:fixed;inset:0;z-index:8990;background:rgba(15,23,42,.55)}" +
      "@media (min-width:" + WIN_MIN + "px){.mcf3m-win-bar{cursor:move;user-select:none}}";
    (document.head || document.documentElement).appendChild(s);
  }

  function winHost() {
    var h = document.getElementById("mcf3m-windows");
    if (!h) {
      h = document.createElement("div");
      h.id = "mcf3m-windows";
      h.setAttribute("data-mcf3m-ui", "1");
      document.body.appendChild(h);
    }
    return h;
  }

  function scrim(on) {
    var el = document.getElementById("mcf3m-scrim");
    if (on && !el) {
      el = document.createElement("div");
      el.id = "mcf3m-scrim";
      el.setAttribute("data-mcf3m-ui", "1");
      el.addEventListener("click", closeAllDrawers);
      document.body.appendChild(el);
      document.documentElement.style.overflow = "hidden";
    } else if (!on && el) {
      el.parentNode.removeChild(el);
      document.documentElement.style.overflow = "";
    }
  }

  function openCount() { return Object.keys(wins).length; }

  function closeDrawer(id) {
    var w = wins[id];
    if (!w) return;
    if (id === "arena" && art.cv && art.cv.parentNode) {
      art.cv.parentNode.removeChild(art.cv);   /* back to the lesson page below */
    }
    if (w.parentNode) w.parentNode.removeChild(w);
    delete wins[id];
    if (id === "arena") { renderBoss(); artHudSync(); return; }
    if (!openCount()) {
      scrim(false);
      document.removeEventListener("keydown", drawerKey);
    }
    paintMenu();
  }

  function closeAllDrawers() {
    Object.keys(wins).forEach(closeDrawer);
  }

  function drawerKey(ev) {
    if (ev.key !== "Escape") return;
    var ids = Object.keys(wins);
    if (!ids.length) return;
    /* the one in front goes first */
    var front = ids[0];
    ids.forEach(function (k) {
      if ((+wins[k].style.zIndex || 0) > (+wins[front].style.zIndex || 0)) front = k;
    });
    closeDrawer(front);
  }

  function bringToFront(w) { w.style.zIndex = ++winTop; }

  function place(w, index) {
    if (!roomy()) {
      w.style.cssText += ";position:fixed;left:0;right:0;bottom:0;max-height:88vh;border-radius:16px 16px 0 0";
      return;
    }
    var pad = 16;
    var width = Math.min(560, window.innerWidth - pad * 2);
    w.style.position = "fixed";
    w.style.width = width + "px";
    w.style.maxHeight = "78vh";

    var h = w.offsetHeight || 360;
    var step = (index % 4) * 28;
    var left = Math.round((window.innerWidth - width) / 2) + step;
    var top = Math.round((window.innerHeight - h) / 2) + step;

    w.style.left = Math.max(pad, Math.min(left, window.innerWidth - width - pad)) + "px";
    w.style.top = Math.max(pad, Math.min(top, window.innerHeight - Math.min(h, window.innerHeight - pad * 2) - pad)) + "px";
  }

  function evPoint(ev) {
    var t = ev.touches && ev.touches[0];
    return { x: t ? t.clientX : ev.clientX, y: t ? t.clientY : ev.clientY };
  }

  function draggable(w, bar) {
    var sx = 0, sy = 0, ox = 0, oy = 0, live = false;

    function move(ev) {
      if (!live) return;
      var p = evPoint(ev);
      var nx = ox + (p.x - sx);
      var ny = oy + (p.y - sy);
      var maxX = window.innerWidth - w.offsetWidth - 6;
      var maxY = window.innerHeight - 44;          /* always leave the bar grabbable */
      w.style.left = Math.max(6, Math.min(nx, Math.max(6, maxX))) + "px";
      w.style.top = Math.max(6, Math.min(ny, Math.max(6, maxY))) + "px";
      if (ev.cancelable) ev.preventDefault();
    }

    function up() {
      live = false;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
    }

    function down(ev) {
      if (!roomy()) return;
      if (ev.target.closest && ev.target.closest("button")) return;
      var p = evPoint(ev);
      sx = p.x; sy = p.y;
      ox = parseFloat(w.style.left) || 0;
      oy = parseFloat(w.style.top) || 0;
      live = true;
      bringToFront(w);
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", up);
      if (ev.cancelable) ev.preventDefault();
    }

    bar.addEventListener("mousedown", down);
    bar.addEventListener("touchstart", down, { passive: false });
  }

  function openDrawer(id) {
    var d = null;
    DRAWERS.forEach(function (x) { if (x.id === id) d = x; });
    if (!d) return;

    /* already up: bring it forward rather than stacking a copy */
    if (wins[id]) { bringToFront(wins[id]); return; }

    /* a phone shows one at a time */
    if (!roomy()) closeAllDrawers();

    winStyles();
    var index = openCount();

    var w = document.createElement("div");
    w.className = "mcf3m-win";
    w.setAttribute("data-mcf3m-ui", "1");
    w.innerHTML =
      '<div class="mcf3m-win-bar">' +
        '<span class="mcf3m-win-title">' + esc(d.label()) + "</span>" +
        '<span style="display:flex;align-items:center;gap:10px">' +
          '<span class="mcf3m-win-stars" data-stars="1">' + getMeta().stars + " \u2605</span>" +
          '<button class="mcf3m-win-x" aria-label="Close">\u00d7</button>' +
        "</span>" +
      "</div>" +
      '<div class="mcf3m-win-body"><div id="' + d.host + '"></div></div>';

    winHost().appendChild(w);
    wins[id] = w;
    bringToFront(w);

    d.paint();                    /* size the window around real content */
    place(w, index);
    if (!roomy()) scrim(true);

    w.querySelector(".mcf3m-win-x").addEventListener("click", function () { closeDrawer(id); });
    w.addEventListener("mousedown", function () { if (roomy()) bringToFront(w); });
    draggable(w, w.querySelector(".mcf3m-win-bar"));
    document.addEventListener("keydown", drawerKey);
    paintMenu();
  }

  /* a purchase changes the star count in every open title bar */
  function refreshSheetStars() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-stars]"), function (el) {
      el.textContent = getMeta().stars + " \u2605";
    });
  }

  /* buying in the shop has to show up in an open bag straight away */
  function refreshOpenDrawers(except) {
    Object.keys(wins).forEach(function (id) {
      if (id === except) return;
      DRAWERS.forEach(function (x) { if (x.id === id) x.paint(); });
    });
  }

  function paintMenu() {
    var box = document.getElementById("mcf3m-menu");
    if (!box) return;

    var inv = getInv();
    var carrying = 0;
    Object.keys(inv).forEach(function (k) { if (SHOP[k]) carrying += inv[k] || 0; });

    var m = getMeta();
    var affordable = Object.keys(SHOP).filter(function (k) { return m.stars >= SHOP[k].cost; }).length;

    function dot(count, colour) {
      if (!count) return "";
      return '<span style="min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:' + colour +
        ';color:#fff;font-size:.68rem;font-weight:900;display:inline-flex;align-items:center;justify-content:center">' +
        count + "</span>";
    }

    var buttons = DRAWERS.filter(function (d) {
      if (d.id === "farm") return farmOn();          /* only where it exists */
      return !d.hidden;
    }).map(function (d) {
      var badge = d.id === "shop" ? dot(affordable, "#f59e0b")
                : d.id === "bag"  ? dot(carrying, "#059669") : "";
      var up = !!wins[d.id];
      return '<button data-drawer="' + d.id + '" style="flex:1 1 130px;min-width:120px;display:flex;' +
        'align-items:center;justify-content:center;gap:8px;background:' + (up ? "#e0e7ff" : "#f8fafc") +
        ';border:1px solid ' + (up ? "#a5b4fc" : "#e2e8f0") +
        ';border-radius:12px;padding:13px 12px;font-size:.9rem;font-weight:800;color:#0f172a;cursor:pointer">' +
        '<span style="color:' + (up ? "#4f46e5" : "#94a3b8") + '">' + d.glyph + "</span>" +
        esc(d.label()) + badge + "</button>";
    }).join("");

    box.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:9px">' + buttons + "</div>";

    Array.prototype.forEach.call(box.querySelectorAll("button[data-drawer]"), function (b) {
      b.addEventListener("click", function () { openDrawer(b.getAttribute("data-drawer")); });
    });
  }

  function themeHref() {
    var a = document.querySelector('script[src$="progress.js"]');
    var s = a ? (a.getAttribute("src") || "") : "";
    var cut = s.lastIndexOf("/");
    return (cut < 0 ? "" : s.slice(0, cut + 1)) + "theme.html";
  }

  /* The save-code warning is the one thing that must not go behind a
     button: a student who never takes a code is one cleared history away
     from losing everything. So the nudge stays on the page and only the
     full panel moves into a drawer. */
  function paintAlert() {
    var box = document.getElementById("mcf3m-alert");
    if (!box) return;
    var m = getMeta();
    if (m.backupAt || m.stars < 30) { box.innerHTML = ""; return; }

    box.innerHTML =
      '<div style="border:2px solid #fca5a5;background:#fef2f2;border-radius:12px;padding:12px 14px;' +
        'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div style="font-size:.86rem;font-weight:700;color:#b91c1c">' +
          "You have never saved a code. Clearing this browser&rsquo;s history would erase everything." +
        "</div>" +
        '<button id="mcf3m-alert-go" style="background:#b91c1c;color:#fff;border:0;border-radius:9px;' +
          'padding:9px 16px;font-weight:800;cursor:pointer;white-space:nowrap">' + esc(T.ui.tabCode) + "</button>" +
      "</div>";

    document.getElementById("mcf3m-alert-go").addEventListener("click", function () { openDrawer("code"); });
  }

  /* ---------- the bag ---------- */

  function paintBag() {
    var box = document.getElementById("mcf3m-bag");
    if (!box) return;
    var inv = getInv();

    var held = Object.keys(SHOP).filter(function (k) { return (inv[k] || 0) > 0; });

    if (!held.length) {
      box.innerHTML =
        '<div style="border:2px dashed #e2e8f0;background:#f8fafc;border-radius:12px;padding:26px 18px;' +
          'text-align:center;font-size:.9rem;font-weight:700;color:#94a3b8">' + esc(T.ui.bagEmpty) + "</div>" +
        '<div style="margin-top:10px;text-align:center">' +
          '<button id="mcf3m-bag-shop" style="background:#f59e0b;color:#78350f;border:0;border-radius:9px;' +
            'padding:10px 18px;font-weight:800;cursor:pointer">' + esc(T.ui.tabShop) + "</button></div>";
      var go = document.getElementById("mcf3m-bag-shop");
      if (go) go.addEventListener("click", function () { openDrawer("shop"); });
      return;
    }

    var cards = held.map(function (k) {
      var it = SHOP[k], own = inv[k];
      return '<div style="border:1px solid #a7f3d0;background:#ecfdf5;border-radius:12px;padding:12px 14px;' +
          'flex:1 1 220px;min-width:200px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">' +
          '<span style="font-weight:900;font-size:.95rem;color:#065f46">' + esc(it.name) + "</span>" +
          '<span style="font-size:.85rem;font-weight:900;color:#059669">\u00d7' + own + "</span>" +
        "</div>" +
        '<div style="font-size:.78rem;font-weight:600;color:#047857;margin-top:4px">' + esc(it.desc) + "</div>" +
      "</div>";
    }).join("");

    box.innerHTML =
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">' + T.ui.bagHead + "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' + cards + "</div>" +
      '<div style="font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:8px">' + T.ui.bagNote + "</div>";
  }

  function paintStars(m) {
    var box = document.getElementById("mcf3m-stars");
    if (!box) return;
    box.innerHTML =
      '<div style="display:inline-flex;align-items:baseline;gap:10px;background:#fffbeb;border:1px solid #fde68a;' +
      'border-radius:14px;padding:12px 20px">' +
        '<span style="font-size:2rem;font-weight:900;color:#b45309">' + m.stars + "</span>" +
        '<span style="font-size:1.4rem;color:#f59e0b">&#9733;</span>' +
        '<span style="font-size:.85rem;font-weight:700;color:#92400e">' + T.ui.stars + '</span>' +
      "</div>";
  }

  function paintTrophies() {
    var box = document.getElementById("mcf3m-trophies");
    if (!box) return;

    var titles = earnedTitles();
    var rows = trophyRows();
    var st = careerStats();

    /* ---- titles ---- */
    var titleBlock;
    if (titles.length) {
      titleBlock = titles.map(function (t, i) {
        var big = (i === 0);
        return '<div style="border:2px solid ' + (big ? "#b45309" : "#fde68a") + ";background:" +
            (big ? "linear-gradient(135deg,#78350f,#b45309)" : "#fffbeb") +
            ';border-radius:12px;padding:' + (big ? "13px 18px" : "9px 14px") + ';flex:0 1 auto">' +
          '<div style="font-size:.62rem;font-weight:900;letter-spacing:.1em;color:' +
            (big ? "#fcd34d" : "#b45309") + '">' + (big ? "TITLE" : "ALSO EARNED") + "</div>" +
          '<div style="font-size:' + (big ? "1.35rem" : "1rem") + ';font-weight:900;color:' +
            (big ? "#fffbeb" : "#78350f") + '">' + esc(t.name) + "</div>" +
          '<div style="font-size:.74rem;font-weight:700;color:' + (big ? "#fde68a" : "#a16207") + '">' +
            esc(t.note) + "</div>" +
        "</div>";
      }).join("");
    } else {
      titleBlock =
        '<div style="border:2px dashed #e2e8f0;background:#f8fafc;border-radius:12px;padding:13px 18px">' +
          '<div style="font-size:.62rem;font-weight:900;letter-spacing:.1em;color:#94a3b8">TITLE</div>' +
          '<div style="font-size:1.1rem;font-weight:900;color:#cbd5e1">Not earned yet</div>' +
        "</div>";
    }

    /* ---- one plaque per boss ---- */
    function plaque(r) {
      var won = !!r.rec;
      /* filled versus hollow, not gold versus grey: the difference has to
         survive a colourblind reader and a black-and-white screenshot */
      var stars = won
        ? '<span style="color:#f59e0b">' + "\u2605".repeat(r.rec.grade) +
          "\u2606".repeat(3 - r.rec.grade) + "</span>"
        : '<span style="color:#cbd5e1">' + "\u2606\u2606\u2606" + "</span>";
      var inner =
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">' +
          '<span style="font-size:.58rem;font-weight:900;letter-spacing:.1em;color:' +
            (won ? "#fbbf24" : "#94a3b8") + '">' + r.tag + "</span>" +
          '<span style="font-size:.8rem;letter-spacing:1px">' + stars + "</span>" +
        "</div>" +
        '<div style="font-size:.8rem;font-weight:800;margin-top:3px;color:' +
          (won ? "#f8fafc" : "#94a3b8") + '">' + esc(r.label) + "</div>" +
        '<div style="font-size:.7rem;font-weight:700;margin-top:2px;color:' +
          (won ? "#94a3b8" : "#cbd5e1") + '">' +
          (won ? r.rec.questions + " questions &nbsp;\u00b7&nbsp; +" + r.rec.stars + " \u2605"
               : "still standing") + "</div>";

      var css = "border-radius:11px;padding:10px 12px;flex:1 1 190px;min-width:180px;" +
        "text-decoration:none;display:block;" +
        (won ? "background:#0f172a;border:1px solid #b45309"
             : "background:#f8fafc;border:1px dashed #e2e8f0");

      /* data-mcf3m-ui keeps these out of the lesson count */
      return r.href
        ? '<a href="' + esc(r.href) + '" data-mcf3m-ui="1" style="' + css + '">' + inner + "</a>"
        : '<div style="' + css + '">' + inner + "</div>";
    }

    rows.sort(function (a, b) {
      if (a.final !== b.final) return a.final ? 1 : -1;
      return a.unit - b.unit;
    });
    var beaten = rows.filter(function (r) { return r.rec; }).length;

    /* ---- career line ---- */
    function stat(v, l) {
      return '<span style="display:inline-flex;flex-direction:column;margin-right:22px">' +
        '<span style="font-size:1.15rem;font-weight:900;color:#0f172a">' + v + "</span>" +
        '<span style="font-size:.68rem;font-weight:800;letter-spacing:.06em;color:#94a3b8">' + l + "</span>" +
      "</span>";
    }

    box.innerHTML =
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">TROPHY CASE</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;align-items:stretch">' + titleBlock + "</div>" +
      (function () {
        var hint = nextTitleHint(titles.length > 0);
        return hint
          ? '<div style="font-size:.8rem;font-weight:700;color:#94a3b8;margin-top:7px">' +
            "Next &rarr; " + esc(hint) + "</div>"
          : '<div style="font-size:.8rem;font-weight:800;color:#b45309;margin-top:7px">' +
            "Everything on this wall is yours.</div>";
      })() +
      '<div style="margin-top:12px;display:flex;flex-wrap:wrap;align-items:flex-end">' +
        stat(st.earned, "STARS EARNED") +
        stat(st.beaten, "BOSSES BEATEN") +
        stat(st.perfect, "THREE-STAR") +
        stat(st.fastest === null ? "&mdash;" : st.fastest, "FEWEST QUESTIONS") +
        stat(st.longest, "LONGEST STREAK") +
        stat(st.badges.have + "/" + st.badges.of, "BADGE TIERS") +
      "</div>" +
      '<details style="margin-top:12px">' +
        '<summary style="cursor:pointer;font-size:.82rem;font-weight:800;color:#475569">' +
          "Boss shelf &mdash; " + beaten + " of " + rows.length + " beaten</summary>" +
        '<div style="display:flex;flex-wrap:wrap;gap:9px;margin-top:9px">' +
          rows.map(plaque).join("") +
        "</div>" +
      "</details>";
  }

  function paintBadges() {
    var box = document.getElementById("mcf3m-badges");
    if (!box) return;
    var all = getBadges();
    var tally = badgeTally();

    var cards = Object.keys(BADGES).map(function (id) {
      var cfg = BADGES[id];
      var b = badgeRow(all, id);
      var done = b.tier >= cfg.tiers.length;
      var target = done ? cfg.tiers[cfg.tiers.length - 1] : cfg.tiers[b.tier];
      var pct = Math.min(100, Math.round(b.n / target * 100));

      var pips = cfg.tiers.map(function (t, i) {
        var on = b.tier > i;
        return '<span style="display:inline-block;padding:1px 6px;margin-right:4px;border-radius:5px;' +
          "font-size:.62rem;font-weight:900;letter-spacing:.04em;" +
          (on ? "background:#7c3aed;color:#fff" : "background:#e2e8f0;color:#94a3b8") + '">' +
          ROMAN[i + 1] + "</span>";
      }).join("");

      var bd = b.tier ? "#c4b5fd" : "#e2e8f0";
      var bg = b.tier ? "#f5f3ff" : "#f8fafc";

      return '<div style="border:1px solid ' + bd + ";background:" + bg + ';border-radius:12px;' +
          'padding:12px 14px;flex:1 1 220px;min-width:210px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">' +
          '<span style="font-weight:900;font-size:.92rem;color:#0f172a">' + cfg.name + "</span>" +
          "<span>" + pips + "</span>" +
        "</div>" +
        '<div style="font-size:.76rem;font-weight:600;color:#64748b;margin-top:4px;min-height:32px">' +
          cfg.desc + "</div>" +
        '<div style="background:#e2e8f0;border-radius:999px;height:7px;overflow:hidden;margin-top:8px">' +
          '<div style="width:' + pct + '%;height:100%;background:' + (done ? "#7c3aed" : "#a78bfa") + '"></div>' +
        "</div>" +
        '<div style="display:flex;justify-content:space-between;gap:6px;margin-top:5px">' +
          '<span style="font-size:.74rem;font-weight:800;color:#6d28d9">' +
            b.n + " / " + target + " " + cfg.unit + "</span>" +
          '<span style="font-size:.74rem;font-weight:700;color:#94a3b8">' +
            (done ? "all three earned" : "next: " + SHOP[cfg.gives[b.tier]].name) + "</span>" +
        "</div>" +
      "</div>";
    }).join("");

    box.innerHTML =
      '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">' +
        '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">BADGES</div>' +
        '<div style="font-size:.82rem;font-weight:700;color:#64748b">' +
          tally.have + " of " + tally.of + " earned</div>" +
      "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' + cards + "</div>" +
      '<div style="font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:6px">' +
        "Badges cannot be bought. Every tier you reach hands you a shop item for free.</div>";
  }

  /* Skills are permanent, so they sit apart from the four items above,
     which are spent. Locked rows stay visible: knowing what the next boss
     opens up is half the reason to go and fight it. */
  function paintSkillShop() {
    var box = document.getElementById("mcf3m-skillshop");
    if (!box) return;
    var s = getSkill(), m = getMeta(), open = farmWaves();
    var GATE_NAME = { W0: "", W1: "Unit boss 1", W2: "Unit boss 2", W3: "Unit boss 3",
                      W4: "Unit boss 4", F: "the final boss", LS: "the Last Stand" };

    var rows = Object.keys(SKILLS).map(function (k) {
      var it = SKILLS[k], own = !!s.owned[k], unlocked = !!open[it.gate];
      var award = it.cost === 0;
      var afford = m.stars >= it.cost;
      var can = unlocked && !own && !award && afford;

      var tag = own ? '<span style="font-size:.75rem;font-weight:800;color:#059669">owned</span>'
        : !unlocked ? '<span style="font-size:.75rem;font-weight:800;color:#94a3b8">opens after ' +
                      GATE_NAME[it.gate] + "</span>"
        : award ? '<span style="font-size:.75rem;font-weight:800;color:#be123c">awarded</span>' : "";

      return '<div style="border:1px solid ' + (can ? "#fde68a" : "#e2e8f0") + ";background:" +
        (own ? "#f0fdf4" : can ? "#fffbeb" : "#f8fafc") + ';border-radius:12px;padding:12px 14px;' +
        "flex:1 1 210px;min-width:200px;opacity:" + (unlocked ? "1" : ".6") + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">' +
          '<span style="font-weight:800;font-size:.92rem;color:' + EL_COL[it.el] + '">' +
            esc(it.name) + "</span>" + tag + "</div>" +
        '<div style="font-size:.7rem;font-weight:800;letter-spacing:.06em;color:#94a3b8;margin-top:2px">' +
          EL_NAME[it.el].toUpperCase() + "</div>" +
        '<div style="font-size:.78rem;font-weight:600;color:#64748b;margin-top:4px;min-height:46px">' +
          esc(it.desc) + "</div>" +
        (own || award ? "" :
          '<button data-skillbuy="' + k + '" ' + (can ? "" : "disabled ") +
          'style="margin-top:8px;width:100%;border:0;border-radius:8px;padding:8px;font-weight:800;cursor:' +
          (can ? "pointer" : "not-allowed") + ";background:" + (can ? "#f59e0b" : "#e2e8f0") +
          ";color:" + (can ? "#78350f" : "#94a3b8") + '">' + it.cost + " \u2605</button>") +
      "</div>";
    }).join("");

    box.innerHTML =
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8;margin-top:16px">SKILLS</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' + rows + "</div>" +
      '<div style="font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:6px">' +
        "Bought once and kept. A skill changes how your attack looks and how the " +
        "damage arrives, never how much of it lands. Every boss is weak to one " +
        "element \u2014 hit that weakness three times to set off Starfall.</div>";

    Array.prototype.forEach.call(box.querySelectorAll("button[data-skillbuy]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-skillbuy"), it = SKILLS[k], mm = getMeta();
        if (mm.stars < it.cost) return;
        var st = getSkill();
        if (st.owned[k]) return;
        addStars(-it.cost);
        st.owned[k] = 1; setSkill(st);
        paintStars(getMeta()); paintShop(); refreshSheetStars();
        refreshOpenDrawers("shop"); paintMenu();
        toast(it.name + " learned", "#059669");
      });
    });
  }

  function paintShop() {
    var box = document.getElementById("mcf3m-shop");
    if (!box) return;
    var inv = getInv(), m = getMeta();

    var cards = Object.keys(SHOP).map(function (k) {
      var it = SHOP[k], own = inv[k] || 0;
      var afford = m.stars >= it.cost;
      return '<div style="border:1px solid ' + (afford ? "#fde68a" : "#e2e8f0") + ';background:' +
        (afford ? "#fffbeb" : "#f8fafc") + ';border-radius:12px;padding:12px 14px;flex:1 1 200px;min-width:190px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">' +
          '<span style="font-weight:800;font-size:.92rem;color:#0f172a">' + it.name + "</span>" +
          (own ? '<span style="font-size:.75rem;font-weight:800;color:#059669">owned \u00d7' + own + "</span>" : "") +
        "</div>" +
        '<div style="font-size:.78rem;font-weight:600;color:#64748b;margin-top:4px;min-height:34px">' + it.desc + "</div>" +
        '<button data-buy="' + k + '" ' + (afford ? "" : "disabled ") +
          'style="margin-top:8px;width:100%;border:0;border-radius:8px;padding:8px;font-weight:800;cursor:' +
          (afford ? "pointer" : "not-allowed") + ';background:' + (afford ? "#f59e0b" : "#e2e8f0") +
          ";color:" + (afford ? "#78350f" : "#94a3b8") + '">' + it.cost + " \u2605</button>" +
      "</div>";
    }).join("");

    box.innerHTML =
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">' + T.ui.shopHead + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' + cards + "</div>" +
      '<div style="font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:6px">' + T.ui.shopNote + "</div>" +
      (farmOn() ? "" : '<div id="mcf3m-skillshop"></div>') +
      (farmOn() ? '<div id="mcf3m-farmshop"></div>' : "");

    if (farmOn()) paintFarmShop(); else paintSkillShop();

    Array.prototype.forEach.call(box.querySelectorAll("button[data-buy]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-buy"), it = SHOP[k], mm = getMeta();
        if (mm.stars < it.cost) return;
        addStars(-it.cost);
        var iv = getInv(); iv[k] = (iv[k] || 0) + 1; setInv(iv);
        paintStars(getMeta()); paintShop(); refreshSheetStars();
        refreshOpenDrawers("shop"); paintMenu();
        toast(it.name + " purchased", "#059669");
      });
    });
  }

  /* pick up where they left off */
  function paintContinue() {
    var box = document.getElementById("mcf3m-continue");
    if (!box) return;
    var best = null;
    Array.prototype.forEach.call(lessonLinks(), function (a) {
      var info = lessonMeta(a);
      var e = entry(info.key);
      if (!e.lastAt) return;
      var st = cardStatus(info.key, info.total);
      if (st.state === "done") return;
      if (!best || e.lastAt > best.at) best = { at: e.lastAt, info: info };
    });
    if (!best) { box.innerHTML = ""; return; }
    box.innerHTML =
      '<a href="' + esc(best.info.href) + '" data-mcf3m-ui="1" style="display:inline-flex;align-items:center;gap:10px;' +
      'background:#0f172a;color:#fff;border-radius:12px;padding:12px 20px;text-decoration:none;font-weight:800">' +
        '<span style="font-size:.72rem;letter-spacing:.09em;color:#93c5fd">CONTINUE</span>' +
        "<span>" + esc(best.info.title) + " &rarr;</span>" +
      "</a>";
  }

  /* the topics that need work, named properly */
  function paintWeak() {
    var box = document.getElementById("mcf3m-weak");
    if (!box) return;
    var found = [];
    Array.prototype.forEach.call(lessonLinks(), function (a) {
      var info = lessonMeta(a);
      var e = entry(info.key);
      var w = weakestTopic(e);
      if (w) found.push({ w: w, info: info });
    });
    if (!found.length) { box.innerHTML = ""; return; }

    found.sort(function (x, y) { return x.w.rate - y.w.rate; });
    var rows = found.slice(0, 3).map(function (f) {
      return '<a href="' + esc(f.info.href) + '" data-mcf3m-ui="1" style="display:flex;align-items:center;gap:12px;text-decoration:none;' +
        'background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;margin-top:8px">' +
        '<span style="flex:1;min-width:0">' +
          '<span style="display:block;font-size:.92rem;font-weight:800;color:#7c2d12">' + esc(f.w.label) + "</span>" +
          '<span style="display:block;font-size:.78rem;font-weight:600;color:#9a3412">' + esc(f.info.title) + "</span>" +
        "</span>" +
        '<span style="font-size:.85rem;font-weight:800;color:#c2410c;white-space:nowrap">' +
          f.w.c + " / " + f.w.a + " right</span>" +
        '<span style="color:#ea580c;font-weight:800">&rarr;</span>' +
      "</a>";
    }).join("");

    box.innerHTML =
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">WORK ON THESE NEXT</div>' + rows;
  }

  /* the shelf: every streak you have ever built, kept for good */
  function paintStreaks(m) {
    var box = document.getElementById("mcf3m-streaks");
    if (!box) return;

    var runs = streakRuns(m.days.concat(m.frozen));
    if (!runs.length) {
      box.innerHTML =
        '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">STREAKS</div>' +
        '<div style="font-size:.9rem;font-weight:600;color:#94a3b8;margin-top:6px">' +
        "Answer a question today to start your first streak.</div>";
      return;
    }

    var live = liveRun(runs);
    var longest = runs.reduce(function (a, b) { return b.len > a.len ? b : a; });
    var shown = runs.filter(function (r) { return r.len >= 2 || r === live; });
    var hidden = runs.length - shown.length;
    if (shown.length > 14) { hidden += shown.length - 14; shown = shown.slice(-14); }

    var chips = shown.map(function (r) {
      var isLive = (r === live);
      var isBest = (r === longest && r.len > 1);
      var bg = isLive ? "#dbeafe" : "#f1f5f9";
      var bd = isLive ? "#93c5fd" : "#e2e8f0";
      var fg = isLive ? "#1d4ed8" : "#475569";
      return '<span style="display:inline-flex;flex-direction:column;align-items:center;background:' + bg +
        ";border:1px solid " + bd + ';border-radius:12px;padding:8px 12px;margin:0 8px 8px 0">' +
        '<span style="font-size:1.15rem;font-weight:900;color:' + fg + '">' + r.len + (isBest ? " &#9733;" : "") + "</span>" +
        '<span style="font-size:.66rem;font-weight:800;letter-spacing:.05em;color:' + fg + ';opacity:.75">' +
          (r.len === 1 ? "DAY" : "DAYS") + "</span>" +
        '<span style="font-size:.66rem;font-weight:600;color:#94a3b8;margin-top:2px">' +
          prettyDay(r.start) + (r.len > 1 ? "&ndash;" + prettyDay(r.end) : "") + "</span>" +
      "</span>";
    }).join("");

    var total = m.days.length;
    box.innerHTML =
      '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">' +
        '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">STREAKS</div>' +
        '<div style="font-size:.82rem;font-weight:700;color:#64748b">' +
          (live ? "Running: " + live.len + " day" + (live.len > 1 ? "s" : "") + " &nbsp;&middot;&nbsp; " : "") +
          "Longest: " + longest.len + " &nbsp;&middot;&nbsp; " + total + " day" + (total > 1 ? "s" : "") + " practised" +
        "</div>" +
      "</div>" +
      '<div style="margin-top:9px">' + chips +
        (hidden > 0 ? '<span style="font-size:.78rem;font-weight:700;color:#94a3b8">+' + hidden + " more</span>" : "") +
      "</div>" +
      '<div style="font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:2px">' +
        "A break never erases a streak &mdash; it just finishes one and lets the next begin." +
        (m.frozen.length ? " &nbsp;" + m.frozen.length + " day" + (m.frozen.length > 1 ? "s" : "") +
          " bridged by a Streak Freeze." : "") + "</div>" +
      (m.freezeNotice ? '<div style="margin-top:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;' +
        'padding:9px 13px;font-size:.85rem;font-weight:700;color:#1d4ed8">' +
        "A Streak Freeze covered " + esc(prettyDay(m.freezeNotice)) + " &mdash; your run is still alive.</div>" : "");
  }

  function paintStats() {
    var box = document.getElementById("mcf3m-stats");
    if (!box) return;
    var links = lessonLinks();
    var started = 0, done = 0, attempts = 0, correct = 0, mastered = 0, topics = 0;

    Array.prototype.forEach.call(links, function (a) {
      var info = lessonMeta(a);
      var st = cardStatus(info.key, info.total);
      if (st.state === "doing" || st.state === "done") started++;
      if (st.state === "done") done++;
      attempts += st.e.attempts;
      correct += st.e.correct;
      mastered += st.mastered;
      topics += info.total;
    });

    box.innerHTML =
      '<span class="text-slate-700 font-semibold">Lessons practised: <span class="text-blue-600">' + started + " of " + links.length + "</span></span>" +
      '<span class="text-slate-700 font-semibold">Topics mastered: <span class="text-emerald-600">' + mastered + " of " + topics + "</span></span>" +
      '<span class="text-slate-700 font-semibold">Questions answered: <span class="text-blue-600">' + attempts + "</span></span>" +
      '<span class="text-slate-700 font-semibold">Correct: <span class="text-emerald-600">' + correct + "</span></span>" +
      '<button id="mcf3m-reset" class="ml-auto text-slate-400 hover:text-red-600 text-xs font-bold underline">Clear my saved progress</button>';

    var btn = document.getElementById("mcf3m-reset");
    if (btn) btn.addEventListener("click", function () {
      if (window.confirm("This clears your name, stars, streaks, items and every beaten boss on this device, and it cannot be undone.\n\nIf you have not taken a save code yet, cancel and press \"Show my code\" first.\n\nClear everything?")) {
        resetAll();
        window.location.reload();
      }
    });
  }

  /* ============================================================
     BOSS BATTLES
     ------------------------------------------------------------
     lesson boss  : inside each lesson file        HP 100
     unit boss    : inside each practice test      HP 150
     course final : 4 phases, one per practice
                    test file, then a Last Stand   HP 50 x4 + 25

     Damage   correct (retry)            5
              first try                 10
              first try inside timer    15
              a bought solution step  halved
              after 20 questions      doubled
     Heal     first missed question     +1
              then every 2 misses in a row +1
     ============================================================ */

  var K_BOSS = NS + ".boss";
  var K_INV  = NS + ".inv";
  var K_MAP  = NS + ".manifest";

  /* hp / par / reward are balance, not theme: they stay here so a
     reskin can never quietly make a boss easier. Only the label moves. */
  var BOSS = {
    lesson: { hp: 100, par: 10, reward: 20, label: T.boss.lesson },
    unit:   { hp: 150, par: 15, reward: 40, label: T.boss.unit },
    final:  { hp: 50,  par: 5,  reward: 30, label: T.boss.final },
    stand:  { hp: 25,  par: 4,  reward: 150, label: T.boss.stand }
  };

  var SHOP = T.shop;

  /* ------------------------------------------------------------
     skills — what the hero's attack looks like

     A skill never changes how much damage lands. It decides how that
     damage is delivered and drawn, so nothing on this shelf can quietly
     make a boss easier or harder than it was balanced to be.
     ------------------------------------------------------------ */

  var K_SKILL = NS + ".skill";

  var SKILLS = {
    slash: { name: "Triple Slash",  el: "steel", cost: 180, gate: "W0",
             desc: "Three cuts instead of one \u2014 thrust, overhead, side." },
    bolt:  { name: "Thunderstrike", el: "storm", cost: 240, gate: "W1",
             desc: "Lightning straight down. For a moment you see the bones." },
    ice:   { name: "Frostbind",     el: "frost", cost: 260, gate: "W2",
             desc: "Crystals seal it in ice, then the ice comes apart." },
    fire:  { name: "Pyre",          el: "ember", cost: 300, gate: "W3",
             desc: "A pillar of fire from under its feet. It comes back charred." },
    wind:  { name: "Galecut",       el: "gale",  cost: 320, gate: "W4",
             desc: "Three crescent blades pass straight through it." },
    hole:  { name: "Singularity",   el: "void",  cost: 400, gate: "F",
             desc: "A collapsing star opens in front of it. Something has to give." },
    nova:  { name: "Starfall",      el: "*",     cost: 0,   gate: "LS",
             desc: "Every skill you own, one after the other. Awarded, never sold." }
  };

  var EL_NAME = { steel: "Steel", storm: "Storm", frost: "Frost",
                  ember: "Ember", gale: "Gale", "void": "Void", "*": "All" };
  var EL_COL  = { steel: "#a16207", storm: "#7e22ce", frost: "#0284c7",
                  ember: "#ea580c", gale: "#047857", "void": "#4c1d95", "*": "#be123c" };

  function getSkill() {
    var s = load(K_SKILL, null) || {};
    if (!s.owned) s.owned = { slash: 1 };      /* the first cut comes free */
    if (!s.mode) s.mode = "auto";
    if (!s.pick) s.pick = "slash";
    return s;
  }
  function setSkill(s) { return save(K_SKILL, s); }

  function ownedSkills() {
    var s = getSkill(), out = [];
    if (!s.owned.nova && farmWaves().LS) { s.owned.nova = 1; setSkill(s); }
    Object.keys(SKILLS).forEach(function (k) { if (s.owned[k]) out.push(k); });
    return out;
  }

  /* Bosses come back better equipped. The tier is counted off the clear
     record rather than stored, for the same reason the farm counts its
     waves that way: a restored code has to bring it along. */
  function bossTier(kind) {
    var cl = getBoss().cleared || {}, lessons = 0, units = 0;
    Object.keys(cl).forEach(function (k) {
      if (k.indexOf("lesson:") === 0) lessons++;
      else if (k.indexOf("unit:") === 0) units++;
    });
    if (kind === "lesson") return Math.min(3, Math.floor(lessons / 4));
    return Math.min(3, units);          /* unit, final and stand all follow units */
  }
  var TIER_TAG = ["", "Mk II", "Mk III", "Mk IV"];

  var WEAK_ORDER = ["ember", "frost", "storm", "gale", "void"];
  function bossWeak(kind, tier) {
    var base = { lesson: 0, unit: 1, final: 2, stand: 3 }[kind] || 0;
    return WEAK_ORDER[(base + tier) % WEAK_ORDER.length];
  }

  /* Decides which skill fires, and moves the stagger charge along.
     Hitting the weakness three times sets off Starfall; it does not add
     damage, it collects what the hits were already doing into one blow. */
  function fireSkill(f, weak) {
    var s = getSkill(), own = ownedSkills();
    if (!own.length) return null;
    var ready = (f.stagger || 0) >= 3 && own.indexOf("nova") >= 0;
    var key;
    if (ready) key = "nova";
    else if (s.mode === "manual" && s.owned[s.pick]) key = s.pick;
    else {
      s.turn = ((s.turn || 0) + 1) % own.length;
      setSkill(s);
      key = own[s.turn];
    }
    var el = SKILLS[key].el;
    if (ready) f.stagger = 0;
    else if (el === weak) f.stagger = Math.min(3, (f.stagger || 0) + 1);
    return { key: key, el: el, weak: el === weak, staggered: ready };
  }

  function packSkill() {
    var s = getSkill();
    return { o: ownedSkills(), m: s.mode, p: s.pick };
  }
  function applySkill(d) {
    if (!d) return;                     /* codes cut before skills existed */
    var s = getSkill();
    (d.o || []).forEach(function (k) { if (SKILLS[k]) s.owned[k] = 1; });
    if (d.m === "auto" || d.m === "manual") s.mode = d.m;
    if (d.p && SKILLS[d.p]) s.pick = d.p;
    setSkill(s);
  }

  var HINT_NUDGE = 10;
  var STEP_COST = [25, 40, 60];
  var ENTRY_PER_TOPIC = 30;
  var KEY_COST = 200;

  function getBoss() { return load(K_BOSS, { cleared: {} }); }
  function setBoss(b) { return save(K_BOSS, b); }
  function getInv()  { return load(K_INV, {}); }
  function setInv(i) { return save(K_INV, i); }
  /* The manifest is read on nearly every badge check, and parsing it
     eighteen times per answer was the single most expensive thing on the
     page. It only changes when the portal rebuilds it. */
  var manifestCache = null;
  function getManifest() {
    if (!manifestCache) manifestCache = load(K_MAP, []);
    return manifestCache;
  }

  function activeFight() {
    var b = getBoss();
    return b.active || null;
  }

  function saveFight(f) {
    var b = getBoss();
    if (f) b.active = f; else delete b.active;
    setBoss(b);
  }

  /* ---------- which lessons belong to which unit ---------- */

  /* Keys are file names now, so a unit is read from the portal's own
     grouping, with the file name as a fallback. */
  function unitOf(key) {
    var m = mapEntry(key);
    if (m && m.unit) return m.unit.toLowerCase();
    var f = String(key).match(/unit\s*(\d+)/i);
    return f ? "unit " + f[1] : "";
  }

  /* Every lesson file in the same unit, minus practice tests. */
  function unitLessons(key) {
    var u = unitOf(key);
    if (!u) return [];
    return getManifest().filter(function (m) {
      return !m.isTest && unitOf(m.key) === u;
    });
  }

  function allLessons() {
    return getManifest().filter(function (m) { return !m.isTest; });
  }

  function practiceTests() {
    return getManifest().filter(function (m) { return m.isTest; });
  }

  /* ---------- entry requirement ---------- */

  function requirementFor(kind, key) {
    var scope, label;
    if (kind === "lesson") {
      var e = entry(key);
      var n = topicIds().length || (mapEntry(key) ? mapEntry(key).total : 0);
      return { have: masteredCount(e), need: Math.ceil(n / 2), of: n, label: "this lesson" };
    }
    scope = (kind === "unit") ? unitLessons(key) : allLessons();
    label = (kind === "unit") ? "this unit's lessons" : "the whole course";
    var have = 0, of = 0;
    scope.forEach(function (m) {
      have += masteredCount(entry(m.key));
      of += m.total || 0;
    });
    return { have: have, need: Math.ceil(of / 2), of: of, label: label };
  }

  function mapEntry(key) {
    var m = getManifest();
    for (var i = 0; i < m.length; i++) if (m[i].key === key) return m[i];
    return null;
  }

  function entryPassPrice(req) {
    return Math.max(1, req.need - req.have) * ENTRY_PER_TOPIC;
  }

  /* ---------- picking the next question ---------- */

  /* Weighted so the topics the student misses most come up more,
     but every topic keeps a real chance of appearing. */
  function pickTopic(fight) {
    var ids = topicIds();
    if (!ids.length) return null;
    var e = entry(PAGE_KEY);

    if (fight.kind === "final" || fight.kind === "stand") {
      return ids[Math.floor(Math.random() * ids.length)];   /* even coverage */
    }

    var weights = ids.map(function (id) {
      var t = e.topics[id];
      if (!t || !t.a) return 2;                 /* never tried: normal weight */
      var missRate = 1 - (t.c / t.a);
      var w = 1 + missRate * 5;                 /* 1 .. 6 */
      if (t.mastered) w *= 0.5;
      return w;
    });

    /* avoid the same topic three times running */
    var last = fight.recent || [];
    ids.forEach(function (id, i) {
      if (last.length >= 2 && last[last.length - 1] === id && last[last.length - 2] === id) weights[i] = 0.01;
    });

    var sum = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * sum;
    for (var i = 0; i < ids.length; i++) { r -= weights[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }

  /* ---------- starting / ending a fight ---------- */

  function bossId(kind, key) { return kind + ":" + key; }

  function allUnitBossesCleared() {
    var tests = practiceTests();
    if (tests.length < 2) return false;
    var b = getBoss();
    return tests.every(function (t) { return !!b.cleared["unit:" + t.key]; });
  }

  function standHost() {          /* the file where the 4th phase fell */
    var s = finalState();
    return s.done.length >= practiceTests().length ? s.done[s.done.length - 1] : null;
  }

  function startFight(kind, opts) {
    opts = opts || {};
    var cfg = BOSS[kind];
    var f = {
      kind: kind,
      key: PAGE_KEY,
      id: opts.id || bossId(kind, PAGE_KEY),
      phaseTotal: practiceTests().length || 4,
      hp: cfg.hp, maxHp: cfg.hp, par: cfg.par,
      unitLabel: (mapEntry(PAGE_KEY) || {}).unit || "",
      questions: 0, missRun: 0, misses: 0, firstMissDone: false,
      phase: opts.phase || 0,
      powerCore: 0, starLens: false, secondWind: false,
      stepsBought: 0, nudgeBought: false, stepUsedThisQ: false,
      startedAt: Date.now(), recent: [], damageLog: []
    };
    saveFight(f);
    nextBossQuestion();
    renderBoss();
  }

  function nextBossQuestion() {
    var f = activeFight();
    if (!f) return;
    var sel = topicSelect();
    var topic = pickTopic(f);
    if (sel && topic) sel.value = topic;
    f.stepUsedThisQ = false;
    f.nudgeBought = false;
    saveFight(f);
    bossAwaiting = false;
    newProblem();
    renderBoss();
  }

  function damageFor(f, firstTry, beatClock) {
    var d = firstTry ? (beatClock ? 15 : 10) : 5;
    if (f.stepUsedThisQ) d = Math.round(d / 2);
    if (f.powerCore > 0) d *= 2;
    if (f.questions > 20) d *= 2;
    return d;
  }

  /* called from the normal answer-recording path when a fight is on */
  var STAND_HEAL_UNTIL = 12;   /* after this the boss is too tired to recover */

  function bossResolve(isCorrect, firstTry, beatClock) {
    var f = activeFight();
    if (!f || f.paused) return null;        /* a paused fight is just practice */
    if (!isCorrect) return null;            /* the page only locks on correct */

    f.questions += 1;
    var used = false;

    if (!firstTry && f.secondWind) {        /* spend the artifact */
      firstTry = true; f.secondWind = false; used = true;
    }

    var dmg, heal = 0;

    if (f.kind === "stand") {
      /* Only a clean first-try answer lands. A miss lets the boss
         recover 5 - but only for the first 12 questions, so nobody
         can be locked out forever. */
      dmg = firstTry ? 10 : 0;
      if (f.stepUsedThisQ) dmg = Math.round(dmg / 2);
      if (f.powerCore > 0) { dmg *= 2; f.powerCore -= 1; }
      f.hp -= dmg;
      if (!firstTry) {
        f.misses += 1;
        f.missRun += 1;
        if (f.questions <= STAND_HEAL_UNTIL) {
          heal = 5;
          f.hp = Math.min(f.maxHp, f.hp + heal);
        }
      } else {
        f.missRun = 0;
      }
    } else {
      dmg = damageFor(f, firstTry, beatClock);
      if (f.powerCore > 0) f.powerCore -= 1;
      f.hp -= dmg;

      if (!firstTry) {
        f.misses += 1;
        f.missRun += 1;
        if (!f.firstMissDone) { heal = 1; f.firstMissDone = true; f.missRun = 0; }
        else if (f.missRun >= 2) { heal = 1; f.missRun = 0; }
        f.hp += heal;
      } else {
        f.missRun = 0;
      }
    }

    f.recent.push(currentTopic());
    if (f.recent.length > 4) f.recent.shift();
    f.damageLog.push({ d: dmg, h: heal, ft: firstTry });
    if (f.damageLog.length > 30) f.damageLog.shift();

    var beaten = f.hp <= 0;
    if (beaten) f.hp = 0;
    saveFight(f);
    return { dmg: dmg, heal: heal, beaten: beaten, secondWindUsed: used, fight: f };
  }

  function gradeFor(f) {
    if (f.questions <= Math.ceil(f.par * 1.2)) return 3;
    if (f.questions <= Math.ceil(f.par * 1.6)) return 2;
    return 1;
  }

  function finishFight(f) {
    var cfg = BOSS[f.kind];
    var grade = gradeFor(f);
    var mult = grade === 3 ? 2 : (grade === 2 ? 1.5 : 1);
    var stars = Math.round(cfg.reward * mult * (f.starLens ? 2 : 1));
    addStars(stars);

    var b = getBoss();
    var prev = b.cleared[f.id];
    if (!prev || grade > prev.grade || (grade === prev.grade && f.questions < prev.questions)) {
      b.cleared[f.id] = { grade: grade, questions: f.questions, stars: stars, at: Date.now() };
    }
    delete b.active;
    setBoss(b);
    syncBadges({ scan: true });
    window.setTimeout(hudHide, 1400);   /* let the boss finish dissolving first */
    return { grade: grade, stars: stars };
  }

  /* ---------- the final boss moves from unit to unit ---------- */

  function finalState() {
    var b = getBoss();
    return b.final || { phase: 0, done: [] };
  }
  function setFinalState(s) {
    var b = getBoss(); b.final = s; setBoss(b);
  }

  function finalNextTarget() {
    var s = finalState();
    var tests = practiceTests();
    for (var i = 0; i < tests.length; i++) {
      if (s.done.indexOf(tests[i].key) === -1) return tests[i];
    }
    return null;                              /* all four phases cleared */
  }

  /* ---------- the course-wide final boss ---------- */

  function finalReq() {
    var have = 0, of = 0;
    allLessons().forEach(function (m) { have += masteredCount(entry(m.key)); of += m.total || 0; });
    return { have: have, need: Math.ceil(of / 2), of: of, label: "the whole course" };
  }

  function renderFinalBlock(box) {
    if (bossKindHere() !== "unit") return;      /* the final only lives in practice tests */
    if (!allUnitBossesCleared() && !devActive()) return;

    var st = finalState();
    var tests = practiceTests();
    var wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:14px;padding:14px;border:2px solid #7f1d1d;background:#450a0a;" +
      "border-radius:12px;color:#fecaca";

    var host = standHost();
    var b = getBoss();

    if (host && host === PAGE_KEY && !b.cleared["stand"]) {
      wrap.innerHTML =
        '<div style="font-size:1.2rem;font-weight:900;color:#fff">LAST STAND</div>' +
        '<div style="font-size:.88rem;font-weight:600;margin-top:4px">' +
          "All four phases are down, but the boss is still standing. 25 HP. " +
          "Only a clean first-try answer lands a hit &mdash; anything else lets it recover. " +
          "Hints and solution steps are still for sale, but they cut your damage in half.</div>" +
        '<button id="mcf3m-stand-go" style="margin-top:10px;background:#dc2626;color:#fff;border:0;' +
        'border-radius:9px;padding:10px 18px;font-weight:900;cursor:pointer">Finish it</button>';
    } else if (b.cleared["stand"]) {
      var r = b.cleared["stand"];
      wrap.innerHTML =
        '<div style="font-size:1.1rem;font-weight:900;color:#fff">Course cleared</div>' +
        '<div style="font-size:.88rem;font-weight:600;margin-top:4px">Last Stand beaten in ' +
        r.questions + " questions &nbsp;\u00b7&nbsp; " + "\u2605".repeat(r.grade) + "</div>";
    } else {
      var target = finalNextTarget();
      var phase = st.done.length + 1;
      var req = finalReq();
      var ok = req.have >= req.need || devActive();
      var price = Math.max(1, req.need - req.have) * ENTRY_PER_TOPIC;

      if (target && target.key === PAGE_KEY) {
        wrap.innerHTML =
          '<div style="font-size:1.2rem;font-weight:900;color:#fff">FINAL BOSS &mdash; Phase ' + phase + " of " + tests.length + "</div>" +
          '<div style="font-size:.88rem;font-weight:600;margin-top:4px">' +
            "50 HP per phase. Beat it here and it runs to the next unit &mdash; you follow it there. " +
            "Questions are drawn evenly across every type, with no weighting.</div>" +
          '<div style="margin-top:8px;font-size:.85rem;font-weight:800;color:' + (ok ? "#86efac" : "#fdba74") + '">' +
            "Mastered across " + req.label + ": " + req.have + " / " + req.of +
            (ok ? " \u2014 the door is open." : " (need " + req.need + ")") + "</div>" +
          '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
            '<button id="mcf3m-final-go" style="background:' + (ok ? "#dc2626" : "#7f1d1d") + ';color:#fff;border:0;' +
            'border-radius:9px;padding:10px 18px;font-weight:900;cursor:pointer">Enter the final</button>' +
            (ok ? "" : '<button id="mcf3m-final-pass" style="background:#f59e0b;color:#78350f;border:0;border-radius:9px;' +
              'padding:10px 16px;font-weight:800;cursor:pointer">Entry pass \u2014 ' + price + " \u2605</button>") +
          "</div>";
      } else if (target) {
        wrap.innerHTML =
          '<div style="font-size:1.1rem;font-weight:900;color:#fff">FINAL BOSS \u2014 Phase ' + phase + "</div>" +
          '<div style="font-size:.88rem;font-weight:600;margin-top:4px">The boss is hiding in ' + esc(target.unit) + ".</div>" +
          '<a href="' + esc(relTo(target.key)) + '" style="display:inline-block;margin-top:10px;background:#dc2626;' +
          'color:#fff;border-radius:9px;padding:9px 16px;text-decoration:none;font-weight:800">Chase it &rarr;</a>';
      }
    }

    box.appendChild(wrap);

    var sg = document.getElementById("mcf3m-stand-go");
    if (sg) sg.addEventListener("click", function () { startFight("stand", { id: "stand" }); });

    var fg = document.getElementById("mcf3m-final-go");
    if (fg) fg.addEventListener("click", function () {
      var req2 = finalReq();
      if (req2.have < req2.need && !devActive()) { toast("Master " + (req2.need - req2.have) + " more topic(s), or use an entry pass", "#b45309"); return; }
      startFight("final", { phase: finalState().done.length });
    });
    var fp = document.getElementById("mcf3m-final-pass");
    if (fp) fp.addEventListener("click", function () {
      var req2 = finalReq(), m2 = getMeta();
      var cost = Math.max(1, req2.need - req2.have) * ENTRY_PER_TOPIC;
      if (m2.stars < cost) { toast("You need " + cost + " \u2605 for the pass", "#b91c1c"); return; }
      addStars(-cost);
      startFight("final", { phase: finalState().done.length });
    });
  }

  /* ============================================================
     BOSS UI on a lesson page
     ============================================================ */

  var bossBox = null;
  var bossAwaiting = false;
  var bossScreen = "entry";   /* entry | fight | victory | bonus */

  function ensureBossBox() {
    if (bossBox && document.body.contains(bossBox)) return bossBox;
    var host = document.getElementById("mcf3m-tools");
    if (!host) return null;
    bossBox = document.createElement("div");
    bossBox.id = "mcf3m-boss";
    bossBox.style.cssText = "border-radius:14px;padding:16px 18px;border:2px solid #e2e8f0;background:#fff";
    host.insertBefore(bossBox, host.firstChild);
    return bossBox;
  }

  function lockPractice(on) {
    var sel = topicSelect();
    var box = null;
    if (sel) {
      box = sel.closest(".selector-box");
      if (!box && sel.parentElement) box = sel.parentElement.parentElement || sel.parentElement;
    }
    if (sel) sel.disabled = on;
    if (box) box.style.display = on ? "none" : "";
    var next = document.getElementById("next-btn");
    if (next) next.style.display = on ? "none" : "";
    var m = document.getElementById("mcf3m-mastery");
    if (m) m.style.display = on ? "none" : "";
    var r = document.getElementById("mcf3m-review");
    if (r && on) r.style.display = "none";
  }

  /* Hints and solution steps must be bought during a fight. */
  function gateHelp(on) {
    var hint = document.getElementById("hint-btn");
    var sol = document.getElementById("reveal-sol-btn");
    [hint, sol].forEach(function (b) {
      if (!b) return;
      if (on && !b.dataset.mcfGated) {
        b.dataset.mcfGated = "1";
        b.dataset.mcfLabel = b.textContent;
        b.addEventListener("click", helpGuard, true);
      } else if (!on && b.dataset.mcfGated) {
        delete b.dataset.mcfGated;
        b.removeEventListener("click", helpGuard, true);
        if (b.dataset.mcfLabel) b.textContent = b.dataset.mcfLabel;
      }
    });
    paintHelpPrices();
  }

  function paintHelpPrices() {
    var f = activeFight();
    var hint = document.getElementById("hint-btn");
    var sol = document.getElementById("reveal-sol-btn");
    if (!f) return;
    if (hint && !f.nudgeBought) hint.textContent = "Hint  " + HINT_NUDGE + " \u2605";
    if (sol) {
      var n = Math.min(f.stepsBought, STEP_COST.length - 1);
      sol.textContent = "Solution step  " + STEP_COST[n] + " \u2605";
    }
  }

  function helpGuard(ev) {
    var f = activeFight();
    if (!f) return;
    var id = ev.currentTarget.id;
    var m = getMeta();

    if (id === "hint-btn") {
      if (f.nudgeBought) return;                    /* already paid */
      if (m.stars < HINT_NUDGE) { ev.stopImmediatePropagation(); ev.preventDefault(); toast("Not enough stars for a hint", "#b91c1c"); return; }
      addStars(-HINT_NUDGE);
      f.nudgeBought = true; saveFight(f);
      renderBoss(); paintHelpPrices();
      return;                                        /* let the click through */
    }

    if (id === "reveal-sol-btn") {
      var n = Math.min(f.stepsBought, STEP_COST.length - 1);
      var cost = STEP_COST[n];
      if (m.stars < cost) { ev.stopImmediatePropagation(); ev.preventDefault(); toast("Not enough stars for a solution step", "#b91c1c"); return; }
      addStars(-cost);
      f.stepsBought += 1;
      f.stepUsedThisQ = true;                       /* this question deals half damage */
      saveFight(f);
      renderBoss(); paintHelpPrices();
    }
  }

  /* ------------------------------------------------------------
     Pausing a fight.

     Until now a started fight owned the lesson: the topic picker was
     hidden and the only exit was Retreat, which heals the boss back to
     full. That is a heavy price for wanting to practise one weak topic
     mid-fight, and it also meant reopening the file dropped the student
     straight back into the fight with no way out.

     Pause keeps the boss exactly where it is, hands the lesson back, and
     survives a reload. Answers given while paused count as ordinary
     practice: they earn stars and mastery, and they do no damage.
     ------------------------------------------------------------ */

  function pauseFight(on) {
    var f = activeFight();
    if (!f) return;
    f.paused = !!on;
    saveFight(f);
    bossAwaiting = false;
    if (on) {
      lockPractice(false);
      gateHelp(false);
      renderBossPaused();
      refreshLessonUI();
    } else {
      renderBoss();
      refreshLessonUI();
    }
  }

  function renderBossPaused() {
    artStop();
    hudHide();
    var f = activeFight();
    var box = ensureBossBox();
    if (!box || !f) return;
    bossScreen = "paused";

    var cfg = BOSS[f.kind];
    box.style.display = "block";
    box.style.border = "2px dashed #94a3b8";
    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        "<div>" +
          '<div style="font-size:1rem;font-weight:900;color:#475569">' +
            esc(cfg.label) + " \u2014 paused</div>" +
          '<div style="font-size:.83rem;font-weight:700;color:#94a3b8;margin-top:2px">' +
            f.hp + " / " + f.maxHp + " HP left after " + f.questions + " questions. " +
            "Practise freely; nothing here is lost.</div>" +
        "</div>" +
        '<button id="mcf3m-boss-resume" style="background:#0f172a;color:#fff;border:0;border-radius:10px;' +
          'padding:10px 18px;font-weight:800;cursor:pointer;white-space:nowrap">Back to the fight &rarr;</button>' +
      "</div>";

    document.getElementById("mcf3m-boss-resume").addEventListener("click", function () { pauseFight(false); });
  }

  /* ============================================================
     the arena
     ------------------------------------------------------------
     An HP bar tells a student the number. It does not tell them
     they landed a hit. So the fight now happens on a small canvas:
     the hero lunges on a correct answer, the boss flashes and
     staggers, the damage floats up, and a beaten boss dissolves.

     Pixel art on purpose. Sixteen-by-sixteen sprites drawn from
     text (see mcf-sprites.js) cost a few kilobytes for the whole
     set, need no image files at any folder depth, and scale to any
     size without going blurry.

     The canvas is one element that gets moved, never rebuilt, so
     an animation in flight survives renderBoss() rewriting the box
     around it and survives being popped out into a window.
     ============================================================ */

  var BOSS_ART = { lesson: "slime", unit: "golem", final: "eye", stand: "knight" };

  /* how far down its own box each creature actually starts. Without this a
     helmet floats above a slime and lightning strikes empty sky. */
  var BOSS_HEAD = { slime: 0.30, golem: 0.06, eye: 0.14, knight: 0.03 };

  var art = {
    on: false,            /* sprite file present */
    tried: false,
    cv: null, ctx: null,
    raf: 0,
    kind: "lesson",
    lungeAt: 0,           /* when the hero last swung */
    fx: null,             /* the effect playing right now */
    fxq: [],              /* the rest of a Starfall chain */
    pending: [],          /* damage numbers waiting for their blow to land */
    hitAt: 0,             /* when the boss last took one */
    healAt: 0,
    deadAt: 0,
    floats: []
  };

  var ART_W = 320, ART_H = 132;

  function artLoad(then) {
    if (art.on) { then(); return; }
    if (art.tried) { then(); return; }
    art.tried = true;
    if (window.MCF_SPRITES) { art.on = true; then(); return; }

    var tag = document.createElement("script");
    tag.src = sibling("mcf-sprites.js");
    tag.onload = function () { art.on = !!window.MCF_SPRITES; then(); };
    tag.onerror = function () { then(); };   /* no art: the HP bar still works */
    (document.head || document.documentElement).appendChild(tag);
  }

  function artCanvas() {
    if (art.cv) return art.cv;
    var c = document.createElement("canvas");
    c.id = "mcf3m-arena-canvas";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = ART_W * dpr;
    c.height = ART_H * dpr;
    c.style.cssText = "width:100%;max-width:440px;display:block;border-radius:10px;" +
      "image-rendering:pixelated;background:#0f172a";
    var g = c.getContext("2d");
    g.scale(dpr, dpr);
    art.cv = c; art.ctx = g;
    return c;
  }

  /* put the canvas wherever its host currently is */
  function artMount() {
    /* three possible homes, in order of how deliberately the student chose
       them: the window they popped open, the pinned mini panel, then the
       spot in the page it started life in */
    var host = document.getElementById("mcf3m-arena-win") ||
               document.getElementById("mcf3m-arena-hud") ||
               document.getElementById("mcf3m-arena");
    if (!host) return;
    if (!art.on) { host.style.display = "none"; return; }
    host.style.display = "block";
    var c = artCanvas();
    if (c.parentNode !== host) host.appendChild(c);
    artStart();
  }

  function artStart() {
    if (art.raf) return;
    var step = function () {
      art.raf = 0;
      if (!art.cv || !art.cv.parentNode) return;      /* nothing on screen */
      artPaint(Date.now());
      art.raf = window.requestAnimationFrame(step);
    };
    art.raf = window.requestAnimationFrame(step);
  }

  function artStop() {
    if (art.raf) window.cancelAnimationFrame(art.raf);
    art.raf = 0;
  }

  function artFloat(text, colour, x) {
    art.floats.push({ t: text, c: colour, x: x, at: Date.now() });
    if (art.floats.length > 6) art.floats.shift();
  }

  /* a number that appears when its blow actually connects, not before */
  function artFloatIn(delay, text, colour, x) {
    art.pending.push({ at: Date.now() + delay, t: text, c: colour, x: x });
  }

  var NOVA_CHAIN = ["bolt", "ice", "fire", "wind", "hole"];

  function artPlay(shot) {
    var FX = window.MCF_FX;
    if (!FX || !shot || !shot.key) return null;
    var own = getSkill().owned;
    var list = shot.key === "nova"
      ? NOVA_CHAIN.filter(function (k) { return own[k]; })
      : [shot.key];
    if (!list.length) list = ["slash"];
    art.fxq = list.slice(1);
    art.fx = { name: list[0], at: Date.now(), len: FX.LEN[list[0]] || 800 };
    return list;
  }

  /* called from the answer path */
  function artHit(dmg, heal, dead, shot) {
    if (!art.on) return;
    var now = Date.now(), FX = window.MCF_FX;
    art.lungeAt = now;
    var list = artPlay(shot);

    if (dmg) {
      /* Split the number the way the animation splits the blow. The pieces
         always add back to dmg - the last one takes the remainder - so a
         skill can never round its way into extra damage. */
      var beats = (FX && list && list.length === 1 && FX.HITS[list[0]]) || null;
      var len = art.fx ? art.fx.len : 0;
      if (beats && beats.length > 1) {
        var each = Math.floor(dmg / beats.length), left = dmg;
        for (var i = 0; i < beats.length; i++) {
          var part = (i === beats.length - 1) ? left : each;
          left -= part;
          artFloatIn(beats[i] * len, "-" + part, "#fca5a5", 214 + i * 18);
        }
        art.hitAt = now + beats[0] * len + 40;
      } else {
        var when = beats ? beats[0] * len : 0.17 * 1000;
        artFloatIn(when, "-" + dmg, "#fca5a5", 232);
        art.hitAt = now + when + 40;
      }
      if (shot && shot.staggered) artFloatIn(60, "STARFALL", "#fda4af", 232);
      else if (shot && shot.weak) artFloatIn(60, "weak point", "#fcd34d", 232);
    }
    if (heal) { art.healAt = now + 170; artFloatIn(170, "+" + heal, "#86efac", 262); }
    if (dead) art.deadAt = now + (art.fx ? art.fx.len * 0.8 : 300);
    artStart();
  }

  /* advances the chain and reports what should be on screen */
  function artFxStep(now) {
    var FX = window.MCF_FX;
    if (!art.fx || !FX) return null;
    var t = (now - art.fx.at) / art.fx.len;
    if (t < 1) return { name: art.fx.name, t: t };
    if (art.fxq && art.fxq.length) {
      var nx = art.fxq.shift();
      art.fx = { name: nx, at: now, len: FX.LEN[nx] || 800 };
      return { name: nx, t: 0 };
    }
    art.fx = null;
    return null;
  }

  function ease(v) { return 1 - Math.pow(1 - v, 3); }

  function artPaint(now) {
    var g = art.ctx;
    if (!g) return;
    var f = activeFight();

    /* --- sky and ground --- */
    var sky = g.createLinearGradient(0, 0, 0, ART_H);
    sky.addColorStop(0, "#1e293b");
    sky.addColorStop(1, "#475569");
    g.fillStyle = sky;
    g.fillRect(0, 0, ART_W, ART_H);

    var GY = 104;
    g.fillStyle = "#3f6212";
    g.fillRect(0, GY, ART_W, ART_H - GY);
    g.fillStyle = "#4d7c0f";
    g.fillRect(0, GY, ART_W, 5);
    g.fillStyle = "#365314";
    for (var i = 0; i < ART_W; i += 16) {
      g.fillRect(i + ((i / 16) % 3) * 3, GY + 9 + ((i / 16) % 2) * 6, 4, 3);
    }

    /* --- hero --- */
    var bob = Math.round(Math.sin(now / 380) * 2);
    var lunge = 0;
    var since = now - art.lungeAt;
    if (since >= 0 && since < 320) {
      var p = since / 320;
      lunge = p < 0.4 ? ease(p / 0.4) * 54 : (1 - ease((p - 0.4) / 0.6)) * 54;
    }
    var HS = 2.9, BS = 3.6;
    var hx = 40 + lunge, hy = GY - 16 * HS + bob;

    g.fillStyle = "rgba(0,0,0,.25)";            /* keeps them standing on the ground */
    g.beginPath();
    g.ellipse(hx + 16 * HS / 2, GY + 3, 15, 4, 0, 0, 6.29);
    g.fill();

    var fxNow = artFxStep(now);

    /* the plain swing, kept for anyone with no skills bought yet */
    if (!fxNow && since >= 40 && since < 190) {
      g.save();
      g.strokeStyle = "#fef08a";
      g.lineWidth = 3;
      g.globalAlpha = 1 - (since - 40) / 150;
      g.beginPath();
      g.arc(hx + 58, hy + 24, 26, -0.9, 0.9);
      g.stroke();
      g.restore();
    }

    /* --- boss --- */
    var dead = art.deadAt && now > art.deadAt;
    var fade = dead ? Math.max(0, 1 - (now - art.deadAt) / 750) : 1;
    var hitFor = art.hitAt - now;
    var shake = hitFor > -260 && hitFor < 0 ? Math.round(Math.sin(now / 18) * 4 * (1 + hitFor / 260)) : 0;
    var bbob = Math.round(Math.sin(now / 500) * 2);

    /* while an effect is playing it owns the boss: where it stands, how big
       it is and what colour it is all come from one place */
    var fb = fxNow ? window.MCF_FX.boss(fxNow.name, fxNow.t)
                   : { dx: 0, dy: 0, s: 1, tint: null, alpha: 1 };

    var opts = { flip: true, alpha: fade * fb.alpha };
    if (fb.tint) opts.tint = fb.tint;
    else if (hitFor > -140 && hitFor < 0) opts.tint = "#ffffff";
    else if (art.healAt - now > -220 && art.healAt - now < 0) opts.tint = "#86efac";

    var name = BOSS_ART[art.kind] || "slime";
    var SC = BS * fb.s, side = 16 * SC;
    var bx = 224 + (16 * BS - side) / 2 + shake + fb.dx;
    var by = GY - side + bbob + fb.dy;

    var bbox = {
      cx: bx + side / 2,
      cy: by + side * 0.55,
      top: by + side * (BOSS_HEAD[name] || 0.1),
      bottom: GY,
      w: side
    };

    if (fade > 0 && opts.alpha > 0) {
      g.fillStyle = "rgba(0,0,0," + (0.25 * fade * fb.s) + ")";
      g.beginPath();
      g.ellipse(bx + side / 2, GY + 3, 21 * fb.s, 5 * fb.s, 0, 0, 6.29);
      g.fill();
      MCF_SPRITES.draw(g, name, bx, by, SC, opts);
      if (window.MCF_FX) window.MCF_FX.gear(g, bossTier(art.kind), bbox, now);
    }

    if (fxNow) window.MCF_FX.play(g, fxNow.name, fxNow.t, bbox);

    MCF_SPRITES.draw(g, "hero", hx, hy, HS);

    if (dead && fade > 0) {                      /* it comes apart as it goes */
      g.fillStyle = "#fde68a";
      for (var k = 0; k < 8; k++) {
        var a = (now - art.deadAt) / 750;
        g.globalAlpha = fade;
        g.fillRect(232 + (k % 4) * 13, 92 - a * (26 + k * 5) + bbob, 4, 4);
      }
      g.globalAlpha = 1;
    }

    /* --- floating numbers --- */
    for (var pi = art.pending.length - 1; pi >= 0; pi--) {
      if (now >= art.pending[pi].at) {
        var pd = art.pending.splice(pi, 1)[0];
        artFloat(pd.t, pd.c, pd.x);
      }
    }
    g.font = "700 15px system-ui, sans-serif";
    g.textAlign = "center";
    for (var j = art.floats.length - 1; j >= 0; j--) {
      var fl = art.floats[j];
      var age = now - fl.at;
      if (age > 950) { art.floats.splice(j, 1); continue; }
      g.globalAlpha = Math.max(0, 1 - age / 950);
      g.fillStyle = fl.c;
      g.fillText(fl.t, fl.x, 62 - (age / 950) * 30);
    }
    g.globalAlpha = 1;
    g.textAlign = "left";

    /* --- the state line --- */
    if (f) {
      g.font = "800 11px system-ui, sans-serif";
      g.fillStyle = "#cbd5e1";
      g.fillText("Q" + f.questions, 8, 17);
      g.textAlign = "right";
      g.fillStyle = "#f8fafc";
      g.fillText(((BOSS[f.kind] || {}).label || "") +
                 (TIER_TAG[bossTier(f.kind)] ? "  " + TIER_TAG[bossTier(f.kind)] : ""),
                 ART_W - 8, 17);
      g.textAlign = "left";
    }

    /* idle fights do not need to burn a frame every 16ms forever, but the
       bob is the thing that says the screen is alive, so it keeps running
       while it is on screen and stops the moment it is detached */
  }

  /* ============================================================
     the pinned mini panel
     ------------------------------------------------------------
     The arena first lived inside the boss box near the top of the
     lesson. That is exactly the wrong place: the student scrolls
     down to reach Check answer, so the swing they just earned
     happened off screen every single time.

     So by default it is now pinned to the viewport and cannot
     scroll away. Wide screens get a small panel in the bottom
     right that can be dragged anywhere and stays where it is put;
     narrow screens get a thin strip along the top, which is the
     one edge a phone never puts a button on.
     ============================================================ */

  var K_HUD = NS + ".hud";

  function hudCfg() {
    var c = load(K_HUD, null) || {};
    return { off: !!c.off, x: c.x, y: c.y, small: !!c.small };
  }
  function hudSave(c) { save(K_HUD, c); }

  function hudHide() {
    var el = document.getElementById("mcf3m-hud");
    if (!el) return;
    if (art.cv && art.cv.parentNode && el.contains(art.cv)) art.cv.parentNode.removeChild(art.cv);
    el.parentNode.removeChild(el);
  }

  function hudBuild() {
    var el = document.getElementById("mcf3m-hud");
    if (el) return el;

    el = document.createElement("div");
    el.id = "mcf3m-hud";
    el.setAttribute("data-mcf3m-ui", "1");

    var wide = roomy();
    var c = hudCfg();

    el.style.cssText = wide
      ? "position:fixed;z-index:8800;width:248px;background:#0f172a;border:1px solid #334155;" +
        "border-radius:12px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,.4)"
      : "position:fixed;z-index:8800;top:0;left:0;right:0;background:#0f172a;" +
        "border-bottom:1px solid #334155;box-shadow:0 4px 18px rgba(15,23,42,.35)";

    el.innerHTML =
      '<div id="mcf3m-hud-bar" style="display:flex;align-items:center;justify-content:space-between;' +
        'gap:8px;padding:5px 8px;background:#1e293b' + (wide ? ";cursor:move;user-select:none" : "") + '">' +
        '<span id="mcf3m-hud-name" style="font-size:.72rem;font-weight:800;color:#cbd5e1"></span>' +
        '<span style="display:flex;gap:5px">' +
          '<button id="mcf3m-hud-min" title="Shrink" style="border:0;background:#334155;color:#e2e8f0;' +
            'border-radius:6px;width:24px;height:22px;font-weight:900;cursor:pointer;line-height:1">' +
            (c.small ? "+" : "\u2212") + "</button>" +
          '<button id="mcf3m-hud-off" title="Hide" style="border:0;background:#334155;color:#e2e8f0;' +
            'border-radius:6px;width:24px;height:22px;font-weight:900;cursor:pointer;line-height:1">\u00d7</button>' +
        "</span>" +
      "</div>" +
      '<div id="mcf3m-hud-body"' + (c.small ? ' style="display:none"' : "") + ">" +
        '<div id="mcf3m-arena-hud"></div>' +
        '<div style="padding:5px 8px 7px">' +
          '<div style="height:7px;background:#334155;border-radius:99px;overflow:hidden">' +
            '<div id="mcf3m-hud-hp" style="height:100%;width:100%;background:#ef4444"></div>' +
          "</div>" +
          '<div id="mcf3m-hud-num" style="font-size:.68rem;font-weight:800;color:#94a3b8;margin-top:3px"></div>' +
        "</div>" +
      "</div>";

    document.body.appendChild(el);

    if (wide) {
      var pad = 14;
      var x = (typeof c.x === "number") ? c.x : window.innerWidth - 248 - pad;
      var y = (typeof c.y === "number") ? c.y : window.innerHeight - el.offsetHeight - pad;
      el.style.left = Math.max(4, Math.min(x, window.innerWidth - 248 - 4)) + "px";
      el.style.top = Math.max(4, Math.min(y, window.innerHeight - 40)) + "px";
      hudDrag(el);
    }

    document.getElementById("mcf3m-hud-off").addEventListener("click", function () {
      var cc = hudCfg(); cc.off = true; hudSave(cc);
      hudHide();
      renderBoss();
    });

    document.getElementById("mcf3m-hud-min").addEventListener("click", function () {
      var cc = hudCfg(); cc.small = !cc.small; hudSave(cc);
      var body = document.getElementById("mcf3m-hud-body");
      body.style.display = cc.small ? "none" : "";
      this.textContent = cc.small ? "+" : "\u2212";
      if (!cc.small) artMount();
    });

    return el;
  }

  function hudDrag(el) {
    var bar = document.getElementById("mcf3m-hud-bar");
    var sx = 0, sy = 0, ox = 0, oy = 0, live = false;

    function move(ev) {
      if (!live) return;
      var p = evPoint(ev);
      var nx = ox + (p.x - sx), ny = oy + (p.y - sy);
      nx = Math.max(4, Math.min(nx, window.innerWidth - el.offsetWidth - 4));
      ny = Math.max(4, Math.min(ny, window.innerHeight - 34));
      el.style.left = nx + "px";
      el.style.top = ny + "px";
      if (ev.cancelable) ev.preventDefault();
    }
    function up() {
      if (!live) return;
      live = false;
      var cc = hudCfg();
      cc.x = parseFloat(el.style.left); cc.y = parseFloat(el.style.top);
      hudSave(cc);                       /* it stays where the student put it */
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
    }
    function down(ev) {
      if (ev.target.closest && ev.target.closest("button")) return;
      var p = evPoint(ev);
      sx = p.x; sy = p.y;
      ox = parseFloat(el.style.left) || 0;
      oy = parseFloat(el.style.top) || 0;
      live = true;
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", up);
      if (ev.cancelable) ev.preventDefault();
    }
    bar.addEventListener("mousedown", down);
    bar.addEventListener("touchstart", down, { passive: false });
  }

  /* called whenever the fight state changes */
  function artHudSync() {
    var f = activeFight();
    var c = hudCfg();

    if (!f || f.paused || f.key !== PAGE_KEY || c.off || !art.on || wins.arena) {
      hudHide();
      return;
    }

    var el = hudBuild();
    document.getElementById("mcf3m-hud-name").textContent = (BOSS[f.kind] || {}).label || "";

    var pct = Math.max(0, Math.round((f.hp / f.maxHp) * 100));
    var hp = document.getElementById("mcf3m-hud-hp");
    hp.style.width = pct + "%";
    hp.style.background = pct > 50 ? "#ef4444" : (pct > 20 ? "#f59e0b" : "#fbbf24");
    document.getElementById("mcf3m-hud-num").textContent =
      f.hp + " / " + f.maxHp + " HP  \u00b7  Q" + f.questions;

    if (!c.small) artMount();
  }

  /* ============================================================
     the farm
     ------------------------------------------------------------
     Only alive when the farm world is loaded. Everything below is
     inert in the other two, and the engine above does not know it
     exists — theme-farm.js hands over a catalogue and this reads it.

     The farm runs itself on purpose. A student who has to water
     things is a student doing chores instead of mathematics, and a
     farm that wilts while they are away punishes exactly the person
     who most needs to come back. So crops grow on correct answers,
     the farmer walks over and harvests on his own, and nothing here
     can ever be lost.
     ============================================================ */

  var K_FARM = NS + ".farm";

  function farmOn() { return T.id === "farm" && !!T.farm; }

  function farmCat() { return (T.farm && T.farm.items) || []; }

  function farmItem(id) {
    var out = null;
    farmCat().forEach(function (i) { if (i.id === id) out = i; });
    return out;
  }

  /* which waves of the catalogue have been opened, read off the boss record
     rather than stored, so a restored save code brings the right shop with it */
  function farmWaves() {
    var cl = getBoss().cleared || {};
    var units = 0;
    Object.keys(cl).forEach(function (k) { if (k.indexOf("unit:") === 0) units++; });
    var open = { W0: true };
    for (var i = 1; i <= 4; i++) if (units >= i) open["W" + i] = true;
    if (cl["final"] || cl["stand"]) open.F = true;
    if (cl["stand"]) open.LS = true;
    return open;
  }

  function getFarm() {
    var f = load(K_FARM, null) || {};
    if (!f.owned) {
      f.owned = {};
      (T.farm.start || []).forEach(function (id) { f.owned[id] = 1; });
    }
    if (!f.plots) f.plots = [];
    if (!f.house) f.house = "house1";
    if (!f.deco) f.deco = [];
    if (!f.names) f.names = {};
    if (!f.paid) f.paid = 0;

    /* one plot object per owned plot, in catalogue order. Normalising has to
       be written back: leaving it in memory meant a plot bought this turn was
       missing from the save until the next one. */
    var plots = farmCat().filter(function (i) { return i.cat === "plot" && f.owned[i.id]; });
    var was = f.plots.length;
    while (f.plots.length < plots.length) f.plots.push({ crop: firstCrop(f), pts: 0 });
    f.plots.length = plots.length;
    if (f.plots.length !== was) save(K_FARM, f);
    return f;
  }

  function setFarm(f) { save(K_FARM, f); }

  function firstCrop(f) {
    var c = farmCat().filter(function (i) { return i.cat === "crop" && f.owned[i.id]; });
    /* the newest one, so a field bought late does not come up as eight more
       strawberries; tapping a plot still changes it */
    return c.length ? c[c.length - 1].id : null;
  }

  function ownedIn(f, cat) {
    return farmCat().filter(function (i) { return i.cat === cat && f.owned[i.id]; });
  }

  function decoSlots(f) {
    return (T.farm.houseSlots || {})[f.house] || 2;
  }

  /* ---------- growth ----------
     One point per first-try correct answer, plus 0.2 for every plot past the
     first, all of it going to whichever crop is nearest ready. More plots
     therefore means more crops on the go and a faster cycle, not several
     times the money — otherwise buying plots would be the only sane move. */

  function farmGrow() {
    if (!farmOn()) return;
    var f = getFarm();
    if (!f.plots.length) return;

    var pts = 1 + Math.max(0, f.plots.length - 1) * 0.2;

    var best = -1, bestFrac = -1;
    f.plots.forEach(function (p, i) {
      if (!p.crop) return;
      var c = farmItem(p.crop);
      if (!c) return;
      if (c.showOnly) return;                /* nothing to grow */
      var frac = p.pts / c.grow;
      if (frac >= 1) return;                 /* already waiting to be picked */
      if (frac > bestFrac) { bestFrac = frac; best = i; }
    });
    if (best < 0) { setFarm(f); return; }

    f.plots[best].pts += pts;
    setFarm(f);
  }

  function readyPlot(f) {
    for (var i = 0; i < f.plots.length; i++) {
      var c = f.plots[i].crop && farmItem(f.plots[i].crop);
      if (c && !c.showOnly && f.plots[i].pts >= c.grow) return i;
    }
    return -1;
  }

  /* ---------- harvest ----------
     Paid when the farmer actually reaches the plot, so the number that pops
     up is attached to something the student watched happen. */

  function farmHarvest(i) {
    var f = getFarm();
    var p = f.plots[i];
    if (!p) return null;
    var c = farmItem(p.crop);
    if (!c) return null;

    var produce = 0, kinds = [];
    ownedIn(f, "animal").forEach(function (a) {
      produce += a.produce || 0;
      if (a.sells && kinds.indexOf(a.sells) < 0) kinds.push(a.sells);
    });

    var total = (c.yield || 0) + produce;
    addStars(total);
    p.pts = 0;                                /* the farmer replants it */
    setFarm(f);
    paintStars(getMeta());

    return { crop: c.name, cropStars: c.yield || 0, produce: produce, kinds: kinds, total: total };
  }

  /* ---------- buying ---------- */

  function farmBuy(id) {
    var it = farmItem(id);
    if (!it) return false;
    var f = getFarm();
    if (f.owned[id]) return false;
    if (!farmWaves()[it.wave]) return false;

    var m = getMeta();
    if (m.stars < it.cost) return false;

    m.stars -= it.cost;
    setMeta(m);
    f.owned[id] = 1;

    if (it.cat === "house") f.house = id;
    /* if the house is full the piece still belongs to them — it waits in the
       store below the farm instead of vanishing with the stars */
    if (it.cat === "deco" && f.deco.length < decoSlots(f)) f.deco.push(id);
    if (it.cat === "crop" && !f.plots.some(function (p) { return p.crop; })) {
      f.plots.forEach(function (p) { if (!p.crop) p.crop = id; });
    }
    /* a display plant goes into the ground the moment it is bought — it is a
       trophy, and making someone hunt for a free plot to see it would be a
       strange way to hand over a trophy */
    if (it.cat === "crop" && it.showOnly && f.plots.length) {
      var slot = 0;
      f.plots.forEach(function (p, i) {
        var c = farmItem(p.crop);
        if (!c || !c.showOnly) slot = i;
      });
      f.plots[slot].crop = id;
      f.plots[slot].pts = 0;
    }
    setFarm(f);
    getFarm();                                 /* new plot objects if needed */
    paintStars(getMeta());
    return true;
  }

  /* the one-off for finishing the course. Deliberately not the boss reward,
     which all three worlds share. */
  function farmFinishBonus() {
    if (!farmOn()) return;
    if (!getBoss().cleared["stand"]) return;
    var f = getFarm();
    if (f.paid) return;
    f.paid = 1;
    setFarm(f);
    addStars(T.farm.finishBonus || 0);
    toast("Last Harvest bonus: +" + (T.farm.finishBonus || 0) + " \u2605", "#f59e0b");
  }

  /* ---------- the farm screen ----------
     One canvas, same pixel engine as the arena. The farmer and the animals
     wander on their own: a farm that only moves when you poke it looks like
     a spreadsheet, and asking a student to poke it is asking them to stop
     doing mathematics. */

  var FW = 360, FH = 240;
  var GRASS_TOP = 96;                    /* animals stay below this line */

  var farmView = {
    cv: null, ctx: null, raf: 0,
    who: [],                             /* farmer + animals, wandering */
    floats: [],
    pause: 0,                            /* farmer standing still after a pick */
    lastPlots: -1
  };

  function farmCanvas() {
    if (farmView.cv) return farmView.cv;
    var c = document.createElement("canvas");
    c.id = "mcf3m-farm-canvas";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = FW * dpr;
    c.height = FH * dpr;
    c.style.cssText = "width:100%;max-width:520px;display:block;border-radius:10px;" +
      "image-rendering:pixelated;background:#4d7c0f;cursor:pointer";
    var g = c.getContext("2d");
    g.scale(dpr, dpr);
    farmView.cv = c; farmView.ctx = g;

    c.addEventListener("click", function (ev) {
      var r = c.getBoundingClientRect();
      farmClick((ev.clientX - r.left) / r.width * FW, (ev.clientY - r.top) / r.height * FH);
    });
    return c;
  }

  function plotBox(i) {
    var col = i % 4, row = Math.floor(i / 4);
    return { x: 22 + col * 42, y: 150 + row * 42, s: 34 };
  }

  /* clicking a plot cycles what is planted there, out of the crops owned */
  function farmClick(px, py) {
    var f = getFarm();
    for (var i = 0; i < f.plots.length; i++) {
      var b = plotBox(i);
      if (px >= b.x && px <= b.x + b.s && py >= b.y && py <= b.y + b.s) {
        var crops = ownedIn(f, "crop");
        if (crops.length < 2) return;
        var at = 0;
        crops.forEach(function (c, k) { if (c.id === f.plots[i].crop) at = k; });
        var next = crops[(at + 1) % crops.length];
        f.plots[i].crop = next.id;
        f.plots[i].pts = 0;
        setFarm(f);
        farmFloat(next.name, "#ffffff", b.x + b.s / 2, b.y);
        return;
      }
    }
  }

  function farmFloat(text, colour, x, y) {
    farmView.floats.push({ t: text, c: colour, x: x, y: y, at: Date.now() });
    if (farmView.floats.length > 6) farmView.floats.shift();
  }

  function farmPeople() {
    var f = getFarm();
    var want = ["farmer"].concat(ownedIn(f, "animal").map(function (a) { return a.art; }));
    if (farmView.who.length !== want.length) {
      farmView.who = want.map(function (art, i) {
        return {
          art: art,
          x: 30 + (i * 47) % (FW - 90),
          y: GRASS_TOP + 8 + (i * 23) % 34,
          tx: 0, ty: 0, flip: false, wait: 0
        };
      });
      farmView.who.forEach(newTarget);
    }
    return farmView.who;
  }

  function newTarget(w) {
    w.tx = 20 + Math.random() * (FW - 70);
    w.ty = GRASS_TOP + 4 + Math.random() * 38;
    w.wait = 400 + Math.random() * 2600;
  }

  function farmMount() {
    var host = document.getElementById("mcf3m-farm");
    if (!host) return;
    if (!art.on) {
      host.innerHTML = '<div style="padding:22px;text-align:center;font-weight:700;color:#94a3b8">' +
        "The farm art did not load. Check that mcf-sprites.js sits next to progress.js.</div>";
      return;
    }
    var c = farmCanvas();
    if (c.parentNode !== host) host.appendChild(c);
    farmStart();
  }

  function farmStart() {
    if (farmView.raf) return;
    var step = function () {
      farmView.raf = 0;
      if (!farmView.cv || !farmView.cv.parentNode) return;
      farmPaint(Date.now());
      farmView.raf = window.requestAnimationFrame(step);
    };
    farmView.raf = window.requestAnimationFrame(step);
  }

  function farmPaint(now) {
    var g = farmView.ctx;
    if (!g) return;
    var f = getFarm();

    /* ---- ground ---- */
    g.fillStyle = "#4d7c0f";
    g.fillRect(0, 0, FW, FH);
    g.fillStyle = "#517f12";                 /* barely there: the sprites are
                                                the subject, the grass is not */
    for (var i = 0; i < FW; i += 20) {
      for (var j = 0; j < FH; j += 20) {
        if (((i + j) / 20) % 2 === 0) g.fillRect(i, j, 20, 20);
      }
    }
    g.fillStyle = "#3f6212";
    for (var t = 0; t < 26; t++) {
      g.fillRect((t * 53) % FW, GRASS_TOP + 6 + (t * 31) % 130, 3, 2);
    }

    /* ---- house ---- */
    var hd = MCF_SPRITES.dim(f.house) || { w: 24, h: 24 };
    MCF_SPRITES.draw(g, f.house, 10, 82 - hd.h * 2, 2);

    /* ---- decorations along the top, as many as the house can show ---- */
    var slots = decoSlots(f);
    var shown = f.deco.slice(0, slots);
    shown.forEach(function (id, k) {
      var it = farmItem(id);
      if (!it) return;
      var d = MCF_SPRITES.dim(it.art) || { w: 16, h: 16 };
      var x = 96 + (k % 5) * 52 - (d.w - 16) * 0.8;
      var base = (k < 5 ? 44 : 82);              /* they share a ground line */
      MCF_SPRITES.draw(g, it.art, x, base - d.h * 1.6, 1.6);
    });

    /* ---- plots ---- */
    var ready = readyPlot(f);
    f.plots.forEach(function (p, i) {
      var b = plotBox(i);
      MCF_SPRITES.draw(g, "plot", b.x, b.y, 2.1);
      var c = p.crop && farmItem(p.crop);
      if (!c) return;
      var frac = c.showOnly ? 1 : p.pts / c.grow;
      var stage = frac >= 1 ? c.art : (frac > 0.45 ? "bud" : (frac > 0 ? "sprout" : null));
      if (stage) {
        /* planted on the soil rather than fitted to it: a 16-tall crop lands
           exactly in the tile as before, and the tall Starfruit Vine grows up
           out of it instead of being shrunk back down to everything else */
        var cd = MCF_SPRITES.dim(stage) || { w: 16, h: 16 };
        MCF_SPRITES.draw(g, stage, b.x + (b.s - cd.w * 2.1) / 2,
                         b.y + b.s - cd.h * 2.1, 2.1);
      }

      if (c.showOnly) return;                  /* no bar, nothing to wait for */
      if (frac < 1) {                          /* a thin progress line under it */
        g.fillStyle = "rgba(15,23,42,.35)";
        g.fillRect(b.x + 2, b.y + b.s - 3, b.s - 4, 3);
        g.fillStyle = "#facc15";
        g.fillRect(b.x + 2, b.y + b.s - 3, (b.s - 4) * Math.min(1, frac), 3);
      } else if (i === ready) {
        g.fillStyle = "#fde68a";                /* ready: a little bob marker */
        var bob = Math.round(Math.sin(now / 260) * 2);
        g.fillRect(b.x + b.s / 2 - 2, b.y - 8 + bob, 4, 4);
      }
    });

    /* ---- the farmer and the animals ---- */
    var who = farmPeople();
    who.forEach(function (w, idx) {
      var isFarmer = idx === 0;

      if (isFarmer && ready >= 0 && !farmView.pause) {
        var b = plotBox(ready);
        w.tx = b.x + b.s / 2 - 8;
        w.ty = b.y - 14;
      }

      var dx = w.tx - w.x, dy = w.ty - w.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        if (isFarmer && ready >= 0 && !farmView.pause) {
          var got = farmHarvest(ready);
          if (got) {
            var bb = plotBox(ready);
            farmFloat("+" + got.total + " \u2605", "#fde68a", bb.x + bb.s / 2, bb.y - 6);
            farmView.pause = now + 900;
            paintFarmPanel();
          }
        }
        w.wait -= 16;
        if (w.wait <= 0) newTarget(w);
      } else {
        var sp = isFarmer ? 0.55 : 0.3;
        w.x += dx / dist * sp;
        w.y += dy / dist * sp;
        w.flip = dx < 0;
      }

      /* Everything is drawn at one scale and stands on the same line. The
         Last Harvest pieces are drawn bigger because their sprites ARE
         bigger (24 or more against the usual 16), which is the whole point
         of them being 1.5x: one rule here, no per-item exceptions. */
      var d = MCF_SPRITES.dim(w.art) || { w: 16, h: 16 };
      var scale = 1.7;
      var hop = Math.round(Math.sin(now / 220 + idx) * (dist > 2 ? 1 : 0));
      MCF_SPRITES.draw(g, w.art, w.x - (d.w - 16) * scale / 2,
                       w.y - d.h * scale + 16 + hop, scale, { flip: w.flip });
    });

    if (farmView.pause && now > farmView.pause) farmView.pause = 0;

    /* ---- floating numbers ---- */
    g.font = "800 13px system-ui, sans-serif";
    g.textAlign = "center";
    for (var k = farmView.floats.length - 1; k >= 0; k--) {
      var fl = farmView.floats[k];
      var age = now - fl.at;
      if (age > 1300) { farmView.floats.splice(k, 1); continue; }
      g.globalAlpha = Math.max(0, 1 - age / 1300);
      g.fillStyle = "#0f172a";
      g.fillText(fl.t, fl.x + 1, fl.y - (age / 1300) * 26 + 1);
      g.fillStyle = fl.c;
      g.fillText(fl.t, fl.x, fl.y - (age / 1300) * 26);
    }
    g.globalAlpha = 1;
    g.textAlign = "left";
  }

  /* ---------- the farm drawer ---------- */

  function paintFarmPanel() {
    var box = document.getElementById("mcf3m-farm-info");
    if (!box) return;
    var f = getFarm();
    var h = farmItem(f.house);
    var crops = ownedIn(f, "crop").length, animals = ownedIn(f, "animal").length;

    box.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:.82rem;font-weight:700;color:#475569;margin-top:10px">' +
        "<span>" + esc(h ? h.name : "") + "</span>" +
        "<span>" + f.plots.length + " plots</span>" +
        "<span>" + crops + " crops</span>" +
        "<span>" + animals + " animals</span>" +
        "<span>" + f.deco.length + " / " + decoSlots(f) + " on show</span>" +
      "</div>" +
      '<div style="font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:6px">' +
        "Crops grow when you answer correctly first try. Tap a plot to plant something else." +
      "</div>";
  }

  /* ---------- the decoration store ----------
     The house sets how many pieces can be on display, and ten pieces exist,
     so from the second purchase onwards there is a choice to make. Without
     somewhere to see the rest, a piece bought with a full house looked like
     it had been eaten. Swapping is free: that is the whole point of it. */

  function paintFarmDeco() {
    var box = document.getElementById("mcf3m-farm-deco");
    if (!box) return;

    var f = getFarm();
    var owned = ownedIn(f, "deco");
    if (!owned.length) { box.innerHTML = ""; return; }

    var slots = decoSlots(f);
    var chips = owned.map(function (it) {
      var on = f.deco.indexOf(it.id) >= 0;
      return '<button data-deco="' + it.id + '" title="' + esc(it.name) + '" ' +
        'style="display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;' +
        'border:2px solid ' + (on ? "#f59e0b" : "#e2e8f0") + ';background:' + (on ? "#fffbeb" : "#f8fafc") +
        ';border-radius:10px;padding:6px 7px;width:72px">' +
        '<canvas data-thumb="' + it.art + '" width="34" height="34" ' +
          'style="image-rendering:pixelated"></canvas>' +
        '<span style="font-size:.62rem;font-weight:800;color:' + (on ? "#92400e" : "#94a3b8") +
          ';line-height:1.1;text-align:center">' + esc(it.name) + "</span></button>";
    }).join("");

    box.innerHTML =
      '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8;margin:14px 0 6px">' +
        "ON SHOW &nbsp;" + f.deco.length + " / " + slots + "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:7px">' + chips + "</div>" +
      '<div style="font-size:.75rem;font-weight:600;color:#94a3b8;margin-top:6px">' +
        "Tap to put a piece out or back in the store. A bigger house shows more at once.</div>";

    Array.prototype.forEach.call(box.querySelectorAll("canvas[data-thumb]"), function (c) {
      if (!art.on) return;
      var name = c.getAttribute("data-thumb");
      var d = MCF_SPRITES.dim(name) || { w: 16, h: 16 };
      var s = Math.min(34 / d.w, 34 / d.h);
      var g = c.getContext("2d");
      MCF_SPRITES.draw(g, name, (34 - d.w * s) / 2, (34 - d.h * s) / 2, s);
    });

    Array.prototype.forEach.call(box.querySelectorAll("button[data-deco]"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-deco");
        var ff = getFarm();
        var at = ff.deco.indexOf(id);
        if (at >= 0) {
          ff.deco.splice(at, 1);
        } else if (ff.deco.length >= decoSlots(ff)) {
          var h = farmItem(ff.house);
          toast("The " + (h ? h.name : "house") + " only shows " + decoSlots(ff) +
                ". Take one down first.", "#b45309");
          return;
        } else {
          ff.deco.push(id);
        }
        setFarm(ff);
        paintFarmDeco();
        paintFarmPanel();
      });
    });
  }

  /* ---------- the market ---------- */

  var CAT_LABEL = { plot: "Plots", house: "House", crop: "Crops", animal: "Animals", deco: "Decorations" };

  function paintFarmShop() {
    var box = document.getElementById("mcf3m-farmshop");
    if (!box) return;

    var f = getFarm();
    var m = getMeta();
    var open = farmWaves();
    var out = [];

    ["plot", "house", "crop", "animal", "deco"].forEach(function (cat) {
      var rows = farmCat().filter(function (i) { return i.cat === cat && i.cost > 0; });
      if (!rows.length) return;

      var cards = rows.map(function (it) {
        var have = !!f.owned[it.id];
        var can = open[it.wave];
        var afford = m.stars >= it.cost;

        var detail = it.cat === "crop"
          ? (it.showOnly
            ? "in flower from the day you buy it \u00b7 never harvested"
            : "grows in " + it.grow + " \u00b7 pays " + it["yield"] + " \u2605 each harvest")
          : (it.cat === "animal"
            ? "+" + it.produce + " \u2605 every harvest (" + it.sells + ")"
            : (it.cat === "house"
              ? (function () {
                  var slots = (T.farm.houseSlots || {})[it.id] || 0;
                  var all = farmCat().filter(function (x) { return x.cat === "deco"; }).length;
                  /* the top house is built to hold the whole set, so say so —
                     that is the reason to buy it */
                  return slots >= all ? "shows all " + all + " decorations at once"
                                      : "shows " + slots + " decorations";
                })()
              : (it.cat === "plot" ? "faster growth" : "for the look of it")));

        var bg = have ? "#ecfdf5" : (!can ? "#f8fafc" : "#ffffff");
        var bd = have ? "#a7f3d0" : (!can ? "#e2e8f0" : (afford ? "#fcd34d" : "#e2e8f0"));

        var btn = have
          ? '<span style="font-size:.78rem;font-weight:800;color:#059669">owned</span>'
          : (!can
            ? '<span style="font-size:.72rem;font-weight:800;color:#94a3b8">locked</span>'
            : '<button data-farmbuy="' + it.id + '" ' + (afford ? "" : "disabled ") +
              'style="background:' + (afford ? "#f59e0b" : "#e2e8f0") + ';color:' +
              (afford ? "#78350f" : "#94a3b8") + ';border:0;border-radius:8px;padding:6px 12px;' +
              'font-weight:800;font-size:.8rem;cursor:' + (afford ? "pointer" : "not-allowed") + '">' +
              it.cost + " \u2605</button>");

        return '<div style="border:1px solid ' + bd + ';background:' + bg + ';border-radius:10px;' +
            'padding:9px 11px;flex:1 1 200px;min-width:180px;display:flex;justify-content:space-between;' +
            'align-items:center;gap:8px">' +
          "<span>" +
            '<span style="font-weight:800;font-size:.9rem;color:#0f172a">' +
              esc(can || have ? it.name : "???") + "</span>" +
            '<br><span style="font-size:.72rem;font-weight:600;color:#94a3b8">' +
              esc(can || have ? detail : "beat the " + waveWord(it.wave)) + "</span>" +
          "</span>" + btn +
        "</div>";
      }).join("");

      out.push('<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8;' +
        'margin:14px 0 6px">' + CAT_LABEL[cat].toUpperCase() + "</div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' + cards + "</div>");
    });

    if (!open.LS && T.farm.finishTeaser) {
      out.push('<div style="margin-top:16px;border:2px dashed #cbd5e1;background:#f8fafc;border-radius:10px;' +
        'padding:12px 14px;font-size:.8rem;font-weight:600;color:#64748b">' +
        '<b style="color:#0f172a">Beat the Last Harvest to unlock three more.</b><br>' +
        esc(T.farm.finishTeaser) + "</div>");
    }

    box.innerHTML = out.join("");

    Array.prototype.forEach.call(box.querySelectorAll("button[data-farmbuy]"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-farmbuy");
        if (!farmBuy(id)) return;
        var it = farmItem(id);
        var f2 = getFarm();
        if (it.cat === "deco" && f2.deco.indexOf(id) < 0) {
          toast(it.name + " is in the store \u2014 your house is full", "#b45309");
        } else {
          toast(it.name + " bought", "#059669");
        }
        paintFarmShop();
        paintFarmPanel();
        paintFarmDeco();
        refreshSheetStars();
        paintMenu();
      });
    });
  }

  function waveWord(w) {
    if (w === "F") return T.boss.final;
    if (w === "LS") return T.boss.stand;
    return "Unit " + w.slice(1) + " " + T.boss.unit;
  }

  /* pop the arena out into a draggable window and back again */
  function artPopOut() {
    hudHide();
    openDrawer("arena");
    renderBoss();          /* drops the button while the window is out */
  }

  function hpBar(f) {
    var pct = Math.max(0, Math.round(f.hp / f.maxHp * 100));
    var col = pct > 50 ? "#dc2626" : (pct > 20 ? "#ea580c" : "#16a34a");
    return '<div style="background:#e2e8f0;border-radius:999px;height:22px;overflow:hidden;position:relative">' +
      '<div style="width:' + pct + '%;height:100%;background:' + col + ';transition:width .45s ease"></div>' +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'font-size:.8rem;font-weight:800;color:#0f172a">' + f.hp + " / " + f.maxHp + "</div></div>";
  }

  /* the row of skills under the health bar. Auto is a chip of its own so
     picking one is always a deliberate act, never something you fall into. */
  function skillBar(f) {
    var own = ownedSkills();
    if (own.length < 2) return "";
    var s = getSkill();
    var weak = bossWeak(f.kind, bossTier(f.kind));

    function chip(id, label, live, colour) {
      return '<button data-skill="' + id + '" style="border:2px solid ' +
        (live ? colour : "#e2e8f0") + ";background:" + (live ? colour : "#fff") +
        ";color:" + (live ? "#fff" : "#334155") + ';border-radius:999px;padding:4px 11px;' +
        'font-size:.76rem;font-weight:800;cursor:pointer">' + label + "</button>";
    }

    var chips = own.map(function (k) {
      var it = SKILLS[k];
      return chip(k, esc(it.name) + (it.el === weak ? " \u25c6" : ""),
                  s.mode === "manual" && s.pick === k, EL_COL[it.el]);
    }).join("");

    return '<div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
      chip("__auto", "Auto", s.mode === "auto", "#0f172a") + chips +
      '<span style="font-size:.74rem;font-weight:700;color:#64748b">' +
        "weak to " + EL_NAME[weak] + " \u25c6 &nbsp;\u00b7&nbsp; charge " +
        (f.stagger || 0) + "/3</span></div>";
  }

  function bindSkillBar(box) {
    Array.prototype.forEach.call(box.querySelectorAll("button[data-skill]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-skill"), s = getSkill();
        if (k === "__auto") s.mode = "auto";
        else { s.mode = "manual"; s.pick = k; }
        setSkill(s);
        renderBoss();
      });
    });
  }

  function renderBoss() {
    bossScreen = "fight";
    var f = activeFight();
    var box = ensureBossBox();
    if (!box) return;

    if (!f) { box.style.display = "none"; lockPractice(false); gateHelp(false); return; }
    box.style.display = "block";
    lockPractice(true);
    gateHelp(true);

    var cfg = BOSS[f.kind];
    var title = f.kind === "final" ? T.boss.final + " \u2014 Phase " + (f.phase + 1) + " of " + (f.phaseTotal || 4)
              : cfg.label;
    var pace = f.questions <= Math.ceil(f.par * 1.2) ? "\u2605\u2605\u2605"
             : (f.questions <= Math.ceil(f.par * 1.6) ? "\u2605\u2605" : "\u2605");

    var arts = [];
    if (f.powerCore > 0) arts.push("Power Core \u00d7" + f.powerCore);
    if (f.secondWind) arts.push("Second Wind ready");
    if (f.starLens) arts.push("Star Lens active");

    box.style.border = "2px solid " + (f.kind === "stand" ? "#b91c1c" : "#0f172a");
    box.innerHTML =
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div style="font-size:1.15rem;font-weight:900;color:#0f172a">' + title + "</div>" +
        '<div style="font-size:.8rem;font-weight:700;color:#64748b">Question ' + f.questions +
          " &nbsp;\u00b7&nbsp; pace " + pace + (f.questions > 20 ? " &nbsp;\u00b7&nbsp; " + T.boss.tiring : "") +
          (wins.arena ? "" :
            ' <button id="mcf3m-arena-view" style="margin-left:8px;border:0;background:#f1f5f9;' +
            'color:#334155;border-radius:7px;padding:3px 9px;font-size:.78rem;font-weight:800;cursor:pointer">' +
            (hudCfg().off ? "\u25A2 Show mini view" : "\u2922 Bigger window") + "</button>") + "</div>" +
      "</div>" +
      (hudCfg().off ? '<div id="mcf3m-arena" style="margin-top:10px;display:none"></div>' : "") +
      '<div style="margin-top:10px">' + hpBar(f) + "</div>" +
      skillBar(f) +
      (arts.length ? '<div style="margin-top:8px;font-size:.8rem;font-weight:700;color:#0369a1">' + arts.join(" &nbsp;\u00b7&nbsp; ") + "</div>" : "") +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
        (bossAwaiting ? '<button id="mcf3m-boss-next" style="background:#0f172a;color:#fff;border:0;' +
          'border-radius:9px;padding:8px 18px;font-size:.9rem;font-weight:800;cursor:pointer">Next question &rarr;</button>' : '') +
        '<button id="mcf3m-boss-pause" style="background:#f1f5f9;color:#334155;border:0;border-radius:9px;' +
        'padding:8px 14px;font-size:.85rem;font-weight:800;cursor:pointer">Pause &amp; practise</button>' +
        '<button id="mcf3m-boss-exit" style="background:#f1f5f9;color:#334155;border:0;border-radius:9px;' +
        'padding:8px 14px;font-size:.85rem;font-weight:800;cursor:pointer">Save &amp; exit</button>' +
        '<button id="mcf3m-boss-quit" style="background:#fff;color:#b91c1c;border:1px solid #fecaca;border-radius:9px;' +
        'padding:8px 14px;font-size:.85rem;font-weight:800;cursor:pointer">' + T.boss.retreat + '</button>' +
      "</div>";

    bindSkillBar(box);
    var nb = document.getElementById("mcf3m-boss-next");
    if (nb) nb.addEventListener("click", nextBossQuestion);
    document.getElementById("mcf3m-boss-pause").addEventListener("click", function () { pauseFight(true); });
    var pop = document.getElementById("mcf3m-arena-view");
    if (pop) pop.addEventListener("click", function () {
      var c = hudCfg();
      if (c.off) { c.off = false; c.small = false; hudSave(c); renderBoss(); artLoad(artHudSync); }
      else artPopOut();
    });

    art.kind = f.kind;
    if (!wins.arena) artLoad(artHudSync);
    document.getElementById("mcf3m-boss-exit").addEventListener("click", function () {
      toast("Progress saved \u2014 come back any time", "#0f172a");
      window.setTimeout(function () { window.location.href = window.MCF3M_PORTAL_URL || "../index.html"; }, 700);
    });
    document.getElementById("mcf3m-boss-quit").addEventListener("click", function () {
      if (!window.confirm(T.boss.retreatAsk)) return;
      saveFight(null);
      bossScreen = "entry";
      lockPractice(false);
      gateHelp(false);
      renderBossEntry();
      refreshLessonUI();
    });
  }

  /* victory / defeat screens ------------------------------------------- */

  function showVictory(f, res) {
    bossScreen = "victory";
    var box = ensureBossBox();
    if (!box) return;
    lockPractice(true);

    var next = "";
    if (f.kind === "final") {
      var s = finalState();
      if (s.done.indexOf(f.key) === -1) s.done.push(f.key);
      s.phase = s.done.length;
      setFinalState(s);
      var t = finalNextTarget();
      next = t
        ? '<a href="' + esc(relTo(t.key)) + '" style="display:inline-block;margin-top:12px;background:#0f172a;color:#fff;' +
          'border-radius:10px;padding:11px 18px;text-decoration:none;font-weight:800">The boss flees to ' + esc(t.unit) + " \u2192</a>"
        : '<div style="margin-top:12px;font-weight:800;color:#b91c1c">All four phases are down. Return here for the Last Stand.</div>';
    }

    if (f.kind === "stand") {
      box.style.border = "3px solid #b91c1c";
      box.innerHTML =
        '<div style="font-size:1.7rem;font-weight:900;color:#7f1d1d">THE COURSE IS CLEARED</div>' +
        '<div style="margin-top:6px;font-size:2rem">' + "\u2605".repeat(res.grade) +
          '<span style="color:#cbd5e1">' + "\u2605".repeat(3 - res.grade) + "</span></div>" +
        '<div style="font-size:.95rem;font-weight:700;color:#334155;margin-top:4px">' +
          f.questions + " questions &nbsp;\u00b7&nbsp; +" + res.stars + " \u2605</div>" +
        '<div style="margin-top:10px;font-weight:800;color:#b45309">Title earned: MCF3M Conqueror</div>' +
        '<div style="font-size:.85rem;font-weight:700;color:#64748b">It is on the trophy case in your portal from now on.</div>' +
        '<div style="margin-top:12px"><button id="mcf3m-boss-done" style="background:#0f172a;color:#fff;border:0;' +
        'border-radius:10px;padding:10px 18px;font-weight:800;cursor:pointer">Back to practice</button></div>';
      document.getElementById("mcf3m-boss-done").addEventListener("click", function () {
        bossScreen = "entry"; lockPractice(false); gateHelp(false); renderBossEntry(); refreshLessonUI();
      });
      return;
    }

    var keyBlock = "";
    if (f.kind !== "stand") {
      var free = uniqueKeyIsFree(f);
      keyBlock =
        '<div style="margin-top:14px;padding:14px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px">' +
          '<div style="font-weight:900;color:#92400e">Unique Key</div>' +
          '<div style="font-size:.88rem;font-weight:600;color:#92400e;margin-top:3px">' +
            "Open one harder bonus question. Get it right and you win " + (KEY_COST * 2) + " \u2605. " +
            "Get it wrong and half your key cost comes back." +
          "</div>" +
          '<button id="mcf3m-key" style="margin-top:10px;background:#f59e0b;color:#78350f;border:0;border-radius:9px;' +
          'padding:9px 16px;font-weight:800;cursor:pointer">' +
            (free ? "Use your free key" : "Buy a key \u2014 " + KEY_COST + " \u2605") +
          "</button>" +
        "</div>";
    }

    box.innerHTML =
      '<div style="font-size:1.5rem;font-weight:900;color:#065f46">Boss defeated</div>' +
      '<div style="margin-top:6px;font-size:2rem">' + "\u2605".repeat(res.grade) + '<span style="color:#cbd5e1">' + "\u2605".repeat(3 - res.grade) + "</span></div>" +
      '<div style="font-size:.95rem;font-weight:700;color:#334155;margin-top:4px">' +
        f.questions + " questions &nbsp;\u00b7&nbsp; +" + res.stars + " \u2605</div>" +
      keyBlock + next +
      '<div style="margin-top:12px"><button id="mcf3m-boss-done" style="background:#0f172a;color:#fff;border:0;' +
      'border-radius:10px;padding:10px 18px;font-weight:800;cursor:pointer">Back to practice</button></div>';

    var kb = document.getElementById("mcf3m-key");
    if (kb) kb.addEventListener("click", function () { startBonus(f); });
    document.getElementById("mcf3m-boss-done").addEventListener("click", function () {
      bossScreen = "entry";
      lockPractice(false);
      gateHelp(false);
      renderBossEntry();
      refreshLessonUI();
    });
  }

  /* Page keys are lower-cased for matching, so never build a link from
     one - case-sensitive servers would 404. Use the manifest's real href. */
  function relTo(targetKey) {
    var m = mapEntry(targetKey);
    if (m && m.href) return "../" + m.href;
    return window.MCF3M_PORTAL_URL || "../index.html";
  }

  function uniqueKeyIsFree(f) {
    var scope = f.kind === "lesson" ? [mapEntry(f.key)].filter(Boolean) : unitLessons(f.key);
    if (!scope.length) return false;
    var have = 0, of = 0;
    scope.forEach(function (m) { have += masteredCount(entry(m.key)); of += m.total || 0; });
    return of > 0 && have >= of;
  }

  var bonus = null;

  function startBonus(f) {
    var free = uniqueKeyIsFree(f);
    var m = getMeta();
    if (!free) {
      if (m.stars < KEY_COST) { toast("You need " + KEY_COST + " \u2605 for a key", "#b91c1c"); return; }
      addStars(-KEY_COST);
    }
    bossScreen = "bonus";
    bonus = { paid: free ? 0 : KEY_COST, kind: f.kind };
    var box = ensureBossBox();
    box.innerHTML =
      '<div style="font-size:1.2rem;font-weight:900;color:#92400e">Bonus question</div>' +
      '<div style="font-size:.9rem;font-weight:600;color:#92400e;margin-top:4px">One shot. First try only.</div>';
    /* hardest topic the student has not mastered, else any */
    var e = entry(PAGE_KEY), ids = topicIds(), pick = null, worst = 2;
    ids.forEach(function (id) {
      var t = e.topics[id];
      var rate = t && t.a ? t.c / t.a : 1;
      if ((!t || !t.mastered) && rate < worst) { worst = rate; pick = id; }
    });
    var sel = topicSelect();
    if (sel) sel.value = pick || ids[Math.floor(Math.random() * ids.length)];
    newProblem();
  }

  function resolveBonus(isCorrect, firstTry) {
    if (!bonus) return false;
    var won = isCorrect && firstTry;
    var payout = won ? KEY_COST * 2 : Math.round(bonus.paid / 2);
    if (payout) addStars(payout);
    var box = ensureBossBox();
    if (box) {
      box.innerHTML =
        '<div style="font-size:1.35rem;font-weight:900;color:' + (won ? "#065f46" : "#7c2d12") + '">' +
          (won ? "Bonus cleared" : "Bonus missed") + "</div>" +
        '<div style="margin-top:5px;font-weight:700;color:#334155">' +
          (won ? "+" + payout + " \u2605" : (payout ? "Half your key comes back: +" + payout + " \u2605" : "Better luck next boss.")) +
        "</div>" +
        '<div style="margin-top:12px"><button id="mcf3m-bonus-done" style="background:#0f172a;color:#fff;border:0;' +
        'border-radius:10px;padding:10px 18px;font-weight:800;cursor:pointer">Back to practice</button></div>';
      document.getElementById("mcf3m-bonus-done").addEventListener("click", function () {
        bossScreen = "entry"; lockPractice(false); gateHelp(false); renderBossEntry(); refreshLessonUI();
      });
    }
    toast(won ? "+" + payout + " \u2605 bonus!" : "Bonus missed", won ? "#059669" : "#b45309");
    bonus = null;
    return true;
  }

  /* ============================================================
     TROPHIES AND TITLES
     ------------------------------------------------------------
     Every one of these is read back out of records that already
     exist -- boss clears, badge tiers, practice days. Nothing new
     is stored, so a title can never disagree with what was won.
     ============================================================ */

  function unitNo(key) {
    var m = mapEntry(key);
    var s = (m && m.unit) || String(key || "");
    var f = s.match(/unit\s*(\d+)/i);
    return f ? +f[1] : 0;
  }

  /* Best first: the whole course, then everything, then unit by unit. */
  function earnedTitles() {
    var cleared = getBoss().cleared || {};
    var out = [];

    if (cleared["stand"]) {
      out.push({ name: "MCF3M Conqueror", note: "Last Stand beaten", rank: 100 });
    }
    var t = badgeTally();
    if (t.of && t.have >= t.of) {
      out.push({ name: "Completionist", note: "every badge tier earned", rank: 90 });
    }
    practiceTests().forEach(function (m) {
      var rec = cleared["unit:" + m.key];
      if (!rec) return;
      var n = unitNo(m.key);
      out.push({
        name: (n ? "Unit " + n : m.title) + " Champion",
        note: "Unit Boss beaten in " + rec.questions + " questions",
        rank: 10 + n
      });
    });
    out.sort(function (a, b) { return b.rank - a.rank; });
    return out;
  }

  function topTitle() {
    var t = earnedTitles();
    return t.length ? t[0].name : "";
  }

  /* What it takes to get the first one, so an empty shelf still points
     somewhere instead of just being empty. */
  function nextTitleHint(haveAny) {
    var cleared = getBoss().cleared || {};
    var tests = practiceTests();
    for (var i = 0; i < tests.length; i++) {
      if (!cleared["unit:" + tests[i].key]) {
        var n = unitNo(tests[i].key);
        return "Beat the " + (n ? "Unit " + n : "first") + " Boss" +
               (haveAny ? " for the next title." : " to earn your first title.");
      }
    }
    if (!cleared["stand"]) return "Beat the Last Stand to become MCF3M Conqueror.";
    var t = badgeTally();
    if (t.of && t.have < t.of) {
      return "Every badge tier earns one more: " + t.have + " of " + t.of + ".";
    }
    return "";                 /* there is nothing left to earn */
  }

  function trophyRows() {
    var cleared = getBoss().cleared || {};
    var rows = [];
    getManifest().forEach(function (m) {
      var kind = m.isTest ? "unit" : "lesson";
      var n = unitNo(m.key);
      /* every practice test is headed "Cumulative Practice Test", so on a
         shelf of four they need the unit said out loud */
      var label = m.isTest ? ((n ? "Unit " + n : "Unit") + " Practice Test") : m.title;
      rows.push({
        label: label, tag: m.isTest ? "UNIT" : "LESSON", href: m.href,
        rec: cleared[kind + ":" + m.key] || null, unit: n
      });
    });
    practiceTests().forEach(function (m, i) {
      var n = unitNo(m.key);
      rows.push({
        label: "Phase " + (i + 1) + (n ? " \u2014 Unit " + n : ""),
        tag: "FINAL", href: m.href,
        rec: cleared["final:" + m.key] || null, unit: n, final: true
      });
    });
    rows.push({
      label: "Last Stand", tag: "FINAL", href: null,
      rec: cleared["stand"] || null, unit: 99, final: true
    });
    return rows;
  }

  function careerStats() {
    var m = getMeta();
    var cleared = getBoss().cleared || {};
    var keys = Object.keys(cleared);
    var perfect = 0, fastest = null;
    keys.forEach(function (k) {
      if (cleared[k].grade >= 3) perfect++;
      if (fastest === null || cleared[k].questions < fastest) fastest = cleared[k].questions;
    });
    var runs = streakRuns(m.days.concat(m.frozen));
    var longest = runs.length ? runs.reduce(function (a, b) { return b.len > a.len ? b : a; }).len : 0;
    return {
      earned: m.earnedTotal, beaten: keys.length, perfect: perfect,
      fastest: fastest, longest: longest, days: m.days.length,
      badges: badgeTally()
    };
  }

  /* ---------- entry panel shown when no fight is running ---------- */

  function bossKindHere() {
    var m = mapEntry(PAGE_KEY);
    if (m) return m.isTest ? "unit" : "lesson";
    /* portal not visited yet: fall back to the file name and the page title */
    var h1 = document.querySelector("h1");
    var probe = PAGE_KEY + " " + (h1 ? h1.textContent : "");
    return /practice\s*test/i.test(probe) ? "unit" : "lesson";
  }

  function renderBossEntry() {
    var f = activeFight();
    if (f && f.paused && f.key === PAGE_KEY) { renderBossPaused(); return; }
    if (f) { renderBoss(); return; }
    bossScreen = "entry";
    var box = ensureBossBox();
    if (!box) return;

    var kind = bossKindHere();

    /* A unit boss needs to know which lesson files make up the unit,
       and only the portal can tell us that. */
    if (kind === "unit" && !getManifest().length) {
      box.style.display = "block";
      box.style.border = "2px solid #f59e0b";
      box.innerHTML =
        '<div style="font-size:1.1rem;font-weight:900;color:#92400e">Unit Boss</div>' +
        '<div style="font-size:.88rem;font-weight:600;color:#92400e;margin-top:4px">' +
          "Open the practice portal once so the boss can see which lessons belong to this unit. " +
          "After that it works from anywhere.</div>" +
        '<a href="' + (window.MCF3M_PORTAL_URL || "../index.html") + '" style="display:inline-block;margin-top:10px;' +
        'background:#f59e0b;color:#78350f;border-radius:9px;padding:9px 16px;text-decoration:none;font-weight:800">' +
        "Open the portal &rarr;</a>";
      return;
    }

    var req = requirementFor(kind, PAGE_KEY);
    var ok = req.have >= req.need || devActive();
    var b = getBoss();
    var done = b.cleared[bossId(kind, PAGE_KEY)];
    var price = entryPassPrice(req);
    var inv = getInv();

    var stock = [];
    ["powerCore", "secondWind", "starLens"].forEach(function (k) {
      if (inv[k]) stock.push('<label style="font-size:.82rem;font-weight:700;color:#334155;margin-right:12px">' +
        '<input type="checkbox" data-art="' + k + '" style="vertical-align:-2px"> ' + SHOP[k].name + " \u00d7" + inv[k] + "</label>");
    });

    box.style.display = "block";
    box.style.border = "2px solid #0f172a";
    box.innerHTML =
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div style="font-size:1.15rem;font-weight:900;color:#0f172a">' + BOSS[kind].label + "</div>" +
        (done ? '<div style="font-size:.8rem;font-weight:800;color:#b45309">Best: ' + "\u2605".repeat(done.grade) +
                " in " + done.questions + " questions</div>" : "") +
      "</div>" +
      '<div style="font-size:.88rem;font-weight:600;color:#64748b;margin-top:4px">' +
        BOSS[kind].hp + " HP. Correct answers deal damage; first-try answers deal double. " +
        "Wrong answers never hurt you \u2014 they only let the boss recover a little.</div>" +
      '<div style="margin-top:10px;font-size:.9rem;font-weight:700;color:' + (ok ? "#065f46" : "#92400e") + '">' +
        "Mastered in " + req.label + ": " + req.have + " / " + req.of +
        (ok ? " \u2014 the door is open." : " &nbsp;(need " + req.need + ")") + "</div>" +
      (stock.length ? '<div style="margin-top:10px">' + stock.join("") + "</div>" : "") +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button id="mcf3m-boss-go" style="background:' + (ok ? "#0f172a" : "#94a3b8") + ';color:#fff;border:0;' +
        'border-radius:10px;padding:11px 20px;font-weight:800;cursor:pointer">Enter the boss room</button>' +
        (ok ? "" : '<button id="mcf3m-boss-pass" style="background:#f59e0b;color:#78350f;border:0;border-radius:10px;' +
          'padding:11px 18px;font-weight:800;cursor:pointer">Entry pass \u2014 ' + price + " \u2605</button>") +
      "</div>";

    function begin() {
      var opts = {};
      startFight(kind, opts);
      var f2 = activeFight();
      var inv2 = getInv();
      Array.prototype.forEach.call(box.querySelectorAll("input[data-art]:checked"), function (c) {
        var k = c.getAttribute("data-art");
        if (!inv2[k]) return;
        inv2[k] -= 1; if (!inv2[k]) delete inv2[k];
        if (k === "powerCore") f2.powerCore = 3;
        if (k === "secondWind") f2.secondWind = true;
        if (k === "starLens") f2.starLens = true;
      });
      setInv(inv2);
      saveFight(f2);
      renderBoss();
    }

    renderFinalBlock(box);

    document.getElementById("mcf3m-boss-go").addEventListener("click", function () {
      if (!ok) { toast("Master " + (req.need - req.have) + " more topic(s), or use an entry pass", "#b45309"); return; }
      begin();
    });
    var pb = document.getElementById("mcf3m-boss-pass");
    if (pb) pb.addEventListener("click", function () {
      var m2 = getMeta();
      if (m2.stars < price) { toast("You need " + price + " \u2605 for the pass", "#b91c1c"); return; }
      addStars(-price);
      begin();
    });
  }

  /* 페이지를 열었을 때: 진행 중인 전투가 있으면 이어서, 없으면 입장 안내 */
  function bossOnLoad() {
    var f = activeFight();
    if (!f) { renderBossEntry(); return; }
    if (f.paused && f.key === PAGE_KEY) { renderBossPaused(); return; }
    if (f.key !== PAGE_KEY) {
      var box = ensureBossBox();
      if (!box) return;
      var m = mapEntry(f.key);
      box.style.display = "block";
      box.style.border = "2px solid #f59e0b";
      box.innerHTML =
        '<div style="font-weight:900;color:#92400e">A boss fight is already running</div>' +
        '<div style="font-size:.88rem;font-weight:600;color:#92400e;margin-top:4px">' +
          esc(m ? m.title : "another lesson") + " &mdash; " + f.hp + " / " + f.maxHp + " HP left.</div>" +
        (m ? '<a href="' + esc(relTo(f.key)) + '" style="display:inline-block;margin-top:10px;background:#f59e0b;' +
          'color:#78350f;border-radius:9px;padding:9px 16px;text-decoration:none;font-weight:800">Back to the fight &rarr;</a>' : "");
      return;
    }
    bossAwaiting = true;
    renderBoss();
  }


  /* ============================================================
     SAVE CODE
     ------------------------------------------------------------
     Everything the student owns, squeezed into one line of text
     they can copy somewhere safe or carry to another computer.

       MCF3M3.<payload>.<checksum>

     Loading a code MERGES, it never replaces: for every number the
     better of the two is kept, and every practised day and beaten
     boss from both sides survives. So a student can practise on a
     phone and a laptop and end up with the union of the two, and a
     mistyped or half-copied code is rejected by the checksum before
     it can touch anything.

     Page keys are file names, so a code written from a disk folder
     still lines up with the same site served from a web address.
     ============================================================ */

  var CODE_V = 3;      /* 3 added badges; a version 2 code still loads */

  function hash32(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function utf8ToB64(str) {
    var bytes;
    if (window.TextEncoder) {
      bytes = new TextEncoder().encode(str);
    } else {
      var esc = unescape(encodeURIComponent(str));
      bytes = new Uint8Array(esc.length);
      for (var i = 0; i < esc.length; i++) bytes[i] = esc.charCodeAt(i);
    }
    var bin = "";
    for (var j = 0; j < bytes.length; j += 4096) {
      bin += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(j, j + 4096)));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64ToUtf8(code) {
    var b = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    var bin = atob(b);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (window.TextDecoder) return new TextDecoder().decode(bytes);
    return decodeURIComponent(escape(bin));
  }

  /* days travel as one number plus the gaps between them */
  function packDays(list) {
    var nums = (list || []).map(dayNumber).sort(function (a, b) { return a - b; });
    var out = [], prev = 0;
    nums.forEach(function (n, i) { out.push(i ? n - prev : n); prev = n; });
    return out;
  }
  function unpackDays(arr) {
    var out = [], run = 0;
    (arr || []).forEach(function (d, i) { run = i ? run + d : d; out.push(stampFromNumber(run)); });
    return out;
  }
  function unionStamps(a, b) {
    var seen = {}, out = [];
    (a || []).concat(b || []).forEach(function (s) {
      if (s && !seen[s]) { seen[s] = 1; out.push(s); }
    });
    return out.sort();
  }

  /* ---------- writing ---------- */

  /* The farm travels in the save code. Leaving it out meant a student who
     moved from home to a school machine got their stars and their mastery
     back but found an empty field — the one loss they would feel most.
     Ids rather than indices, so reordering the catalogue later cannot
     silently turn someone's castle into a cabin. */
  function packFarm() {
    if (!farmOn()) return null;
    var f = getFarm();
    return {
      o: Object.keys(f.owned).filter(function (k) { return f.owned[k]; }),
      p: f.plots.map(function (p) { return [p.crop || "", Math.round(p.pts || 0)]; }),
      h: f.house,
      d: f.deco.slice(),
      n: f.names,
      x: f.paid ? 1 : 0
    };
  }

  /* Restoring merges rather than replaces, for the same reason the rest of
     applyCode does: a code carried in from another machine must not be able
     to take away something already standing here. */
  function applyFarm(d) {
    if (!d || !farmOn()) return;
    var f = getFarm();

    (d.o || []).forEach(function (id) { if (farmItem(id)) f.owned[id] = 1; });

    var mine = farmItem(f.house), theirs = farmItem(d.h);
    if (theirs && (!mine || (theirs.tier || 0) > (mine.tier || 0))) f.house = d.h;

    (d.d || []).forEach(function (id) {
      if (farmItem(id) && f.deco.indexOf(id) < 0) f.deco.push(id);
    });

    Object.keys(d.n || {}).forEach(function (k) { if (!f.names[k]) f.names[k] = d.n[k]; });
    if (d.x) f.paid = 1;
    setFarm(f);

    /* plots only exist once the plot items are owned, so size first */
    f = getFarm();
    (d.p || []).forEach(function (pair, i) {
      if (!f.plots[i]) return;
      if (pair[0] && farmItem(pair[0])) f.plots[i].crop = pair[0];
      f.plots[i].pts = Math.max(f.plots[i].pts || 0, pair[1] || 0);
    });
    f.deco.length = Math.min(f.deco.length, decoSlots(f));
    setFarm(f);
  }

  function packState() {
    var m = getMeta(), p = getProgress(), b = getBoss(), inv = getInv(), s = getStudent();

    var pp = {};
    Object.keys(p).forEach(function (k) {
      var e = normalise(p[k]);
      if (!e.attempts && !e.visits) return;
      var tp = {};
      Object.keys(e.topics).forEach(function (id) {
        var t = e.topics[id];
        if (!t.a) return;
        tp[id] = [t.a, t.c, t.run, t.best, t.mastered ? 1 : 0];
      });
      pp[k] = [e.visits, e.attempts, e.correct, Math.round((e.lastAt || 0) / 1000), tp];
    });

    var cl = {};
    Object.keys(b.cleared || {}).forEach(function (id) {
      var c = b.cleared[id];
      cl[id] = [c.grade, c.questions, c.stars, Math.round((c.at || 0) / 1000)];
    });

    return {
      v: CODE_V,
      s: [s.first, s.last],
      m: [m.stars, m.timerSecs, m.timerOn ? 1 : 0, Math.round(m.freezeUsedAt / 1000), m.earnedTotal],
      d: packDays(m.days),
      z: packDays(m.frozen),
      p: pp,
      c: cl,
      f: (b.final && b.final.done) ? b.final.done : [],
      i: inv,
      g: (function () {
        /* counts are recomputed on arrival, but the tier has to travel or
           the artifacts it already paid out would be handed over twice */
        var all = getBadges(), out = {};
        Object.keys(BADGES).forEach(function (id) {
          var b = badgeRow(all, id);
          if (b.n || b.tier) out[id] = [b.n, b.tier];
        });
        return out;
      })(),
      cb: [getMeta().cleanBest],
      th: m.theme || "",
      fm: packFarm(),
      sk: packSkill(),
      at: Math.round(Date.now() / 1000)
    };
  }

  /* The checksum covers the version as well as the payload. Without that,
     editing the single digit in the prefix would still pass the check and
     the reader would quietly drop everything the older format never had. */
  function makeCode() {
    var body = utf8ToB64(JSON.stringify(packState()));
    return "MCF3M" + CODE_V + "." + body + "." + hash32(CODE_V + "." + body);
  }

  /* ---------- reading ---------- */

  function readCode(text) {
    var clean = String(text || "").replace(/\s+/g, "");
    var m = clean.match(/^MCF3M(\d+)\.([A-Za-z0-9_\-]+)\.([a-z0-9]+)$/i);
    if (!m) {
      return { error: "That does not look like a progress code. It should start with MCF3M." };
    }
    if (parseInt(m[1], 10) > CODE_V) {
      return { error: "That code was made by a newer version of the site." };
    }
    if (hash32(m[1] + "." + m[2]) !== m[3].toLowerCase()) {
      return { error: "Some of the code is missing. Copy the whole thing, from MCF3M to the very last character." };
    }
    var data;
    try { data = JSON.parse(b64ToUtf8(m[2])); }
    catch (e) { return { error: "The code could not be read." }; }
    if (!data || !data.v) return { error: "The code could not be read." };
    return { data: data };
  }

  function codeSummary(d) {
    var mastered = 0, files = 0;
    Object.keys(d.p || {}).forEach(function (k) {
      files++;
      var tp = d.p[k][4] || {};
      Object.keys(tp).forEach(function (id) { if (tp[id][4]) mastered++; });
    });
    return {
      name: (((d.s || [])[0] || "") + " " + ((d.s || [])[1] || "")).trim(),
      stars: (d.m || [])[0] || 0,
      mastered: mastered,
      files: files,
      badges: Object.keys(d.g || {}).reduce(function (a, id) {
        return a + ((d.g[id] || [])[1] || 0);
      }, 0),
      bosses: Object.keys(d.c || {}).length,
      days: (d.d || []).length,
      at: (d.at || 0) * 1000
    };
  }

  /* Merge, never replace. */
  function applyCode(d) {
    var s = getStudent();
    if (d.s) setStudent(s.first || d.s[0] || "", s.last || d.s[1] || "");

    var m = getMeta(), dm = d.m || [];
    m.stars = Math.max(m.stars, dm[0] || 0);
    if (dm[1]) m.timerSecs = dm[1];
    m.timerOn = m.timerOn || !!dm[2];
    m.freezeUsedAt = Math.max(m.freezeUsedAt, (dm[3] || 0) * 1000);
    m.earnedTotal = Math.max(m.earnedTotal, dm[4] || 0);
    m.days = unionStamps(m.days, unpackDays(d.d));
    m.frozen = unionStamps(m.frozen, unpackDays(d.z));
    m.backupAt = Math.max(m.backupAt, (d.at || 0) * 1000);
    /* a code from another device carries its world; only adopt it if this
       device has not chosen one yet, so a deliberate switch is not undone */
    if (!m.theme && d.th) m.theme = d.th;
    setMeta(m);
    applyFarm(d.fm);
    applySkill(d.sk);

    var all = getProgress();
    Object.keys(d.p || {}).forEach(function (raw) {
      var row = d.p[raw] || [];
      var inc = blank();
      inc.visits = row[0] || 0;
      inc.attempts = row[1] || 0;
      inc.correct = row[2] || 0;
      inc.lastAt = (row[3] || 0) * 1000;
      Object.keys(row[4] || {}).forEach(function (id) {
        var t = row[4][id] || [];
        inc.topics[normTopic(id)] = {
          a: t[0] || 0, c: t[1] || 0, run: t[2] || 0,
          best: t[3] || 0, mastered: !!t[4]
        };
      });
      var key = keyFor(raw);
      all[key] = all[key] ? mergeEntry(all[key], inc) : inc;
    });
    setProgress(all);

    var b = getBoss();
    b.cleared = b.cleared || {};
    Object.keys(d.c || {}).forEach(function (id) {
      var c = d.c[id] || [];
      var i = id.indexOf(":");
      var nid = i < 0 ? id : id.slice(0, i + 1) + keyFor(id.slice(i + 1));
      b.cleared[nid] = betterClear(b.cleared[nid], {
        grade: c[0] || 1, questions: c[1] || 0, stars: c[2] || 0, at: (c[3] || 0) * 1000
      });
    });
    var done = ((b.final && b.final.done) || []).slice();
    (d.f || []).forEach(function (k) {
      var nk = keyFor(k);
      if (done.indexOf(nk) === -1) done.push(nk);
    });
    b.final = { phase: done.length, done: done };
    setBoss(b);

    var iv = getInv();
    Object.keys(d.i || {}).forEach(function (k) {
      iv[k] = Math.max(iv[k] || 0, d.i[k] || 0);
    });
    setInv(iv);

    var bg = getBadges();
    Object.keys(d.g || {}).forEach(function (id) {
      if (!BADGES[id]) return;
      var row = badgeRow(bg, id), inc = d.g[id] || [];
      bg[id] = {
        n: Math.max(row.n, inc[0] || 0),
        tier: Math.max(row.tier, inc[1] || 0),
        at: row.at || Date.now()
      };
    });
    setBadges(bg);

    var mb = getMeta();
    mb.cleanBest = Math.max(mb.cleanBest, ((d.cb || [])[0]) || 0);
    setMeta(mb);

    /* recompute from the merged records; tiers already granted stay put */
    badgeQueue.length = 0;
    syncBadges({ scan: true });
    badgeQueue.length = 0;
  }

  function markBackedUp() {
    var m = getMeta();
    m.backupAt = Date.now();
    setMeta(m);
  }

  /* ---------- the panel on the portal ---------- */

  function paintCode() {
    var box = document.getElementById("mcf3m-code");
    if (!box) return;

    var m = getMeta();
    var nudge = !m.backupAt && m.stars >= 30;
    var when = m.backupAt
      ? "Last saved to a code " + timeAgo(m.backupAt) + "."
      : "You have never saved a code.";

    box.innerHTML =
      '<div style="border:2px solid ' + (nudge ? "#fca5a5" : "#e2e8f0") + ';background:' +
        (nudge ? "#fef2f2" : "#f8fafc") + ';border-radius:14px;padding:14px 16px">' +
        '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">' +
          '<span style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#94a3b8">SAVE CODE</span>' +
          '<span style="font-size:.82rem;font-weight:700;color:' + (nudge ? "#b91c1c" : "#64748b") + '">' + when + "</span>" +
        "</div>" +
        '<div style="font-size:.86rem;font-weight:600;color:#475569;margin-top:5px">' +
          "Your stars, streaks, mastered topics and beaten bosses live in this browser only. " +
          "Clearing your history erases them. Take a code, keep it somewhere safe " +
          "(an email to yourself works), and you can bring everything back &mdash; " +
          "on this computer or any other." +
        "</div>" +
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
          '<button id="mcf3m-code-make" style="background:#0f172a;color:#fff;border:0;border-radius:9px;' +
            'padding:10px 16px;font-weight:800;cursor:pointer">Show my code</button>' +
          '<button id="mcf3m-code-open" style="background:#fff;color:#334155;border:1px solid #cbd5e1;' +
            'border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer">I have a code</button>' +
        "</div>" +
        '<div id="mcf3m-code-out" style="margin-top:10px"></div>' +
      "</div>";

    document.getElementById("mcf3m-code-make").addEventListener("click", showMyCode);
    document.getElementById("mcf3m-code-open").addEventListener("click", showCodeInput);
  }

  function codeOut() { return document.getElementById("mcf3m-code-out"); }

  function showMyCode() {
    var out = codeOut();
    if (!out) return;
    var code = makeCode();

    out.innerHTML =
      '<div style="font-size:.82rem;font-weight:700;color:#334155">' +
        "Copy all of it. Anything less will not load." +
      "</div>" +
      '<textarea id="mcf3m-code-text" readonly rows="4" style="width:100%;margin-top:6px;padding:9px;' +
        'border:1px solid #cbd5e1;border-radius:9px;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'resize:vertical;word-break:break-all">' + esc(code) + "</textarea>" +
      '<div style="margin-top:7px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<button id="mcf3m-code-copy" style="background:#2563eb;color:#fff;border:0;border-radius:9px;' +
          'padding:9px 16px;font-weight:800;cursor:pointer">Copy to clipboard</button>' +
        '<button id="mcf3m-code-file" style="background:#fff;color:#334155;border:1px solid #cbd5e1;' +
          'border-radius:9px;padding:9px 16px;font-weight:800;cursor:pointer">Download as a file</button>' +
        '<span id="mcf3m-code-said" style="font-size:.82rem;font-weight:800;color:#059669"></span>' +
      "</div>" +
      '<div style="font-size:.78rem;font-weight:600;color:#94a3b8;margin-top:6px">' +
        code.length + " characters. A code taken today does not include anything you do after today." +
      "</div>";

    var ta = document.getElementById("mcf3m-code-text");
    var said = document.getElementById("mcf3m-code-said");

    function ok(msg) {
      markBackedUp();
      if (said) said.textContent = msg;
      window.setTimeout(paintCode, 1400);
    }

    document.getElementById("mcf3m-code-copy").addEventListener("click", function () {
      ta.select();
      ta.setSelectionRange(0, code.length);
      var done = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { ok("Copied"); }, function () {
          if (!done) { try { document.execCommand("copy"); ok("Copied"); } catch (e) { ok("Selected \u2014 press Ctrl+C"); } }
        });
        done = true;
        return;
      }
      try { document.execCommand("copy"); ok("Copied"); }
      catch (e) { ok("Selected \u2014 press Ctrl+C"); }
    });

    document.getElementById("mcf3m-code-file").addEventListener("click", function () {
      var who = displayName().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mcf3m";
      var blob = new Blob([code], { type: "text/plain" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = who + "-mcf3m-" + dayStamp() + ".txt";
      document.body.appendChild(a);
      a.click();
      window.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      ok("Downloaded");
    });
  }

  function showCodeInput() {
    var out = codeOut();
    if (!out) return;

    out.innerHTML =
      '<div style="font-size:.82rem;font-weight:700;color:#334155">' +
        "Paste your code. Nothing gets deleted &mdash; whatever is further ahead wins, " +
        "so it is safe to load an old code by mistake." +
      "</div>" +
      /* audit fix 2026-07-31: 실제 발급 코드는 MCF3M3. 으로 시작하는데 placeholder 는
         MCF3M2 로 남아 있었다. 버전이 또 오르면 자동으로 따라가게 CODE_V 에서 만든다. */
      '<textarea id="mcf3m-code-in" rows="4" placeholder="MCF3M' + CODE_V + '...." style="width:100%;margin-top:6px;padding:9px;' +
        'border:1px solid #cbd5e1;border-radius:9px;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'resize:vertical;word-break:break-all"></textarea>' +
      '<div style="margin-top:7px"><button id="mcf3m-code-check" style="background:#0f172a;color:#fff;border:0;' +
        'border-radius:9px;padding:9px 16px;font-weight:800;cursor:pointer">Check this code</button></div>' +
      '<div id="mcf3m-code-preview" style="margin-top:9px"></div>';

    document.getElementById("mcf3m-code-check").addEventListener("click", function () {
      var res = readCode(document.getElementById("mcf3m-code-in").value);
      var pv = document.getElementById("mcf3m-code-preview");
      if (!pv) return;

      if (res.error) {
        pv.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:9px;' +
          'padding:10px 13px;font-size:.85rem;font-weight:700">' + esc(res.error) + "</div>";
        return;
      }

      var sm = codeSummary(res.data);
      var mine = getMeta();
      pv.innerHTML =
        '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px">' +
          '<div style="font-size:.72rem;font-weight:800;letter-spacing:.09em;color:#1d4ed8">THIS CODE HOLDS</div>' +
          '<div style="font-size:.88rem;font-weight:700;color:#1e3a8a;margin-top:4px">' +
            (sm.name ? esc(sm.name) + " &nbsp;&middot;&nbsp; " : "") +
            sm.stars + " &#9733; &nbsp;&middot;&nbsp; " +
            sm.mastered + " topics mastered &nbsp;&middot;&nbsp; " +
            sm.bosses + " boss" + (sm.bosses === 1 ? "" : "es") + " beaten &nbsp;&middot;&nbsp; " +
            sm.badges + " badge" + (sm.badges === 1 ? "" : "s") + " &nbsp;&middot;&nbsp; " +
            sm.days + " day" + (sm.days === 1 ? "" : "s") + " practised" +
          "</div>" +
          '<div style="font-size:.8rem;font-weight:600;color:#3b82f6;margin-top:3px">' +
            "Written " + (sm.at ? timeAgo(sm.at) : "at an unknown time") +
            ". You have " + mine.stars + " &#9733; on this device right now." +
          "</div>" +
          '<button id="mcf3m-code-load" style="margin-top:10px;background:#2563eb;color:#fff;border:0;' +
            'border-radius:9px;padding:10px 18px;font-weight:800;cursor:pointer">Load it</button>' +
        "</div>";

      document.getElementById("mcf3m-code-load").addEventListener("click", function () {
        applyCode(res.data);
        window.location.reload();
      });
    });
  }

  /* ============================================================
     TESTER MODE
     ------------------------------------------------------------
     Add ?dev to any page URL, or run MCF3M.dev.on() in the console.
     Bypasses every unlock so the whole system can be walked through
     without grinding. Students will never see it unless they turn
     it on themselves.
     ============================================================ */

  var K_DEV = NS + ".dev";
  var DEV = false;

  function devActive() { return DEV; }

  function devInit() {
    if (/[?&]dev\b/.test(window.location.search)) save(K_DEV, true);
    DEV = !!load(K_DEV, false);
    if (DEV) devPanel();
  }

  function devFabricateMastery(m) {
    var e = entry(m.key);
    var n = m.total || 5;
    for (var i = 1; i <= n; i++) {
      var id = "t" + i;
      e.topics[id] = { a: 3, c: 3, run: 3, best: 3, mastered: true };
    }
    e.visits = Math.max(1, e.visits);
    e.lastAt = Date.now();
    commit(m.key, e);
  }

  var devApi = {
    on:  function () { save(K_DEV, true); window.location.reload(); },
    off: function () { save(K_DEV, false); window.location.reload(); },

    stars: function (n) { var m = getMeta(); m.stars = (n === undefined ? 2000 : n); setMeta(m); devRefresh(); return m.stars; },

    /* real topic ids, so the mastery panel on this page updates too */
    masterPage: function () {
      var e = entry(PAGE_KEY);
      topicIds().forEach(function (id) {
        e.topics[normTopic(id)] = { a: 3, c: 3, run: 3, best: 3, mastered: true };
      });
      e.visits = Math.max(1, e.visits); e.lastAt = Date.now();
      commit(PAGE_KEY, e);
      devRefresh();
    },

    /* every file in the manifest - enough for unlock checks */
    masterAll: function () {
      getManifest().forEach(devFabricateMastery);
      devApi.masterPage();
      devRefresh();
    },

    clearUnitBosses: function () {
      var b = getBoss();
      practiceTests().forEach(function (t) {
        b.cleared["unit:" + t.key] = { grade: 3, questions: 12, stars: 80, at: Date.now() };
      });
      setBoss(b); devRefresh();
    },

    give: function (item, n) {
      var iv = getInv();
      if (item) iv[item] = (iv[item] || 0) + (n || 1);
      else Object.keys(SHOP).forEach(function (k) { iv[k] = (iv[k] || 0) + (n || 3); });
      setInv(iv); devRefresh();
    },

    start: function (kind) {
      if (kind === "final") startFight("final", { phase: finalState().done.length });
      else if (kind === "stand") startFight("stand", { id: "stand" });
      else startFight(kind || bossKindHere());
    },

    kill: function () {
      var f = activeFight();
      if (!f) { toast("No fight running", "#b91c1c"); return; }
      f.hp = 0; f.questions = Math.max(1, f.questions); saveFight(f);
      var out = finishFight(f);
      showVictory(f, out);
    },

    setPhase: function (n) {
      var tests = practiceTests();
      setFinalState({ phase: n, done: tests.slice(0, n).map(function (t) { return t.key; }) });
      devRefresh();
    },

    wipe: function () { resetAll(); try { window.localStorage.removeItem(K_BOSS); window.localStorage.removeItem(K_INV); window.localStorage.removeItem(K_KEYS2); } catch (e) {} window.location.reload(); },

    badges: function () { return { rows: getBadges(), tally: badgeTally() }; },

    state: function () {
      return { stars: getMeta().stars, inv: getInv(), boss: getBoss(), manifest: getManifest().length, fight: activeFight() };
    }
  };

  function devRefresh() {
    if (document.getElementById("mcf3m-panel")) { window.location.reload(); return; }
    if (onLesson) { bossScreen = "entry"; renderBossEntry(); refreshLessonUI(); }
    devPaint();
  }

  var devBox = null;

  function devPanel() {
    if (devBox) return;
    devBox = document.createElement("div");
    devBox.id = "mcf3m-dev";
    devBox.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:10001;background:#111827;color:#e5e7eb;" +
      "border:2px solid #dc2626;border-radius:12px;padding:10px 12px;max-width:250px;" +
      "font:600 11px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)";
    document.body.appendChild(devBox);
    devPaint();
  }

  function devPaint() {
    if (!devBox) return;
    var m = getMeta();
    var btn = function (id, label) {
      return '<button data-dev="' + id + '" style="background:#374151;color:#f9fafb;border:0;border-radius:6px;' +
        'padding:5px 8px;margin:2px 2px 0 0;font-size:10px;font-weight:800;cursor:pointer">' + label + "</button>";
    };
    devBox.innerHTML =
      '<div style="font-weight:900;color:#fca5a5;letter-spacing:.08em">TESTER MODE</div>' +
      '<div style="margin-top:2px;color:#9ca3af">' + m.stars + " \u2605 &nbsp;\u00b7&nbsp; " +
        (onLesson ? "lesson page" : "portal") + "</div>" +
      '<div style="margin-top:6px">' +
        btn("stars", "+2000 \u2605") + btn("give", "All items \u00d73") +
        btn("masterPage", "Master page") + btn("masterAll", "Master all") +
        btn("clearUnits", "Clear unit bosses") +
      "</div>" +
      (onLesson ?
      '<div style="margin-top:6px;border-top:1px solid #374151;padding-top:5px">' +
        btn("lesson", "Lesson boss") + btn("unit", "Unit boss") +
        btn("final", "Final") + btn("stand", "Last Stand") + btn("kill", "Kill boss") +
      "</div>" : "") +
      '<div style="margin-top:6px;border-top:1px solid #374151;padding-top:5px">' +
        btn("phase3", "Final phase 3") + btn("wipe", "Wipe all") + btn("off", "Turn off") +
      "</div>";

    Array.prototype.forEach.call(devBox.querySelectorAll("button[data-dev]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-dev");
        if (k === "stars") devApi.stars(getMeta().stars + 2000);
        else if (k === "give") devApi.give(null, 3);
        else if (k === "masterPage") devApi.masterPage();
        else if (k === "masterAll") devApi.masterAll();
        else if (k === "clearUnits") devApi.clearUnitBosses();
        else if (k === "phase3") devApi.setPhase(3);
        else if (k === "wipe") { if (window.confirm("Wipe everything?")) devApi.wipe(); }
        else if (k === "off") devApi.off();
        else if (k === "kill") devApi.kill();
        else devApi.start(k);
      });
    });
  }

  /* ============================================================
     boot
     ============================================================ */

  hookAnswerLogging();

  function boot() {
    migrateKeys();
    if (!initLessonPage()) initIndexPage();
    devInit();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.addEventListener("storage", function (ev) {
    if (ev.key !== K_PROGRESS && ev.key !== K_STUDENT && ev.key !== K_META) return;
    if (document.getElementById("mcf3m-panel")) window.location.reload();
    else if (onLesson) refreshLessonUI();
  });

  window.MCF3M = {
    getStudent: getStudent, setStudent: setStudent,
    getProgress: getProgress, getMeta: getMeta,
    streaks: function () { var m = getMeta(); return streakRuns(m.days.concat(m.frozen)); },
    record: function (topicId, isCorrect, firstTry) {
      var r = record(topicId, isCorrect, firstTry !== false, 0);
      if (onLesson) celebrate(r);
    },
    reset: resetAll, keyFor: keyFor, available: available,
    code: makeCode, readCode: readCode, applyCode: applyCode,
    combo: function () { var n = readCombo(); return { run: n, mult: comboMult(n) }; },
    badges: function () { return { rows: getBadges(), tally: badgeTally() }; },
    syncBadges: function (o) { syncBadges(o || { scan: true }); },
    titles: earnedTitles, trophies: trophyRows, career: careerStats,
    __artHit: artHit,                 /* exposed for the render harness only */
    __skill: {                        /* harness only */
      get: getSkill, set: setSkill, owned: ownedSkills, fire: fireSkill,
      tier: bossTier, weak: bossWeak, pack: packSkill, apply: applySkill,
      catalogue: SKILLS, paint: function () { artPaint(Date.now()); },
      arena: function (kind) { art.on = true; artCanvas(); art.kind = kind || "lesson"; }
    },
    __farmHarvest: farmHarvest, __farmBuy: farmBuy,   /* harness only */
    dev: devApi
  };
  }
})();
