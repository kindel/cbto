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
    "growthEdge", "signals", "fill", "buildReading", "encodeState", "decodeState"];
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

// Banned words never appear in the repo. Owner's call; the list is assembled
// from pieces so this file does not trip its own check.
const BANNED = [new RegExp("dri" + "ft", "i")];
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
