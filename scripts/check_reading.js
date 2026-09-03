#!/usr/bin/env node
// Checks the reading engine against every possible input. Lifts the model
// functions out of js/cbto.js rather than restating them, so this check cannot
// fall out of step with what the page actually runs.
//
//   node scripts/check_reading.js
//
// Exits non-zero on any failure.
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);

function lift(src) {
  const body = fs.readFileSync(src, "utf8");
  const grab = (name) => {
    const i = body.indexOf("function " + name + "(");
    if (i < 0) return "";
    let depth = 0;
    for (let k = body.indexOf("{", i); k < body.length; k++) {
      if (body[k] === "{") depth++;
      else if (body[k] === "}") { depth--; if (!depth) return body.slice(i, k + 1); }
    }
    return "";
  };
  const names = ["validStack", "validJoy", "rankOf", "footrule", "overlap",
    "growthEdge", "signals", "fill", "buildReading", "encodeState", "decodeState",
    "defaultOrders", "applyOrder", "moveLetter", "ordersFromState", "stateFromOrders",
    "afterRank", "finishState"];
  const code = names.map(grab).join("\n");
  for (const n of names) {
    if (code.indexOf("function " + n + "(") < 0) throw new Error("could not lift " + n + " from js/cbto.js");
  }
  return new Function(code + "\nreturn {" + names.map((n) => n + ":" + n).join(",") + "};")();
}

const m = lift(path.join(ROOT, "js", "cbto.js"));
const lensData = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lenses.json"), "utf8"));
const interp = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "interpretations.json"), "utf8"));

const fail = [];

// The lens data has the required shape.
if (!Array.isArray(lensData.lenses) || lensData.lenses.length !== 4) {
  fail.push("data/lenses.json must hold exactly four lenses");
}
const names = {};
for (const l of lensData.lenses || []) {
  if (!l.letter || "CBTO".indexOf(l.letter) < 0 || names[l.letter]) fail.push("bad or duplicate lens letter " + JSON.stringify(l.letter));
  if (!l.name || !String(l.name).trim()) fail.push("lens " + l.letter + " has no name");
  if (!l.definition || !String(l.definition).trim()) fail.push("lens " + l.letter + " has no definition");
  if (!Array.isArray(l.aliases)) fail.push("lens " + l.letter + " has no aliases array");
  if (!Array.isArray(l.examples) || l.examples.length < 3) fail.push("lens " + l.letter + " needs at least three examples");
  names[l.letter] = l.name;
}

function perms(a) {
  if (a.length <= 1) return [a];
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const rest = a.slice(0, i).concat(a.slice(i + 1));
    for (const p of perms(rest)) out.push([a[i]].concat(p));
  }
  return out;
}
const STACKS = perms(["C", "B", "T", "O"]).map((p) => p.join(""));
const JOYS = [];
for (let mask = 0; mask < 16; mask++) {
  let j = "";
  for (let i = 0; i < 4; i++) if (mask & (1 << i)) j += "CBTO"[i];
  JOYS.push(j);
}

// Every stack combination produces a complete reading: no missing template,
// no unresolved placeholder, no empty paragraph. The joy variants per combo
// cover every joy branch: skipped, all joy, all drain, and superpower-only.
const used = new Set();
let readings = 0;
for (const s of STACKS) {
  for (const e of STACKS) {
    for (const n of STACKS) {
      const sig = m.signals(s, e, n, null);
      if (sig.superpower !== s[0]) fail.push(`superpower wrong for s=${s}`);
      if ((sig.edge === null) !== (s === e)) fail.push(`edge null-ness wrong for s=${s} e=${e}`);
      if ((sig.blindSpot === null) !== (s.indexOf(n[0]) < 2)) fail.push(`blind spot wrong for s=${s} n=${n}`);
      if (![0, 1, 2, 4].includes(sig.en) || ![0, 1, 2, 4].includes(sig.sn)) fail.push(`overlap out of range for s=${s} e=${e} n=${n}`);
      for (const j of [null, "", "CBTO", s[0]]) {
        readings++;
        const paras = m.buildReading(m.signals(s, e, n, j), names, interp);
        for (const p of paras) {
          used.add(p.key);
          if (typeof p.text !== "string" || !p.text.trim()) {
            fail.push(`empty text for ${p.key} at s=${s} e=${e} n=${n} j=${JSON.stringify(j)}`);
          } else if (/\{|\bundefined\b/.test(p.text)) {
            fail.push(`unresolved text for ${p.key} at s=${s} e=${e} n=${n} j=${JSON.stringify(j)}: ${p.text}`);
          }
        }
      }
    }
  }
}

// Every template is reachable and every reachable key has a template.
for (const k of Object.keys(interp)) {
  if (!used.has(k)) fail.push(`template ${k} is never used by any reading`);
}
for (const k of used) {
  if (!(k in interp)) fail.push(`reading key ${k} has no template`);
}

// Permalinks round-trip across every stack combination, and every joy set
// round-trips on a fixed combination.
let roundtrips = 0;
for (const s of STACKS) {
  for (const e of STACKS) {
    for (const n of STACKS) {
      roundtrips++;
      const st = { s, e, n, j: null };
      const back = m.decodeState(m.encodeState(st));
      if (!back || back.s !== s || back.e !== e || back.n !== n || back.j !== null) {
        fail.push(`round trip failed for s=${s} e=${e} n=${n}`);
      }
    }
  }
}
for (const j of JOYS) {
  roundtrips++;
  const st = { s: "CBTO", e: "TOBC", n: "BCOT", j };
  const back = m.decodeState(m.encodeState(st));
  if (!back || back.j !== j) fail.push(`round trip failed for j=${JSON.stringify(j)}`);
}

// Junk never decodes.
for (const qs of ["", "?s=CCBO&e=CBTO&n=CBTO", "?s=CBTO&e=CBTO", "?s=CBTO&e=CBTO&n=CBTX", "?s=CBTO&e=CBTO&n=CBTO&j=OC", "?s=CBTO&e=CBTO&n=CBTO&j=CC"]) {
  if (m.decodeState(qs) !== null) fail.push(`decodeState accepted ${JSON.stringify(qs)}`);
}

// Ranking helpers: move, reject junk, and keep other stacks when you leave
// one and come back (Back then Next). Permalinks restore those orders.
{
  const fresh = m.defaultOrders();
  if (!fresh || fresh.s.join("") !== "CBTO" || fresh.e.join("") !== "CBTO" || fresh.n.join("") !== "CBTO") {
    fail.push("defaultOrders must start every stack at CBTO");
  }
  const orig = ["C", "B", "T", "O"];
  const once = m.moveLetter(orig, "O", -1);
  if (orig.join("") !== "CBTO") fail.push("moveLetter mutated the input order");
  if (!once || once.join("") !== "CBOT") fail.push("moveLetter O up once should be CBOT");
  const twice = m.moveLetter(once, "O", -1);
  if (!twice || twice.join("") !== "COBT") fail.push("moveLetter O up twice should be COBT");
  const blocked = m.moveLetter(["C", "B", "T", "O"], "C", -1);
  if (!blocked || blocked.join("") !== "CBTO") fail.push("moveLetter must not move the top card up");
  const blockedDown = m.moveLetter(["C", "B", "T", "O"], "O", 1);
  if (!blockedDown || blockedDown.join("") !== "CBTO") fail.push("moveLetter must not move the bottom card down");
  if (m.moveLetter(["C", "B", "T"], "C", 1) !== null) fail.push("moveLetter must reject a short order");
  if (m.applyOrder(["T", "O", "B", "C"]).join("") !== "TOBC") fail.push("applyOrder should accept TOBC");
  if (m.applyOrder(["C", "C", "B", "T"]) !== null) fail.push("applyOrder must reject a duplicate");
  if (m.applyOrder(["C", "B", "T"]) !== null) fail.push("applyOrder must reject a short list");
  if (m.applyOrder(["C", "B", "T", "X"]) !== null) fail.push("applyOrder must reject a non-lens");

  const orders = m.defaultOrders();
  orders.s = m.moveLetter(orders.s, "O", -1);
  orders.s = m.moveLetter(orders.s, "O", -1);
  const savedS = orders.s.join("");
  if (savedS !== "COBT") fail.push("strengths after two ups of O should be COBT");
  orders.e = m.moveLetter(orders.e, "C", 1);
  const savedE = orders.e.join("");
  if (savedE !== "BCTO") fail.push("energy after moving C down should be BCTO");
  if (orders.s.join("") !== savedS) fail.push("leaving a stack changed an earlier rank");
  if (orders.e.join("") !== savedE) fail.push("returning to a stack wiped its order");
  if (orders.n.join("") !== "CBTO") fail.push("an untouched stack must stay at the default order");

  const st = m.stateFromOrders(orders, null);
  if (!st || st.s !== savedS || st.e !== savedE || st.n !== "CBTO" || st.j !== null) {
    fail.push("stateFromOrders lost a rank");
  }
  const qs = m.encodeState(st);
  const decoded = m.decodeState(qs);
  const restored = m.ordersFromState(decoded);
  if (!restored || restored.s.join("") !== savedS || restored.e.join("") !== savedE || restored.n.join("") !== "CBTO") {
    fail.push("permalink restore lost ranks");
  }
  const again = m.stateFromOrders(restored, decoded.j);
  if (!again || m.encodeState(again) !== qs) fail.push("ordersFromState then stateFromOrders must round-trip");

  if (m.stateFromOrders({ s: ["C"], e: ["C", "B", "T", "O"], n: ["C", "B", "T", "O"] }, null) !== null) {
    fail.push("stateFromOrders must reject a short stack");
  }
  if (m.stateFromOrders(m.defaultOrders(), "CC") !== null) {
    fail.push("stateFromOrders must reject invalid joy");
  }
  if (m.ordersFromState({ s: "CBTO", e: "CBTO", n: "XXXX" }) !== null) {
    fail.push("ordersFromState must reject an invalid stack");
  }
  if (m.ordersFromState(null) !== null) fail.push("ordersFromState must reject null");
}

// After a rank: first-time Next continues (and Joy is last). Editing returns
// to results after that rank and does not walk Joy again. First-time skip
// has no joy. Editing one stack keeps the other two and keeps previous j
// unless the user re-answers joy.
{
  if (m.afterRank(0, false) !== "continue") fail.push("first-time after strengths should continue");
  if (m.afterRank(1, false) !== "continue") fail.push("first-time after grow should continue");
  if (m.afterRank(2, false) !== "joy") fail.push("first-time after role needs should go to joy");
  if (m.afterRank(0, true) !== "results") fail.push("editing strengths should return to results");
  if (m.afterRank(1, true) !== "results") fail.push("editing grow should return to results");
  if (m.afterRank(2, true) !== "results") fail.push("editing role needs should return to results");

  const first = m.finishState(m.defaultOrders(), null, null);
  if (!first || first.s !== "CBTO" || first.e !== "CBTO" || first.n !== "CBTO" || first.j !== null) {
    fail.push("first-time skip must encode no joy");
  }
  const firstQs = m.encodeState(first);
  if (firstQs.indexOf("j=") >= 0) fail.push("first-time skip permalink must omit j");

  const previous = { s: "BCTO", e: "TOBC", n: "CBOT", j: "CT" };
  const orders = m.ordersFromState(previous);
  orders.e = m.applyOrder(["T", "B", "O", "C"]);
  if (m.afterRank(1, true) !== "results") {
    fail.push("changing grow-the-most must return to results without walking joy");
  }
  const edited = m.finishState(orders, null, previous);
  if (!edited || edited.s !== "BCTO" || edited.n !== "CBOT") {
    fail.push("editing one stack must keep the other two stacks");
  }
  if (!edited || edited.e !== "TBOC") fail.push("editing grow-the-most must keep the new energy order");
  if (!edited || edited.j !== "CT") fail.push("returning to results must keep previous joy");
  const editedQs = m.encodeState(edited);
  if (editedQs.indexOf("j=CT") < 0) fail.push("edited permalink must still carry j");

  const reanswered = m.finishState(orders, "BO", previous);
  if (!reanswered || reanswered.j !== "BO") fail.push("re-answering joy must replace previous j");
  if (!reanswered || reanswered.s !== "BCTO" || reanswered.e !== "TBOC" || reanswered.n !== "CBOT") {
    fail.push("re-answering joy must keep the edited stacks");
  }

  if (m.finishState({ s: ["C"], e: ["C", "B", "T", "O"], n: ["C", "B", "T", "O"] }, null, previous) !== null) {
    fail.push("finishState must reject a short stack");
  }
}

// Identical stacks with joy including superpower must use joy_clear_no_edge, not joy_clear.
for (const s of STACKS) {
  const superpower = s[0];
  for (const j of JOYS) {
    if (j.indexOf(superpower) < 0) continue; // superpower drained, different path
    for (const n of STACKS) {
      const paras = m.buildReading(m.signals(s, s, n, j), names, interp);
      const keys = paras.map((p) => p.key);
      if (keys.includes("joy_clear")) {
        fail.push(`identical stacks s=e=${s} with joy=${j} should not emit joy_clear (mentions growth edge that does not exist)`);
      }
      if (!keys.includes("joy_clear_no_edge")) {
        fail.push(`identical stacks s=e=${s} with joy=${j} should emit joy_clear_no_edge`);
      }
    }
  }
}

// Banned words and characters never appear in the repo. Owner's call; the list
// is assembled from pieces so this file does not trip its own check.
const BANNED = [new RegExp("dri" + "ft", "i"), /\u2014/];
const SKIP_DIRS = new Set([".git", "node_modules"]);
const SKIP_EXT = new Set([".png", ".jpg", ".gif", ".ico", ".woff", ".woff2"]);
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full);
      continue;
    }
    if (SKIP_EXT.has(path.extname(name).toLowerCase())) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const re of BANNED) {
      const hit = text.match(re);
      if (hit) fail.push(`banned word ${JSON.stringify(hit[0])} in ${path.relative(ROOT, full)}`);
    }
  }
})(ROOT);

if (fail.length) {
  console.error("check_reading: FAIL");
  for (const f of fail.slice(0, 40)) console.error("  " + f);
  if (fail.length > 40) console.error(`  ... and ${fail.length - 40} more`);
  process.exit(1);
}
console.log(`check_reading: ok (${readings} readings, ${roundtrips} permalink round trips, ${used.size} templates all reachable)`);
