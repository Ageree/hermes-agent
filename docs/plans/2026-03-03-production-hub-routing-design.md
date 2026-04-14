# Production Hub Routing Design

**Date**: 2026-03-03
**Status**: Approved
**Scope**: Hub Routing (0.1% commission) on Monero Stagenet, deployed to Railway
**Target Users**: AI agents via REST API

## Decision Record

- **MVP Scope**: Hub Routing only (0.1% commission). No escrow, bridge, or swaps.
- **Deployment**: Railway (API + PostgreSQL + Redis)
- **Network**: Monero Stagenet first, mainnet later
- **Users**: AI agents integrating via REST API

## Section 1: Core Payment Flow

Critical path that must work flawlessly:

```
Agent A registers -> Gets API key
     |
Agent A calls POST /v2/payments/hub-routing
     |
Hub verifies balance, calculates fee (0.1%)
     |
Hub sends (amount - fee) to recipient via Monero RPC
     |
Fee recorded in fee_collections table
     |
Transaction recorded, webhook sent to recipient
```

### What to verify/fix:
- Hub routing actually performs on-chain transfer (not just DB record)
- Fee is correctly deducted
- Correct Monero stagenet wallet RPC interaction
- Error handling: insufficient funds, node unavailable, timeouts

### What to disable:
- Escrow endpoints
- Bridge endpoints
- Swap endpoints
- TSS service
- All non-essential routes removed to eliminate failure points

## Section 2: Infrastructure (Railway + Monero Stagenet)

### Railway Services:
- **API service** — FastAPI app (Docker)
- **PostgreSQL** — Railway managed database
- **Redis** — Railway managed Redis

### Monero Stagenet:
- Connect to public stagenet node (no need to run own)
- `monero-wallet-rpc` runs in same Docker container as API or as separate Railway service
- Hub wallet created on first startup

### Configuration (env vars):
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
MONERO_WALLET_RPC_URL=http://...
MONERO_DAEMON_URL=http://stagenet-node:38081
API_SECRET_KEY=...
ENVIRONMENT=stagenet
```

### Required:
- Dockerfile
- railway.toml (partially exists)
- DB migrations on startup

## Section 3: Testing

### Unit tests:
- `test_fee_collector.py` — hub routing fee calculation (0.1%), min/max limits, tier discounts
- `test_agent_registry.py` — agent registration, search, API keys
- `test_wallet.py` — mock Monero RPC calls, error handling

### Integration tests:
- `test_api_payments.py` — full cycle via API: register -> pay -> verify fee in DB
- `test_api_auth.py` — authentication, rate limiting, invalid keys

### E2E test (stagenet):
- Script to verify real payment on stagenet: create 2 wallets, send XMR, verify fee collected

Total: ~5-6 test files covering the critical path.

## Section 4: Hardening

- **Input validation**: address format, amounts (>0, not NaN, no overflow), agent names
- **Rate limiting**: verify existing Redis-based implementation works
- **Logging**: structured JSON logs for every payment with tx_hash, amount, fee
- **Error handling**: graceful degradation if Monero node unavailable, retry logic
- **Secrets management**: all secrets via env vars, no hardcoded keys

## Section 5: Monitoring & Admin

- `/v2/admin/revenue` — revenue stats endpoint (exists, needs auth hardening)
- `/v2/health` — health check (exists, add Monero RPC connection check)
- **Revenue logging** — log total collected fees hourly
- Railway built-in metrics for CPU/memory
- No Grafana/Prometheus stack yet — add later
