/* ============================================================================
   Rookery adapter  (Stinky Penguin launchpad — Zero / ZRO, pre-mainnet)
   Registers itself into window.Sources. Public, username-based (no wallet yet).
   Proxy: /rk/*  ->  https://rookery.stinkypenguin.xyz/*   (see vercel.json)
   ============================================================================ */
(() => {
  const U = window.Sources.util;
  const BASE = '/rk/api';
  const DEC = 18;                         // ZERO tokens: 18 decimals
  const tokCache = new Map();             // id -> { at, data }
  const TTL = 15000;

  function mapToken(m) {
    return {
      src: 'rookery',
      id: m.id,
      sym: m.symbol,
      name: m.name,
      img: m.image ? '/rk' + m.image : '',
      priceUsd: U.num(m.priceUsd),
      priceNative: U.num(m.priceZro),
      mcapUsd: U.num(m.mcapUsd),
      ch5m: m.change5m == null ? null : U.num(m.change5m),
      ch1h: m.change1h == null ? null : U.num(m.change1h),
      ch24: m.change24h == null ? null : U.num(m.change24h),
      progress: U.num(m.progress),        // bonded %
      trades: U.num(m.trades),
      holders: U.num(m.holders),
      volumeUsd: U.num(m.volumeUsd),
      liquidityUsd: U.num(m.liquidityUsd),
      created: U.num(m.created),
      creator: m.creator || '',
      graduated: !!m.graduated,
      desc: m.description || '',
      x: m.x || '', tg: m.tg || '', web: m.web || '',
      raw: m,
    };
  }

  async function listTokens() {
    const j = await U.json(BASE + '/markets', { cache: 'no-store' });
    const arr = (j && j.markets) || [];
    return arr.map(mapToken);
  }

  async function getToken(id) {
    const c = tokCache.get(id);
    if (c && Date.now() - c.at < TTL) return c.data;
    const j = await U.json(BASE + '/market/' + encodeURIComponent(id), { cache: 'no-store' });
    const token = mapToken(j.market || {});
    const zroUsd = U.num(j.zroUsd);
    const trades = (j.trades || []).map(t => ({
      src: 'rookery', tokenId: id, sym: token.sym,
      side: t.side, who: t.username || '',
      native: U.fromWei(t.zro, DEC), usd: U.num(t.usd), ts: U.num(t.ts), raw: t,
    }));
    const holders = (j.holders || []).map(h => ({
      who: h.username || '', amount: U.fromWei(h.amount, DEC),
      pct: U.num(h.pct), creator: !!h.creator,
    }));
    const data = { token, zroUsd, trades, holders, me: j.me || null, comments: j.comments || [] };
    tokCache.set(id, { at: Date.now(), data });
    return data;
  }

  // Public account view keyed by USERNAME: scan markets' holder lists.
  // (ZRO balance / transfers need a logged-in session -> added when auth lands.)
  async function getAccount(username, onProgress) {
    const uname = String(username || '').trim();
    const toks = await listTokens();
    const holdings = [];
    let done = 0;
    const CONC = 6;
    let i = 0;
    async function worker() {
      while (i < toks.length) {
        const t = toks[i++];
        try {
          const d = await getToken(t.id);
          const h = d.holders.find(x => x.who === uname);
          if (h && h.amount > 0) {
            holdings.push({
              src: 'rookery', id: t.id, sym: t.sym, name: t.name, img: t.img,
              amount: h.amount, priceUsd: t.priceUsd, valueUsd: h.amount * t.priceUsd,
              pct: h.pct, mcapUsd: t.mcapUsd, ch24: t.ch24, progress: t.progress, raw: t.raw,
            });
          }
        } catch {}
        done++; if (onProgress) try { onProgress(done, toks.length); } catch {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, toks.length) }, worker));
    holdings.sort((a, b) => b.valueUsd - a.valueUsd);
    const valueUsd = holdings.reduce((s, h) => s + h.valueUsd, 0);
    return {
      src: 'rookery', id: uname, label: uname,
      native: null, nativeSym: 'ZRO', nativeUsd: null,
      valueUsd, holdings, transfers: [], raw: {},
    };
  }

  window.Sources.register({
    id: 'rookery',
    label: 'Rookery',
    chain: 'Zero',
    nativeSym: 'ZRO',
    caps: { account: true, trade: false, transfer: false, onchain: false },
    listTokens, getToken, getAccount,
  });
})();
