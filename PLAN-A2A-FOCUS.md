# AgentBill — План реализации (Hybrid A2A Model)

> **Видение:** Инфраструктура доверия для Agent-to-Agent (A2A) экономики — агенты платят напрямую, но проверяют друг друга через нас
> **Core:** P2P payments + x402 protocol + Reputation Layer + Optional Hub Routing
> **Time to MVP:** 6-8 недель

---

## 🎯 Проблема

**A2A платежи сейчас хаотичны:**
- Агент А хочет заплатить агенту Б за услугу, но не знает, можно ли ему доверять
- Нет единого реестра агентов и их репутации
- Микроплатежи ($0.01-0.50) неэффективны через традиционные платёжки
- Если что-то пошло не так — нет механизма разрешения споров

**AgentBill решает:**
- ✅ Агенты платят напрямую (P2P) — никакого custodial риска
- ✅ Проверка репутации перед сделкой — снижаем риск мошенничества  
- ✅ Опциональный escrow через Hub — для дорогих/сложных сделок
- ✅ Стандартизированный протокол (x402) — работает везде

---

## 💡 Гибридная Модель (P2P + Hub)

### Ключевой принцип: Агенты всегда МОГУТ платить напрямую

```
┌─────────────────────────────────────────────────────────────────┐
│  АГЕНТЫ ПЛАТЯТ НАПРЯМУЮ (P2P)                                   │
│  ┌──────────┐  USDC/Base  ┌──────────┐                          │
│  │ Agent A  │◄───────────▶│ Agent B  │  ← Без посредников       │
│  │          │  Lightning  │          │                          │
│  └────┬─────┘             └────┬─────┘                          │
│       │                        │                                │
│       │  Репутация/Discovery   │                                │
│       └──────────┬─────────────┘                                │
│                  ▼                                              │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  AGENTBILL HUB (Опционально)                        │       │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │       │
│  │  │ Agent      │  │ Reputation │  │ Optional     │   │       │
│  │  │ Registry   │  │ Scoring    │  │ Escrow       │   │       │
│  │  └────────────┘  └────────────┘  └──────────────┘   │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Три режима работы

| Режим | Описание | Когда использовать | Комиссия |
|-------|----------|-------------------|----------|
| **P2P Direct** | Агенты платят напрямую по адресу | Доверяете контрагенту, маленькие суммы | 0% |
| **Verified Routing** | Через Hub для проверки репутации | Неизвестный агент, хочу проверить | 0.1% |
| **Escrow Hub** | Условное удержание через Hub | Крупные суммы, сложные задачи | 1% |

---

## 🏗️ Архитектура системы

### Layer 1: P2P Protocol (Базовый уровень)

```go
// x402 P2P Payment Header
type PaymentHeader struct {
    Version     string  `json:"version"`      // "x402/0.1"
    Scheme      string  `json:"scheme"`       // "exact", "estimate"
    Network     string  `json:"network"`      // "base", "solana", "lightning"
    
    // P2P данные
    From        string  `json:"from"`         // Адрес отправителя
    To          string  `json:"to"`           // Адрес получателя
    Amount      string  `json:"amount"`       // Сумма
    Token       string  `json:"token"`        // "USDC", "SOL", "BTC"
    
    // Подпись транзакции (готовая к отправке в сеть)
    TxSignature string  `json:"tx_signature"` 
    
    // Опционально: репутация от Hub
    ReputationProof string `json:"reputation_proof,omitempty"`
}
```

### Layer 2: Agent Registry (Reputation Layer)

```sql
-- Агенты регистрируются, но платят напрямую
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    name VARCHAR(255) NOT NULL,
    did VARCHAR(255) UNIQUE,  -- Decentralized Identifier
    
    -- P2P Addresses (не храним ключи!)
    wallet_base VARCHAR(255),
    wallet_solana VARCHAR(255),
    wallet_lightning VARCHAR(255),
    
    -- Reputation Metrics (наша ценность)
    total_transactions INTEGER DEFAULT 0,
    successful_deliveries INTEGER DEFAULT 0,
    dispute_losses INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    trust_score INTEGER DEFAULT 0,  -- 0-100, алгоритмический
    
    -- Verification Tiers
    tier VARCHAR(50) DEFAULT 'basic', -- 'basic', 'verified', 'premium'
    verified_at TIMESTAMP,
    
    -- Staking (для premium)
    staked_amount DECIMAL(20, 8) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Транзакции наблюдаем в блокчейне, не храним деньги
CREATE TABLE observed_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    network VARCHAR(50) NOT NULL,
    
    from_agent_id UUID REFERENCES agents(id),
    to_agent_id UUID REFERENCES agents(id),
    
    amount DECIMAL(20, 8) NOT NULL,
    token VARCHAR(10) DEFAULT 'USDC',
    
    -- Мета-данные
    service_type VARCHAR(100),  -- 'api_call', 'task_completion', etc.
    status VARCHAR(50),         -- 'pending', 'confirmed', 'failed'
    
    -- Репутация: подтверждена ли доставка
    delivery_confirmed BOOLEAN DEFAULT false,
    delivery_confirmed_at TIMESTAMP,
    
    block_number BIGINT,
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Отзывы агентов друг о друге
CREATE TABLE agent_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id UUID REFERENCES agents(id),
    reviewee_id UUID REFERENCES agents(id),
    tx_hash VARCHAR(255) REFERENCES observed_transactions(tx_hash),
    
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    tags JSONB,  -- ["fast_delivery", "quality_work", "responsive"]
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Layer 3: Optional Hub Services

```go
// Hub Routing — опциональное ускорение
type HubRoute struct {
    PaymentID     string    `json:"payment_id"`
    FromAgentID   string    `json:"from_agent_id"`
    ToAgentID     string    `json:"to_agent_id"`
    
    // Hub берёт на себя риск за комиссию
    RiskAssumed   bool      `json:"risk_assumed"`
    FeePercent    float64   `json:"fee_percent"`  // 0.1% для verified
    
    // Instant confirmation vs ждать блокчейн
    Instant       bool      `json:"instant"`
    
    // Escrow условия (опционально)
    EscrowEnabled bool      `json:"escrow_enabled"`
    Conditions    EscrowConditions `json:"conditions,omitempty"`
}
```

---

## 📦 SDK Specification

### Python SDK — P2P First

```python
from agentbill import AgentClient

# Инициализация — мы НЕ храним ключи, агент управляет сам
agent = AgentClient(
    wallet_private_key=os.environ["AGENT_WALLET_KEY"],
    network="base"
)

# ═══════════════════════════════════════════════════════════════
# СЦЕНАРИЙ 1: Чистый P2P платёж (дефолт)
# ═══════════════════════════════════════════════════════════════

# Шаг 1: Находим агента в реестре (через Hub)
recipient = agent.resolve_agent("fact-checker.alice")
# Возвращает: { wallet: "0xabc...", reputation: 4.8, tier: "verified" }

# Шаг 2: Проверяем репутацию перед сделкой
if recipient.trust_score < 50:
    raise Exception("Низкий trust score, используйте escrow")

# Шаг 3: Отправляем платёж напрямую (P2P)
tx_hash = agent.pay_p2p(
    to_address=recipient.wallet,
    amount=0.10,
    memo="Fact-check claim #12345"
)
# Деньги ушли напрямую, AgentBill не участвовал в переводе

# Шаг 4: Подтверждаем получение услуги (для репутации)
agent.confirm_delivery(
    tx_hash=tx_hash,
    rating=5,
    review="Быстро и точно!"
)

# ═══════════════════════════════════════════════════════════════
# СЦЕНАРИЙ 2: Verified Routing (через Hub)
# ═══════════════════════════════════════════════════════════════

# Если нужна скорость или защита — используем Hub
result = agent.pay_with_routing(
    to_agent_id="fact-checker.alice",
    amount=5.00,
    route="verified",  # или "p2p" (default), "escrow"
    memo="Urgent verification"
)

# Hub берёт 0.1%, но даёт:
# - Instant confirmation (не ждём блокчейн)
# - Reputation verification
# - Delivery guarantee (или возврат)

# ═══════════════════════════════════════════════════════════════
# СЦЕНАРИЙ 3: Escrow для крупных сумм
# ═══════════════════════════════════════════════════════════════

escrow = agent.create_escrow(
    to_agent_id="developer.bob",
    amount=100.00,
    conditions={
        "deliverable": "smart_contract_audit",
        "deadline": "2024-12-31T23:59:59Z",
        "milestone_based": True
    }
)

# Деньги заморожены в смарт-контракте (не у нас на счету!)
# Агент выполняет работу → подтверждаем delivery → release

if work_accepted:
    escrow.release()
else:
    escrow.dispute(evidence="code_quality_poor")
    # Hub выступает арбитром

# ═══════════════════════════════════════════════════════════════
# СЦЕНАРИЙ 4: Получение платежей как сервис-провайдер
# ═══════════════════════════════════════════════════════════════

from agentbill.server import A2AServer

server = A2AServer(
    wallet_key=os.environ["WALLET_KEY"],
    identity="fact-checker.alice"
)

@server.endpoint("/verify")
@require_payment(amount=0.05, network="base")
def verify_claim(claim: str):
    # Этот код выполняется ТОЛЬКО если платёж подтверждён
    # Платёж может прийти:
    # - P2P: напрямую на наш адрес (проверяем в блокчейне)
    # - Via Hub: мгновенное подтверждение
    
    result = fact_check(claim)
    
    # Отправляем proof для репутации
    server.confirm_delivery(payment_id, result.hash)
    
    return result
```

### TypeScript SDK

```typescript
import { AgentClient, A2AServer } from '@agentbill/a2a';

const agent = new AgentClient({
  walletPrivateKey: process.env.AGENT_WALLET_KEY!,
  network: 'base',
  // Опционально: подключение к Hub для репутации
  hubApiKey: process.env.AGENTBILL_HUB_KEY  // можно и без него
});

// P2P Discovery — находим агентов и их репутацию
const providers = await agent.discover({
  service: 'web-search',
  minRating: 4.5,
  maxPrice: 0.10,
  verifiedOnly: true
});

// Выбираем лучшего
const best = providers.sort((a, b) => b.trustScore - a.trustScore)[0];

// P2P Payment — напрямую
const tx = await agent.pay({
  to: best.walletAddress,
  amount: 0.05,
  route: 'p2p'  // direct blockchain transfer
});

// Или через Hub для защиты
const tx = await agent.pay({
  to: best.agentId,
  amount: 50.00,
  route: 'escrow',
  escrowConditions: {
    deliverable: 'research_report',
    deadline: Date.now() + 86400000
  }
});

// Получение платежей
const server = new A2AServer({
  identity: 'my-agent',
  services: [
    {
      name: 'data-analysis',
      price: 0.10,
      handler: async (input, ctx) => {
        // ctx.payment содержит информацию о платеже
        // Может быть P2P или Hub — нам всё равно
        return await analyze(input);
      }
    }
  ]
});
```

---

## 💰 Revenue Model (P2P-friendly)

### Как зарабатываем, если агенты платят напрямую?

| Revenue Stream | Модель | Объём необходимый |
|----------------|--------|-------------------|
| **Verified Badge** | $29/мес | 1,000 агентов = $29K/mo |
| **Routing Fee** | 0.1% от P2P через Hub | $1M volume = $1K/mo |
| **Escrow Fee** | 1% за спорное удержание | $100K escrow = $1K/mo |
| **Premium Discovery** | $99/мес за приоритет в поиске | 500 агентов = $49K/mo |
| **Dispute Resolution** | $50 за арбитраж | 100 споров = $5K/mo |
| **API Calls** | $0.001 за reputation check | 1M calls = $1K/mo |

### Freemium Tiers

| Tier | Цена | Что включено |
|------|------|--------------|
| **Free** | $0 | Регистрация, базовый профиль, P2P платежи |
| **Verified** | $29/мес | Верификация личности, verified badge, reputation tracking |
| **Premium** | $99/мес | Приоритет в discovery, analytics, API rate limit 10K/mo |
| **Enterprise** | $499/мес | White-label reputation, SLA, dedicated support |

### Network Effect

```
Цикл роста:
1. Агент регистрируется бесплатно → добавляем в реестр
2. Он получает P2P платежи → мы индексируем транзакции
3. Его репутация растёт → другие агенты доверяют
4. Он хочет быстрых платежей → использует Hub routing ($)
5. Дорогие сделки → использует escrow ($)
6. Хочет больше клиентов → покупает Premium ($)
```

---

## 📅 Roadmap (Hybrid Model)

### Неделя 0: Foundation
- [ ] Deploy x402 smart contract на Base Sepolia (non-custodial)
- [ ] Agent Registry contract (DID-based)
- [ ] Basic API: регистрация, профиль, адреса
- [ ] PostgreSQL schema для репутации

### Неделя 1-2: P2P Core
- [ ] Python SDK: P2P payments, transaction signing
- [ ] Indexer: чтение транзакций из Base для репутации
- [ ] Trust Score алгоритм v1
- [ ] Agent discovery endpoint

### Неделя 3-4: Reputation System
- [ ] Review system (agent-to-agent)
- [ ] Trust score calculation
- [ ] Verified badge flow
- [ ] Public reputation API

### Неделя 5: Optional Hub
- [ ] Internal ledger (для routing)
- [ ] Instant confirmation service
- [ ] Fee collection mechanism
- [ ] Dashboard для агентов

### Неделя 6: Escrow
- [ ] Smart contract escrow (non-custodial)
- [ ] Create/release/refund flows
- [ ] Dispute interface
- [ ] Oracle service

### Неделя 7: TypeScript + MCP
- [ ] TypeScript SDK
- [ ] MCP Server для Claude/Cursor
- [ ] LangChain integration
- [ ] Documentation

### Неделя 8: Launch
- [ ] Mainnet deployment
- [ ] 50 beta агентов
- [ ] Product Hunt
- [ ] Developer tutorials

---

## 🔗 Integration Architecture

### P2P Flow (Основной)

```
Agent A                          Blockchain                    Agent B
   │                                │                            │
   │  1. Узнаёт адрес Agent B       │                            │
   │◄───────────────────────────────┤                            │
   │     (из нашего registry)       │                            │
   │                                │                            │
   │  2. Проверяет репутацию        │                            │
   │◄───────────────────────────────┤                            │
   │     (наш API, бесплатно)       │                            │
   │                                │                            │
   │  3. Подписывает транзакцию     │                            │
   ├────────────────────────────────┼────────────────────────────►│
   │     (напрямую в сеть)          │                            │
   │                                │                            │
   │                                │  4. Мы индексируем tx       │
   │◄───────────────────────────────┼────────────────────────────┤
   │     (для обновления репутации) │                            │
   │                                │                            │
   │  5. Подтверждает delivery      │                            │
   ├────────────────────────────────┼────────────────────────────►│
   │     (через наш API)            │                            │
```

### Hub Routing Flow (Опциональный)

```
Agent A         AgentBill Hub          Blockchain          Agent B
   │                  │                      │               │
   │  1. pay_with_routing                    │               │
   ├─────────────────►│                      │               │
   │                  │  2. Проверка баланса │               │
   │                  ├─────────────────────►│               │
   │                  │                      │               │
   │                  │  3. Резервируем      │               │
   │  4. Подтверждение│  (внутренний ledger) │               │
   │◄─────────────────┤                      │               │
   │                  │                      │               │
   │  5. Agent B вызывает confirm_delivery   │               │
   │                  │◄─────────────────────┼───────────────┤
   │                  │                      │               │
   │                  │  6. Release payment  │               │
   │                  ├─────────────────────┼───────────────►│
   │                  │                      │               │
   │                  │  7. Batch settlement │               │
   │                  │  (раз в час в сеть)  │               │
```

---

## 🔐 Security & Trust

### Non-custodial по дизайну

- **Мы НИКОГДА не храним приватные ключи агентов**
- **Мы НИКОГДА не контролируем P2P транзакции**
- **Агенты могут использовать Hub или обходить его**

### Reputation Verification

```python
def calculate_trust_score(agent_id) -> int:
    """
    Алгоритм trust score (0-100)
    """
    score = 0
    
    # Базовые метрики (40 баллов)
    score += min(agent.total_transactions * 0.5, 20)  # Опыт
    score += min(agent.successful_deliveries * 0.5, 20)  # Надёжность
    
    # Репутация (30 баллов)
    if agent.average_rating > 0:
        score += (agent.average_rating / 5) * 30
    
    # Верификация (20 баллов)
    if agent.tier == 'verified':
        score += 10
    if agent.tier == 'premium':
        score += 20
    
    # Стейкинг (10 баллов)
    score += min(agent.staked_amount / 100, 10)
    
    # Штрафы
    score -= agent.dispute_losses * 10
    
    return max(0, min(100, int(score)))
```

### Dispute Resolution

```solidity
// Non-custodial escrow с возможностью арбитража
contract AgentEscrow {
    enum Resolution { None, ReleaseToPayee, RefundToPayer, Split }
    
    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        bytes32 taskHash;
        
        // Арбитраж
        address arbiter;  // Может быть 0x0 (автоматический)
        uint256 arbiterFee;  // 1% если используется
        
        Resolution resolution;
        bool payerApproved;
        bool payeeApproved;
    }
    
    // Автоматический release если обе стороны согласны
    function mutualRelease(bytes32 escrowId) external {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.payer || msg.sender == e.payee);
        
        if (msg.sender == e.payer) e.payerApproved = true;
        if (msg.sender == e.payee) e.payeeApproved = true;
        
        if (e.payerApproved && e.payeeApproved) {
            e.resolution = Resolution.ReleaseToPayee;
            usdc.transfer(e.payee, e.amount);
        }
    }
    
    // Арбитраж (вызывается только если назначен arbiter)
    function arbitrate(
        bytes32 escrowId, 
        Resolution decision,
        uint256 payeeAmount  // для Split
    ) external {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.arbiter, "Not arbiter");
        require(e.resolution == Resolution.None, "Already resolved");
        
        e.resolution = decision;
        
        if (decision == Resolution.ReleaseToPayee) {
            uint256 fee = (e.amount * e.arbiterFee) / 10000;
            usdc.transfer(e.arbiter, fee);
            usdc.transfer(e.payee, e.amount - fee);
        } else if (decision == Resolution.RefundToPayer) {
            usdc.transfer(e.payer, e.amount);
        } else if (decision == Resolution.Split) {
            usdc.transfer(e.payer, e.amount - payeeAmount);
            usdc.transfer(e.payee, payeeAmount);
        }
    }
}
```

---

## 🎮 Demo Scenarios

### Demo 1: Research Pipeline (P2P)

```
User → Agent Researcher (хочет доклад за $10)
    ├─► Проверяет репутацию в Hub (бесплатно)
    ├─► Нанимает Agent Searcher ($2) — ПЛАТИТ НАПРЯМУЮ
    ├─► Нанимает Agent FactChecker ($1) — ПЛАТИТ НАПРЯМУЮ
    ├─► Нанимает Agent Writer ($3) — ПЛАТИТ НАПРЯМУЮ
    └─► Собирает доклад → получает $10

AgentBill получает:
- $0 с P2P платежей
- Reputation data для всех агентов
- Возможность продать Premium позже
```

### Demo 2: Крупная сделка с escrow

```
Agent Developer → Заказ на разработку ($1000)
    ├─► Использует Escrow Hub (1% = $10 fee)
    ├─► Деньги в смарт-контракте (не у нас!)
    ├─► Milestones: $300 → $400 → $300
    └─► По завершении: release каждого milestone

AgentBill получает:
- $10 escrow fee
- Reputation обновление для обоих агентов
```

### Demo 3: API Micropayments

```
Agent → POST /translate (x402)
    ├─► 402 Payment Required: $0.02
    ├─► Agent отправляет P2P на адрес сервиса
    ├─► Сервис видит транзакцию в mempool → выполняет запрос
    └─► Мгновенно, без задержки на подтверждение

AgentBill получает:
- $0 напрямую
- Но индексирует транзакцию → обновляет репутацию
```

---

## ⚡ Technical Decisions

### Почему P2P + Hub, а не чистый Hub?

| Критерий | P2P + Hub (Наш выбор) | Central Hub | Pure P2P |
|----------|----------------------|-------------|----------|
| **Custodial риск** | Нет | Высокий | Нет |
| **Регуляторка** | Минимальная | Тяжёлая (MTL) | Нет |
| **Скорость запуска** | Быстро | Медленно | Быстро |
| **Revenue** | Растёт с сетью | Высокая сразу | Сложно монетизировать |
| **Доверие агентов** | Высокое | Среднее | Низкое (нет защиты) |

### Почему Base для начала?

- **EIP-3009** = gasless transfers (мета-транзакции)
- **Низкие комиссии** = <$0.01 за транзакцию
- **Coinbase backing** = institutional trust
- **EVM** = простая разработка

### Fallback на Solana?

- Да, добавим в неделю 4-5
- **SPL tokens** = ещё ниже fees
- **Higher TPS** = масштабирование

---

## 📊 Success Metrics

| Metric | Month 3 | Month 6 | Year 1 |
|--------|---------|---------|--------|
| Registered Agents | 500 | 2,000 | 15,000 |
| P2P Transactions/day | 1,000 | 10,000 | 100,000 |
| Avg Transaction | $0.50 | $1.00 | $2.00 |
| % Using Hub Routing | 10% | 20% | 30% |
| % Using Escrow | 2% | 5% | 8% |
| Verified Agents | 50 | 300 | 2,000 |
| **Monthly Revenue** | **$2K** | **$15K** | **$150K** |

---

## 🚀 Next Steps (This Week)

1. **Уточнить схему** — финализируем smart contract architecture
2. **Base Sepolia** — deploy x402 + registry contracts
3. **Python SDK** — базовая реализация P2P payments
4. **Landing page** — "PayPal for AI Agents" positioning

**Ключевой вопрос:**
Стартуем с одной сети (Base) или сразу multi-chain (Base + Solana)?

---

**Главное отличие от старых планов:**
- ❌ Больше не требуем, чтобы все платежи шли через нас
- ❌ Не храним деньги агентов
- ✅ Даём ценность через репутацию и доверие
- ✅ Зарабатываем на опциональных сервисах
- ✅ Масштабируемся через network effect
