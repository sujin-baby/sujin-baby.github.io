(function () {
  'use strict';
  var D = window.POLICE_DATA;
  var SKEY = 'police-review-v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var dstr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var todayStr = function () { return dstr(new Date()); };
  var ydayStr = function () { var d = new Date(); d.setDate(d.getDate() - 1); return dstr(d); };

  /* ---------- data maps ---------- */
  var SUBJ = {}, COURSE = {};
  D.subjects.forEach(function (s) {
    SUBJ[s.id] = s;
    s.courses.forEach(function (c) { c.subj = s; COURSE[c.id] = c; });
  });
  var QBY = {};   // course -> unit -> [q]
  D.questions.forEach(function (q) {
    (QBY[q.c] = QBY[q.c] || {});
    (QBY[q.c][q.u] = QBY[q.c][q.u] || []).push(q);
  });

  /* ---------- state ---------- */
  var S = {
    xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {},
    ans: 0, ok: 0, muted: false, subj: 'crim', course: {}, qlen: 10, mix: false, days: {}
  };
  try {
    var raw = localStorage.getItem(SKEY);
    if (raw) {
      var p = JSON.parse(raw);
      Object.keys(p).forEach(function (k) { S[k] = p[k]; });
    }
  } catch (e) {}
  if (!S.streak) S.streak = { n: 0, last: '', best: 0 };
  if (!S.course) S.course = {};
  if (!S.checked) S.checked = {};
  if (!S.wrong) S.wrong = {};
  if (!S.days) S.days = {};
  D.subjects.forEach(function (s) {
    if (!S.course[s.id] || !COURSE[S.course[s.id]]) S.course[s.id] = s.courses[0].id;
  });
  if (!SUBJ[S.subj]) S.subj = 'crim';

  function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
  function ckMap(cid) { return S.checked[cid] || (S.checked[cid] = {}); }
  function isChecked(cid, n) { return !!ckMap(cid)[n]; }
  function checkedNums(cid) { return Object.keys(ckMap(cid)).map(Number); }
  function courseQ(cid) {
    var out = [], m = QBY[cid] || {};
    Object.keys(m).forEach(function (u) { out = out.concat(m[u]); });
    return out;
  }

  /* ---------- helpers ---------- */
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.add('hidden'); }, 2200);
  }
  function qs(pool, n) {
    var a = pool.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }
  function unitName(cid, u) { var c = COURSE[cid]; return c.units[u] ? c.units[u].n : ''; }

  /* ---------- sound ---------- */
  var AC = null;
  function tone(f, t0, dur, type, vol) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.06, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(name) {
    if (S.muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var t = AC.currentTime;
      if (name === 'ok') { tone(659, t, 0.1, 'sine', 0.06); tone(988, t + 0.07, 0.14, 'sine', 0.05); }
      else if (name === 'no') { tone(220, t, 0.16, 'square', 0.045); tone(155, t + 0.11, 0.2, 'square', 0.04); }
      else if (name === 'tap') { tone(540, t, 0.05, 'sine', 0.03); }
      else if (name === 'combo') { tone(880, t, 0.07, 'triangle', 0.05); tone(1180, t + 0.06, 0.08, 'triangle', 0.04); }
      else if (name === 'done') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.1, 0.2, 'sine', 0.055); }); }
    } catch (e) {}
  }

  /* ---------- confetti ---------- */
  var COLORS = ['#ffc24b', '#22c55e', '#5b7cfa', '#f97316', '#ec4899', '#14b8a6'];
  function confetti(n) {
    var fx = $('#fx');
    for (var i = 0; i < (n || 22); i++) {
      var el = document.createElement('i');
      el.className = 'conf';
      el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      el.style.left = (30 + Math.random() * 40) + '%';
      el.style.top = (34 + Math.random() * 12) + '%';
      fx.appendChild(el);
      var dx = (Math.random() - 0.5) * 260, dy = -60 - Math.random() * 160, rot = Math.random() * 720 - 360;
      var an = el.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + (dx * 1.4) + 'px,' + (dy + 320) + 'px) rotate(' + (rot * 2) + 'deg)', opacity: 0 }
      ], { duration: 1150 + Math.random() * 400, easing: 'cubic-bezier(.2,.6,.3,1)' });
      an.onfinish = (function (e) { return function () { e.remove(); }; })(el);
    }
  }

  /* ---------- header / tabs ---------- */
  function applyTheme() {
    var s = SUBJ[S.subj];
    document.documentElement.style.setProperty('--c', s.color);
    document.documentElement.style.setProperty('--c-soft', s.accent);
    document.documentElement.style.setProperty('--c-dark', shade(s.color, -0.22));
  }
  function shade(hex, amt) {
    var c = hex.replace('#', '');
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    var f = function (v) { v = Math.round(v + 255 * amt); return Math.max(0, Math.min(255, v)); };
    return '#' + [f(r), f(g), f(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function renderHud() {
    $('#streakN').textContent = S.streak.n || 0;
    $('#xpN').textContent = S.xp || 0;
    $('#mute').textContent = S.muted ? '🔇' : '🔊';
  }
  function renderSubtabs() {
    var el = $('#subtabs'); el.innerHTML = '';
    D.subjects.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'stab' + (s.id === S.subj ? ' on' : '');
      if (s.id === S.subj) b.style.background = s.color;
      b.innerHTML = '<b>' + s.emoji + ' ' + s.name + '</b><i>' + s.teacher + '</i>';
      b.onclick = function () {
        if (S.subj === s.id) return;
        S.subj = s.id; save(); sfx('tap');
        renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      el.appendChild(b);
    });
  }

  /* ---------- stage ---------- */
  function curCourse() { return COURSE[S.course[S.subj]]; }

  function todayLectures(cid) {
    var m = ckMap(cid), t = todayStr(), out = [];
    Object.keys(m).forEach(function (n) { if (m[n] === t) out.push(Number(n)); });
    return out.sort(function (a, b) { return a - b; });
  }
  function latestLectures(cid) {
    var m = ckMap(cid), best = '', nums = [];
    Object.keys(m).forEach(function (n) { if (m[n] > best) best = m[n]; });
    if (!best) return { date: '', nums: [] };
    Object.keys(m).forEach(function (n) { if (m[n] === best) nums.push(Number(n)); });
    return { date: best, nums: nums.sort(function (a, b) { return a - b; }) };
  }

  var lastCourse = '';
  function renderStage() {
    var s = SUBJ[S.subj], c = curCourse();
    if (!c) return;
    if (lastCourse !== c.id) { lastCourse = c.id; $('#path')._scrolled = false; }
    $('#heroSub').textContent = s.name + ' · ' + s.teacher + ' 교수';
    $('#heroName').textContent = c.name;
    var done = checkedNums(c.id).length;
    $('#progBar').style.width = Math.min(100, (done / c.total) * 100) + '%';
    var tL = todayLectures(c.id);
    $('#progTxt').textContent = done + ' / ' + c.total + '강';
    var note = '';
    var btn = $('#ctaToday');
    if (done === 0) {
      btn.textContent = '먼저 강의를 체크해 주세요';
      btn.onclick = function () { openSheet(c.id, nextLecture(c.id)); };
      note = '아래 노드를 눌러 오늘 들은 강의를 체크하면 그 강의 문제가 열립니다.';
    } else if (tL.length) {
      btn.textContent = '오늘 들은 ' + tL.length + '강 문제 풀기';
      btn.onclick = function () { startSession('today'); };
      note = '오늘 체크한 ' + fmtNums(tL) + '강에서 문제가 나옵니다.';
    } else {
      var lt = latestLectures(c.id);
      btn.textContent = '최근 들은 강의 문제 풀기';
      btn.onclick = function () { startSession('today'); };
      note = '오늘은 아직 체크한 강의가 없어 ' + lt.date.slice(5).replace('-', '/') + '에 들은 ' + fmtNums(lt.nums) + '강으로 복습합니다.';
    }
    $('#heroNote').textContent = note;
    $('#ctaAll').onclick = function () { startSession('all'); };
    $('#ctaWrong').onclick = function () { startSession('wrong'); };
    $('#courseBtn').onclick = openCourseSheet;
    renderPath(c);
  }
  function fmtNums(a) {
    if (!a.length) return '';
    if (a.length <= 3) return a.join('·') + '강';
    return a[0] + '강 외 ' + (a.length - 1) + '강';
  }
  function nextLecture(cid) {
    var m = ckMap(cid);
    for (var i = 1; i <= COURSE[cid].total; i++) if (!m[i]) return i;
    return COURSE[cid].total;
  }

  function renderPath(c) {
    var path = $('#path'); path.innerHTML = '';
    var wrap = path.parentElement;
    var W = wrap.clientWidth || 360;
    path.style.height = (c.lec.length * 88 + 60) + 'px';
    var pts = [], today = todayStr(), doneSet = ckMap(c.id);
    var cur = nextLecture(c.id);
    c.lec.forEach(function (L, i) {
      var x = W / 2 + Math.sin(i * 0.78) * (W * 0.27);
      var y = 40 + i * 88;
      pts.push([x, y]);
      var w = document.createElement('div');
      w.className = 'node-wrap';
      w.style.left = x + 'px'; w.style.top = y + 'px';
      var b = document.createElement('button');
      var cls = 'node';
      if (doneSet[L.n]) cls += ' done';
      else if (L.n === cur) cls += ' current';
      if (doneSet[L.n] === today) cls += ' today';
      b.className = cls;
      b.innerHTML = '<span class="num">' + L.n + '</span>';
      b.setAttribute('aria-label', L.n + '강');
      b.onclick = function () { sfx('tap'); openSheet(c.id, L.n); };
      w.appendChild(b);
      if (L.n === cur) {
        var tg = document.createElement('span'); tg.className = 'node-tag'; tg.textContent = '여기서부터';
        w.appendChild(tg);
      } else if (L.n === 1) {
        var t2 = document.createElement('span'); t2.className = 'node-tag gold'; t2.textContent = 'START';
        w.appendChild(t2);
      }
      path.appendChild(w);
    });
    // connecting line
    var svg = $('#pathSvg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (c.lec.length * 88 + 60));
    svg.setAttribute('width', W);
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var lastDone = -1;
    c.lec.forEach(function (L, i) { if (doneSet[L.n]) lastDone = i; });
    var dDone = lastDone > 0 ? pts.slice(0, lastDone + 1).map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') : '';
    svg.innerHTML = '<path d="' + d + '" fill="none" stroke="#dfe5f0" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 13"/>' +
      (dDone ? '<path d="' + dDone + '" fill="none" stroke="' + SUBJ[S.subj].color + '" stroke-width="7" stroke-linecap="round" stroke-opacity=".5"/>' : '');
    // scroll to current
    if (!path._scrolled) {
      path._scrolled = true;
      var target = 40 + (Math.min(cur, c.lec.length) - 1) * 88 - (window.innerHeight * 0.45);
      setTimeout(function () { window.scrollTo({ top: Math.max(0, target), behavior: 'auto' }); }, 60);
    }
  }

  /* ---------- sheet ---------- */
  function closeSheet() { $('#sheet').classList.add('hidden'); }
  function openSheet(cid, n) {
    var c = COURSE[cid], L = c.lec[n - 1];
    if (!L) return;
    var on = isChecked(cid, n);
    var pool = poolForLecture(cid, n);
    var st = pool.length ? '<span class="pill">문제 ' + pool.length + '개 있음</span>' : '<span class="pill plan">이 회차 전용 문제는 아직 없음 · 같은 단원 문제로 출제</span>';
    var isCur = n === nextLecture(cid);
    $('#sheetIn').innerHTML =
      '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">' + c.name + ' · ' + n + '강' + (L.up ? '' : ' <span class="pill plan">업로드 예정</span>') + (on ? ' <span class="pill done">체크됨</span>' : '') + '</div>' +
      '<div class="sheet-title">' + esc(L.t) + '</div>' +
      '<div class="sheet-meta">' + (c.units ? '' : '') + (unitOf(cid, n) ? unitOf(cid, n) : '') + ' ' + st + '</div>' +
      '<button class="btn ' + (on ? 'ghost' : 'primary') + '" id="shToggle">' + (on ? '체크 해제' : '이 강의 들었어요 ✓') + '</button>' +
      '<button class="btn ghost" id="shQuiz" ' + (on && pool.length ? '' : 'disabled style="opacity:.45"') + '>이 강의 문제 풀기</button>' +
      (isCur ? '<button class="btn ghost" id="shNext">다음 강의 보기 →</button>' : '');
    $('#sheet').classList.remove('hidden');
    $('#shToggle').onclick = function () {
      if (isChecked(cid, n)) { delete ckMap(cid)[n]; toast(n + '강 체크를 해제했어요'); }
      else { ckMap(cid)[n] = todayStr(); touchDay(); toast(n + '강 체크! 오늘의 복습에 들어갑니다'); sfx('ok'); }
      save(); closeSheet(); renderAll();
    };
    var qb = $('#shQuiz');
    if (qb) qb.onclick = function () { closeSheet(); startSession('lecture', { cid: cid, n: n }); };
    var nb = $('#shNext');
    if (nb) nb.onclick = function () { openSheet(cid, Math.min(c.total, n + 1)); };
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function unitOf(cid, n) {
    var c = COURSE[cid];
    for (var i = 0; i < c.units.length; i++) if (n >= c.units[i].a && n <= c.units[i].b) return c.units[i].n;
    return '';
  }
  function openCourseSheet() {
    var s = SUBJ[S.subj];
    var html = '<button class="sheet-close" data-close="1">✕</button><div class="sheet-num">' + s.name + ' · ' + s.teacher + ' 교수</div><div class="sheet-title">강좌 선택</div><div class="sheet-meta">본인이 듣는 강좌를 고르면 진도가 그 강좌 기준으로 쌓입니다.</div>';
    s.courses.forEach(function (c) {
      var d = checkedNums(c.id).length;
      html += '<button class="btn ' + (S.course[s.id] === c.id ? 'primary' : 'ghost') + '" data-c="' + c.id + '" style="justify-content:space-between">' +
        '<span>' + esc(c.name) + '</span><span style="font-size:12px;opacity:.8">' + d + '/' + c.total + '강</span></button>';
    });
    $('#sheetIn').innerHTML = html;
    $('#sheet').classList.remove('hidden');
    $$('#sheetIn [data-c]').forEach(function (b) {
      b.onclick = function () {
        S.course[s.id] = b.getAttribute('data-c');
        $('#path')._scrolled = false; save(); closeSheet(); renderAll(); sfx('tap');
      };
    });
  }

  /* ---------- pools ---------- */
  function poolForLecture(cid, n) {
    var c = COURSE[cid], out = [];
    c.units.forEach(function (u, i) {
      if (n >= u.a && n <= u.b) out = out.concat(QBY[cid] && QBY[cid][i] ? QBY[cid][i] : []);
    });
    return out;
  }
  function poolForCourse(cid, nums) {
    var c = COURSE[cid], out = [];
    if (!nums.length) return out;
    c.units.forEach(function (u, i) {
      var hit = nums.some(function (n) { return n >= u.a && n <= u.b; });
      if (hit && QBY[cid] && QBY[cid][i]) out = out.concat(QBY[cid][i]);
    });
    return out;
  }
  function poolForSubject(subjId, numsFilter) {
    var s = SUBJ[subjId], out = [];
    s.courses.forEach(function (c) {
      var nums = checkedNums(c.id);
      if (numsFilter === 'today') {
        var m = ckMap(c.id), t = todayStr();
        nums = Object.keys(m).filter(function (n) { return m[n] === t; }).map(Number);
        if (!nums.length) {
          var lt = latestLectures(c.id);
          nums = lt.nums;
        }
      }
      out = out.concat(poolForCourse(c.id, nums));
    });
    return out;
  }
  function poolWrong() {
    var ids = Object.keys(S.wrong);
    return D.questions.filter(function (q) {
      if (!ids.length) return false;
      if (!S.wrong[q.i]) return false;
      if (S.mix) return true;
      return q.s === S.subj;
    });
  }

  /* ---------- review view ---------- */
  function renderReview() {
    var c = curCourse(), s = SUBJ[S.subj];
    var tN = todayLectures(c.id).length;
    var allN = checkedNums(c.id).length;
    var wrongN = D.questions.filter(function (q) { return S.wrong[q.i] && (S.mix || q.s === S.subj); }).length;
    $('#reviewSub').textContent = (S.mix ? '전체 과목' : s.name) + ' · 들은 강의에서만 문제가 나옵니다.';
    $('#mTodayTxt').textContent = tN ? '오늘 체크한 ' + tN + '강' : '오늘 체크한 강의 없음 (최근 강의로)';
    $('#mAllTxt').textContent = '지금까지 들은 ' + allN + '강 누적';
    $('#mWrongTxt').textContent = wrongN ? wrongN + '문제 대기' : '오답 없음';
    $$('#lenChips .chip').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-len')) === S.qlen);
    });
    $('#mixAll').checked = !!S.mix;
  }

  /* ---------- stats ---------- */
  function renderStats() {
    $('#stStreak').textContent = S.streak.n || 0;
    $('#stStreak').nextElementSibling.textContent = '연속 학습일 (최고 ' + (S.streak.best || 0) + '일)';
    $('#stXp').textContent = S.xp || 0;
    $('#stAcc').textContent = S.ans ? Math.round((S.ok / S.ans) * 100) + '%' : '-';
    $('#stAns').textContent = S.ans || 0;
    var el = $('#stProg'); el.innerHTML = '';
    D.subjects.forEach(function (s) {
      s.courses.forEach(function (c) {
        var d = checkedNums(c.id).length;
        if (!d && s.courses.length > 1) return;
        var w = document.createElement('div');
        w.className = 'prog-item';
        w.innerHTML = '<div class="pi-top"><span>' + s.emoji + ' ' + s.name + ' · ' + esc(c.name) + '</span><i>' + d + '/' + c.total + '강</i></div>' +
          '<div class="bar"><i style="width:' + Math.min(100, d / c.total * 100) + '%;background:' + s.color + '"></i></div>';
        el.appendChild(w);
      });
    });
    if (!el.children.length) el.innerHTML = '<div class="empty">아직 체크한 강의가 없어요.</div>';
    var wl = $('#stWrong'); wl.innerHTML = '';
    var arr = D.questions.filter(function (q) { return S.wrong[q.i]; })
      .sort(function (a, b) { return ((S.wrong[b.i]||{}).c || 1) - ((S.wrong[a.i]||{}).c || 1); });
    if (!arr.length) wl.innerHTML = '<div class="empty">틀린 문제가 여기에 쌓입니다. 맞히면 자동으로 지워져요.</div>';
    arr.slice(0, 40).forEach(function (q) {
      var d = document.createElement('div');
      d.className = 'wrong-item';
      d.innerHTML = '<span class="wi-tag">' + SUBJ[q.s].name + ' · ' + unitName(q.c, q.u) + ' · ' + (S.wrong[q.i].c || 1) + '번 틀림</span>' +
        esc(q.q) + '<div class="wi-e">정답: ' + esc(q.o[q.a]) + '<br>' + esc(q.e) + '</div>';
      wl.appendChild(d);
    });
  }

  /* ---------- quiz ---------- */
  var QS = null;
  function startSession(mode, opt) {
    opt = opt || {};
    var pool = [], title = '';
    if (mode === 'lecture') {
      pool = poolForLecture(opt.cid, opt.n);
      title = COURSE[opt.cid].name + ' ' + opt.n + '강';
    } else if (mode === 'wrong') {
      pool = poolWrong();
      title = '오답 집중 복습';
    } else {
      pool = S.mix ? D.subjects.reduce(function (a, s) { return a.concat(poolForSubject(s.id, mode)); }, []) : poolForSubject(S.subj, mode);
      title = mode === 'today' ? '오늘 들은 강의' : '누적 랜덤 복습';
    }
    if (!pool.length) {
      if (mode === 'wrong') toast('아직 오답이 없어요. 먼저 문제를 풀어 주세요.');
      else if (mode === 'lecture') toast('이 강의 문제가 아직 없어요. 다른 강의를 체크해 보세요.');
      else toast('먼저 스테이지에서 들은 강의를 체크해 주세요.');
      return;
    }
    var n = mode === 'lecture' ? Math.min(pool.length, 6) : Math.min(pool.length, S.qlen);
    var items = qs(pool, n).map(function (q) {
      var order = [0, 1, 2, 3];
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
      return { q: q, order: order };
    });
    QS = { items: items, i: 0, ok: 0, combo: 0, maxCombo: 0, xp: 0, mode: mode, title: title, locked: false, sel: -1, opt: opt };
    document.body.style.overflow = 'hidden';
    $('#quiz').classList.remove('hidden');
    $('#qCombo').textContent = '🔥 0';
    renderQ();
  }

  function renderQ() {
    var it = QS.items[QS.i], q = it.q;
    QS.locked = false; QS.sel = -1;
    $('#qBar').style.width = (QS.i / QS.items.length * 100) + '%';
    var tag = SUBJ[q.s].name + ' · ' + (COURSE[q.c].name ? COURSE[q.c].name + ' · ' : '') + unitName(q.c, q.u);
    var keys = ['A', 'B', 'C', 'D'];
    var h = '<div class="q-tag">' + esc(tag) + '</div>' +
      '<h2 class="q-text">' + esc(q.q) + '</h2><div class="opts">';
    it.order.forEach(function (oi, idx) {
      h += '<button class="opt" data-i="' + oi + '"><span class="k">' + keys[idx] + '</span><span>' + esc(q.o[oi]) + '</span></button>';
    });
    h += '</div>';
    $('#qBody').innerHTML = h;
    $('#qBody').scrollTop = 0;
    $('#qFb').classList.add('hidden');
    $$('#qBody .opt').forEach(function (b) {
      b.onclick = function () { answer(Number(b.getAttribute('data-i')), b); };
    });
  }

  function answer(oi, btn) {
    if (QS.locked) return;
    QS.locked = true;
    var it = QS.items[QS.i], q = it.q;
    var right = oi === q.a;
    $$('#qBody .opt').forEach(function (b) {
      var i = Number(b.getAttribute('data-i'));
      b.disabled = true;
      if (i === q.a) b.classList.add('ok');
    });
    if (!right) btn.classList.add('no');
    // state
    if (!S.days[todayStr()]) S.days[todayStr()] = { xp: 0, ans: 0, ok: 0 };
    var day = S.days[todayStr()];
    S.ans++; day.ans = (day.ans || 0) + 1;
    if (right) {
      S.ok++; day.ok = (day.ok || 0) + 1;
      QS.ok++; QS.combo++; QS.maxCombo = Math.max(QS.maxCombo, QS.combo);
      var gain = 10 + Math.min(10, (QS.combo - 1) * 2);
      QS.xp += gain; S.xp += gain; day.xp = (day.xp || 0) + gain;
      delete S.wrong[q.i];
      $('#qCombo').textContent = '🔥 ' + QS.combo;
      if (QS.combo > 1) { $('#qCombo').classList.add('hot'); setTimeout(function () { $('#qCombo').classList.remove('hot'); }, 320); }
      sfx('ok'); confetti(24);
      fb(true, q, gain);
    } else {
      QS.combo = 0;
      QS.xp += 3; S.xp += 3; day.xp = (day.xp || 0) + 3;
      var w = S.wrong[q.i] || { c: 0 };
      S.wrong[q.i] = { c: (w.c || 0) + 1, d: todayStr() };
      $('#qCombo').textContent = '🔥 0';
      sfx('no');
      var qb = $('#quiz'); qb.classList.add('shake'); setTimeout(function () { qb.classList.remove('shake'); }, 320);
      fb(false, q, 3);
    }
    touchStreak();
    save();
    renderHud();
  }

  function fb(ok, q, gain) {
    var el = $('#qFb');
    el.classList.remove('hidden', 'ok', 'no');
    el.classList.add(ok ? 'ok' : 'no');
    el.querySelector('.fb-head').innerHTML = (ok ? '정답이에요! 🎉' : '아쉬워요 😢') + '<span class="fb-xp">+' + gain + ' XP</span>';
    el.querySelector('.fb-text').innerHTML = '<b>해설</b> · ' + esc(q.e);
    var b = $('#fbNext');
    b.textContent = QS.i + 1 >= QS.items.length ? '결과 보기' : '다음 문제';
  }

  function nextQ() {
    $('#qFb').classList.add('hidden');
    if (QS.i + 1 >= QS.items.length) return finish();
    QS.i++; renderQ();
  }

  function finish() {
    var tot = QS.items.length, ok = QS.ok, acc = Math.round(ok / tot * 100);
    var bonus = acc === 100 ? 20 : 10;
    S.xp += bonus;
    if (S.days[todayStr()]) S.days[todayStr()].xp = (S.days[todayStr()].xp || 0) + bonus;
    save();
    sfx('done'); confetti(60);
    var emoji = acc === 100 ? '🏆' : acc >= 80 ? '🎯' : acc >= 50 ? '💪' : '📚';
    var msg = acc === 100 ? '완벽해요! 오늘 몫 끝!' : acc >= 80 ? '아주 좋아요!' : acc >= 50 ? '조금만 더!' : '틀린 문제는 오답노트에 담아뒀어요';
    $('#qBar').style.width = '100%';
    $('#qBody').innerHTML =
      '<div class="summary"><div class="big">' + emoji + '</div><h2>' + ok + ' / ' + tot + ' 정답</h2><p>' + msg + '</p>' +
      '<div class="rows"><div class="row"><span>정답률</span><i>' + acc + '%</i></div>' +
      '<div class="row"><span>최대 콤보</span><i>🔥 ' + QS.maxCombo + '</i></div>' +
      '<div class="row"><span>얻은 XP</span><i>+' + (QS.xp + bonus) + '</i></div>' +
      '<div class="row"><span>연속 학습</span><i>🔥 ' + S.streak.n + '일</i></div></div>' +
      '<button class="btn primary wide" id="qAgain">한 번 더</button>' +
      '<button class="btn ghost wide" id="qHome">스테이지로</button></div>';
    $('#qFb').classList.add('hidden');
    var modeNow = QS.mode, optNow = QS.opt || {};
    var again = $('#qAgain');
    if (again) again.onclick = function () {
      closeQuiz();
      startSession(modeNow, optNow);
    };
    var home = $('#qHome');
    if (home) home.onclick = function () { closeQuiz(); renderAll(); };
    renderHud(); renderReview(); renderStats();
  }

  function closeQuiz() {
    document.body.style.overflow = '';
    $('#quiz').classList.add('hidden');
    $('#qBody').innerHTML = '';
    $('#qFb').classList.add('hidden');
    QS = null;
  }

  function touchStreak() {
    var t = todayStr(), st = S.streak;
    if (st.last === t) return;
    st.n = st.last === ydayStr() ? (st.n || 0) + 1 : 1;
    st.last = t;
    st.best = Math.max(st.best || 0, st.n);
  }
  function touchDay() {
    if (!S.days[todayStr()]) S.days[todayStr()] = { xp: 0, ans: 0, ok: 0 };
  }

  /* ---------- render all ---------- */
  function renderAll() {
    applyTheme(); renderHud(); renderSubtabs(); renderStage(); renderReview(); renderStats();
  }

  /* ---------- events ---------- */
  $('#mute').onclick = function () {
    S.muted = !S.muted; save(); renderHud();
    if (!S.muted) sfx('tap');
  };
  $$('.tab').forEach(function (b) {
    b.onclick = function () {
      $$('.tab').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var v = b.getAttribute('data-view');
      ['stage', 'review', 'stats'].forEach(function (k) {
        $('#view-' + k).classList.toggle('hidden', k !== v);
      });
      window.scrollTo({ top: 0 });
      if (v === 'stage') { $('#path')._scrolled = false; renderStage(); }
      if (v === 'review') renderReview();
      if (v === 'stats') renderStats();
    };
  });
  $('#mToday').onclick = function () { startSession('today'); };
  $('#mAll').onclick = function () { startSession('all'); };
  $('#mWrong').onclick = function () { startSession('wrong'); };
  $$('#lenChips .chip').forEach(function (b) {
    b.onclick = function () { S.qlen = Number(b.getAttribute('data-len')); save(); renderReview(); sfx('tap'); };
  });
  $('#mixAll').onchange = function () { S.mix = this.checked; save(); renderReview(); };
  $('#qClose').onclick = function () { closeQuiz(); renderAll(); };
  $('#fbNext').onclick = nextQ;
  $('#sheet').addEventListener('click', function (e) {
    if (e.target.getAttribute && e.target.getAttribute('data-close')) closeSheet();
  });
  $('#reset').onclick = function () {
    if (!confirm('학습 기록(진도·XP·스트릭·오답)을 모두 지울까요?')) return;
    S = { xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {}, ans: 0, ok: 0, muted: S.muted, subj: S.subj, course: {}, qlen: 10, mix: false, days: {} };
    D.subjects.forEach(function (s) { S.course[s.id] = s.courses[0].id; });
    save(); $('#path')._scrolled = false; renderAll(); toast('초기화했어요');
  };
  $('#installTip').onclick = function () {
    toast('사파리 하단 공유(⬆️) → "홈 화면에 추가"');
  };
  window.addEventListener('resize', function () {
    if (!$('#view-stage').classList.contains('hidden')) renderStage();
  });

  /* ---------- boot ---------- */
  renderAll();
  if (D.questions.length === 0) toast('문제 데이터를 불러오지 못했어요');
})();
