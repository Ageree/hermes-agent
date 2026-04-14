# @stealthpay/sdk - TypeScript SDK

[![npm version](https://badge.fury.io/js/@stealthpay%2Fsdk.svg)](https://badge.fury.io/js/@stealthpay%2Fsdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)

TypeScript/JavaScript SDK for StealthPay - anonymous payments for AI Agents via Monero.

## 🚀 Quick Start

```bash
npm install @stealthpay/sdk
```

```typescript
import { StealthPay } from '@stealthpay/sdk';

// Initialize client
const agent = new StealthPay({
  rpcHost: '127.0.0.1',
  rpcPort: 18082,
  rpcUser: 'username',
  rpcPass: 'password'
});

// Check balance
const info = await agent.getInfo();
console.log(`Balance: ${info.balance} XMR`);

// Send payment
const tx = await agent.pay('44...', 0.1, {
  memo: 'Payment for data'
});
console.log(`Sent: ${tx.txHash}`);
```

## 📦 Installation

```bash
# npm
npm install @stealthpay/sdk

# yarn
yarn add @stealthpay/sdk

# pnpm
pnpm add @stealthpay/sdk
```

## 🔧 Configuration

### From Environment Variables

```typescript
import { StealthPay } from '@stealthpay/sdk';

const agent = StealthPay.fromEnv();
```

Set environment variables:

```bash
export MONERO_RPC_HOST=127.0.0.1
export MONERO_RPC_PORT=18082
export MONERO_RPC_USER=username
export MONERO_RPC_PASS=password
```

### Manual Configuration

```typescript
const agent = new StealthPay({
  rpcHost: '127.0.0.1',
  rpcPort: 18082,
  rpcUser: 'username',
  rpcPass: 'password',
  accountIndex: 0
});
```

## 💡 Usage Examples

### P2P Payment

```typescript
// Send payment directly (free, 0% fee)
const tx = await agent.pay('44ABC...', 0.5, {
  memo: 'Payment for service'
});

// Wait for confirmation
const confirmed = await agent.waitForConfirmation(tx.txHash, {
  confirmations: 10,
  timeout: 600000  // 10 minutes
});
```

### Using StealthPay API

```typescript
import { StealthPayAPI } from '@stealthpay/sdk';

const api = new StealthPayAPI({
  baseUrl: 'https://api.stealthpay.io',
  apiKey: 'sk_your_api_key'
});

// Register agent
const { agentId, apiKey } = await api.registerAgent({
  agentName: 'my-agent',
  webhookUrl: 'https://my-agent.com/webhook'
});

// Send payment via API
const payment = await api.sendPayment({
  toAddress: '44...',
  amount: 0.1
});

// Discover agents
const agents = await api.discoverAgents({
  minTrustScore: 80,
  verifiedOnly: true
});
```

### Hub Routing (Instant Confirmation)

```typescript
// Use hub routing for instant confirmation (0.1% fee)
const route = await api.createHubRoute({
  toAgentName: 'recipient-agent',
  amount: 1.0,
  urgency: 'normal'  // or 'urgent' for faster but higher fee
});

// Confirmed instantly
console.log(`Route created: ${route.paymentId}`);
console.log(`Fee: ${route.fee.feeAmount} XMR (${route.fee.feePercent * 100}%)`);
```

### Escrow

```typescript
// Create escrow deal (1% fee)
const escrow = await agent.createEscrow({
  sellerAddress: '44SELLER...',
  arbiterAddress: '44ARBITER...',  // Optional
  amount: 10.0,
  description: 'Smart contract audit',
  timeoutHours: 72
});

// Fund the escrow
await agent.fundEscrow(escrow.id, multisigAddress);

// Release when work is done
await agent.releaseEscrow(escrow.id);

// Or dispute if needed
await agent.disputeEscrow(escrow.id, 'Work not delivered');
```

### Payment Channels

```typescript
// Open channel for frequent payments
const channel = await agent.openChannel({
  counterpartyAddress: '44PARTNER...',
  capacity: 5.0  // XMR to lock
});

// Instant off-chain payments (0 fee!)
const state = agent.channelPay(channel.id, 0.01);
console.log(`New balance: ${state.balanceA} / ${state.balanceB}`);

// Make many payments...
for (let i = 0; i < 100; i++) {
  agent.channelPay(channel.id, 0.001);
}

// Close and settle on-chain
await agent.closeChannel(channel.id, { cooperative: true });
```

### Stealth Addresses

```typescript
// Create one-time address for receiving
const stealth = await agent.createStealthAddress('api-payment');
console.log(`Pay me: ${stealth.address}`);

// Create batch for multiple payments
const addresses = await agent.createStealthBatch(10);
```

### Get Payment History

```typescript
// Get all payments
const payments = await agent.getPayments({
  incoming: true,
  outgoing: true,
  limit: 50
});

for (const payment of payments) {
  console.log(`${payment.txHash}: ${payment.amount} XMR`);
}
```

## 🌐 API Client

The SDK includes a full API client for the StealthPay REST API:

```typescript
import { StealthPayAPI } from '@stealthpay/sdk';

const api = new StealthPayAPI({
  baseUrl: 'https://api.stealthpay.io',
  apiKey: 'sk_...'
});

// Agents
const profile = await api.getAgentProfile('agent-name');
const agents = await api.discoverAgents({ minTrustScore: 80 });

// Payments
const history = await api.getPaymentHistory();

// Escrow
const escrows = await api.getEscrowDeals({ status: 'active' });

// Webhooks
await api.configureWebhook({
  url: 'https://my-agent.com/webhook',
  events: ['payment.received', 'escrow.funded']
});
```

## 🤖 MCP Server

Use StealthPay with Claude, Cursor, and other MCP-compatible assistants:

### Configure Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stealthpay": {
      "command": "npx",
      "args": ["@stealthpay/sdk", "mcp-server"],
      "env": {
        "MONERO_RPC_HOST": "127.0.0.1",
        "MONERO_RPC_PORT": "18082"
      }
    }
  }
}
```

### Available MCP Tools

- `stealthpay_send_payment` - Send XMR payment
- `stealthpay_get_balance` - Check wallet balance
- `stealthpay_create_stealth_address` - Generate receiving address
- `stealthpay_create_escrow` - Create escrow deal
- `stealthpay_get_payment_history` - View recent payments

## 📘 Types

Full TypeScript support included:

```typescript
import {
  StealthPayConfig,
  WalletInfo,
  Payment,
  PaymentStatus,
  EscrowDeal,
  PaymentChannel,
  AgentProfile
} from '@stealthpay/sdk';
```

## 💰 Fees

| Service | Fee | Description |
|---------|-----|-------------|
| P2P Direct | 0% | Direct blockchain transfer |
| Hub Routing | 0.1% | Instant confirmation via hub |
| Escrow | 1% | Protected transactions |
| Channels | 0% | Off-chain payments |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Your Application                    │
└──────────────────────┬──────────────────────────────┘
                       │
           ┌───────────▼────────────┐
           │   @stealthpay/sdk      │
           │   - StealthPay client  │
           │   - API client         │
           │   - MCP server         │
           └───────────┬────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│  Monero     │ │  StealthPay │ │  WebSocket  │
│  Wallet RPC │ │  REST API   │ │  Events     │
└─────────────┘ └─────────────┘ └─────────────┘
```

## 🔒 Security

- **Non-custodial**: Private keys never leave your wallet
- **Zero-knowledge**: Monero hides transaction details
- **Stealth addresses**: One-time addresses for each transaction

## 📚 Documentation

- [Full Documentation](https://docs.stealthpay.io)
- [API Reference](https://docs.stealthpay.io/api)
- [Examples](https://github.com/stealthpay/examples)

## 🤝 Contributing

```bash
git clone https://github.com/stealthpay/stealthpay.git
cd stealthpay/stealthpay-ts
npm install
npm run build
npm test
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Links

- [Website](https://stealthpay.io)
- [Documentation](https://docs.stealthpay.io)
- [GitHub](https://github.com/stealthpay/stealthpay)
- [npm](https://www.npmjs.com/package/@stealthpay/sdk)
