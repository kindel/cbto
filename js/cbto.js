(function () {
  var cfg = window.CBTO || {};
  var lensesUrl = cfg.lenses || "data/lenses.json";
  var interpUrl = cfg.interpretations || "data/interpretations.json";
  var RUNS_KEY = "cbto-runs";
  var JOY_DRAIN_URL = "https://blog.kindel.com/2025/02/05/stop-answering-the-wrong-question-unlock-your-true-work-happiness/";

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
    // The old yes/no joy check, still read from old links: the letters
    // marked joy, in C, B, T, O order. New runs rank joy instead (jd).
    if (typeof j !== "string" || j.length > 4) return false;
    var last = -1;
    for (var i = 0; i < j.length; i++) {
      var k = "CBTO".indexOf(j.charAt(i));
      if (k <= last) return false;
      last = k;
    }
    return true;
  }

  function joySeed(j) {
    // Turn an old yes/no joy set into a starting order for the joy rank:
    // joy letters first, then drain, each in C, B, T, O order. Only a
    // starting point for the cards; the reading never treats it as a rank.
    var joy = "";
    var drain = "";
    for (var i = 0; i < 4; i++) {
      var ch = "CBTO".charAt(i);
      if (j.indexOf(ch) >= 0) joy += ch;
      else drain += ch;
    }
    return joy + drain;
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

  function signals(s, e, n, jd, j) {
    // jd is the joy rank: four letters, most joy first, most drain last.
    // The top two are the joy end, the bottom two the drain end. j is an
    // old yes/no answer from an old link; it only flags that the reading
    // has no joy rank to use.
    var fs = footrule(e, s);
    var fn = footrule(e, n);
    var edge = growthEdge(s, e);
    var sig = {
      superpower: s.charAt(0),
      edge: edge,
      comfort: s === n ? "same" : fs < fn ? "strengths" : fn < fs ? "role" : "even",
      blindSpot: rankOf(s, n.charAt(0)) >= 2 ? n.charAt(0) : null,
      en: overlap(e, n),
      sn: overlap(s, n),
      jd: jd == null ? null : jd,
      legacyJoy: jd == null && j != null ? j : null
    };
    if (jd != null) {
      var a = n.charAt(0);
      var b = n.charAt(1);
      var top = jd.charAt(0);
      sig.jn = overlap(jd, n);
      sig.roleNeeds = [a, b];
      sig.roleJoy = (rankOf(jd, a) < 2 ? 1 : 0) + (rankOf(jd, b) < 2 ? 1 : 0);
      sig.edgeJoy = edge == null ? null : rankOf(jd, edge) < 2 ? "joy" : "drain";
      sig.superDrained = jd.charAt(3) === s.charAt(0);
      // The work you enjoy most, that the role needs, that you left low in
      // where you want to grow. Not the growth edge; the reading covers it.
      sig.untapped = top !== edge && rankOf(n, top) < 2 && rankOf(e, top) >= 2 ? top : null;
    }
    return sig;
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
    if (sig.jd != null) {
      out.push({ key: "alignment_joy", text: fill(interp.alignment_joy, { en: sig.en, sn: sig.sn, jn: sig.jn }) });
      var a = sig.roleNeeds[0];
      var b = sig.roleNeeds[1];
      var joyOne = sig.jd.indexOf(a) < sig.jd.indexOf(b) ? a : b;
      var drainOne = joyOne === a ? b : a;
      out.push({ key: "joy_role_" + sig.roleJoy, text: fill(interp["joy_role_" + sig.roleJoy], {
        a: names[a], b: names[b], joy: names[joyOne], drain: names[drainOne]
      }) });
      if (sig.untapped) out.push({ key: "joy_untapped", text: fill(interp.joy_untapped, { lens: names[sig.untapped] }) });
      if (sig.edgeJoy) out.push({ key: "joy_edge_" + sig.edgeJoy, text: fill(interp["joy_edge_" + sig.edgeJoy], { lens: names[sig.edge] }) });
      if (sig.superDrained) out.push({ key: "joy_superpower_drain", text: fill(interp.joy_superpower_drain, { lens: names[sig.superpower] }) });
    } else {
      out.push({ key: "alignment", text: fill(interp.alignment, { en: sig.en, sn: sig.sn }) });
      if (sig.legacyJoy != null) out.push({ key: "joy_legacy", text: interp.joy_legacy });
    }
    out.push({ key: "closing", text: interp.closing });
    return out;
  }

  function encodeState(st) {
    var q = "?s=" + st.s + "&e=" + st.e + "&n=" + st.n;
    if (st.jd != null) q += "&jd=" + st.jd;
    else if (st.j != null) q += "&j=" + st.j;
    return q;
  }

  function decodeState(qs) {
    // jd is the joy rank. j is the old yes/no joy set; old links still
    // load, and a jd in the same link wins.
    var p = new URLSearchParams(qs);
    var s = p.get("s");
    var e = p.get("e");
    var n = p.get("n");
    var jd = p.get("jd");
    var j = p.get("j");
    if (!validStack(s) || !validStack(e) || !validStack(n)) return null;
    if (jd != null && !validStack(jd)) return null;
    if (jd == null && j != null && !validJoy(j)) return null;
    return { s: s, e: e, n: n, jd: jd, j: jd == null ? j : null };
  }

  function defaultOrders() {
    var d = ["C", "B", "T", "O"];
    return { s: d.slice(), e: d.slice(), n: d.slice(), jd: d.slice() };
  }

  function applyOrder(letters) {
    if (!letters || letters.length !== 4) return null;
    var next = [];
    for (var i = 0; i < 4; i++) next.push(letters[i]);
    return validStack(next.join("")) ? next : null;
  }

  function moveLetter(order, letter, dir) {
    if (!order || order.length !== 4) return null;
    var next = order.slice();
    var from = next.indexOf(letter);
    var to = from + Number(dir);
    if (from < 0 || to < 0 || to > 3) return next;
    next.splice(from, 1);
    next.splice(to, 0, letter);
    return next;
  }

  function ordersFromState(st) {
    // The joy cards start from the joy rank, or from an old yes/no answer,
    // or from the default order.
    if (!st || !validStack(st.s) || !validStack(st.e) || !validStack(st.n)) return null;
    var jd = validStack(st.jd) ? st.jd : st.j != null && validJoy(st.j) ? joySeed(st.j) : "CBTO";
    return { s: st.s.split(""), e: st.e.split(""), n: st.n.split(""), jd: jd.split("") };
  }

  function stateFromOrders(orders, jd, j) {
    if (!orders) return null;
    var s = orders.s && orders.s.join("");
    var e = orders.e && orders.e.join("");
    var n = orders.n && orders.n.join("");
    if (!validStack(s) || !validStack(e) || !validStack(n)) return null;
    if (jd != null && !validStack(jd)) return null;
    if (jd == null && j != null && !validJoy(j)) return null;
    return { s: s, e: e, n: n, jd: jd == null ? null : jd, j: jd == null && j != null ? j : null };
  }

  function afterRank(idx, editing) {
    if (editing) return "results";
    if (idx === 2) return "joy";
    if (idx === 0 || idx === 1) return "continue";
    return null;
  }

  function finishState(orders, jd, previous) {
    // A new joy rank replaces whatever joy the last result had. Without
    // one, the last result's joy (rank or old yes/no) carries over.
    if (jd != null) return stateFromOrders(orders, jd, null);
    if (previous) return stateFromOrders(orders, previous.jd == null ? null : previous.jd, previous.j == null ? null : previous.j);
    return stateFromOrders(orders, null, null);
  }
  // --- end model -----------------------------------------------------------

  var root = document.getElementById("cbto-app");
  if (!root) return;

  var RANKS = [
    {
      key: "s",
      title: "What are you strongest at today?",
      ask: "Rank all four. Strongest at the top.",
      hint: "Rank yourself. Not what you enjoy. Not your job title. A name is optional and never required.",
      top: "Strongest at the top."
    },
    {
      key: "e",
      title: "Where do you want to grow the most?",
      ask: "Rank all four. Growth that matters most at the top.",
      hint: "Think about the roles you want next, not only the job you have now. This stack is your future energy.",
      top: "Strongest at the top."
    },
    {
      key: "n",
      title: "What does your current role actually need?",
      ask: "Rank the job, not yourself.",
      hint: "Rank by importance to the role, the manager, and the team.",
      top: "Strongest at the top."
    },
    {
      key: "jd",
      title: "Joy or drain?",
      ask: "Rank the work itself: most joy at the top, most drain at the bottom.",
      hint: "You can be really good at something and still find it soul-sucking. Rank the work, not the outcomes. Or skip to your stacks.",
      top: "Most joy at the top."
    }
  ];

  var lenses = [];
  var names = {};
  var interp = null;
  var orders = defaultOrders();
  var heroes = { C: "", B: "", T: "", O: "" };
  var lastResults = null;

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function joyDrainLink() {
    return '<a href="' + JOY_DRAIN_URL + '" target="_blank" rel="noopener noreferrer">Joy vs Drain</a>';
  }

  function linkJoyDrainPhrase(escaped) {
    return escaped.replace(/Joy vs Drain/g, joyDrainLink());
  }

  function dropCapName(name) {
    if (!name || name.length === 0) return esc(name);
    return '<span class="cbto-letter">' + esc(name.charAt(0)) + '</span>' + esc(name.slice(1));
  }

  function lensByLetter(ch) {
    for (var i = 0; i < lenses.length; i++) if (lenses[i].letter === ch) return lenses[i];
    return null;
  }

  function piep(l) {
    return l.piep || (l.aliases && l.aliases[0]) || l.name;
  }

  function loadRuns() {
    try {
      var raw = localStorage.getItem(RUNS_KEY);
      var runs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(runs)) return [];
      return runs.filter(function (r) {
        return r && validStack(r.s) && validStack(r.e) && validStack(r.n) && (r.jd == null || validStack(r.jd)) && (r.j == null || validJoy(r.j));
      });
    } catch (err) {
      return [];
    }
  }

  function sameRun(a, b) {
    return a.s === b.s && a.e === b.e && a.n === b.n &&
      (a.jd == null ? null : a.jd) === (b.jd == null ? null : b.jd) &&
      (a.j == null ? null : a.j) === (b.j == null ? null : b.j);
  }

  function saveRun(st) {
    try {
      var runs = loadRuns();
      var last = runs[runs.length - 1];
      var today = new Date().toISOString().slice(0, 10);
      var sameStacks = last && sameRun(last, st);
      if (sameStacks && last.t === today) return runs;
      var run = { t: today, s: st.s, e: st.e, n: st.n };
      if (st.jd != null) run.jd = st.jd;
      else if (st.j != null) run.j = st.j;
      runs.push(run);
      if (runs.length > 24) runs = runs.slice(runs.length - 24);
      localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
      return runs;
    } catch (err) {
      return [];
    }
  }

  function setFlow(inFlow) {
    document.body.classList.toggle("cbto-in-flow", !!inFlow);
  }

  function resetWizard() {
    orders = defaultOrders();
    heroes = { C: "", B: "", T: "", O: "" };
    lastResults = null;
    setFlow(false);
  }

  function adoptState(st) {
    var restored = ordersFromState(st);
    if (restored) orders = restored;
    lastResults = st;
  }

  function renderIntro(showTeach) {
    var html = '<div class="cbto-intro">' +
      "<p>The exercise is three stack ranks of the same four lenses: what you are strongest at today, where you want to grow the most, and what your current role needs. The gaps between the three stacks are the point.</p>" +
      "<p>It takes a few minutes. Rank the cards. You can go back and change a stack without starting over. Names are optional. There are no ties: the forced rank is the exercise.</p>" +
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
    setFlow(false);
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

  function heroFieldsHtml() {
    var anyHero = heroes.C || heroes.B || heroes.T || heroes.O;
    var html = '<details class="cbto-heroes"' + (anyHero ? " open" : "") + ">" +
      "<summary>Optional: name who set your bar</summary>" +
      '<p class="cbto-hint">A name can help you judge the gap. You do not need one, and Next does not wait for it.</p>';
    lenses.forEach(function (l) {
      var heroVal = heroes[l.letter] || "";
      var heroLabel = heroVal ? "Gap to " + heroVal : "Someone who set your bar for " + l.name;
      html += '<label class="cbto-hero-field"><span class="cbto-hero-label">' + esc(heroLabel) + "</span>" +
        '<input type="text" class="cbto-hero-input" data-lens="' + l.letter + '" value="' + esc(heroVal) + '" placeholder="optional" aria-label="' + esc(l.name) + ': optional, someone who set your bar"></label>';
    });
    return html + "</details>";
  }

  function backLabel(idx) {
    if (idx === 0) return lastResults ? "Back to results" : "Back";
    if (idx === 1) return "Back to strengths";
    if (idx === 3) return lastResults ? "Back to results" : "Back to role needs";
    return "Back to grow the most";
  }

  function renderRank(idx) {
    var r = RANKS[idx];
    var order = orders[r.key];
    var isStrengths = idx === 0;
    var isJoy = idx === 3;
    var html = (isJoy ? '<p class="cbto-step">Optional. Skip this if you want.</p>' : '<p class="cbto-step">Step ' + (idx + 1) + " of 3</p>") +
      "<h2>" + (isJoy ? '<a href="' + JOY_DRAIN_URL + '" target="_blank" rel="noopener noreferrer">' + esc(r.title) + "</a>" : esc(r.title)) + "</h2>" +
      '<p class="cbto-ask">' + esc(r.ask) + "</p>" +
      '<p class="cbto-hint">' + esc(r.hint) + "</p>" +
      '<p class="cbto-how cbto-how-desktop">Drag the cards to rank them. ' + esc(r.top) + "</p>" +
      '<p class="cbto-how cbto-how-mobile">Tap the arrows to rank them. ' + esc(r.top) + "</p>" +
      '<ol class="cbto-rank" id="cbto-rank">';
    for (var i = 0; i < order.length; i++) {
      var l = lensByLetter(order[i]);
      html += '<li class="cbto-card cbto-lens-' + l.letter.toLowerCase() + '" draggable="true" data-letter="' + l.letter + '">' +
        '<span class="cbto-grip" aria-hidden="true"></span>' +
        '<span class="cbto-dot" aria-hidden="true"></span>' +
        '<span class="cbto-card-body"><strong class="cbto-card-name">' + dropCapName(l.name) + '</strong><span class="cbto-card-piep"> / ' + esc(piep(l)) + '</span>' +
        '<span class="cbto-card-def">' + esc(l.definition) + "</span></span>" +
        '<span class="cbto-moves">' +
        '<button type="button" class="cbto-move" data-dir="-1" aria-label="Move ' + esc(l.name) + ' up"' + (i === 0 ? " disabled" : "") + ">▲</button>" +
        '<button type="button" class="cbto-move" data-dir="1" aria-label="Move ' + esc(l.name) + ' down"' + (i === 3 ? " disabled" : "") + ">▼</button>" +
        "</span></li>";
    }
    html += "</ol>";
    if (isJoy) {
      html += '<p class="cbto-persist">' + (lastResults ? "Back to results keeps the reading you had." : "Skip still takes you to results. Back keeps your ranks.") + "</p>" +
        '<div class="cbto-actions">' +
        '<button type="button" class="cbto-btn" id="cbto-back">' + esc(backLabel(idx)) + "</button>" +
        (lastResults ? "" : '<button type="button" class="cbto-btn cbto-btn-primary" id="cbto-skip">Skip to results</button>') +
        '<button type="button" class="cbto-btn' + (lastResults ? " cbto-btn-primary" : "") + '" id="cbto-next">Include joy in results</button>' +
        "</div>";
    } else {
      html += '<p class="cbto-persist">Back keeps the order you already set. You do not need to start over.</p>' +
        '<div class="cbto-actions">' +
        '<button type="button" class="cbto-btn" id="cbto-back">' + esc(backLabel(idx)) + "</button>" +
        '<button type="button" class="cbto-btn cbto-btn-primary" id="cbto-next">' + (idx === 2 ? "Continue" : "Next") + "</button>" +
        "</div>";
    }
    if (isStrengths) html += heroFieldsHtml();
    html += examplesHtml();
    setFlow(true);
    root.innerHTML = html;

    var list = document.getElementById("cbto-rank");
    var dragging = null;

    if (isStrengths) {
      var heroInputs = root.querySelectorAll(".cbto-hero-input");
      heroInputs.forEach(function (inp) {
        ["pointerdown", "mousedown", "touchstart"].forEach(function (evName) {
          inp.addEventListener(evName, function (ev) { ev.stopPropagation(); });
        });
        inp.addEventListener("input", function () {
          var lens = inp.getAttribute("data-lens");
          heroes[lens] = inp.value;
          var label = inp.previousElementSibling;
          label.textContent = inp.value ? "Gap to " + inp.value : "Someone who set your bar for " + names[lens];
        });
      });
    }

    list.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".cbto-move");
      if (!btn || btn.disabled) return;
      var ch = btn.closest("li").getAttribute("data-letter");
      var next = moveLetter(order, ch, btn.getAttribute("data-dir"));
      if (!next) return;
      orders[r.key] = next;
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
      var letters = [];
      for (var i = 0; i < lis.length; i++) letters.push(lis[i].getAttribute("data-letter"));
      var next = applyOrder(letters);
      if (next) orders[r.key] = next;
      renderRank(idx);
    });

    document.getElementById("cbto-back").addEventListener("click", function () {
      if (idx === 0 || (isJoy && lastResults)) {
        if (lastResults) showResults(lastResults, loadRuns());
        else renderIntro(false);
      } else {
        renderRank(idx - 1);
      }
    });
    if (isJoy) {
      var skip = document.getElementById("cbto-skip");
      if (skip) skip.addEventListener("click", function () { finish(false); });
      document.getElementById("cbto-next").addEventListener("click", function () { finish(true); });
      return;
    }
    document.getElementById("cbto-next").addEventListener("click", function () {
      var dest = afterRank(idx, !!lastResults);
      if (dest === "results") finish(false);
      else if (dest === "joy") renderRank(3);
      else if (dest === "continue") renderRank(idx + 1);
    });
  }

  function finish(withJoy) {
    var st = finishState(orders, withJoy ? orders.jd.join("") : null, lastResults);
    if (!st) return;
    showResults(st, saveRun(st));
  }

  function columnsHtml(st, sig) {
    var cols = [
      { title: "Strengths today", ask: "What you are strongest at.", stack: st.s, edit: 0, mark: sig && sig.superpower, markLabel: "Superpower", compare: false },
      { title: "Grow the most", ask: "Where you want to grow. Future energy.", stack: st.e, edit: 1, mark: sig && sig.edge, markLabel: "Growth edge", compare: false },
      { title: "Role needs", ask: "What the job needs. Compare this last.", stack: st.n, edit: 2, mark: null, markLabel: "", compare: true }
    ];
    if (st.jd != null) {
      cols.push({ title: "Joy to drain", ask: "Most joy at the top, most drain at the bottom.", stack: st.jd, edit: 3, mark: null, markLabel: "", compare: false });
    }
    return '<p class="cbto-cols-lead">Read Superpower and Growth edge first. Role needs is the comparison, not the thing to decode first.</p>' +
      '<div class="cbto-cols' + (cols.length === 4 ? " cbto-cols-4" : "") + '">' + cols.map(function (c) {
        var lis = "";
        for (var i = 0; i < 4; i++) {
          var ch = c.stack.charAt(i);
          var badge = c.mark && ch === c.mark ? ' <span class="cbto-mark">' + esc(c.markLabel) + "</span>" : "";
          lis += '<li class="cbto-lens-' + ch.toLowerCase() + '"><span class="cbto-dot" aria-hidden="true"></span>' + esc(names[ch]) + badge + "</li>";
        }
        return '<div class="cbto-col' + (c.compare ? " cbto-col-compare" : "") + '">' +
          '<div class="cbto-col-head"><h3>' + esc(c.title) + "</h3>" +
          '<button type="button" class="cbto-edit" data-edit-rank="' + c.edit + '">Change</button></div>' +
          '<p class="cbto-col-ask">' + esc(c.ask) + "</p><ol>" + lis + "</ol></div>";
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

  function joyLineHtml(j) {
    var joy = [];
    var drain = [];
    "CBTO".split("").forEach(function (ch) {
      (j.indexOf(ch) >= 0 ? joy : drain).push(esc(names[ch]));
    });
    var joyLink = '<a href="' + JOY_DRAIN_URL + '" target="_blank" rel="noopener noreferrer">Joy</a>';
    var drainLink = '<a href="' + JOY_DRAIN_URL + '" target="_blank" rel="noopener noreferrer">Drain</a>';
    return joyLink + ": " + (joy.join(", ") || "none") + ". " + drainLink + ": " + (drain.join(", ") || "none") + ".";
  }

  function toMarkdown(st, paras) {
    var lines = ["# CBTO stack rank, " + new Date().toISOString().slice(0, 10), ""];
    var withJoy = st.jd != null;
    lines.push("| | Strengths today | Grow the most | Role needs |" + (withJoy ? " Joy to drain |" : ""));
    lines.push("|---|---|---|---|" + (withJoy ? "---|" : ""));
    for (var i = 0; i < 4; i++) {
      lines.push("| " + (i + 1) + " | " + names[st.s.charAt(i)] + " | " + names[st.e.charAt(i)] + " | " + names[st.n.charAt(i)] + " |" +
        (withJoy ? " " + names[st.jd.charAt(i)] + " |" : ""));
    }
    if (st.j != null) lines.push("", joyLineText(st.j));
    lines.push("");
    var hasJoyDrain = false;
    paras.forEach(function (p) {
      if (p.text.indexOf("Joy vs Drain") >= 0) hasJoyDrain = true;
      lines.push("- " + p.text);
    });
    lines.push("", "The CBTO stack rank: https://kindel.com/cbto/");
    if (hasJoyDrain) lines.push("Joy vs Drain: " + JOY_DRAIN_URL);
    return lines.join("\n");
  }

  function historyHtml(st, runs) {
    if (!runs || !runs.length) return "";
    var html = "";
    var last = runs[runs.length - 1];
    var isCurrent = last && sameRun(last, st);
    var prev = isCurrent ? runs[runs.length - 2] : null;
    if (prev) {
      var bits = [
        "strengths " + (prev.s === st.s ? "unchanged" : "moved"),
        "energy " + (prev.e === st.e ? "unchanged" : "moved"),
        "role needs " + (prev.n === st.n ? "unchanged" : "moved")
      ];
      if (prev.jd != null && st.jd != null) bits.push("joy " + (prev.jd === st.jd ? "unchanged" : "moved"));
      html += '<p class="cbto-compare">Since your run on ' + esc(prev.t) + ": " + bits.join(", ") + ".</p>";
    }
    if (runs.length > (isCurrent ? 1 : 0)) {
      html += '<details class="cbto-history"><summary>Past runs on this browser</summary><ul>';
      runs.slice().reverse().forEach(function (run) {
        html += '<li><a href="' + esc(location.pathname + encodeState(run)) + '">' + esc(run.t) + "</a>: S " + esc(run.s) + " · E " + esc(run.e) + " · N " + esc(run.n) + (run.jd != null ? " · J " + esc(run.jd) : "") + "</li>";
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

  function shareResults(btn) {
    var url = location.href;
    if (navigator.share) {
      navigator.share({ title: "CBTO stack rank", url: url }).catch(function () {
        copyText(url, btn);
      });
      return;
    }
    copyText(url, btn);
  }

  function showResults(st, runs) {
    adoptState(st);
    try { history.replaceState(null, "", location.pathname + encodeState(st)); } catch (err) {}
    var sig = signals(st.s, st.e, st.n, st.jd, st.j);
    var paras = buildReading(sig, names, interp);
    var lead = [];
    var rest = [];
    paras.forEach(function (p) {
      if (p.key === "superpower" || p.key === "growth_edge" || p.key === "growth_edge_none") lead.push(p);
      else rest.push(p);
    });
    var html = "<h2>Your superpower and growth edge</h2>" +
      '<div class="cbto-lead" aria-live="polite">' +
      lead.map(function (p) { return "<p>" + linkJoyDrainPhrase(esc(p.text)) + "</p>"; }).join("") +
      "</div>" +
      '<div class="cbto-actions cbto-actions-share">' +
      '<button type="button" class="cbto-btn cbto-btn-primary" id="cbto-share">Share</button>' +
      '<button type="button" class="cbto-btn" id="cbto-copy-md">Copy as Markdown</button>' +
      '<button type="button" class="cbto-btn cbto-btn-quiet" id="cbto-again">Start over</button>' +
      "</div>" +
      '<h3 class="cbto-stacks-head">' + (st.jd != null ? "The four stacks" : "The three stacks") + "</h3>" +
      columnsHtml(st, sig) +
      (st.j != null ? '<p class="cbto-joyline">' + joyLineHtml(st.j) + "</p>" : "") +
      (st.jd == null ? '<div class="cbto-actions"><button type="button" class="cbto-btn" data-edit-rank="3">Rank joy to drain</button></div>' : "") +
      '<div class="cbto-reading">' +
      rest.map(function (p) { return "<p>" + linkJoyDrainPhrase(esc(p.text)) + "</p>"; }).join("") +
      "</div>" +
      historyHtml(st, runs);
    setFlow(true);
    root.innerHTML = html;

    document.getElementById("cbto-share").addEventListener("click", function () {
      shareResults(this);
    });
    document.getElementById("cbto-copy-md").addEventListener("click", function () {
      copyText(toMarkdown(st, paras), this);
    });
    root.querySelectorAll("[data-edit-rank]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        adoptState(st);
        renderRank(Number(btn.getAttribute("data-edit-rank")));
      });
    });
    document.getElementById("cbto-again").addEventListener("click", function () {
      try { history.replaceState(null, "", location.pathname); } catch (err) {}
      resetWizard();
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
