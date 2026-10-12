(() => {
  const E = PLCEngine, CH = PLCChallenges;
  const $ = id => document.getElementById(id);
  const sess = Auth.session();
  const clone = o => JSON.parse(JSON.stringify(o));
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
  };
  const kProg = id => `plc.prog.${sess.username}.${id}`;
  const kBest = `plc.best.${sess.username}`;
  const BOARD = 'plc.board';

  const S = { ch: CH[0], program: [], hist: [], fut: [], plc: null, timer: null, inputs: {}, nodes: [], lamps: {}, result: null, level: 0, inflow: 6 };

  /* ---------- helpers ---------- */
  const nameOf = a => { const io = [...S.ch.inputs, ...S.ch.outputs].find(x => x.a === a); return io ? io.n : ''; };
  const firstIn = () => S.ch.inputs[0].a;
  const msg = (id, lines, ok) => { const el = $(id); el.textContent = ''; lines.forEach(l => el.append(h('div', ok ? 'ok' : '', l))); };

  /* ---------- tabs ---------- */
  function showTab(name) {
    if (!$('tab-' + name)) name = 'overview';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    location.hash = name;
    if (name === 'results') renderResults();
    if (name === 'challenges') renderChallenges();
    if (name === 'board') renderBoard();
  }
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => showTab(b.dataset.go));

  /* ---------- program state ---------- */
  function setProgram(p) { S.program = p; if (S.plc) S.plc.program = p; renderLadder(); }
  function mutate(fn) {
    S.hist.push(clone(S.program)); if (S.hist.length > 100) S.hist.shift(); S.fut.length = 0;
    fn(S.program); setProgram(S.program); msg('edMsgs', []);
  }
  function saveProg(note) { store.set(kProg(S.ch.id), S.program); if (note) msg('edMsgs', ['Program saved in this browser.'], true); }

  function loadChallenge(id) {
    if (S.program.length) saveProg();
    stopCPU();
    S.ch = CH.find(c => c.id === id) || CH[0];
    store.set(`plc.last.${sess.username}`, S.ch.id);
    S.program = store.get(kProg(S.ch.id), null) || [E.emptyRung()];
    S.hist = []; S.fut = []; S.inputs = {}; S.level = 0; S.result = null;
    S.ch.inputs.forEach(i => S.inputs[i.a] = 0);
    $('chName').textContent = S.ch.title;
    $('edTitle').textContent = S.ch.title; $('edTier').textContent = S.ch.tier; $('edDesc').textContent = S.ch.desc;
    $('benchDesc').textContent = S.ch.desc;
    const map = $('iomap'); map.textContent = '';
    [...S.ch.inputs, ...S.ch.outputs].forEach(x => map.append(h('span', '', `${x.a} ${x.n}`)));
    const dl = $('addrs'); dl.textContent = '';
    [...S.ch.inputs, ...S.ch.outputs].map(x => x.a).concat(['M0.0', 'M0.1', 'M0.2', 'T0', 'T1', 'T2']).forEach(a => { const o = h('option'); o.value = a; dl.append(o); });
    msg('edMsgs', []); msg('benchMsgs', []);
    renderLadder(); buildRack(); renderTests(null);
  }

  /* ---------- ladder rendering ---------- */
  const SYM = { NO: '┤ ├', NC: '┤/├', COIL: '( )', LATCH: '(L)', UNLATCH: '(U)', TON: '[TON]' };
  function elBtn(el, onClick) {
    const b = h('button', 'el'); b.type = 'button';
    b.append(h('span', 'sym', SYM[el.t] || '?'), h('span', 'addr', el.a), h('span', 'nm', nameOf(el.a) || (el.t === 'TON' ? `${el.preset} ms` : '')));
    b.title = 'Click to edit'; b.onclick = onClick; return b;
  }
  function slotFor(el, onClick, get) {
    const slot = h('div', 'slot'), b = elBtn(el, onClick);
    slot.append(b); S.nodes.push({ els: [slot, b], get }); return slot;
  }
  function addBtn(title, fn, cls) { const b = h('button', 'add ' + (cls || ''), cls ? '–' : '+'); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.onclick = fn; return b; }

  function renderLadder() {
    const root = $('ladder'); root.textContent = ''; S.nodes = [];
    if (!S.program.length) root.append(h('p', 'empty', 'No rungs yet. Use "Add rung" to start.'));
    S.program.forEach((r, ri) => {
      const rung = h('div', 'rung'), head = h('div', 'rung-head');
      head.append(h('span', '', `Rung ${ri + 1}`));
      const del = h('button', 'btn sm danger', 'Delete rung'); del.type = 'button'; del.onclick = () => mutate(p => p.splice(ri, 1));
      head.append(del); rung.append(head);

      const body = h('div', 'rung-body'); body.append(h('div', 'rail l'));
      const group = h('div', 'group' + (r.branches.length > 1 ? ' multi' : ''));
      r.branches.forEach((b, bi) => {
        const row = h('div', 'branch');
        b.forEach((el, ei) => row.append(slotFor(el,
          () => openEl('contact', el, v => mutate(() => Object.assign(el, v)), () => mutate(() => b.splice(ei, 1))),
          f => f[ri] && f[ri].branches[bi] && f[ri].branches[bi].els[ei])));
        row.append(addBtn('Add contact in series', () => openEl('contact', { t: 'NO', a: firstIn() }, v => mutate(() => b.push(v)))));
        if (r.branches.length > 1) row.append(addBtn('Remove this branch', () => mutate(() => r.branches.splice(bi, 1)), 'minus'));
        S.nodes.push({ els: [row], get: f => f[ri] && f[ri].branches[bi] && f[ri].branches[bi].power });
        group.append(row);
      });
      const ab = h('button', 'btn sm addbranch', '+ Parallel branch'); ab.type = 'button'; ab.onclick = () => mutate(() => r.branches.push([]));
      group.append(ab);
      S.nodes.push({ els: [group], get: f => f[ri] && f[ri].any });
      body.append(group);

      const ser = h('div', 'series');
      r.series.forEach((el, ei) => ser.append(slotFor(el,
        () => openEl('contact', el, v => mutate(() => Object.assign(el, v)), () => mutate(() => r.series.splice(ei, 1))),
        f => f[ri] && f[ri].series[ei])));
      ser.append(addBtn('Add contact after the branches', () => openEl('contact', { t: 'NO', a: firstIn() }, v => mutate(() => r.series.push(v)))));
      body.append(ser);

      const ow = h('div', 'outwrap'), ob = elBtn(r.out, () => openEl('out', r.out, v => mutate(() => Object.assign(r.out, v))));
      ow.append(ob); S.nodes.push({ els: [ow, ob], get: f => f[ri] && f[ri].out });
      body.append(ow, h('div', 'rail r'));
      rung.append(body); root.append(rung);
    });
    if (S.plc) paintFlow(S.plc.flow);
  }
  function paintFlow(flow) {
    S.nodes.forEach(n => { let v = false; try { v = !!n.get(flow); } catch (e) { } n.els.forEach(e => e.classList.toggle('live', v)); });
  }

  /* ---------- element dialog ---------- */
  const dlg = $('elDlg');
  function openEl(kind, el, apply, del) {
    const types = kind === 'contact' ? [['NO', 'NO contact'], ['NC', 'NC contact']] : [['COIL', 'Coil'], ['LATCH', 'Latch (L)'], ['UNLATCH', 'Unlatch (U)'], ['TON', 'TON timer']];
    const sel = $('elType'); sel.textContent = '';
    types.forEach(([v, l]) => { const o = h('option', '', l); o.value = v; sel.append(o); });
    sel.value = el.t; $('elAddr').value = el.a; $('elPreset').value = el.preset || 1000;
    const sync = () => { $('presetWrap').hidden = sel.value !== 'TON'; };
    sel.onchange = sync; sync();
    $('elTitle').textContent = kind === 'contact' ? 'Contact' : 'Output';
    $('elDel').hidden = !del;
    $('elForm').onsubmit = () => apply({ t: sel.value, a: $('elAddr').value.trim().toUpperCase(), preset: sel.value === 'TON' ? Number($('elPreset').value) || 0 : 0 });
    $('elDel').onclick = () => { del(); dlg.close(); };
    $('elCancel').onclick = () => dlg.close();
    dlg.showModal(); $('elAddr').focus();
  }

  /* ---------- editor toolbar ---------- */
  $('addRung').onclick = () => mutate(p => p.push(E.emptyRung()));
  $('clear').onclick = () => mutate(() => { S.program = [E.emptyRung()]; });
  $('reset').onclick = () => mutate(() => { S.program = store.get(kProg(S.ch.id), null) || [E.emptyRung()]; });
  $('solution').onclick = () => mutate(() => { S.program = clone(S.ch.solution); });
  $('undo').onclick = () => { if (!S.hist.length) return; S.fut.push(clone(S.program)); setProgram(S.hist.pop()); };
  $('redo').onclick = () => { if (!S.fut.length) return; S.hist.push(clone(S.program)); setProgram(S.fut.pop()); };
  $('save').onclick = () => saveProg(true);
  $('validate').onclick = () => { const m = E.validate(S.program); msg('edMsgs', m.length ? m : ['No problems found.'], !m.length); };
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify({ challenge: S.ch.id, program: S.program }, null, 2)], { type: 'application/json' });
    const a = h('a'); a.href = URL.createObjectURL(blob); a.download = `plc-${S.ch.id}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('import').onclick = () => $('importFile').click();
  $('importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      const p = Array.isArray(d) ? d : d.program;
      const ok = Array.isArray(p) && p.every(r => Array.isArray(r.branches) && Array.isArray(r.series) && r.out && r.out.t && r.out.a);
      if (!ok) throw new Error();
      mutate(() => { S.program = p; }); msg('edMsgs', ['Program imported.'], true);
    } catch { msg('edMsgs', ['That file is not a valid PLC Logic Arena program.']); }
  };
  $('runLogic').onclick = () => { showTab('plc'); startCPU(); };

  /* ---------- virtual PLC ---------- */
  function buildRack() {
    const inp = $('inputs'); inp.textContent = ''; S.lamps = {};
    S.ch.inputs.forEach(i => {
      const row = h('div', 'io'); row.append(h('span', 'a', i.a), h('span', 'n', i.n));
      let ctl;
      if (i.kind === 'auto') { ctl = h('span', 'lamp'); }
      else {
        ctl = h('button', i.kind, i.kind === 'pb' ? 'Push' : 'Off'); ctl.type = 'button';
        const set = v => { S.inputs[i.a] = v; refreshInputs(); };
        if (i.kind === 'pb') {
          ctl.onpointerdown = e => { ctl.setPointerCapture(e.pointerId); set(1); };
          ctl.onpointerup = ctl.onpointercancel = () => set(0);
          ctl.onkeydown = e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); set(1); } };
          ctl.onkeyup = e => { if (e.key === ' ' || e.key === 'Enter') set(0); };
        } else ctl.onclick = () => set(S.inputs[i.a] ? 0 : 1);
      }
      S.lamps[i.a] = ctl; row.append(ctl); inp.append(row);
    });
    const out = $('outputs'); out.textContent = '';
    S.ch.outputs.forEach(o => { const row = h('div', 'io'), l = h('span', 'lamp'); row.append(h('span', 'a', o.a), h('span', 'n', o.n), l); S.lamps[o.a] = l; out.append(row); });
    buildViz(); refreshInputs(); updateOutputs();
  }
  function refreshInputs() {
    S.ch.inputs.forEach(i => {
      const c = S.lamps[i.a], v = !!S.inputs[i.a];
      c.classList.toggle('on', v);
      if (i.kind === 'sw') c.textContent = v ? 'On' : 'Off';
    });
  }
  function updateOutputs() {
    S.ch.outputs.forEach(o => { const l = S.lamps[o.a]; if (l) l.classList.toggle('on', !!(S.plc && S.plc.get(o.a))); });
    updateViz();
  }

  function buildViz() {
    const v = $('viz'), sim = $('sim'); v.textContent = ''; sim.textContent = '';
    if (S.ch.viz === 'motor' || S.ch.viz === 'revmotor') { const m = h('div', 'motor'); m.id = 'vMotor'; m.append(h('i')); v.append(m); }
    else if (S.ch.viz === 'press') { const p = h('div', 'press'); p.id = 'vPress'; p.append(h('div', 'ram')); v.append(p); }
    else if (S.ch.viz === 'tank') {
      const t = h('div', 'tank'); t.id = 'vTank';
      const w = h('div', 'water'); w.id = 'vWater'; t.append(w);
      [[20, 'LOW'], [80, 'HIGH']].forEach(([lvl, n]) => { const p = h('div', 'probe'); p.style.bottom = lvl + '%'; p.append(h('span', '', n)); t.append(p); });
      v.append(t);
      const lab = h('label', '', 'Inflow '); const r = h('input'); r.type = 'range'; r.min = 2; r.max = 12; r.value = S.inflow; r.oninput = () => { S.inflow = Number(r.value); };
      lab.append(r); sim.append(lab, h('span', 'mono')); sim.lastChild.id = 'vLevel';
    }
    $('cpuNote').textContent = S.ch.viz === 'tank' ? 'Level probes are driven by the tank simulation.' : '';
  }
  function updateViz() {
    const g = a => S.plc ? S.plc.get(a) : 0;
    if (S.ch.viz === 'motor' || S.ch.viz === 'revmotor') {
      const m = $('vMotor'); if (!m) return;
      m.classList.toggle('cw', !!g('Q0.0')); m.classList.toggle('ccw', !!g('Q0.1'));
    } else if (S.ch.viz === 'press') { const p = $('vPress'); if (p) p.classList.toggle('on', !!g('Q0.0')); }
    else if (S.ch.viz === 'tank') {
      const w = $('vWater'); if (w) w.style.height = S.level + '%';
      const l = $('vLevel'); if (l) l.textContent = `Level ${S.level.toFixed(0)}%`;
    }
  }

  function startCPU() {
    stopCPU();
    const problems = E.validate(S.program);
    if (problems.length) msg('edMsgs', problems.concat(['Running anyway. Fix these for a clean result.']));
    S.plc = new E.PLC(S.program);
    document.body.classList.add('run-mode');
    $('cpu').textContent = 'CPU: RUN'; $('cpu').className = 'badge run';
    S.timer = setInterval(tick, 50);
  }
  function stopCPU() {
    if (S.timer) clearInterval(S.timer);
    S.timer = null; S.plc = null;
    document.body.classList.remove('run-mode');
    $('cpu').textContent = 'CPU: STOP'; $('cpu').className = 'badge stop';
    if (S.nodes.length) paintFlow([]);
    if (S.lamps && S.ch) { updateOutputs(); }
  }
  function tick() {
    const p = S.plc; if (!p) return;
    if (S.ch.viz === 'tank') { S.inputs['I0.0'] = S.level >= 20 ? 1 : 0; S.inputs['I0.1'] = S.level >= 80 ? 1 : 0; refreshInputs(); }
    for (const [a, v] of Object.entries(S.inputs)) p.set(a, v);
    p.scan(50);
    if (S.ch.viz === 'tank') S.level = Math.max(0, Math.min(100, S.level + (S.inflow - (p.get('Q0.0') ? 14 : 0)) * 0.05));
    paintFlow(p.flow); updateOutputs();
    $('scanInfo').textContent = `Scans: ${p.scans}`;
  }
  $('cpuRun').onclick = startCPU;
  $('cpuStop').onclick = stopCPU;

  /* ---------- test bench ---------- */
  function renderTests(res) {
    const ul = $('tests'); ul.textContent = '';
    S.ch.tests.forEach((t, i) => {
      const r = res && res.results[i];
      const li = h('li', r ? (r.pass ? 'pass' : 'fail') : '');
      li.append(h('span', 'mk', r ? (r.pass ? 'PASS' : 'FAIL') : '–'));
      const d = h('div'); d.append(h('span', '', `${i + 1}. ${t.name}`));
      if (r && !r.pass) d.append(h('span', 'd', r.detail));
      li.append(d); ul.append(li);
    });
    $('benchSum').textContent = res ? `${res.passed}/${res.total} passed (${res.score}%)` : '';
  }
  $('runTests').onclick = () => {
    stopCPU();
    const problems = E.validate(S.program);
    msg('benchMsgs', problems);
    const res = E.runTests(clone(S.program), S.ch);
    S.result = res; renderTests(res);
    const best = store.get(kBest, {}); if ((best[S.ch.id] || 0) < res.score) { best[S.ch.id] = res.score; store.set(kBest, best); }
    $('scanInfo').textContent = 'Scans: 0';
  };

  /* ---------- results ---------- */
  const rank = s => s === 100 ? 'Commissioning ready' : s >= 75 ? 'Technician' : s >= 50 ? 'Apprentice' : 'Trainee';
  function renderResults() {
    const body = $('resultsBody'); body.textContent = '';
    const r = S.result, card = h('div', 'card');
    if (!r) {
      card.append(h('p', 'lead', `No test run yet for ${S.ch.title}. Run the automated tests to see your score.`));
      const b = h('button', 'btn primary', 'Go to test bench'); b.onclick = () => showTab('bench'); card.append(b);
    } else {
      card.append(h('p', 'lead', S.ch.title));
      card.append(h('div', 'score ' + (r.score === 100 ? 'good' : r.score >= 50 ? 'mid' : 'low'), r.score + '%'));
      card.append(h('p', '', `${r.passed} of ${r.total} tests passed. Rank: ${rank(r.score)}.`));
      const t = h('div', 'toolbar');
      const post = h('button', 'btn primary', 'Post to leaderboard'); post.onclick = openSubmit;
      const again = h('button', 'btn', 'Back to editor'); again.onclick = () => showTab('editor');
      t.append(post, again); card.append(t);
    }
    body.append(card);
  }
  const sub = $('subDlg');
  function openSubmit() {
    $('subInfo').textContent = `${S.ch.title} · ${S.result.score}%`;
    $('subName').value = sess.guest ? '' : sess.username; $('subOrg').value = sess.org || '';
    $('subForm').onsubmit = () => {
      const b = store.get(BOARD, []);
      b.push({ name: $('subName').value.trim() || 'Anonymous', org: $('subOrg').value.trim(), ch: S.ch.title, score: S.result.score, ts: Date.now() });
      store.set(BOARD, b); setTimeout(() => showTab('board'), 0);
    };
    $('subCancel').onclick = () => sub.close();
    sub.showModal();
  }

  /* ---------- challenges + leaderboard ---------- */
  function renderChallenges() {
    const g = $('chGrid'); g.textContent = ''; const best = store.get(kBest, {});
    CH.forEach(c => {
      const card = h('div', 'card');
      const tag = h('span', 'tier tag', c.tier); card.append(tag, h('h3', '', c.title), h('p', '', c.desc));
      const row = h('div', 'toolbar'); const b = h('button', 'btn primary', c.id === S.ch.id ? 'Continue' : 'Open');
      b.onclick = () => { if (c.id !== S.ch.id) loadChallenge(c.id); showTab('editor'); };
      row.append(b); if (best[c.id] != null) row.append(h('span', 'mono', `Best ${best[c.id]}%`));
      card.append(row); g.append(card);
    });
  }
  function renderBoard() {
    const body = $('boardBody'); body.textContent = '';
    const rows = store.get(BOARD, []).sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, 50);
    if (!rows.length) { body.append(h('p', 'empty', 'No scores yet. Pass a challenge on the test bench and post your result.')); return; }
    const t = h('table'), th = h('tr');
    ['#', 'Name', 'Role', 'Challenge', 'Score', 'Date'].forEach(x => th.append(h('th', '', x))); t.append(th);
    rows.forEach((r, i) => {
      const tr = h('tr'); [i + 1, r.name, r.org || '–', r.ch, r.score + '%', new Date(r.ts).toLocaleDateString()].forEach((x, k) => tr.append(h('td', k === 0 || k === 4 ? 'num' : '', String(x)))); t.append(tr);
    });
    body.append(t);
  }

  /* ---------- boot ---------- */
  $('who').textContent = (sess.guest ? 'Guest Learner' : sess.username) + (sess.role && sess.role !== 'student' ? ' (' + sess.role + ')' : '');
  $('logout').onclick = () => { saveProg(); Auth.logout(); location.href = 'login.html'; };
  window.addEventListener('beforeunload', () => { if (S.program.length) saveProg(); });
  loadChallenge(store.get(`plc.last.${sess.username}`, CH[0].id));
  showTab((location.hash || '#overview').slice(1));
})();
