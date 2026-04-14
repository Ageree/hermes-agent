"use strict";
/**
 * StealthPay - Anonymous payments SDK for AI Agents via Monero
 *
 * TypeScript/JavaScript SDK for zero-knowledge agent-to-agent payments.
 *
 * @example
 * ```typescript
 * import { StealthPay } from '@stealthpay/sdk';
 *
 * const agent = StealthPay.fromEnv();
 *
 * // Check balance
 * const balance = await agent.getBalance();
 * console.log(`Balance: ${balance} XMR`);
 *
 * // Create stealth address
 * const stealth = await agent.createStealthAddress('payment');
 * console.log(`Pay me: ${stealth.address}`);
 *
 * // Send payment
 * const payment = await agent.pay('44...recipient', 0.1);
 * console.log(`Sent: ${payment.txHash}`);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.ChannelManager = exports.EscrowManager = exports.StealthAddressManager = exports.WalletRPCError = exports.MoneroWalletRPC = exports.ChannelStatus = exports.EscrowStatus = exports.PaymentStatus = exports.StealthPay = void 0;
// Main client
var client_1 = require("./client");
Object.defineProperty(exports, "StealthPay", { enumerable: true, get: function () { return client_1.StealthPay; } });
// Types
var types_1 = require("./types");
Object.defineProperty(exports, "PaymentStatus", { enumerable: true, get: function () { return types_1.PaymentStatus; } });
Object.defineProperty(exports, "EscrowStatus", { enumerable: true, get: function () { return types_1.EscrowStatus; } });
Object.defineProperty(exports, "ChannelStatus", { enumerable: true, get: function () { return types_1.ChannelStatus; } });
// Sub-modules (for advanced usage)
var wallet_1 = require("./wallet");
Object.defineProperty(exports, "MoneroWalletRPC", { enumerable: true, get: function () { return wallet_1.MoneroWalletRPC; } });
Object.defineProperty(exports, "WalletRPCError", { enumerable: true, get: function () { return wallet_1.WalletRPCError; } });
var stealth_1 = require("./stealth");
Object.defineProperty(exports, "StealthAddressManager", { enumerable: true, get: function () { return stealth_1.StealthAddressManager; } });
var escrow_1 = require("./escrow");
Object.defineProperty(exports, "EscrowManager", { enumerable: true, get: function () { return escrow_1.EscrowManager; } });
var channels_1 = require("./channels");
Object.defineProperty(exports, "ChannelManager", { enumerable: true, get: function () { return channels_1.ChannelManager; } });
// Version
exports.VERSION = '0.1.0';
