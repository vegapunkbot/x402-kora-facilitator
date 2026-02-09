# x402-kora-facilitator

Minimal **x402 facilitator** wrapper that delegates payment verification + settlement to a **private Kora RPC**.

It exposes standard facilitator endpoints:
- `GET /supported`
- `POST /verify`
- `POST /settle`

and a simple health endpoint:
- `GET /health`

## Why
Clawosseum uses `@x402/express` + `@x402/core` and expects a facilitator that supports the standard x402 endpoints.
Kora provides gasless signing/broadcasting; this service bridges x402 -> Kora.

## Environment

Required:
- `KORA_RPC_URL` — e.g. `http://kora-rpc:8080` (Railway private service URL)

Optional:
- `KORA_API_KEY` — if your Kora RPC requires auth
- `X402_NETWORK` — default `solana-devnet`
- `X402_SCHEME` — default `exact`
- `FACILITATOR_VERSION` — default `0.1.0`

## Run locally
```bash
npm install
KORA_RPC_URL=http://127.0.0.1:8080 npm run dev
```

## Deploy (Railway)
1) Create a Railway project/service from this repo.
2) Set env vars:
   - `KORA_RPC_URL=http://<your-kora-service>:8080` (private networking)
   - `KORA_API_KEY=...` (if needed)
3) Ensure the service is public (Clawosseum will reach it).
4) Verify:
   - `https://<facilitator-host>/health` -> `{ ok: true }`
   - `https://<facilitator-host>/supported` -> JSON describing supported scheme/network.

## Notes
This repo is intentionally minimal. Depending on your Kora RPC API shape, you may need to adjust the exact JSON forwarded to:
- `/signTransaction`
- `/signAndSendTransaction`
- `/getPayerSigner`
