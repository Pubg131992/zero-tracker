/* ============================================================================
   Zero Tracker — app (v1). Reads only from window.Sources (adapter registry).
   v1 source: Rookery (rookery.js). Account = Rookery username (public data).
   ============================================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const SRC = () => Sources.get('rookery');        // v1 single source; multi-source merge comes with more adapters
  const LS = { acc: 'zt:accounts', active: 'zt:active' };

  const state = {
    accounts: load(LS.acc, []),      // [{user,label}]
    active: load(LS.active, null),   // username or null (null = Markets view)
    tokens: [], byId: {}, zroUsd: 0,
    tab: 'markets',
    accData: {},                     // user -> account (holdings)
    scanning: false,
  };

  /* ---------- utils ---------- */
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  function usd(v, dp) { v = +v || 0; const a = Math.abs(v); if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'; return '$' + v.toFixed(dp ?? (a < 1 ? (a < 0.01 ? 6 : 4) : 2)); }
  function num(v) { v = +v || 0; const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K'; return v.toFixed(a < 1 ? 2 : 0); }
  function chg(v) { if (v == null) return '<span class="muted">—</span>'; const c = +v; const cl = c >= 0 ? 'up' : 'down'; return `<span class="${cl}">${c >= 0 ? '+' : ''}${c.toFixed(1)}%</span>`; }
  function ago(ts) { const s = (Date.now() - ts) / 1000; if (s < 60) return Math.floor(s) + 's'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function avatar(t, size) { const im = t.img ? `<img src="${esc(t.img)}" alt="" onerror="this.remove()">` : ''; return `<div class="av" style="${size ? `width:${size}px;height:${size}px` : ''}">${im || esc((t.sym || '?').slice(0, 3))}</div>`; }
  let toastT; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

  /* ---------- data ---------- */
  async function loadMarkets() {
    const toks = await Sources.listTokens();
    state.tokens = toks;
    state.byId = {}; toks.forEach(t => state.byId[t.id] = t);
    const z = toks.find(t => t.priceNative > 0);
    state.zroUsd = z ? z.priceUsd / z.priceNative : 0;
    renderKPIs(); renderCurrent();
  }

  async function scanAccount(user) {
    const a = SRC();
    if (!a || !a.getAccount) return;
    state.scanning = true; renderSidebar();
    try {
      const acc = await a.getAccount(user);
      state.accData[user] = acc;
    } catch (e) { toast('Scan failed'); }
    state.scanning = false;
    renderSidebar(); if (state.active === user) renderCurrent();
  }

  /* ---------- render: KPIs ---------- */
  function renderKPIs() {
    const vol = state.tokens.reduce((s, t) => s + (t.volumeUsd || 0), 0);
    $('k0').textContent = state.tokens.length;
    $('k1').textContent = usd(vol);
    $('k2').textContent = state.zroUsd ? '$' + state.zroUsd.toFixed(3) : '—';
    $('nMarkets').textContent = state.tokens.length;
  }

  /* ---------- render: sidebar ---------- */
  function renderSidebar() {
    const box = $('alist'); box.innerHTML = '';
    // "Markets" (no account) pseudo-row
    const mk = document.createElement('button');
    mk.className = 'wl' + (state.active == null ? ' on' : '');
    mk.innerHTML = `<span class="wd"></span><span class="wt"><span class="wn">All markets</span></span>`;
    mk.onclick = () => selectAccount(null);
    box.appendChild(mk);
    for (const a of state.accounts) {
      const acc = state.accData[a.user];
      const row = document.createElement('button');
      row.className = 'wl' + (state.active === a.user ? ' on' : '');
      const val = acc ? usd(acc.valueUsd) : (state.scanning && state.active === a.user ? '…' : '<span class="skel"></span>');
      row.innerHTML = `<span class="wd"></span><span class="wt"><span class="wn">${esc(a.label || a.user)}</span><span class="muted">@${esc(a.user)}</span></span><span class="wv mono">${val}</span>`;
      row.onclick = () => selectAccount(a.user);
      box.appendChild(row);
    }
  }

  /* ---------- render: current view ---------- */
  function renderCurrent() {
    const acct = state.active ? state.accData[state.active] : null;
    // header
    if (state.active == null) {
      $('hName').textContent = 'Markets';
      $('hSubTxt').textContent = 'Zero · Stinky Penguin launchpad';
      $('holdTab').hidden = true;
      if (state.tab === 'hold') state.tab = 'markets';
    } else {
      $('hName').textContent = state.accounts.find(a => a.user === state.active)?.label || state.active;
      $('hSubTxt').textContent = '@' + state.active + (acct ? ' · ' + (acct.holdings.length) + ' holdings' : '');
      $('holdTab').hidden = false;
      $('nHold').textContent = acct ? acct.holdings.length : 0;
    }
    // KPI swap when an account is active
    if (state.active && acct) {
      $('k0l').textContent = 'Holdings value'; $('k0').textContent = usd(acct.valueUsd); $('k0s').textContent = acct.holdings.length + ' tokens';
      $('k1l').textContent = 'Top holding'; const top = acct.holdings[0]; $('k1').textContent = top ? usd(top.valueUsd) : '—'; $('k1s').textContent = top ? '$' + top.sym : ' ';
      $('k2l').textContent = 'ZRO price'; $('k2').textContent = state.zroUsd ? '$' + state.zroUsd.toFixed(3) : '—'; $('k2s').textContent = ' ';
    } else {
      $('k0l').textContent = 'Tokens on Rookery'; $('k0').textContent = state.tokens.length; $('k0s').textContent = ' ';
      $('k1l').textContent = 'Total volume'; $('k1').textContent = usd(state.tokens.reduce((s, t) => s + (t.volumeUsd || 0), 0)); $('k1s').textContent = ' ';
      $('k2l').textContent = 'ZRO price'; $('k2').textContent = state.zroUsd ? '$' + state.zroUsd.toFixed(3) : '—'; $('k2s').textContent = ' ';
    }
    // tabs active state
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.t === state.tab));
    if (state.tab === 'hold' && acct) renderHoldings(acct); else renderMarkets();
  }

  function renderMarkets() {
    const toks = state.tokens.slice().sort((a, b) => b.mcapUsd - a.mcapUsd);
    const rows = toks.map(t => `
      <tr class="ovrow" data-id="${esc(t.id)}">
        <td><div class="coin">${avatar(t)}<div><div class="nm">${esc(t.name)} <span class="muted">$${esc(t.sym)}</span></div><div class="ad">by ${esc(t.creator)} · ${ago(t.created)} ago</div></div></div></td>
        <td class="mono">${usd(t.priceUsd)}</td>
        <td class="mono">${usd(t.mcapUsd)}</td>
        <td>${chg(t.ch24)}</td>
        <td><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><span class="mono">${t.progress.toFixed(1)}%</span><span class="bar"><b style="width:${Math.min(100, t.progress)}%"></b></span></div></td>
        <td class="mono">${t.holders}</td>
        <td class="mono">${t.trades}</td>
      </tr>`).join('');
    $('panel').innerHTML = toks.length ? `<table class="tbl">
      <thead><tr><th>Token</th><th>Price</th><th>MCAP</th><th>24h</th><th>Bonded</th><th>Holders</th><th>Trades</th></tr></thead>
      <tbody>${rows}</tbody></table>` : `<div class="empty">No tokens yet.</div>`;
    $('panel').querySelectorAll('tr.ovrow').forEach(tr => tr.onclick = () => openToken(tr.dataset.id));
  }

  function renderHoldings(acc) {
    if (!acc.holdings.length) { $('panel').innerHTML = `<div class="empty">@${esc(acc.id)} holds no tokens on Rookery right now.</div>`; return; }
    const rows = acc.holdings.map(h => `
      <tr class="ovrow" data-id="${esc(h.id)}">
        <td><div class="coin">${avatar(h)}<div><div class="nm">${esc(h.name)} <span class="muted">$${esc(h.sym)}</span></div><div class="ad">${h.pct.toFixed(2)}% of supply</div></div></div></td>
        <td class="mono">${num(h.amount)}</td>
        <td class="mono">${usd(h.priceUsd)}</td>
        <td class="mono">${usd(h.valueUsd)}</td>
        <td>${chg(h.ch24)}</td>
      </tr>`).join('');
    $('panel').innerHTML = `<table class="tbl">
      <thead><tr><th>Token</th><th>Amount</th><th>Price</th><th>Value</th><th>24h</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    $('panel').querySelectorAll('tr.ovrow').forEach(tr => tr.onclick = () => openToken(tr.dataset.id));
  }

  /* ---------- token detail modal ---------- */
  async function openToken(id) {
    const box = $('tokBox'); $('tokModal').classList.add('on');
    box.innerHTML = `<div class="empty">Loading…</div>`;
    let d; try { d = await SRC().getToken(id); } catch { box.innerHTML = `<div class="empty">Failed to load.</div>`; return; }
    const t = d.token;
    const links = [t.x && `<a class="lnk" href="${esc(t.x)}" target="_blank" rel="noopener">X</a>`, t.tg && `<a class="lnk" href="${esc(t.tg)}" target="_blank" rel="noopener">TG</a>`, t.web && `<a class="lnk" href="${esc(t.web)}" target="_blank" rel="noopener">Web</a>`].filter(Boolean).join(' · ');
    const trades = d.trades.slice(0, 20).map(tr => `<tr><td><span class="pill ${tr.side === 'buy' ? 'up' : 'down'}">${tr.side}</span> <span class="muted">@${esc(tr.who)}</span></td><td class="mono">${tr.native.toFixed(2)} ZRO</td><td class="mono">${usd(tr.usd)}</td><td class="muted">${ago(tr.ts)}</td></tr>`).join('');
    const holders = d.holders.slice(0, 15).map((h, i) => `<tr><td>${i + 1}. @${esc(h.who)}${h.creator ? ' <span class="pill up">dev</span>' : ''}</td><td class="mono">${num(h.amount)}</td><td class="mono">${h.pct.toFixed(2)}%</td></tr>`).join('');
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">${avatar(t, 46)}<div><h3 style="margin:0">${esc(t.name)} <span class="muted">$${esc(t.sym)}</span></h3><p style="margin:0">by ${esc(t.creator)} · ${ago(t.created)} ago ${links ? '· ' + links : ''}</p></div><div class="spacer" style="flex:1"></div><button class="lnk" id="tkClose">Close</button></div>
      ${t.desc ? `<p>${esc(t.desc)}</p>` : ''}
      <div class="hero" style="grid-template-columns:repeat(3,1fr);margin:6px 0 10px">
        <div class="kpi card"><div class="lbl">Market cap</div><div class="val mono" style="font-size:22px">${usd(t.mcapUsd)}</div><div class="sub">${chg(t.ch24)} 24h</div></div>
        <div class="kpi card"><div class="lbl">Price</div><div class="val mono" style="font-size:22px">${usd(t.priceUsd)}</div><div class="sub">${t.priceNative.toExponential(2)} ZRO</div></div>
        <div class="kpi card"><div class="lbl">Bonded</div><div class="val mono" style="font-size:22px">${t.progress.toFixed(1)}%</div><div class="sub">${t.holders} holders · ${t.trades} trades</div></div>
      </div>
      <div class="progress"><b style="width:${Math.min(100, t.progress)}%"></b></div>
      <div class="split" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
        <div><div class="side-h">HOLDERS</div><div class="scroll"><table class="tbl">${holders || '<tr><td class="empty">—</td></tr>'}</table></div></div>
        <div><div class="side-h">RECENT TRADES</div><div class="scroll"><table class="tbl">${trades || '<tr><td class="empty">—</td></tr>'}</table></div></div>
      </div>`;
    $('tkClose').onclick = () => $('tokModal').classList.remove('on');
  }

  /* ---------- account actions ---------- */
  function selectAccount(user) {
    state.active = user; save(LS.active, user);
    if (state.active) state.tab = 'hold'; else state.tab = 'markets';
    renderSidebar(); renderCurrent();
    if (user && !state.accData[user]) scanAccount(user);
  }
  function addAccount(user, label) {
    user = user.replace(/^@/, '').trim(); if (!user) return;
    if (!state.accounts.some(a => a.user === user)) state.accounts.push({ user, label: label || '' });
    save(LS.acc, state.accounts); selectAccount(user);
  }

  /* ---------- wiring ---------- */
  function wire() {
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => { state.tab = t.dataset.t; renderCurrent(); });
    $('refreshBtn').onclick = async () => { $('refreshBtn').disabled = true; await loadMarkets(); if (state.active) await scanAccount(state.active); $('refreshBtn').disabled = false; toast('Refreshed'); };
    // add modal
    const am = $('addModal');
    $('addBtn').onclick = () => { $('aUser').value = ''; $('aLabel').value = ''; $('aErr').textContent = ''; am.classList.add('on'); $('aUser').focus(); };
    $('aCancel').onclick = () => am.classList.remove('on');
    $('aOk').onclick = () => { const u = $('aUser').value.trim(); if (!u) { $('aErr').textContent = 'Enter a username'; return; } am.classList.remove('on'); addAccount(u, $('aLabel').value.trim()); };
    $('aUser').onkeydown = e => { if (e.key === 'Enter') $('aOk').click(); };
    [am, $('tokModal')].forEach(m => m.onclick = e => { if (e.target === m) m.classList.remove('on'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { am.classList.remove('on'); $('tokModal').classList.remove('on'); } });
  }

  /* ---------- boot ---------- */
  async function boot() {
    wire(); renderSidebar(); renderCurrent();
    await loadMarkets();
    if (state.active && state.accounts.some(a => a.user === state.active)) scanAccount(state.active);
    setInterval(() => { loadMarkets().catch(() => {}); }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
