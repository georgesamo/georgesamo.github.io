/* Tiny zero-dependency test runner for the browser (no Node needed).
 * describe / it / beforeEach / afterEach / expect, async tests, a DOM report,
 * and window.__testResults for automation. Open tests/index.html to run.
 */
(function () {
  "use strict";
  // each spec file is wrapped in an IIFE; hooks at its top level belong to that file's root suite
  var suites = [], stack = [], loadErrors = [];
  var roots = {};
  function fileOf() { var s = document.currentScript; return (s && s.src) || "inline"; }
  function current() {
    if (stack.length) return stack[stack.length - 1];
    var f = fileOf();
    return roots[f] || (roots[f] = { name: "", tests: [], before: [], after: [], parent: null });
  }
  function describe(name, fn) {
    var p = current();
    var s = { name: (p.name ? p.name + " › " : "") + name, tests: [], before: [], after: [], parent: p };
    suites.push(s); stack.push(s); fn(); stack.pop();
  }
  // a spec file that throws while loading must fail the run, not vanish from it
  window.addEventListener("error", function (e) { loadErrors.push((e.filename || "script").split("/").pop() + ": " + e.message); });
  function it(name, fn) { current().tests.push({ name: name, fn: fn }); }
  function beforeEach(fn) { current().before.push(fn); }
  function afterEach(fn) { current().after.push(fn); }
  function chain(s, key) { var out = []; for (var x = s; x; x = x.parent) out = x[key].concat(out); return key === "after" ? out.reverse() : out; }

  function fmt(v) { try { return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) || String(v); } catch (e) { return String(v); } }
  function deepEqual(a, b) { return fmt(a) === fmt(b); }
  function expect(actual) {
    function check(ok, msg) { if (!ok) throw new Error(msg); }
    var api = {
      toBe: function (e) { check(actual === e, "expected " + fmt(actual) + " to be " + fmt(e)); },
      toEqual: function (e) { check(deepEqual(actual, e), "expected " + fmt(actual) + " to equal " + fmt(e)); },
      toBeTruthy: function () { check(!!actual, "expected " + fmt(actual) + " to be truthy"); },
      toBeFalsy: function () { check(!actual, "expected " + fmt(actual) + " to be falsy"); },
      toContain: function (e) { check(actual != null && actual.indexOf(e) > -1, "expected " + fmt(actual) + " to contain " + fmt(e)); },
      toMatch: function (re) { check(re.test(actual), "expected " + fmt(actual) + " to match " + re); },
      toBeGreaterThan: function (n) { check(actual > n, "expected " + fmt(actual) + " > " + n); },
      toHaveLength: function (n) { check(actual != null && actual.length === n, "expected length " + n + ", got " + (actual && actual.length)); }
    };
    api.not = {
      toBe: function (e) { check(actual !== e, "expected " + fmt(actual) + " not to be " + fmt(e)); },
      toContain: function (e) { check(actual == null || actual.indexOf(e) < 0, "expected " + fmt(actual) + " not to contain " + fmt(e)); },
      toMatch: function (re) { check(!re.test(actual), "expected " + fmt(actual) + " not to match " + re); }
    };
    return api;
  }
  function withTimeout(p, ms, name) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timed out after " + ms + "ms: " + name)); }, ms); })]);
  }

  async function run() {
    var results = { passed: 0, failed: 0, skipped: 0, failures: [], done: false };
    window.__testResults = results;
    var out = document.getElementById("report");
    loadErrors.forEach(function (msg) {
      results.failed++; results.failures.push("load error › " + msg);
      var li = document.createElement("div"); li.className = "fail"; li.textContent = "✗ load error — " + msg; out.appendChild(li);
    });
    for (var i = 0; i < suites.length; i++) {
      var s = suites[i];
      if (!s.tests.length) continue;
      var h = document.createElement("h2"); h.textContent = s.name; out.appendChild(h);
      for (var j = 0; j < s.tests.length; j++) {
        var t = s.tests[j], li = document.createElement("div"), err = null, skipped = false;
        try {
          for (var b of chain(s, "before")) await b();
          var r = await withTimeout(Promise.resolve().then(t.fn), 10000, t.name);
          if (r === "skip") skipped = true;
        } catch (e) { err = e; }
        try { for (var a of chain(s, "after")) await a(); } catch (e) { err = err || e; }
        if (skipped) { results.skipped++; li.className = "skip"; li.textContent = "○ " + t.name + " (skipped)"; }
        else if (err) { results.failed++; results.failures.push(s.name + " › " + t.name + ": " + err.message); li.className = "fail"; li.textContent = "✗ " + t.name + " — " + err.message; }
        else { results.passed++; li.className = "pass"; li.textContent = "✓ " + t.name; }
        out.appendChild(li);
      }
    }
    results.done = true;
    var sum = document.getElementById("summary");
    sum.textContent = results.passed + " passed · " + results.failed + " failed" + (results.skipped ? " · " + results.skipped + " skipped" : "");
    sum.className = results.failed ? "fail" : "pass";
    document.title = (results.failed ? "✗ " : "✓ ") + sum.textContent;
    return results;
  }

  window.T = { describe: describe, it: it, beforeEach: beforeEach, afterEach: afterEach, expect: expect, run: run };
})();
