/* PLC scan engine + automated test runner. Works in browser (window.PLCEngine) and Node. */
(function (root) {
  const ADDR_RE = /^(?:[IQM]\d+\.\d+|T\d+)$/;

  function emptyRung() {
    return { branches: [[]], series: [], out: { t: 'COIL', a: 'Q0.0', preset: 0 } };
  }

  class PLC {
    constructor(program) {
      this.program = program;
      this.mem = {};
      this.timers = {};
      this.scans = 0;
      this.flow = [];
    }
    get(a) { return this.mem[a] ? 1 : 0; }
    set(a, v) { this.mem[a] = v ? 1 : 0; }

    _pass(el, power) {
      const v = this.get(el.a);
      return power && (el.t === 'NO' ? v === 1 : v === 0);
    }

    scan(dt = 50) {
      const flow = [];
      for (const r of this.program) {
        const f = { branches: [], series: [], any: false, out: false };
        let any = r.branches.length === 0;
        for (const b of r.branches) {
          let p = true; const st = [];
          for (const el of b) { p = this._pass(el, p); st.push(p); }
          f.branches.push({ els: st, power: p });
          any = any || p;
        }
        let p = any;
        for (const el of r.series) { p = this._pass(el, p); f.series.push(p); }
        f.any = any; f.out = p;
        const o = r.out;
        if (o.t === 'COIL') this.set(o.a, p);
        else if (o.t === 'LATCH') { if (p) this.set(o.a, 1); }
        else if (o.t === 'UNLATCH') { if (p) this.set(o.a, 0); }
        else if (o.t === 'TON') {
          this.timers[o.a] = p ? (this.timers[o.a] || 0) + dt : 0;
          this.set(o.a, this.timers[o.a] >= (o.preset || 0));
        }
        flow.push(f);
      }
      this.flow = flow;
      this.scans++;
    }
  }

  function validate(program) {
    const msgs = [];
    if (!program.length) msgs.push('Program has no rungs.');
    program.forEach((r, i) => {
      const n = i + 1;
      const els = [...r.branches.flat(), ...r.series];
      if (!els.length) msgs.push(`Rung ${n}: no contacts. The output is always energised.`);
      els.forEach(e => { if (!ADDR_RE.test(e.a)) msgs.push(`Rung ${n}: "${e.a}" is not a valid address (use I0.0, Q0.0, M0.0 or T0).`); });
      const o = r.out;
      if (!ADDR_RE.test(o.a)) msgs.push(`Rung ${n}: output address "${o.a}" is not valid.`);
      else if (o.t === 'TON' && !/^T\d+$/.test(o.a)) msgs.push(`Rung ${n}: a timer must use a T address such as T0.`);
      else if (o.t !== 'TON' && /^[IT]/.test(o.a)) msgs.push(`Rung ${n}: ${o.t} cannot write to ${o.a}. Use a Q or M address.`);
      if (o.t === 'TON' && !(o.preset > 0)) msgs.push(`Rung ${n}: timer preset must be greater than 0 ms.`);
    });
    return msgs;
  }

  function runTests(program, challenge) {
    const plc = new PLC(program);
    const results = challenge.tests.map(t => {
      for (const [a, v] of Object.entries(t.set || {})) plc.set(a, v);
      const ms = t.run == null ? 100 : t.run;
      for (let e = 0; e < ms; e += 50) plc.scan(50);
      const fails = [];
      for (const [a, v] of Object.entries(t.expect || {})) {
        if (plc.get(a) !== v) fails.push(`${a} should be ${v ? 'ON' : 'OFF'} but is ${plc.get(a) ? 'ON' : 'OFF'}`);
      }
      if (t.check && !t.check(a => plc.get(a))) fails.push(t.checkMsg || 'Safety condition violated');
      return { name: t.name, pass: fails.length === 0, detail: fails.join('; ') };
    });
    const passed = results.filter(r => r.pass).length;
    return { results, passed, total: results.length, score: Math.round(100 * passed / results.length) };
  }

  const api = { PLC, validate, runTests, emptyRung, ADDR_RE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PLCEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
