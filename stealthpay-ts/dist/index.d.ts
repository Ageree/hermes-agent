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
export { StealthPay } from './client';
export { StealthPayConfig, WalletInfo, Payment, PaymentStatus, StealthAddress, EscrowDeal, EscrowStatus, PaymentChannel, ChannelStatus, ChannelState, EscrowParticipant, } from './types';
export { MoneroWalletRPC, WalletRPCError } from './wallet';
export { StealthAddressManager } from './stealth';
export { EscrowManager } from './escrow';
export { ChannelManager } from './channels';
export declare const VERSION = "0.1.0";
