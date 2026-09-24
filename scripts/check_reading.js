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
  const names = ["validStack", "validJoy", "joySeed", "rankOf", "footrule", "overlap",
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

// Every input combination produces a complete reading: no missing template,
// no unresolved placeholder, no empty paragraph. That is every strengths,
// energy, and role stack, times every joy rank (24), no joy, and every old
// yes/no joy set (16) from old links.
const used = new Set();
let readings = 0;
function checkParas(paras, where) {
  for (const p of paras) {
    used.add(p.key);
    if (typeof p.text !== "string" || !p.text.trim()) {
      fail.push(`empty text for ${p.key} at ${where}`);
    } else if (/\{|\bundefined\b/.test(p.text)) {
      fail.push(`unresolved text for ${p.key} at ${where}: ${p.text}`);
    }
  }
  return paras.map((p) => p.key);
}
const JOY_KEYS = /^(alignment_joy|joy_)/;
let unmoved = 0;
for (const s of STACKS) {
  for (const e of STACKS) {
    for (const n of STACKS) {
      const sig = m.signals(s, e, n, null, null);
      if (sig.superpower !== s[0]) fail.push(`superpower wrong for s=${s}`);
      if ((sig.edge === null) !== (s === e)) fail.push(`edge null-ness wrong for s=${s} e=${e}`);
      if ((sig.blindSpot === null) !== (s.indexOf(n[0]) < 2)) fail.push(`blind spot wrong for s=${s} n=${n}`);
      if (![0, 1, 2, 4].includes(sig.en) || ![0, 1, 2, 4].includes(sig.sn)) fail.push(`overlap out of range for s=${s} e=${e} n=${n}`);

      // No joy: the reading has no joy paragraphs and uses the plain alignment.
      readings++;
      const plain = checkParas(m.buildReading(sig, names, interp), `s=${s} e=${e} n=${n} jd=null`);
      if (plain.some((k) => JOY_KEYS.test(k)) || !plain.includes("alignment")) {
        fail.push(`no-joy reading carries joy text at s=${s} e=${e} n=${n}`);
      }

      // Old yes/no links: stacks read as before, plus one line asking for a
      // joy rank. The old answer never feeds the reading as if it were a rank.
      for (const j of JOYS) {
        readings++;
        const keys = checkParas(m.buildReading(m.signals(s, e, n, null, j), names, interp), `s=${s} e=${e} n=${n} j=${j}`);
        const joyKeys = keys.filter((k) => JOY_KEYS.test(k));
        if (joyKeys.length !== 1 || joyKeys[0] !== "joy_legacy") fail.push(`old joy link at s=${s} e=${e} n=${n} j=${j} read ${joyKeys}`);
      }

      // Every joy rank: the joy paragraphs follow the rules, and the joy
      // part of the reading changes with the rank.
      const joyTexts = new Set();
      for (const jd of STACKS) {
        readings++;
        const js = m.signals(s, e, n, jd, null);
        const paras = m.buildReading(js, names, interp);
        const keys = checkParas(paras, `s=${s} e=${e} n=${n} jd=${jd}`);
        const at = `s=${s} e=${e} n=${n} jd=${jd}`;
        const roleJoy = (jd.indexOf(n[0]) < 2 ? 1 : 0) + (jd.indexOf(n[1]) < 2 ? 1 : 0);
        const edge = m.growthEdge(s, e);
        const top = jd[0];
        const untapped = top !== edge && n.indexOf(top) < 2 && e.indexOf(top) >= 2;
        if (!keys.includes("alignment_joy") || keys.includes("alignment")) fail.push(`joy alignment missing at ${at}`);
        if (js.jn !== m.overlap(jd, n)) fail.push(`joy overlap wrong at ${at}`);
        if (keys.filter((k) => /^joy_role_/.test(k)).length !== 1 || !keys.includes("joy_role_" + roleJoy)) fail.push(`joy_role wrong at ${at}`);
        if (keys.includes("joy_untapped") !== untapped) fail.push(`joy_untapped wrong at ${at}`);
        const edgeKey = edge == null ? null : jd.indexOf(edge) < 2 ? "joy_edge_joy" : "joy_edge_drain";
        if (edgeKey && !keys.includes(edgeKey)) fail.push(`${edgeKey} missing at ${at}`);
        if (keys.filter((k) => /^joy_edge_/.test(k)).length !== (edgeKey ? 1 : 0)) fail.push(`joy_edge count wrong at ${at}`);
        if (keys.includes("joy_superpower_drain") !== (jd[3] === s[0])) fail.push(`joy_superpower_drain wrong at ${at}`);
        if (keys.includes("joy_legacy")) fail.push(`joy rank still asks for a joy rank at ${at}`);
        joyTexts.add(paras.filter((p) => JOY_KEYS.test(p.key) && p.key !== "alignment_joy").map((p) => p.text).join("|"));
      }
      // Joy that matches the role and joy that runs against it must read
      // differently, beyond the alignment count.
      const rev = n.split("").reverse().join("");
      const withRole = m.buildReading(m.signals(s, e, n, n, null), names, interp).find((p) => /^joy_role_/.test(p.key));
      const againstRole = m.buildReading(m.signals(s, e, n, rev, null), names, interp).find((p) => /^joy_role_/.test(p.key));
      if (withRole.key !== "joy_role_2" || againstRole.key !== "joy_role_0") fail.push(`role joy does not change the advice at s=${s} e=${e} n=${n}`);
      if (joyTexts.size < 4) unmoved++;
    }
  }
}
if (unmoved) fail.push(`${unmoved} stack combinations where the joy rank barely moves the reading`);

// Every template is reachable and every reachable key has a template.
for (const k of Object.keys(interp)) {
  if (!used.has(k)) fail.push(`template ${k} is never used by any reading`);
}
for (const k of used) {
  if (!(k in interp)) fail.push(`reading key ${k} has no template`);
}

// Permalinks round-trip across every input combination: every stack
// combination with no joy, with every joy rank, and with every old yes/no
// joy set.
let roundtrips = 0;
function same(a, b) {
  return a && b && a.s === b.s && a.e === b.e && a.n === b.n && a.jd === b.jd && a.j === b.j;
}
for (const s of STACKS) {
  for (const e of STACKS) {
    for (const n of STACKS) {
      const cases = [{ s, e, n, jd: null, j: null }];
      for (const jd of STACKS) cases.push({ s, e, n, jd, j: null });
      for (const j of JOYS) cases.push({ s, e, n, jd: null, j });
      for (const st of cases) {
        roundtrips++;
        const qs = m.encodeState(st);
        const back = m.decodeState(qs);
        if (!same(back, st)) fail.push(`round trip failed for ${qs}`);
      }
    }
  }
}

// The run from issue 17 still loads: all four marked joy on the old check.
{
  const old = m.decodeState("?s=TOCB&e=BCOT&n=OTCB&j=CBTO");
  if (!old || old.s !== "TOCB" || old.jd !== null || old.j !== "CBTO") fail.push("old link with j=CBTO must still load");
  if (old && m.encodeState(old) !== "?s=TOCB&e=BCOT&n=OTCB&j=CBTO") fail.push("old link must re-encode as itself");
  const seeded = old && m.ordersFromState(old);
  if (!seeded || seeded.jd.join("") !== "CBTO") fail.push("old all-joy link should seed the joy cards in C, B, T, O order");
  if (m.joySeed("OT") !== "TOCB") fail.push("joySeed should put joy letters first, then drain");
  if (m.joySeed("") !== "CBTO") fail.push("joySeed with no joy should keep C, B, T, O order");
  const both = m.decodeState("?s=TOCB&e=BCOT&n=OTCB&jd=OTCB&j=CBTO");
  if (!both || both.jd !== "OTCB" || both.j !== null) fail.push("a joy rank must win over an old joy set in the same link");
  if (both && m.encodeState(both) !== "?s=TOCB&e=BCOT&n=OTCB&jd=OTCB") fail.push("a joy rank link must not carry the old j");
}

// Junk never decodes.
for (const qs of ["", "?s=CCBO&e=CBTO&n=CBTO", "?s=CBTO&e=CBTO", "?s=CBTO&e=CBTO&n=CBTX", "?s=CBTO&e=CBTO&n=CBTO&j=OC", "?s=CBTO&e=CBTO&n=CBTO&j=CC",
  "?s=CBTO&e=CBTO&n=CBTO&jd=CBT", "?s=CBTO&e=CBTO&n=CBTO&jd=CCBO", "?s=CBTO&e=CBTO&n=CBTO&jd=", "?s=CBTO&e=CBTO&n=CBTO&jd=CBTX&j=CT"]) {
  if (m.decodeState(qs) !== null) fail.push(`decodeState accepted ${JSON.stringify(qs)}`);
}

// Ranking helpers: move, reject junk, and keep other stacks when you leave
// one and come back (Back then Next). Permalinks restore those orders.
{
  const fresh = m.defaultOrders();
  if (!fresh || fresh.s.join("") !== "CBTO" || fresh.e.join("") !== "CBTO" || fresh.n.join("") !== "CBTO" || fresh.jd.join("") !== "CBTO") {
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
  if (!st || st.s !== savedS || st.e !== savedE || st.n !== "CBTO" || st.jd !== null || st.j !== null) {
    fail.push("stateFromOrders lost a rank");
  }
  const qs = m.encodeState(st);
  const decoded = m.decodeState(qs);
  const restored = m.ordersFromState(decoded);
  if (!restored || restored.s.join("") !== savedS || restored.e.join("") !== savedE || restored.n.join("") !== "CBTO") {
    fail.push("permalink restore lost ranks");
  }
  const again = m.stateFromOrders(restored, decoded.jd, decoded.j);
  if (!again || m.encodeState(again) !== qs) fail.push("ordersFromState then stateFromOrders must round-trip");

  if (m.stateFromOrders({ s: ["C"], e: ["C", "B", "T", "O"], n: ["C", "B", "T", "O"] }, null) !== null) {
    fail.push("stateFromOrders must reject a short stack");
  }
  if (m.stateFromOrders(m.defaultOrders(), "CC") !== null) {
    fail.push("stateFromOrders must reject an invalid joy rank");
  }
  if (m.stateFromOrders(m.defaultOrders(), null, "CC") !== null) {
    fail.push("stateFromOrders must reject an invalid old joy set");
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
  if (!first || first.s !== "CBTO" || first.e !== "CBTO" || first.n !== "CBTO" || first.jd !== null || first.j !== null) {
    fail.push("first-time skip must encode no joy");
  }
  const firstQs = m.encodeState(first);
  if (firstQs.indexOf("j=") >= 0) fail.push("first-time skip permalink must omit joy");

  const ranked = m.finishState(m.defaultOrders(), "OTCB", null);
  if (!ranked || ranked.jd !== "OTCB" || m.encodeState(ranked).indexOf("&jd=OTCB") < 0) fail.push("including joy must encode the joy rank as jd");

  const previous = { s: "BCTO", e: "TOBC", n: "CBOT", jd: "TCOB", j: null };
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
  if (!edited || edited.jd !== "TCOB") fail.push("returning to results must keep the previous joy rank");
  const editedQs = m.encodeState(edited);
  if (editedQs.indexOf("jd=TCOB") < 0) fail.push("edited permalink must still carry jd");

  const legacyPrev = { s: "BCTO", e: "TOBC", n: "CBOT", jd: null, j: "CT" };
  const legacyEdited = m.finishState(m.ordersFromState(legacyPrev), null, legacyPrev);
  if (!legacyEdited || legacyEdited.j !== "CT" || legacyEdited.jd !== null) fail.push("editing a stack on an old link must keep the old joy answer");
  const legacyRanked = m.finishState(m.ordersFromState(legacyPrev), "OBCT", legacyPrev);
  if (!legacyRanked || legacyRanked.jd !== "OBCT" || legacyRanked.j !== null) fail.push("ranking joy on an old link must replace the old answer");

  const reanswered = m.finishState(orders, "BOCT", previous);
  if (!reanswered || reanswered.jd !== "BOCT") fail.push("re-answering joy must replace the previous joy rank");
  if (!reanswered || reanswered.s !== "BCTO" || reanswered.e !== "TBOC" || reanswered.n !== "CBOT") {
    fail.push("re-answering joy must keep the edited stacks");
  }

  if (m.finishState({ s: ["C"], e: ["C", "B", "T", "O"], n: ["C", "B", "T", "O"] }, null, previous) !== null) {
    fail.push("finishState must reject a short stack");
  }
}

// Identical strengths and energy stacks have no growth edge, so no joy line
// may talk about one.
for (const s of STACKS) {
  for (const jd of STACKS) {
    const keys = m.buildReading(m.signals(s, s, "OTCB", jd, null), names, interp).map((p) => p.key);
    if (keys.some((k) => /^joy_edge_/.test(k))) fail.push(`identical stacks s=e=${s} with jd=${jd} must not read a growth edge`);
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
