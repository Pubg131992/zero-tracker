/* ============================================================================
   Zero Tracker — pluggable SOURCE REGISTRY (the future-proof core)
   ----------------------------------------------------------------------------
   The app ONLY understands the normalized model below. Every data source
   (Rookery now; other pre-mainnet launchpads / desks later; on-chain RPC at
   mainnet) ships as its own adapter file that maps its API -> this model and
   calls Sources.register(adapter). Add a new source = drop in a new adapter.
   Nothing in the UI/app needs a rebuild.

   Normalized shapes
   -----------------
   Token    { src, id, sym, name, img, priceUsd, mcapUsd, ch5m, ch1h, ch24,
              progress, trades, holders, created, creator, graduated, raw }
   Holding  { src, id, sym, name, img, amount, priceUsd, valueUsd, pct, raw }
   Account  { src, id, label, native, nativeSym, nativeUsd, valueUsd,
              holdings:[Holding], transfers:[Transfer], raw }
   Trade    { src, tokenId, sym, side('buy'|'sell'), who, native, usd, ts, raw }
   Transfer { src, dir('in'|'out'), native, usd, ts, raw }

   Adapter
   -------
   { id, label, chain, nativeSym, caps:{account,trade,transfer,onchain},
     listTokens() -> [Token],
     getToken(id) -> { token:Token, trades:[Trade], holders:[{who,amount,pct}] },
     getAccount(id) -> Account,              // id = username / address
     // optional, guarded by caps: buy(), sell(), transfer() ...
   }
   ============================================================================ */
(() => {
  const reg = new Map();           // id -> adapter
  const order = [];                // registration order

  const Sources = {
    register(adapter) {
      if (!adapter || !adapter.id) throw new Error('adapter needs an id');
      if (!reg.has(adapter.id)) order.push(adapter.id);
      adapter.caps = Object.assign({ account: false, trade: false, transfer: false, onchain: false }, adapter.caps || {});
      reg.set(adapter.id, adapter);
      window.dispatchEvent(new CustomEvent('sources:changed', { detail: { id: adapter.id } }));
      return adapter;
    },
    get(id) { return reg.get(id); },
    list() { return order.map(id => reg.get(id)).filter(Boolean); },
    has(id) { return reg.has(id); },
    default() { return reg.get(order[0]); },

    // ---- cross-source helpers (merge as more sources come online) ----
    async listTokens() {
      const out = [];
      for (const a of this.list()) {
        try { const t = await a.listTokens(); if (Array.isArray(t)) out.push(...t); } catch (e) { console.warn('[src]', a.id, 'listTokens', e); }
      }
      return out;
    },
    srcOf(id) { return reg.get(id); },
  };

  // small shared utils for adapters
  Sources.util = {
    num(x) { const n = +x; return Number.isFinite(n) ? n : 0; },
    // wei string -> float given decimals
    fromWei(x, dec = 18) { try { const s = String(x); if (!s || s === '0') return 0; return Number(BigInt(s)) / 10 ** dec; } catch { return +x / 10 ** dec || 0; } },
    async json(url, opt) { const r = await fetch(url, Object.assign({ headers: { accept: 'application/json' } }, opt || {})); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); },
    shortUsd(v) { v = +v || 0; const a = Math.abs(v); if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'; return '$' + v.toFixed(a < 1 ? 4 : 2); },
  };

  window.Sources = Sources;
})();
