/* ============================================================================
   Zero Tracker — app (v1). Reads only from window.Sources (adapter registry).
   v1 source: Rookery (rookery.js). Account = Rookery username (public data).
   ============================================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const SRC = () => Sources.get('rookery');        // v1 single source; multi-source merge comes with more adapters
  const LS = { acc: 'zt:accounts', active: 'zt:active' };

  /* ---- Call config (easy to tune) ---- */
  const CALL_MIN_VOL = 10;   // a coin needs at least this much USD volume to qualify as a call
  const TIERS = [            // wallet rank by realized profit (USD, buy/sell net across scanned markets), high → low
    { min: 20000, name: 'Beast', cls: 'beast', emoji: '🐉' },
    { min: 10000, name: 'Alpha', cls: 'alpha', emoji: '⚡' },
    { min: 5000,  name: 'Smart', cls: 'smart', emoji: '⭐' },
  ];
  const tierOf = net => { for (const t of TIERS) if (net >= t.min) return t; return null; };
  const tierRank = t => t ? TIERS.length - TIERS.indexOf(t) : 0;

  const state = {
    accounts: load(LS.acc, []),      // [{user,label}]
    active: load(LS.active, null),   // username, or null = a top-level view
    view: 'markets',                 // markets | calls | smart  (used when active==null)
    tokens: [], byId: {}, zroUsd: 0,
    tab: 'markets',
    accData: {},                     // user -> account (holdings)
    smart: null, smartScanning: false, // smart-wallet leaderboard cache
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
    const nav = $('nav');
    if (nav) {
      const items = [['markets', 'Markets'], ['calls', 'Calls'], ['smart', 'Smart wallets']];
      nav.innerHTML = '';
      for (const [v, label] of items) {
        const b = document.createElement('button');
        b.className = 'wl' + (state.active == null && state.view === v ? ' on' : '');
        b.innerHTML = `<span class="wd"></span><span class="wt"><span class="wn">${label}</span></span>`;
        b.onclick = () => selectView(v);
        nav.appendChild(b);
      }
    }
    const box = $('alist'); box.innerHTML = '';
    if (!state.accounts.length) box.innerHTML = `<div class="muted" style="padding:6px 8px">No accounts yet</div>`;
    for (const a of state.accounts) {
      const acc = state.accData[a.user];
      const row = document.createElement('button');
      row.className = 'wl' + (state.active === a.user ? ' on' : '');
      const val = acc ? usd(acc.valueUsd) : (state.scanning && state.active === a.user ? '…' : '<span class="skel"></span>');
      row.innerHTML = `<span class="wd"></span><span class="wt"><span class="wn">${esc(a.label || a.user)}</span><span class="muted">@${esc(a.user)}</span></span><span class="wv mono">${val}</span><span class="wx" title="Remove">×</span>`;
      row.onclick = () => selectAccount(a.user);
      const x = row.querySelector('.wx');
      if (x) x.onclick = (e) => { e.stopPropagation(); removeAccount(a.user); };
      box.appendChild(row);
    }
  }

  /* ---------- render: current view ---------- */
  function renderCurrent() {
    const acct = state.active ? state.accData[state.active] : null;
    // header
    if (state.active == null) {
      const titles = { markets: ['Markets', 'Zero · Stinky Penguin launchpad'], calls: ['Calls', 'Fresh launches, movers & near-bonding'], smart: ['Smart wallets', 'Top Rookery traders by realized activity'] };
      const t = titles[state.view] || titles.markets;
      $('hName').textContent = t[0];
      $('hSubTxt').textContent = t[1];
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
    if (state.active) { if (state.tab === 'hold' && acct) renderHoldings(acct); else renderMarkets(); }
    else if (state.view === 'calls') renderCalls();
    else if (state.view === 'smart') renderSmart();
    else renderMarkets();
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

  /* ---------- calls ---------- */
  function callRow(t, right) {
    return `<tr class="ovrow" data-id="${esc(t.id)}"><td><div class="coin">${avatar(t)}<div><div class="nm">${esc(t.name)} <span class="muted">$${esc(t.sym)}</span></div><div class="ad">${usd(t.mcapUsd)} mcap · ${t.holders} holders · ${t.trades} trades</div></div></div></td><td class="mono">${right}</td></tr>`;
  }
  function renderCalls() {
    const now = Date.now(), T = state.tokens;
    const sec = (title, toks, right) => toks.length ? `<div class="side-h" style="padding:16px 8px 8px">${title}</div><table class="tbl"><tbody>${toks.map(t => callRow(t, right(t))).join('')}</tbody></table>` : '';

    // ---- real (smart-money) calls ----
    let smartHtml = '';
    const calls = state.callsData;
    if (state.smartScanning && !calls) {
      smartHtml = `<div class="empty">Scanning wallets for smart-money calls… ${state.smartProgress || ''}</div>`;
    } else if (calls && calls.length) {
      const rows = calls.slice(0, 20).map(c => {
        const t = c.token, badges = c.wallets.slice(0, 4).map(w => `<span class="tier ${w.tier.cls}">${w.tier.emoji} @${esc(w.user)}</span>`).join(' ');
        return `<tr class="ovrow" data-id="${esc(t.id)}">
          <td><div class="coin">${avatar(t)}<div><div class="nm">${esc(t.name)} <span class="muted">$${esc(t.sym)}</span> <span class="tier ${c.tier.cls}">${c.tier.emoji} ${c.tier.name}</span></div><div class="ad">${badges}</div></div></div></td>
          <td class="mono">${usd(t.mcapUsd)}<div class="ad">${usd(t.volumeUsd)} vol</div></td>
          <td>${chg(t.ch24)}</td></tr>`;
      }).join('');
      smartHtml = `<div class="side-h" style="padding:4px 8px 8px">⭐ SMART-MONEY CALLS <span class="muted" style="font-weight:600">· tiered wallet bought · min ${usd(CALL_MIN_VOL)} vol</span></div><table class="tbl"><tbody>${rows}</tbody></table>`;
    } else if (calls) {
      smartHtml = `<div class="empty" style="padding:22px 16px">No smart-money calls yet — no wallet has crossed <b>${usd(5000)}</b> realized profit on this young chain.${state.topNet ? ` Top trader so far: <b>${usd(state.topNet)}</b>.` : ''}<br><span class="muted">Tiers: ⭐ Smart ${usd(5000)} · ⚡ Alpha ${usd(10000)} · 🐉 Beast ${usd(20000)}+ · auto-fills as the chain grows.</span> <button class="lnk" id="clRescan">Rescan</button></div>`;
    } else {
      smartHtml = `<div class="empty">Loading calls… <button class="lnk" id="clRescan">Scan now</button></div>`;
    }

    // ---- launchpad pulse (mechanical) ----
    const fresh = T.filter(t => now - t.created < 6 * 3600e3).sort((a, b) => b.created - a.created).slice(0, 8);
    const movers = T.filter(t => t.ch24 != null && t.volumeUsd > CALL_MIN_VOL).sort((a, b) => b.ch24 - a.ch24).slice(0, 6);
    const near = T.filter(t => t.progress >= 15 && t.progress < 100).sort((a, b) => b.progress - a.progress).slice(0, 6);
    const pulse = sec('🆕 FRESH LAUNCHES', fresh, t => ago(t.created) + ' ago')
      + sec('🚀 TOP MOVERS · 24h', movers, t => chg(t.ch24))
      + sec('🔥 NEAR BONDING', near, t => `<span style="display:inline-flex;align-items:center;gap:8px;justify-content:flex-end">${t.progress.toFixed(1)}%<span class="bar"><b style="width:${Math.min(100, t.progress)}%"></b></span></span>`);

    $('panel').innerHTML = smartHtml + pulse;
    const rb = $('clRescan'); if (rb) rb.onclick = () => scanSmart();
    $('panel').querySelectorAll('tr.ovrow').forEach(tr => tr.onclick = () => openToken(tr.dataset.id));
  }

  /* ---------- smart wallets ---------- */
  async function scanSmart() {
    const a = SRC(); if (!a || !a.getToken) return;
    state.smartScanning = true;
    if (state.active == null && (state.view === 'smart' || state.view === 'calls')) renderCurrent();
    const top = state.tokens.slice().filter(t => t.trades > 0).sort((x, y) => y.volumeUsd - x.volumeUsd).slice(0, 30);
    const agg = {};          // user -> {user,trades,buy,sell}
    const buyers = {};       // marketId -> { user -> buyUsd }  (who bought this coin)
    const q = top.slice(); let done = 0;
    const worker = async () => {
      while (q.length) {
        const m = q.shift();
        try {
          const d = await a.getToken(m.id);
          for (const tr of (d.trades || [])) {
            const u = tr.who || '?'; if (u === '?') continue;
            const g = agg[u] || (agg[u] = { user: u, trades: 0, buy: 0, sell: 0 });
            g.trades++;
            if (tr.side === 'buy') { g.buy += tr.usd || 0; (buyers[m.id] || (buyers[m.id] = {}))[u] = ((buyers[m.id] || {})[u] || 0) + (tr.usd || 0); }
            else g.sell += tr.usd || 0;
          }
        } catch {}
        done++; state.smartProgress = done + '/' + top.length;
        if (state.active == null && (state.view === 'smart' || state.view === 'calls') && done % 4 === 0) renderCurrent();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    // wallet leaderboard with realized-profit tier
    const users = Object.values(agg).map(g => { const net = g.sell - g.buy; return { ...g, vol: g.buy + g.sell, net, tier: tierOf(net) }; });
    state.smart = users.filter(g => g.trades >= 2).sort((x, y) => y.vol - x.vol).slice(0, 50);
    const tierByUser = {}; users.forEach(u => { if (u.tier) tierByUser[u.user] = u; });
    // build smart calls: coins (vol >= min) that a tiered wallet bought
    const calls = [];
    for (const m of state.tokens) {
      if ((m.volumeUsd || 0) < CALL_MIN_VOL) continue;
      const bset = buyers[m.id]; if (!bset) continue;
      const wallets = Object.keys(bset).map(u => tierByUser[u]).filter(Boolean)
        .sort((x, y) => tierRank(y.tier) - tierRank(x.tier));
      if (!wallets.length) continue;
      calls.push({ token: m, tier: wallets[0].tier, wallets });
    }
    calls.sort((x, y) => tierRank(y.tier) - tierRank(x.tier) || (y.token.volumeUsd - x.token.volumeUsd));
    state.callsData = calls;
    state.topNet = users.reduce((mx, u) => Math.max(mx, u.net), 0);
    state.smartScanning = false;
    if (state.active == null && (state.view === 'smart' || state.view === 'calls')) renderCurrent();
  }
  function renderSmart() {
    if (state.smartScanning && !state.smart) { $('panel').innerHTML = `<div class="empty">Scanning trader activity… ${state.smartProgress || ''}</div>`; return; }
    const list = state.smart || [];
    if (!list.length) { $('panel').innerHTML = `<div class="empty">No trader activity found yet. <button class="lnk" id="smRescan">Rescan</button></div>`; const b = $('smRescan'); if (b) b.onclick = () => scanSmart(); return; }
    const rows = list.map((g, i) => `
      <tr class="ovrow" data-u="${esc(g.user)}">
        <td><div class="coin"><div class="av">${esc((g.user || '?').slice(0, 3))}</div><div><div class="nm">@${esc(g.user)}</div><div class="ad">${g.trades} trades</div></div></div></td>
        <td class="mono">${usd(g.vol)}</td>
        <td class="mono">${usd(g.buy)}</td>
        <td class="mono">${usd(g.sell)}</td>
        <td class="mono">${g.net >= 0 ? '<span class="up">+' + usd(g.net) + '</span>' : '<span class="down">-' + usd(-g.net) + '</span>'}</td>
      </tr>`).join('');
    $('panel').innerHTML = `<table class="tbl">
      <thead><tr><th>Trader</th><th>Volume</th><th>Bought</th><th>Sold</th><th>Net flow</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="foot" style="text-align:left;padding:10px 8px">Click a trader to track their holdings · scanned top ${Math.min(24, state.tokens.length)} markets by volume${state.smartScanning ? ' · refreshing…' : ''}</div>`;
    $('panel').querySelectorAll('tr.ovrow').forEach(tr => tr.onclick = () => addAccount(tr.dataset.u, ''));
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
  function selectView(v) {
    state.view = v; state.active = null; save(LS.active, null);
    state.tab = 'markets';
    renderSidebar(); renderCurrent();
    if ((v === 'smart' || v === 'calls') && !state.smart && !state.smartScanning) scanSmart();
  }
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
  function removeAccount(user) {
    const a = state.accounts.find(x => x.user === user);
    if (!a) return;
    if (!confirm(`Remove @${user} from tracking?`)) return;
    state.accounts = state.accounts.filter(x => x.user !== user);
    delete state.accData[user];
    save(LS.acc, state.accounts);
    if (state.active === user) { state.active = null; save(LS.active, null); state.tab = 'markets'; }
    renderSidebar(); renderCurrent();
    toast('Removed @' + user);
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
