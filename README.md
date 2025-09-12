# PAMLA Embed Widgets (v4)

**Routes**
- `/embed` — Trading widget (connect wallet, buy/sell, live chart). Supports defaults via env and admin copy-iframe.
- `/embed-leaderboard` — Leaderboard (Top 25/50/100, pagination, admin embed copier).
- `/admin-allowlist` — Admin tool to upload addresses and call `setAllowlistBatch` on your AccessController.

**Server env (required for allowlist API)**
```
ADMIN_PRIVATE_KEY=0x<burner_or_admin_key_with_ACL_OWNER_PERMS>
RPC_URL=https://api.testnet.abs.xyz
CHAIN_ID=11124
# Frontend defaults (optional)
NEXT_PUBLIC_DEFAULT_CURVE=0x73e97d6cC2339368522De87Faa858818eDA72BC3
NEXT_PUBLIC_DEFAULT_CHAIN=11124
NEXT_PUBLIC_ABSTRACT_RPC=https://api.testnet.abs.xyz
# CSP frame-ancestors override (optional)
NEXT_PUBLIC_FRAME_ANCESTORS="https://soniqute.com"
```

**Security**
- Keep `ADMIN_PRIVATE_KEY` in server-side env **only** (Render/Vercel secret). Never commit it.
- Use a **burner admin key** with only ACL permissions for testnet.
- Consider adding password or IP allow-list to `/admin-allowlist` if exposing publicly.

**Build/Run**
```
npm i
npm run build
npm start
```
