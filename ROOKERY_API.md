# Rookery API (data source for Zero tracker) — reverse-engineered 2026-11-14

Base: https://rookery.stinkypenguin.xyz  (proxy as /rk in vercel.json)
Pre-mainnet bonding-curve launchpad ("Stinky Penguin"). Priced in ZRO.
Zero (LayerZero L1) mainnet ~Nov 30 2026; balances migrate 1:1 at mainnet.
Identity = USERNAME (e.g. pengu_55cb47), NOT wallet address. Session/cookie auth (user is logged in).

## Endpoints
GET /api/markets
  -> { markets: [ market ] }   (35 tokens currently)

GET /api/market/:id
  -> { market, zroUsd, trades:[...], holders:[...], comments:[...], me:{zro,tokens,pendingRewards}, burned }
  (trailing /trades /holders are catch-all -> same object)

GET /api/me   (session-based)
  -> { username, email, wallet, bio, avatar, zro, zroUsd, depositAddress, holdings, transfers }

GET /api/img/m/:id   -> token image

## market object fields
id, name, symbol, description, image(/api/img/m/:id), network("zero"), quote("ZRO"),
x, tg, web, creator, created(ms), supply, sold, burned, curveTokens, reserveZro,
volume, trades(count), priceZro, priceUsd, mcapUsd, liquidityUsd, poolZro, poolTok,
gradAt, volumeUsd, progress(bonded %), graduated, migrated, maxBuyBps, maxBuyUntil,
taxes, rewardsPaidUsd, mktPaid, mktPaidUsd, rewardsPaid, holders(count),
lastTrade, change5m, change1h, change24h

## trade object (market.trades[])
{ side:"buy"|"sell", zro:"wei", tokens:"wei", price:"...", usd:Number, ts:ms, username }

## holder object (market.holders[])
{ username, amount:"wei", creator:bool, pct:Number }

## me object (from /api/market/:id)  -> { zro, tokens, pendingRewards }

## TODO (discover when building buy/auto-buy)
- trade POST (buy/sell on bonding curve) endpoint + payload + auth
- transfer/deposit/withdraw ZRO flow (me.depositAddress, me.transfers)
- create-token endpoint

## Feature mapping (Elysium -> Zero/Rookery)
holdings (AgoraDex) -> /api/me.holdings + per-token priceUsd from /api/markets
multi-wallet tabs   -> multi Rookery account (zro balance, depositAddress) + "You"
ledger/snapshots    -> me.transfers (ZRO in/out) + portfolio value history (Supabase)
calls (3+ smart)    -> 3+ smart USERNAMES buy a token (scan market trades)
smart wallets (PnL) -> smart USERNAMES ranked by realized/unrealized PnL from trades
buy / auto-buy      -> Rookery trade POST (buy with ZRO), session-based, confirm before execute
backend             -> empty elysium-tracker Supabase project, zero_ tables + cron

## Reuse
- UI shell: Elysium index.html (DM Sans, glass/light-premium theme, sidebar/KPIs/tabs/modals) -> reuse verbatim, rebrand to ZRO/Zero/Rookery
- app.js / scan / buy stack: EVM-address+RPC based -> rebuild for account model (not a drop-in swap)
- data layer: agora.js pattern (self-healing wrapper, /ag proxy, window.__agoraHolds cache) -> rookery.js hitting /rk/api/*

## Vercel project (reuse)
elysium-wallet-tracker  id prj_FlAYkhFFMHAo2CLoYvsdWCkja4Bb  (currently blank)
rootDirectory=src; deploy via Vercel MCP create_deployment, files WITHOUT src/ prefix, NO projectSettings.rootDirectory
old full-app deployment (source to pull files from): dpl_8rTLwDzk4fAJX6moo98sNfyY3t7y
  per-deployment URL: elysium-wallet-tracker-cf77r40f6-ahsans-projects-b7fcf934.vercel.app (fetch files via Vercel web_fetch_vercel_url, untruncated)

## Supabase (reuse)
elysium-tracker  id skwmnnpiuiultvvahgwl  ap-south-1  (empty; had elys_/cn_ schema only)
