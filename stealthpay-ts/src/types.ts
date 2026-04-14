/**
 * Type definitions for StealthPay TypeScript SDK
 */

export enum PaymentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum EscrowStatus {
  PENDING = 'pending',
  FUNDED = 'funded',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
}

export enum ChannelStatus {
  PENDING = 'pending',
  OPEN = 'open',
  CLOSING = 'closing',
  CLOSED = 'closed',
  DISPUTED = 'disputed',
}

export interface Payment {
  txHash: string;
  amount: number;  // XMR
  fromAddress: string | null;
  toAddress: string;
  status: PaymentStatus;
  confirmations: number;
  fee: number;
  timestamp: Date;
  memo?: string;
}

export interface WalletInfo {
  address: string;
  primaryAddress: string;
  balance: number;
  unlockedBalance: number;
  height: number;
  viewOnly: boolean;
}

export interface StealthAddress {
  address: string;
  index: number;
  label?: string;
  createdAt?: Date;
  used: boolean;
}

export interface EscrowParticipant {
  role: 'buyer' | 'seller' | 'arbiter';
  address: string;
  signature?: string;
}

export interface EscrowDeal {
  id: string;
  status: EscrowStatus;
  buyer: EscrowParticipant;
  seller: EscrowParticipant;
  arbiter: EscrowParticipant;
  amount: number;
  description: string;
  createdAt: Date;
  timeoutHours: number;
  fundedAt?: Date;
  completedAt?: Date;
  multisigAddress?: string;
  depositTxHash?: string;
  releaseTxHash?: string;
  disputedBy?: string;
  disputeReason?: string;
  arbiterDecision?: 'release' | 'refund';
}

export interface ChannelState {
  sequenceNumber: number;
  balanceA: number;
  balanceB: number;
  signatureA?: string;
  signatureB?: string;
  timestamp: number;
}

export interface PaymentChannel {
  id: string;
  agentAAddress: string;
  agentBAddress: string;
  capacity: number;
  status: ChannelStatus;
  fundingTxHash?: string;
  closingTxHash?: string;
  multisigAddress?: string;
  currentState?: ChannelState;
  statesHistory: ChannelState[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface StealthPayConfig {
  rpcHost: string;
  rpcPort: number;
  rpcUser?: string;
  rpcPass?: string;
  accountIndex?: number;
}
