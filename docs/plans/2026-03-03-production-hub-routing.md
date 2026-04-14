# Production Hub Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make StealthPay Hub Routing production-ready on Monero Stagenet with 0.1% commission, deployed to Railway.

**Architecture:** Custodial hub model — agents deposit XMR to per-agent subaddresses, hub routing moves balances in DB (instant), periodic on-chain settlement. API is FastAPI with PostgreSQL + Redis. Disable all non-essential features (escrow, bridge, swaps).

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, PostgreSQL 15, Redis 7, Monero wallet RPC (stagenet), Docker, Railway

---

## Task 1: Fix Known Bugs

**Files:**
- Modify: `stealthpay/stealthpay/client.py:1` (add `import random`)
- Modify: `stealthpay/stealthpay/wallet.py` (add `from_env` classmethod)
- Modify: `stealthpay/stealthpay/services/monitoring.py:306-328` (fix wallet health check)

**Step 1: Add missing `random` import to client.py**

In `stealthpay/stealthpay/client.py`, line 253 calls `random.uniform()` but `random` is never imported. Add `import random` to the imports at the top of the file, alongside the existing `import time`.

**Step 2: Add `from_env()` classmethod to MoneroWalletRPC**

In `stealthpay/stealthpay/wallet.py`, the `MoneroWalletRPC` class is missing a `from_env()` classmethod that `monitoring.py:311` and `client.py` depend on. Add:

```python
@classmethod
def from_env(cls):
    """Create wallet RPC from environment variables"""
    import os
    host = os.environ.get("MONERO_RPC_HOST", "127.0.0.1")
    port = int(os.environ.get("MONERO_RPC_PORT", "18082"))
    user = os.environ.get("MONERO_RPC_USER", "")
    password = os.environ.get("MONERO_RPC_PASS", "")
    return cls(host=host, port=port, user=user, password=password)
```

**Step 3: Verify the monitoring.py wallet health check now works**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -c "from stealthpay.services.monitoring import create_wallet_health_check; print('OK')"`
Expected: `OK` (no AttributeError)

**Step 4: Commit**

```bash
git add stealthpay/stealthpay/client.py stealthpay/stealthpay/wallet.py
git commit -m "fix: add missing random import and wallet from_env classmethod"
```

---

## Task 2: Add Agent Balance Tracking (DB Model + Migration)

The hub routing currently doesn't track agent balances. We need a balance model so hub routing can check if the sender has enough funds.

**Files:**
- Modify: `stealthpay/stealthpay/db/models.py` (add `AgentBalance` model)
- Modify: `stealthpay/stealthpay/db/schema.sql` (add `agent_balances` table)
- Modify: `stealthpay/stealthpay/db/repository.py` (add `BalanceRepository`)

**Step 1: Add `agent_balances` table to schema.sql**

Append to `stealthpay/stealthpay/db/schema.sql`:

```sql
-- Agent balances for hub routing (custodial)
CREATE TABLE IF NOT EXISTS agent_balances (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES agents(id),
    token VARCHAR(10) NOT NULL DEFAULT 'XMR',
    available NUMERIC(20,12) NOT NULL DEFAULT 0,
    pending NUMERIC(20,12) NOT NULL DEFAULT 0,
    total_deposited NUMERIC(20,12) NOT NULL DEFAULT 0,
    total_withdrawn NUMERIC(20,12) NOT NULL DEFAULT 0,
    deposit_address VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, token)
);

CREATE INDEX IF NOT EXISTS idx_agent_balances_agent ON agent_balances(agent_id);
```

**Step 2: Add `AgentBalance` SQLAlchemy model to models.py**

Add to `stealthpay/stealthpay/db/models.py` after the `FeeCollection` class:

```python
class AgentBalance(Base):
    __tablename__ = "agent_balances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    token = Column(String(10), nullable=False, default="XMR")
    available = Column(Numeric(20, 12), nullable=False, default=0)
    pending = Column(Numeric(20, 12), nullable=False, default=0)
    total_deposited = Column(Numeric(20, 12), nullable=False, default=0)
    total_withdrawn = Column(Numeric(20, 12), nullable=False, default=0)
    deposit_address = Column(String(200))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("agent_id", "token", name="uq_agent_balance"),
    )
```

**Step 3: Add `BalanceRepository` to repository.py**

Add to `stealthpay/stealthpay/db/repository.py`:

```python
class BalanceRepository:
    def __init__(self, db):
        self.db = db

    def get_or_create(self, agent_id, token="XMR"):
        """Get balance record, create if not exists"""
        balance = self.db.query(AgentBalance).filter(
            AgentBalance.agent_id == agent_id,
            AgentBalance.token == token
        ).first()
        if not balance:
            balance = AgentBalance(agent_id=agent_id, token=token)
            self.db.add(balance)
            self.db.flush()
        return balance

    def get_available(self, agent_id, token="XMR"):
        """Get available balance"""
        balance = self.get_or_create(agent_id, token)
        return balance.available or Decimal("0")

    def deposit(self, agent_id, amount, token="XMR"):
        """Credit agent balance after deposit confirmed"""
        balance = self.get_or_create(agent_id, token)
        balance.available = (balance.available or Decimal("0")) + amount
        balance.total_deposited = (balance.total_deposited or Decimal("0")) + amount
        balance.updated_at = datetime.utcnow()
        return balance

    def deduct(self, agent_id, amount, token="XMR"):
        """Deduct from available balance (for hub routing)"""
        balance = self.get_or_create(agent_id, token)
        if (balance.available or Decimal("0")) < amount:
            raise ValueError(f"Insufficient balance: {balance.available} < {amount}")
        balance.available = balance.available - amount
        balance.updated_at = datetime.utcnow()
        return balance

    def credit(self, agent_id, amount, token="XMR"):
        """Credit to available balance (receiving hub payment)"""
        balance = self.get_or_create(agent_id, token)
        balance.available = (balance.available or Decimal("0")) + amount
        balance.updated_at = datetime.utcnow()
        return balance

    def set_deposit_address(self, agent_id, address, token="XMR"):
        """Set the deposit subaddress for an agent"""
        balance = self.get_or_create(agent_id, token)
        balance.deposit_address = address
        return balance
```

Also add the import: `from .models import AgentBalance` at the top of repository.py.

**Step 4: Verify models load correctly**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -c "from stealthpay.db.models import AgentBalance; print('AgentBalance model OK')"`
Expected: `AgentBalance model OK`

**Step 5: Commit**

```bash
git add stealthpay/stealthpay/db/models.py stealthpay/stealthpay/db/schema.sql stealthpay/stealthpay/db/repository.py
git commit -m "feat: add agent balance tracking for hub routing"
```

---

## Task 3: Implement Hub Routing with Balance Checks

The hub routing endpoint currently auto-confirms without checking balances or moving funds. Add real balance deduction from sender and credit to recipient.

**Files:**
- Modify: `stealthpay/api/main_v2.py:436-503` (hub routing endpoint)
- Modify: `stealthpay/api/main_v2.py` (add deposit/withdraw/balance endpoints)

**Step 1: Update hub routing endpoint with balance checks**

Replace the hub routing endpoint in `stealthpay/api/main_v2.py` (lines 436-503). The new version should:

```python
@app.post("/v2/payments/hub-routing")
async def send_hub_routed_payment(
    req: HubPaymentRequest,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(get_current_agent)
):
    """
    Send payment via hub routing

    Fee: 0.1% (or higher for urgent)
    Benefit: Instant confirmation, reputation verification
    """
    registry = get_registry()
    collector = get_fee_collector()

    # Find recipient
    recipient = registry.get_profile(req.to_agent_name)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient agent not found")

    if not recipient.xmr_address:
        raise HTTPException(status_code=400, detail="Recipient has no XMR address configured")

    # Calculate fee first
    fee_info = collector.calculate_hub_routing_fee(
        amount=req.amount,
        from_agent_tier=agent.tier.value,
        urgency=req.urgency
    )
    total_deduction = fee_info["total_deduction"]

    # Check and deduct sender balance
    with get_db() as db:
        balance_repo = BalanceRepository(db)
        available = balance_repo.get_available(agent.id)
        if available < total_deduction:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance: {available} XMR available, {total_deduction} XMR needed (amount + fee)"
            )

        # Deduct from sender
        balance_repo.deduct(agent.id, total_deduction)

        # Credit recipient (they get the amount, fee stays with hub)
        balance_repo.credit(recipient.id, req.amount)

    # Create hub route record with fee
    route = collector.create_hub_route(
        from_agent_id=str(agent.id),
        to_agent_id=recipient.id,
        amount=req.amount,
        from_agent_tier=agent.tier.value,
        urgency=req.urgency
    )

    # Confirm immediately (hub takes the risk)
    collector.confirm_hub_route(route["payment_id"])

    # Queue webhook
    background_tasks.add_task(
        queue_webhook,
        str(agent.id),
        "payment.sent",
        {
            "payment_id": route["payment_id"],
            "amount": float(req.amount),
            "to_agent": req.to_agent_name,
            "fee": float(fee_info["fee_amount"])
        }
    )

    return {
        "payment_id": route["payment_id"],
        "status": "confirmed",
        "payment_type": "hub_routing",
        "recipient": {
            "agent_name": recipient.agent_name,
            "address": recipient.xmr_address,
            "trust_score": recipient.trust_score
        },
        "amount": float(req.amount),
        "fee": float(fee_info["fee_amount"]),
        "fee_percent": float(fee_info["fee_percent"]),
        "total_deducted": float(total_deduction),
        "confirmed_at": datetime.utcnow().isoformat()
    }
```

Add the import at the top of `main_v2.py`: `from stealthpay.db.repository import BalanceRepository`

**Step 2: Add balance/deposit/withdraw endpoints**

Add these new endpoints to `stealthpay/api/main_v2.py` after the hub routing endpoint:

```python
@app.get("/v2/balance")
async def get_balance(agent: Agent = Depends(get_current_agent)):
    """Get agent's hub balance"""
    with get_db() as db:
        repo = BalanceRepository(db)
        balance = repo.get_or_create(agent.id)
        return {
            "available": float(balance.available or 0),
            "pending": float(balance.pending or 0),
            "total_deposited": float(balance.total_deposited or 0),
            "total_withdrawn": float(balance.total_withdrawn or 0),
            "deposit_address": balance.deposit_address,
            "token": "XMR"
        }


class DepositRequest(BaseModel):
    amount: float = Field(gt=0, description="Amount to deposit (for testing/stagenet)")


@app.post("/v2/balance/deposit")
async def deposit_balance(
    req: DepositRequest,
    agent: Agent = Depends(get_current_agent)
):
    """
    Deposit XMR to hub balance.
    On stagenet: direct credit for testing.
    On mainnet: would verify on-chain deposit to agent's subaddress.
    """
    from decimal import Decimal
    amount = Decimal(str(req.amount))

    with get_db() as db:
        repo = BalanceRepository(db)
        balance = repo.deposit(agent.id, amount)
        return {
            "status": "deposited",
            "amount": float(amount),
            "new_balance": float(balance.available),
            "token": "XMR"
        }


class WithdrawRequest(BaseModel):
    amount: float = Field(gt=0, description="Amount to withdraw")
    address: str = Field(min_length=10, description="XMR address to withdraw to")


@app.post("/v2/balance/withdraw")
async def withdraw_balance(
    req: WithdrawRequest,
    agent: Agent = Depends(get_current_agent)
):
    """Withdraw XMR from hub balance to external address"""
    from decimal import Decimal
    amount = Decimal(str(req.amount))

    with get_db() as db:
        repo = BalanceRepository(db)
        available = repo.get_available(agent.id)
        if available < amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance: {available} XMR available"
            )
        repo.deduct(agent.id, amount)
        balance = repo.get_or_create(agent.id)
        balance.total_withdrawn = (balance.total_withdrawn or Decimal("0")) + amount

    # TODO: On mainnet, trigger actual on-chain withdrawal via Monero RPC

    return {
        "status": "withdrawn",
        "amount": float(amount),
        "to_address": req.address,
        "remaining_balance": float(balance.available),
        "token": "XMR"
    }
```

**Step 3: Verify the API module loads**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -c "from api.main_v2 import app; print(f'Routes: {len(app.routes)}')"`
Expected: Shows route count without errors.

**Step 4: Commit**

```bash
git add stealthpay/api/main_v2.py
git commit -m "feat: hub routing with balance checks, deposit/withdraw endpoints"
```

---

## Task 4: Disable Non-Essential Endpoints

Remove escrow, bridge, swap, and P2P payment endpoints to reduce attack surface. Keep only: registration, hub routing, balance, discovery, admin.

**Files:**
- Modify: `stealthpay/api/main_v2.py` (remove/comment escrow and P2P endpoints)

**Step 1: Remove the escrow endpoint**

In `stealthpay/api/main_v2.py`, find the `@app.post("/v2/escrow/create")` endpoint and its entire function body. Replace the entire function with:

```python
@app.post("/v2/escrow/create")
async def create_escrow_deal():
    """Escrow is not available in this version"""
    raise HTTPException(status_code=501, detail="Escrow not available. Use hub routing for payments.")
```

**Step 2: Remove the P2P send endpoint's wallet dependency**

In `stealthpay/api/main_v2.py`, find the `@app.post("/v2/payments/send")` endpoint. Replace with:

```python
@app.post("/v2/payments/send")
async def send_direct_payment():
    """Direct P2P is not available in hub-only mode. Use /v2/payments/hub-routing instead."""
    raise HTTPException(status_code=501, detail="Direct P2P not available. Use /v2/payments/hub-routing for payments.")
```

**Step 3: Remove the `StealthPay` import if no longer needed**

In `stealthpay/api/main_v2.py`, the imports on lines 28-30 (`from stealthpay import StealthPay` and `from stealthpay.types import PaymentStatus`) are only used by the P2P endpoint. Remove or comment them out to eliminate the Monero wallet RPC dependency at startup. This means the API can start without a running Monero node.

**Step 4: Verify the API still loads**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -c "from api.main_v2 import app; print('OK')"`
Expected: `OK`

**Step 5: Commit**

```bash
git add stealthpay/api/main_v2.py
git commit -m "feat: disable escrow and P2P endpoints, hub-routing only mode"
```

---

## Task 5: Unit Tests — Fee Collector

**Files:**
- Create: `stealthpay/tests/test_fee_collector.py`

**Step 1: Write fee collector tests**

```python
"""Tests for fee collector service"""
import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock
from stealthpay.services.fee_collector import FeeCollector, FeeType, DEFAULT_FEES


class TestFeeCalculation:
    def setup_method(self):
        self.collector = FeeCollector.__new__(FeeCollector)
        self.collector.db = None
        self.collector.fee_wallet_address = None

    def test_hub_routing_base_fee(self):
        """0.1% fee on normal payment"""
        result = self.collector.calculate_hub_routing_fee(Decimal("10.0"))
        assert result["fee_amount"] == Decimal("0.01")  # 0.1% of 10
        assert result["fee_percent"] == Decimal("0.001")
        assert result["recipient_receives"] == Decimal("10.0")
        assert result["total_deduction"] == Decimal("10.01")

    def test_hub_routing_min_fee(self):
        """Very small amount should hit min fee"""
        result = self.collector.calculate_hub_routing_fee(Decimal("0.001"))
        assert result["fee_amount"] == Decimal("0.0001")  # min fee

    def test_hub_routing_max_fee(self):
        """Very large amount should hit max fee"""
        result = self.collector.calculate_hub_routing_fee(Decimal("5000.0"))
        assert result["fee_amount"] == Decimal("1.0")  # max fee

    def test_premium_tier_discount(self):
        """Premium agents get 50% fee discount"""
        normal = self.collector.calculate_hub_routing_fee(Decimal("100.0"), from_agent_tier="free")
        premium = self.collector.calculate_hub_routing_fee(Decimal("100.0"), from_agent_tier="premium")
        assert premium["fee_amount"] == normal["fee_amount"] * Decimal("0.5")

    def test_verified_tier_discount(self):
        """Verified agents get 25% fee discount"""
        normal = self.collector.calculate_hub_routing_fee(Decimal("100.0"), from_agent_tier="free")
        verified = self.collector.calculate_hub_routing_fee(Decimal("100.0"), from_agent_tier="verified")
        assert verified["fee_amount"] == normal["fee_amount"] * Decimal("0.75")

    def test_urgent_doubles_fee(self):
        """Urgent payments have 2x fee"""
        normal = self.collector.calculate_hub_routing_fee(Decimal("100.0"))
        urgent = self.collector.calculate_hub_routing_fee(Decimal("100.0"), urgency="urgent")
        assert urgent["fee_amount"] == normal["fee_amount"] * Decimal("2.0")

    def test_zero_amount_hits_min_fee(self):
        """Zero-ish amount should still return min fee"""
        result = self.collector.calculate_hub_routing_fee(Decimal("0.0"))
        assert result["fee_amount"] == Decimal("0.0001")

    def test_fee_config_values(self):
        """Default fee configs are correct"""
        hub = DEFAULT_FEES[FeeType.HUB_ROUTING]
        assert hub.percent == Decimal("0.001")
        assert hub.min_fee == Decimal("0.0001")
        assert hub.max_fee == Decimal("1.0")
```

**Step 2: Run tests to verify they pass**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -m pytest tests/test_fee_collector.py -v`
Expected: All 8 tests PASS

**Step 3: Commit**

```bash
git add stealthpay/tests/test_fee_collector.py
git commit -m "test: add unit tests for fee collector"
```

---

## Task 6: Unit Tests — Balance Repository

**Files:**
- Create: `stealthpay/tests/test_balance.py`

**Step 1: Write balance tests with SQLite in-memory DB**

```python
"""Tests for balance repository"""
import pytest
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from stealthpay.db.models import Base, Agent, AgentReputation, AgentBalance, AgentTier, RateLimitTier, PrivacyLevel
from stealthpay.db.repository import BalanceRepository


@pytest.fixture
def db_session():
    """Create in-memory SQLite database for testing"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def agent(db_session):
    """Create a test agent"""
    agent = Agent(
        agent_name="test-agent",
        api_key_hash="testhash",
        tier=AgentTier.FREE,
        rate_limit_tier=RateLimitTier.STANDARD,
        privacy_level=PrivacyLevel.MEDIUM,
        is_active=True,
        xmr_address="test_address_123"
    )
    db_session.add(agent)
    rep = AgentReputation(agent_id=agent.id, trust_score=50)
    db_session.add(rep)
    db_session.flush()
    return agent


class TestBalanceRepository:
    def test_get_or_create_new(self, db_session, agent):
        repo = BalanceRepository(db_session)
        balance = repo.get_or_create(agent.id)
        assert balance.agent_id == agent.id
        assert balance.available == Decimal("0") or balance.available == 0
        assert balance.token == "XMR"

    def test_deposit(self, db_session, agent):
        repo = BalanceRepository(db_session)
        balance = repo.deposit(agent.id, Decimal("5.0"))
        assert balance.available == Decimal("5.0")
        assert balance.total_deposited == Decimal("5.0")

    def test_multiple_deposits(self, db_session, agent):
        repo = BalanceRepository(db_session)
        repo.deposit(agent.id, Decimal("3.0"))
        balance = repo.deposit(agent.id, Decimal("2.0"))
        assert balance.available == Decimal("5.0")
        assert balance.total_deposited == Decimal("5.0")

    def test_deduct(self, db_session, agent):
        repo = BalanceRepository(db_session)
        repo.deposit(agent.id, Decimal("10.0"))
        balance = repo.deduct(agent.id, Decimal("3.0"))
        assert balance.available == Decimal("7.0")

    def test_deduct_insufficient(self, db_session, agent):
        repo = BalanceRepository(db_session)
        repo.deposit(agent.id, Decimal("1.0"))
        with pytest.raises(ValueError, match="Insufficient balance"):
            repo.deduct(agent.id, Decimal("5.0"))

    def test_credit(self, db_session, agent):
        repo = BalanceRepository(db_session)
        balance = repo.credit(agent.id, Decimal("7.5"))
        assert balance.available == Decimal("7.5")

    def test_get_available(self, db_session, agent):
        repo = BalanceRepository(db_session)
        assert repo.get_available(agent.id) == Decimal("0")
        repo.deposit(agent.id, Decimal("4.2"))
        assert repo.get_available(agent.id) == Decimal("4.2")

    def test_full_hub_routing_flow(self, db_session, agent):
        """Simulate: deposit -> hub route (deduct + credit) -> check balances"""
        # Create recipient
        recipient = Agent(
            agent_name="recipient",
            api_key_hash="recipienthash",
            tier=AgentTier.FREE,
            rate_limit_tier=RateLimitTier.STANDARD,
            privacy_level=PrivacyLevel.MEDIUM,
            is_active=True,
            xmr_address="recipient_address"
        )
        db_session.add(recipient)
        rep = AgentReputation(agent_id=recipient.id, trust_score=50)
        db_session.add(rep)
        db_session.flush()

        repo = BalanceRepository(db_session)

        # Sender deposits 10 XMR
        repo.deposit(agent.id, Decimal("10.0"))

        # Hub routing: 5 XMR + 0.1% fee = 5.005 XMR deducted
        amount = Decimal("5.0")
        fee = Decimal("0.005")  # 0.1%
        total = amount + fee

        repo.deduct(agent.id, total)
        repo.credit(recipient.id, amount)

        # Verify
        assert repo.get_available(agent.id) == Decimal("4.995")
        assert repo.get_available(recipient.id) == Decimal("5.0")
```

**Step 2: Run tests**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -m pytest tests/test_balance.py -v`
Expected: All 8 tests PASS

**Step 3: Commit**

```bash
git add stealthpay/tests/test_balance.py
git commit -m "test: add unit tests for balance repository"
```

---

## Task 7: Integration Tests — API Endpoints

**Files:**
- Create: `stealthpay/tests/test_api.py`

**Step 1: Write API integration tests using FastAPI TestClient**

```python
"""Integration tests for the API"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from stealthpay.db.models import Base


@pytest.fixture(autouse=True)
def mock_services():
    """Mock external services (Redis, Monero RPC, monitoring)"""
    with patch("stealthpay.services.rate_limiter.RateLimiter") as mock_rl, \
         patch("stealthpay.services.monitoring.setup_default_monitoring") as mock_mon, \
         patch("stealthpay.services.webhook_service.WebhookService") as mock_wh:

        # Rate limiter: always allow
        mock_rl_instance = MagicMock()
        mock_rl_instance.check_rate_limit.return_value = None
        mock_rl.return_value = mock_rl_instance

        # Monitor: no-op
        mock_monitor = MagicMock()
        mock_monitor.get_health_report.return_value = {"status": "healthy", "checks": {}}
        mock_mon.return_value = mock_monitor

        # Webhook: no-op
        mock_wh_instance = MagicMock()
        mock_wh.return_value = mock_wh_instance

        yield


@pytest.fixture
def test_db():
    """In-memory SQLite for testing"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    with patch("stealthpay.db.database.get_db") as mock_get_db, \
         patch("stealthpay.db.database.create_tables"):

        def get_test_db():
            from contextlib import contextmanager
            @contextmanager
            def ctx():
                session = Session()
                try:
                    yield session
                    session.commit()
                except Exception:
                    session.rollback()
                    raise
                finally:
                    session.close()
            return ctx()

        mock_get_db.side_effect = get_test_db
        yield engine


@pytest.fixture
def client(test_db):
    """FastAPI test client"""
    from api.main_v2 import app
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_root_returns_info(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert "StealthPay" in response.json().get("name", "")


class TestAgentRegistration:
    def test_register_agent(self, client):
        response = client.post("/v2/agents/register", json={
            "agent_name": "test-agent-1",
            "xmr_address": "test_xmr_address_stagenet_1234567890"
        })
        assert response.status_code == 200
        data = response.json()
        assert "api_key" in data
        assert data["api_key"].startswith("sk_")

    def test_register_duplicate_fails(self, client):
        client.post("/v2/agents/register", json={
            "agent_name": "unique-agent",
            "xmr_address": "addr1"
        })
        response = client.post("/v2/agents/register", json={
            "agent_name": "unique-agent",
            "xmr_address": "addr2"
        })
        assert response.status_code == 400


class TestDisabledEndpoints:
    def test_escrow_returns_501(self, client):
        response = client.post("/v2/escrow/create", json={},
                              headers={"Authorization": "Bearer fake"})
        assert response.status_code in [401, 501]

    def test_p2p_send_returns_501(self, client):
        response = client.post("/v2/payments/send", json={},
                              headers={"Authorization": "Bearer fake"})
        assert response.status_code in [401, 501]
```

Note: These tests need more work to properly mock the authentication dependency. The above is a starting structure. Adjust based on how `get_current_agent()` dependency works in practice with the test DB.

**Step 2: Run tests**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -m pytest tests/test_api.py -v`
Expected: Tests pass (adjust mocks as needed)

**Step 3: Commit**

```bash
git add stealthpay/tests/test_api.py
git commit -m "test: add API integration tests"
```

---

## Task 8: Input Validation Hardening

**Files:**
- Modify: `stealthpay/api/main_v2.py` (Pydantic models)

**Step 1: Harden Pydantic request models**

Find the `HubPaymentRequest` model in `main_v2.py` and add stricter validation:

```python
class HubPaymentRequest(BaseModel):
    to_agent_name: str = Field(
        min_length=1,
        max_length=100,
        pattern=r'^[a-zA-Z0-9_-]+$',
        description="Recipient agent name"
    )
    amount: float = Field(
        gt=0,
        le=10000,  # Max 10000 XMR per transaction
        description="Amount in XMR"
    )
    urgency: str = Field(
        default="normal",
        pattern=r'^(normal|urgent)$',
        description="Payment urgency"
    )
    memo: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional payment memo"
    )
```

Also harden `AgentRegistration`:

```python
class AgentRegistration(BaseModel):
    agent_name: str = Field(
        min_length=3,
        max_length=50,
        pattern=r'^[a-zA-Z0-9_-]+$',
        description="Unique agent name (alphanumeric, dash, underscore)"
    )
    xmr_address: Optional[str] = Field(
        default=None,
        min_length=10,
        max_length=200,
        description="Monero address"
    )
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    privacy_level: str = Field(default="medium", pattern=r'^(low|medium|high|paranoid)$')
```

**Step 2: Add amount validation in hub routing**

In the hub routing endpoint, after parsing the request, add:

```python
from decimal import Decimal, InvalidOperation
try:
    amount = Decimal(str(req.amount))
except (InvalidOperation, ValueError):
    raise HTTPException(status_code=400, detail="Invalid amount")

if amount <= 0:
    raise HTTPException(status_code=400, detail="Amount must be positive")
```

**Step 3: Commit**

```bash
git add stealthpay/api/main_v2.py
git commit -m "feat: harden input validation on API request models"
```

---

## Task 9: Structured Logging

**Files:**
- Modify: `stealthpay/api/main_v2.py` (add logging)

**Step 1: Add structured logging to hub routing and key operations**

At the top of `main_v2.py`, add:

```python
import logging
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger("stealthpay")
```

In the hub routing endpoint, after a successful payment:

```python
logger.info(json.dumps({
    "event": "hub_payment",
    "payment_id": route["payment_id"],
    "from_agent": agent.agent_name,
    "to_agent": req.to_agent_name,
    "amount": float(req.amount),
    "fee": float(fee_info["fee_amount"]),
    "urgency": req.urgency
}))
```

In the deposit endpoint:

```python
logger.info(json.dumps({
    "event": "deposit",
    "agent": agent.agent_name,
    "amount": float(amount)
}))
```

In the withdraw endpoint:

```python
logger.info(json.dumps({
    "event": "withdrawal",
    "agent": agent.agent_name,
    "amount": float(amount),
    "to_address": req.address[:20] + "..."
}))
```

**Step 2: Commit**

```bash
git add stealthpay/api/main_v2.py
git commit -m "feat: add structured logging for payments and balance operations"
```

---

## Task 10: Fix Health Check for Hub-Only Mode

**Files:**
- Modify: `stealthpay/stealthpay/services/monitoring.py`
- Modify: `stealthpay/api/main_v2.py` (lifespan)

**Step 1: Make wallet health check optional**

In `stealthpay/stealthpay/services/monitoring.py`, update `setup_default_monitoring()` to make the wallet check optional:

```python
def setup_default_monitoring(include_wallet=False) -> HealthMonitor:
    """Set up monitoring with default health checks"""
    monitor = get_monitor()

    # Always register these
    monitor.register_check(create_database_health_check())
    monitor.register_check(create_redis_health_check())
    monitor.register_check(create_system_health_check())

    # Only register wallet check if running with Monero RPC
    if include_wallet:
        monitor.register_check(create_wallet_health_check())

    return monitor
```

**Step 2: Update lifespan in main_v2.py**

In `stealthpay/api/main_v2.py`, the lifespan function calls `setup_default_monitoring()`. Keep it as-is (no wallet check since we're hub-only mode).

**Step 3: Commit**

```bash
git add stealthpay/stealthpay/services/monitoring.py stealthpay/api/main_v2.py
git commit -m "fix: make wallet health check optional for hub-only mode"
```

---

## Task 11: Railway Deployment Setup

**Files:**
- Modify: `stealthpay/railway/Dockerfile.railway`
- Verify: `stealthpay/railway.toml`
- Create: `stealthpay/.env.railway.example`

**Step 1: Verify railway.toml is correct**

Read `stealthpay/railway.toml` — it should already have:
- builder = "DOCKERFILE" pointing to `railway/Dockerfile.railway`
- healthcheck on `/health`
- restart on failure

This is correct. No changes needed.

**Step 2: Verify Dockerfile.railway builds**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && docker build -f railway/Dockerfile.railway -t stealthpay-railway . 2>&1 | tail -5`
Expected: `Successfully tagged stealthpay-railway:latest` (or similar success)

**Step 3: Create .env.railway.example**

Create `stealthpay/.env.railway.example`:

```bash
# Railway automatically provides these from plugins:
# DATABASE_URL — from Railway PostgreSQL plugin
# REDIS_URL — from Railway Redis plugin

# Required: Generate a secure admin API key
ADMIN_API_KEY=change_me_to_secure_random_string

# Required: API secret key for session management
SECRET_KEY=change_me_to_another_secure_random_string

# Optional: Monero RPC (not needed for hub-only mode on stagenet)
# MONERO_RPC_HOST=127.0.0.1
# MONERO_RPC_PORT=18082

# Environment
ENVIRONMENT=stagenet
LOG_LEVEL=INFO

# CORS (add your frontend domain if any)
CORS_ORIGINS=*
```

**Step 4: Test locally with docker-compose.dev.yml**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && docker compose -f docker-compose.dev.yml up -d 2>&1 | tail -10`
Then: `curl -s http://localhost:8000/health | python -m json.tool`
Expected: Health check returns `{"status": "healthy", ...}`

Then: `docker compose -f docker-compose.dev.yml down`

**Step 5: Commit**

```bash
git add stealthpay/.env.railway.example
git commit -m "docs: add Railway environment example"
```

---

## Task 12: E2E Smoke Test Script

A script that tests the full flow against a running API instance.

**Files:**
- Create: `stealthpay/scripts/test_hub_routing_e2e.py`

**Step 1: Write E2E test script**

```python
"""
E2E smoke test for hub routing.
Usage: python scripts/test_hub_routing_e2e.py [base_url]
Default: http://localhost:8000
"""
import sys
import requests

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"


def test_full_flow():
    print(f"Testing against {BASE_URL}\n")

    # 1. Health check
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200, f"Health check failed: {r.text}"
    print("[OK] Health check passed")

    # 2. Register sender
    r = requests.post(f"{BASE_URL}/v2/agents/register", json={
        "agent_name": "e2e-sender",
        "xmr_address": "stagenet_sender_address_test"
    })
    assert r.status_code == 200, f"Register sender failed: {r.text}"
    sender_key = r.json()["api_key"]
    print(f"[OK] Sender registered: {sender_key[:20]}...")

    sender_headers = {"Authorization": f"Bearer {sender_key}"}

    # 3. Register recipient
    r = requests.post(f"{BASE_URL}/v2/agents/register", json={
        "agent_name": "e2e-recipient",
        "xmr_address": "stagenet_recipient_address_test"
    })
    assert r.status_code == 200, f"Register recipient failed: {r.text}"
    recipient_key = r.json()["api_key"]
    print(f"[OK] Recipient registered: {recipient_key[:20]}...")

    recipient_headers = {"Authorization": f"Bearer {recipient_key}"}

    # 4. Check initial balance (should be 0)
    r = requests.get(f"{BASE_URL}/v2/balance", headers=sender_headers)
    assert r.status_code == 200
    assert r.json()["available"] == 0
    print("[OK] Initial balance is 0")

    # 5. Deposit 10 XMR
    r = requests.post(f"{BASE_URL}/v2/balance/deposit",
                      json={"amount": 10.0},
                      headers=sender_headers)
    assert r.status_code == 200
    assert r.json()["new_balance"] == 10.0
    print("[OK] Deposited 10 XMR")

    # 6. Send 5 XMR via hub routing
    r = requests.post(f"{BASE_URL}/v2/payments/hub-routing",
                      json={"to_agent_name": "e2e-recipient", "amount": 5.0},
                      headers=sender_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "confirmed"
    assert data["amount"] == 5.0
    fee = data["fee"]
    print(f"[OK] Hub payment sent: 5 XMR, fee: {fee} XMR")

    # 7. Check sender balance (should be 10 - 5 - fee)
    r = requests.get(f"{BASE_URL}/v2/balance", headers=sender_headers)
    assert r.status_code == 200
    sender_balance = r.json()["available"]
    expected = 10.0 - 5.0 - fee
    assert abs(sender_balance - expected) < 0.0001, f"Sender balance {sender_balance} != {expected}"
    print(f"[OK] Sender balance: {sender_balance} XMR (expected ~{expected})")

    # 8. Check recipient balance (should be 5 XMR)
    r = requests.get(f"{BASE_URL}/v2/balance", headers=recipient_headers)
    assert r.status_code == 200
    recipient_balance = r.json()["available"]
    assert recipient_balance == 5.0, f"Recipient balance {recipient_balance} != 5.0"
    print(f"[OK] Recipient balance: {recipient_balance} XMR")

    # 9. Try sending more than available
    r = requests.post(f"{BASE_URL}/v2/payments/hub-routing",
                      json={"to_agent_name": "e2e-recipient", "amount": 999.0},
                      headers=sender_headers)
    assert r.status_code == 400
    assert "Insufficient" in r.json()["detail"]
    print("[OK] Insufficient balance correctly rejected")

    # 10. Check admin stats
    r = requests.get(f"{BASE_URL}/v2/admin/stats",
                     headers={"admin_key": "test"})
    # May return 401 if admin key doesn't match — that's OK
    print(f"[OK] Admin stats endpoint: {r.status_code}")

    # 11. Check disabled endpoints
    r = requests.post(f"{BASE_URL}/v2/escrow/create", json={})
    assert r.status_code in [401, 501]
    print("[OK] Escrow endpoint correctly disabled")

    print(f"\n{'='*50}")
    print(f"ALL TESTS PASSED")
    print(f"Fee collected: {fee} XMR (0.1% of 5.0)")
    print(f"{'='*50}")


if __name__ == "__main__":
    test_full_flow()
```

**Step 2: Run against local dev**

First start dev: `docker compose -f docker-compose.dev.yml up -d`
Then: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python scripts/test_hub_routing_e2e.py`
Expected: `ALL TESTS PASSED`

**Step 3: Commit**

```bash
git add stealthpay/scripts/test_hub_routing_e2e.py
git commit -m "test: add E2E smoke test for hub routing flow"
```

---

## Task 13: Final Review and Cleanup

**Step 1: Run all tests**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && python -m pytest tests/test_fee_collector.py tests/test_balance.py tests/test_api.py -v`
Expected: All tests pass

**Step 2: Verify Docker build**

Run: `cd "/Users/saveliy/Documents/Agent Payments/stealthpay" && docker build -f railway/Dockerfile.railway -t stealthpay-railway .`
Expected: Builds successfully

**Step 3: Review all changes**

Run: `git diff --stat HEAD~12` (or however many commits)
Verify only intended files were changed.

**Step 4: Final commit with summary**

```bash
git add -A
git commit -m "chore: production hub routing v1 ready for Railway deployment"
```

---

## Deployment Steps (Manual — After All Tasks Complete)

1. **Initialize git** (if not already): `git init && git add -A && git commit -m "initial"`
2. **Create Railway project**: `railway login && railway init`
3. **Add PostgreSQL plugin**: Railway dashboard → Add Plugin → PostgreSQL 15
4. **Add Redis plugin**: Railway dashboard → Add Plugin → Redis 7
5. **Set env vars**: `ADMIN_API_KEY`, `SECRET_KEY`, `ENVIRONMENT=stagenet`
6. **Deploy**: `railway up`
7. **Get URL**: `railway status` — Railway provides a `*.up.railway.app` URL
8. **Run E2E test**: `python scripts/test_hub_routing_e2e.py https://your-app.up.railway.app`
9. **Monitor**: Railway dashboard → Logs, Metrics
