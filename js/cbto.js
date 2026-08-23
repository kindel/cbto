(function () {
  var cfg = window.CBTO || {};
  var lensesUrl = cfg.lenses || "data/lenses.json";
  var interpUrl = cfg.interpretations || "data/interpretations.json";
  var RUNS_KEY = "cbto-runs";

  // --- model ---------------------------------------------------------------
  // Pure functions, no DOM. scripts/check_reading.js lifts these by name and
  // runs them against every possible input, so keep them self-contained.

  function validStack(s) {
    if (typeof s !== "string" || s.length !== 4) return false;
    var seen = {};
    for (var i = 0; i < 4; i++) {
      var ch = s.charAt(i);
      if ("CBTO".indexOf(ch) < 0 || seen[ch]) return false;
      seen[ch] = true;
    }
    return true;
  }

  function validJoy(j) {
    // A joy set is the letters marked joy, in C, B, T, O order.
    if (typeof j !== "string" || j.length > 4) return false;
    var last = -1;
    for (var i = 0; i < j.length; i++) {
      var k = "CBTO".indexOf(j.charAt(i));
      if (k <= last) return false;
      last = k;
    }
    return true;
  }

  function rankOf(stack, letter) {
    return stack.indexOf(letter);
  }

  function footrule(a, b) {
    var d = 0;
    for (var i = 0; i < 4; i++) d += Math.abs(rankOf(b, a.charAt(i)) - i);
    return d;
  }

  function overlap(a, b) {
    var m = 0;
    for (var i = 0; i < 4; i++) if (a.charAt(i) === b.charAt(i)) m++;
    return m;
  }

  function growthEdge(s, e) {
    // The lens ranked furthest above its strengths position. Ties go to the
    // lens with more energy behind it. Null only when the stacks are equal.
    var best = null;
    var bestDiff = 0;
    for (var i = 0; i < 4; i++) {
      var diff = rankOf(s, e.charAt(i)) - i;
      if (diff > bestDiff) {
        bestDiff = diff;
        best = e.charAt(i);
      }
    }
    return best;
  }

  function signals(s, e, n, j) {
    var fs = footrule(e, s);
    var fn = footrule(e, n);
    var edge = growthEdge(s, e);
    return {
      superpower: s.charAt(0),
      edge: edge,
      comfort: s === n ? "same" : fs < fn ? "strengths" : fn < fs ? "role" : "even",
      blindSpot: rankOf(s, n.charAt(0)) >= 2 ? n.charAt(0) : null,
      en: overlap(e, n),
      sn: overlap(s, n),
      joy: j == null ? null : j,
      edgeDrained: j != null && edge != null && j.indexOf(edge) < 0,
      superDrained: j != null && j.indexOf(s.charAt(0)) < 0
    };
  }

  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  function buildReading(sig, names, interp) {
    var out = [];
    out.push({ key: "superpower", text: fill(interp.superpower, { lens: names[sig.superpower] }) });
    if (sig.edge) out.push({ key: "growth_edge", text: fill(interp.growth_edge, { lens: names[sig.edge] }) });
    else out.push({ key: "growth_edge_none", text: interp.growth_edge_none });
    if (sig.blindSpot) out.push({ key: "blind_spot", text: fill(interp.blind_spot, { lens: names[sig.blindSpot] }) });
    out.push({ key: "comfort_" + sig.comfort, text: interp["comfort_" + sig.comfort] });
    out.push({ key: "alignment", text: fill(interp.alignment, { en: sig.en, sn: sig.sn }) });
    if (sig.joy != null) {
      if (sig.edgeDrained) out.push({ key: "joy_clash", text: fill(interp.joy_clash, { lens: names[sig.edge] }) });
      if (sig.superDrained) out.push({ key: "joy_superpower_drain", text: fill(interp.joy_superpower_drain, { lens: names[sig.superpower] }) });
      if (!sig.edgeDrained && !sig.superDrained) {
        if (sig.edge != null) out.push({ key: "joy_clear", text: interp.joy_clear });
        else out.push({ key: "joy_clear_no_edge", text: interp.joy_clear_no_edge });
      }
    }
    out.push({ key: "closing", text: interp.closing });
    return out;
  }

  function encodeState(st) {
    var q = "?s=" + st.s + "&e=" + st.e + "&n=" + st.n;
    if (st.j != null) q += "&j=" + st.j;
    return q;
  }

  function decodeState(qs) {
    var p = new URLSearchParams(qs);
    var s = p.get("s");
    var e = p.get("e");
    var n = p.get("n");
    var j = p.get("j");
    if (!validStack(s) || !validStack(e) || !validStack(n)) return null;
    if (j != null && !validJoy(j)) return null;
    return { s: s, e: e, n: n, j: j == null ? null : j };
  }
  // --- end model -----------------------------------------------------------

  var root = document.getElementById("cbto-app");
  if (!root) return;

  var RANKS = [
    {
      key: "s",
      title: "Current strengths",
      ask: "Who are you closest to matching?",
      hint: "For each lens, think of someone you have actually worked with who was your hero at that work. Were they world class? Rank by the remaining gap to their bar. Smallest gap at the top. Not what you enjoy. Not your job title."
    },
    {
      key: "e",
      title: "Future energy",
      ask: "Where should your energy go over the next 5–10 years?",
      hint: "Rank by where growth matters most, given the roles you want next."
    },
    {
      key: "n",
      title: "Role needs",
      ask: "What does your current role actually need?",
      hint: "Rank by importance to the job: the role, the manager, the team. Rank the job, not yourself."
    }
  ];

  var lenses = [];
  var names = {};
  var PIEP = { C: "Product", B: "Industry", T: "Execution", O: "People" };
  var interp = null;
  var orders = { s: "CBTO".split(""), e: "CBTO".split(""), n: "CBTO".split("") };
  var joySel = { C: null, B: null, T: null, O: null };
  var heroes = { C: "", B: "", T: "", O: "" };

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function lensByLetter(ch) {
    for (var i = 0; i < lenses.length; i++) if (lenses[i].letter === ch) return lenses[i];
    return null;
  }

  function loadRuns() {
    try {
      var raw = localStorage.getItem(RUNS_KEY);
      var runs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(runs)) return [];
      return runs.filter(function (r) {
        return r && validStack(r.s) && validStack(r.e) && validStack(r.n) && (r.j == null || validJoy(r.j));
      });
    } catch (err) {
      return [];
    }
  }

  function saveRun(st) {
    try {
      var runs = loadRuns();
      var last = runs[runs.length - 1];
      var today = new Date().toISOString().slice(0, 10);
      var sameStacks = last && last.s === st.s && last.e === st.e && last.n === st.n && (last.j == null ? null : last.j) === st.j;
      if (sameStacks && last.t === today) return runs;
      runs.push({ t: today, s: st.s, e: st.e, n: st.n, j: st.j });
      if (runs.length > 24) runs = runs.slice(runs.length - 24);
      localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
      return runs;
    } catch (err) {
      return [];
    }
  }

  function renderIntro(showTeach) {
    var html = '<div class="cbto-intro">' +
      "<p>The exercise is three stack ranks of the same four lenses: what you are strongest at today, where your energy should go next, and what your current role needs. The gaps between the three stacks are the point.</p>" +
      "<p>It takes about three minutes. There are no ties: the forced rank is the exercise.</p>" +
      '<div class="cbto-actions">' +
      '<button type="button" class="cbto-btn cbto-btn-primary" id="cbto-start">Start the rank</button>' +
      '<button type="button" class="cbto-btn" id="cbto-teach-toggle" aria-expanded="' + (showTeach ? "true" : "false") + '">' +
      (showTeach ? "Hide the lenses" : "Learn the lenses first") + "</button>" +
      "</div></div>";
    if (showTeach) {
      html += '<div class="cbto-teach">';
      lenses.forEach(function (l) {
        html += '<div class="cbto-teach-card cbto-lens-' + l.letter.toLowerCase() + '">' +
          "<h3>" + esc(l.name) +
          (l.aliases && l.aliases.length ? ' <span class="cbto-aka">also called ' + esc(l.aliases.join(", ")) + "</span>" : "") +
          "</h3><p>" + esc(l.definition) + "</p><ul>" +
          l.examples.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
          "</ul></div>";
      });
      html += "</div>";
    }
    root.innerHTML = html;
    document.getElementById("cbto-start").addEventListener("click", function () { renderRank(0); });
    document.getElementById("cbto-teach-toggle").addEventListener("click", function () { renderIntro(!showTeach); });
  }

  function examplesHtml() {
    var html = '<details class="cbto-examples"><summary>What counts as each lens</summary>';
    lenses.forEach(function (l) {
      html += '<div class="cbto-example cbto-lens-' + l.letter.toLowerCase() + '"><strong>' + esc(l.name) + "</strong>" +
        (l.aliases && l.aliases.length ? ' <span class="cbto-aka">also called ' + esc(l.aliases.join(", ")) + "</span>" : "") +
        "<ul>" + l.examples.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    });
    return html + "</details>";
  }

  function renderRank(idx) {
    var r = RANKS[idx];
    var order = orders[r.key];
    var isStrengths = idx === 0;
    var html = '<p class="cbto-step">Step ' + (idx + 1) + " of 3</p>" +
      "<h2>" + esc(r.title) + "</h2>" +
      '<p class="cbto-ask">' + esc(r.ask) + "</p>" +
      '<p class="cbto-hint">' + esc(r.hint) + "</p>" +
      '<ol class="cbto-rank" id="cbto-rank">';
    for (var i = 0; i < order.length; i++) {
      var l = lensByLetter(order[i]);
      var heroVal = heroes[l.letter] || "";
      var heroLabel = heroVal ? "Gap to " + esc(heroVal) : "Someone who set your bar";
      html += '<li class="cbto-card cbto-lens-' + l.letter.toLowerCase() + '" draggable="true" data-letter="' + l.letter + '">' +
        '<span class="cbto-dot" aria-hidden="true"></span>' +
        '<span class="cbto-card-body"><strong class="cbto-card-name">' + esc(l.name) + '</strong><span class="cbto-card-piep"> / ' + esc(PIEP[l.letter]) + '</span>' +
        '<span class="cbto-card-def">' + esc(l.definition) + "</span>";
      if (isStrengths) {
        html += '<label class="cbto-hero-field"><span class="cbto-hero-label">' + heroLabel + "</span>" +
          '<input type="text" class="cbto-hero-input" data-lens="' + l.letter + '" value="' + esc(heroVal) + '" placeholder="a person you have worked with" aria-label="' + esc(l.name) + ': someone who set your bar"></label>';
      }
      html += "</span>" +
        '<span class="cbto-moves">' +
        '<button type="button" class="cbto-move" data-dir="-1" aria-label="Move ' + esc(l.name) + ' up"' + (i === 0 ? " disabled" : "") + ">▲</button>" +
        '<button type="button" class="cbto-move" data-dir="1" aria-label="Move ' + esc(l.name) + ' down"' + (i === 3 ? " disabled" : "") + ">▼</button>" +
        "</span></li>";
    }
    html += "</ol>" + examplesHtml() +
      '<div class="cbto-actions">' +
      '<button type="button" class="cbto-btn" id="cbto-back">Back</button>' +
      '<button type="button" class="cbto-btn cbto-btn-primary" id="cbto-next">' + (idx === 2 ? "Continue" : "Next") + "</button>" +
      "</div>";
    root.innerHTML = html;

    var list = document.getElementById("cbto-rank");
    var dragging = null;

    if (isStrengths) {
      var heroInputs = list.querySelectorAll(".cbto-hero-input");
      heroInputs.forEach(function (inp) {
        ["pointerdown", "mousedown", "touchstart"].forEach(function (evName) {
          inp.addEventListener(evName, function (ev) { ev.stopPropagation(); });
        });
        inp.addEventListener("input", function () {
          var lens = inp.getAttribute("data-lens");
          heroes[lens] = inp.value;
          var label = inp.previousElementSibling;
          label.textContent = inp.value ? "Gap to " + inp.value : "Someone who set your bar";
        });
      });
    }

    list.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".cbto-move");
      if (!btn || btn.disabled) return;
      var ch = btn.closest("li").getAttribute("data-letter");
      var from = order.indexOf(ch);
      var to = from + Number(btn.getAttribute("data-dir"));
      if (to < 0 || to > 3) return;
      order.splice(from, 1);
      order.splice(to, 0, ch);
      renderRank(idx);
    });

    list.addEventListener("dragstart", function (ev) {
      var li = ev.target.closest("li");
      if (!li) return;
      dragging = li;
      li.classList.add("cbto-dragging");
      ev.dataTransfer.effectAllowed = "move";
      try { ev.dataTransfer.setData("text/plain", li.getAttribute("data-letter")); } catch (err) {}
    });
    list.addEventListener("dragover", function (ev) {
      if (!dragging) return;
      ev.preventDefault();
      var li = ev.target.closest("li");
      if (!li || li === dragging) return;
      var rect = li.getBoundingClientRect();
      var before = ev.clientY - rect.top < rect.height / 2;
      list.insertBefore(dragging, before ? li : li.nextSibling);
    });
    list.addEventListener("drop", function (ev) { ev.preventDefault(); });
    list.addEventListener("dragend", function () {
      if (!dragging) return;
      dragging.classList.remove("cbto-dragging");
      dragging = null;
      var lis = list.querySelectorAll("li");
      for (var i = 0; i < lis.length; i++) order[i] = lis[i].getAttribute("data-letter");
      renderRank(idx);
    });

    document.getElementById("cbto-back").addEventListener("click", function () {
      if (idx === 0) renderIntro(false);
      else renderRank(idx - 1);
    });
    document.getElementById("cbto-next").addEventListener("click", function () {
      if (idx === 2) renderJoy();
      else renderRank(idx + 1);
    });
  }

  function allJoySet() {
    return "CBTO".split("").every(function (ch) { return joySel[ch] != null; });
  }

  function renderJoy() {
    var html = '<p class="cbto-step">Optional</p>' +
      "<h2>Joy or drain?</h2>" +
      '<p class="cbto-ask">For each lens: does the work itself bring you joy, or does it drain you?</p>' +
      '<p class="cbto-hint">You can be really good at something and still find it soul-sucking. Answer for the work, not the outcomes.</p>' +
      '<div class="cbto-joy" id="cbto-joy">';
    lenses.forEach(function (l) {
      var v = joySel[l.letter];
      html += '<div class="cbto-joy-row cbto-lens-' + l.letter.toLowerCase() + '" data-letter="' + l.letter + '">' +
        '<span class="cbto-dot" aria-hidden="true"></span>' +
        '<span class="cbto-joy-name"><span class="cbto-joy-name-main">' + esc(l.name) + '</span><span class="cbto-joy-piep"> / ' + esc(PIEP[l.letter]) + '</span></span>' +
        '<span class="cbto-joy-buttons" role="group" aria-label="' + esc(l.name) + ': joy or drain">' +
        '<button type="button" class="cbto-joy-btn" data-v="joy" aria-pressed="' + (v === "joy") + '">Joy</button>' +
        '<button type="button" class="cbto-joy-btn" data-v="drain" aria-pressed="' + (v === "drain") + '">Drain</button>' +
        "</span></div>";
    });
    html += "</div>" +
      '<div class="cbto-actions">' +
      '<button type="button" class="cbto-btn" id="cbto-back">Back</button>' +
      '<button type="button" class="cbto-btn" id="cbto-skip">Skip</button>' +
      '<button type="button" class="cbto-btn cbto-btn-primary" id="cbto-finish"' + (allJoySet() ? "" : " disabled") + ">See results</button>" +
      "</div>";
    root.innerHTML = html;
    document.getElementById("cbto-joy").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".cbto-joy-btn");
      if (!btn) return;
      joySel[btn.closest(".cbto-joy-row").getAttribute("data-letter")] = btn.getAttribute("data-v");
      renderJoy();
    });
    document.getElementById("cbto-back").addEventListener("click", function () { renderRank(2); });
    document.getElementById("cbto-skip").addEventListener("click", function () { finish(false); });
    document.getElementById("cbto-finish").addEventListener("click", function () {
      if (allJoySet()) finish(true);
    });
  }

  function finish(withJoy) {
    var j = null;
    if (withJoy) {
      j = "";
      "CBTO".split("").forEach(function (ch) { if (joySel[ch] === "joy") j += ch; });
    }
    var st = { s: orders.s.join(""), e: orders.e.join(""), n: orders.n.join(""), j: j };
    showResults(st, saveRun(st));
  }

  function columnsHtml(st) {
    var cols = [["Strengths today", st.s], ["Future energy", st.e], ["Role needs", st.n]];
    return '<div class="cbto-cols">' + cols.map(function (c) {
      var lis = "";
      for (var i = 0; i < 4; i++) {
        var ch = c[1].charAt(i);
        lis += '<li class="cbto-lens-' + ch.toLowerCase() + '"><span class="cbto-dot" aria-hidden="true"></span>' + esc(names[ch]) + "</li>";
      }
      return '<div class="cbto-col"><h3>' + esc(c[0]) + "</h3><ol>" + lis + "</ol></div>";
    }).join("") + "</div>";
  }

  function joyLineText(j) {
    var joy = [];
    var drain = [];
    "CBTO".split("").forEach(function (ch) {
      (j.indexOf(ch) >= 0 ? joy : drain).push(names[ch]);
    });
    return "Joy: " + (joy.join(", ") || "none") + ". Drain: " + (drain.join(", ") || "none") + ".";
  }

  function toMarkdown(st, paras) {
    var lines = ["# CBTO stack rank, " + new Date().toISOString().slice(0, 10), ""];
    lines.push("| | Strengths today | Future energy | Role needs |");
    lines.push("|---|---|---|---|");
    for (var i = 0; i < 4; i++) {
      lines.push("| " + (i + 1) + " | " + names[st.s.charAt(i)] + " | " + names[st.e.charAt(i)] + " | " + names[st.n.charAt(i)] + " |");
    }
    if (st.j != null) lines.push("", joyLineText(st.j));
    lines.push("");
    paras.forEach(function (p) { lines.push("- " + p.text); });
    lines.push("", "The CBTO stack rank: https://kindel.com/cbto/");
    return lines.join("\n");
  }

  function historyHtml(st, runs) {
    if (!runs || !runs.length) return "";
    var html = "";
    var last = runs[runs.length - 1];
    var isCurrent = last && last.s === st.s && last.e === st.e && last.n === st.n && (last.j == null ? null : last.j) === st.j;
    var prev = isCurrent ? runs[runs.length - 2] : null;
    if (prev) {
      var bits = [
        "strengths " + (prev.s === st.s ? "unchanged" : "moved"),
        "energy " + (prev.e === st.e ? "unchanged" : "moved"),
        "role needs " + (prev.n === st.n ? "unchanged" : "moved")
      ];
      html += '<p class="cbto-compare">Since your run on ' + esc(prev.t) + ": " + bits.join(", ") + ".</p>";
    }
    if (runs.length > (isCurrent ? 1 : 0)) {
      html += '<details class="cbto-history"><summary>Past runs on this browser</summary><ul>';
      runs.slice().reverse().forEach(function (run) {
        html += '<li><a href="' + esc(location.pathname + encodeState(run)) + '">' + esc(run.t) + "</a>: S " + esc(run.s) + " · E " + esc(run.e) + " · N " + esc(run.n) + "</li>";
      });
      html += "</ul></details>";
    }
    return html;
  }

  function copyText(text, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        if (document.execCommand("copy")) done();
      } catch (err) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function showResults(st, runs) {
    try { history.replaceState(null, "", location.pathname + encodeState(st)); } catch (err) {}
    var paras = buildReading(signals(st.s, st.e, st.n, st.j), names, interp);
    var html = "<h2>Your stacks</h2>" + columnsHtml(st) +
      (st.j != null ? '<p class="cbto-joyline">' + esc(joyLineText(st.j)) + "</p>" : "") +
      '<div class="cbto-reading" aria-live="polite">' +
      paras.map(function (p) { return "<p>" + esc(p.text) + "</p>"; }).join("") +
      "</div>" +
      '<div class="cbto-actions">' +
      '<button type="button" class="cbto-btn" id="cbto-copy-link">Copy link</button>' +
      '<button type="button" class="cbto-btn" id="cbto-copy-md">Copy as Markdown</button>' +
      '<button type="button" class="cbto-btn cbto-btn-primary" id="cbto-again">Start over</button>' +
      "</div>" +
      historyHtml(st, runs);
    root.innerHTML = html;

    document.getElementById("cbto-copy-link").addEventListener("click", function () {
      copyText(location.href, this);
    });
    document.getElementById("cbto-copy-md").addEventListener("click", function () {
      copyText(toMarkdown(st, paras), this);
    });
    document.getElementById("cbto-again").addEventListener("click", function () {
      try { history.replaceState(null, "", location.pathname); } catch (err) {}
      orders = { s: "CBTO".split(""), e: "CBTO".split(""), n: "CBTO".split("") };
      joySel = { C: null, B: null, T: null, O: null };
      renderIntro(false);
    });
  }

  function init() {
    var st = decodeState(location.search);
    if (st) showResults(st, loadRuns());
    else renderIntro(false);
  }

  function validateLenses(arr) {
    if (!Array.isArray(arr) || arr.length !== 4) return false;
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
      var l = arr[i];
      if (!l || typeof l.letter !== "string" || "CBTO".indexOf(l.letter) < 0) return false;
      if (seen[l.letter]) return false;
      seen[l.letter] = true;
    }
    return seen.C && seen.B && seen.T && seen.O;
  }

  Promise.all([fetch(lensesUrl), fetch(interpUrl)]).then(function (rs) {
    if (!rs[0].ok || !rs[1].ok) throw new Error("fetch failed");
    return Promise.all([rs[0].json(), rs[1].json()]);
  }).then(function (data) {
    var rawLenses = data[0].lenses;
    if (!validateLenses(rawLenses)) throw new Error("invalid lenses data");
    lenses = rawLenses;
    lenses.forEach(function (l) { names[l.letter] = l.name; });
    interp = data[1];
    init();
  }).catch(function () {
    root.innerHTML = "<p>Could not load the app data. If you opened index.html straight from disk, serve the directory instead: <code>python3 -m http.server</code>.</p>";
  });
})();
