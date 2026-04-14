/**
 * Main StealthPay client for TypeScript
 */
import { EscrowManager } from './escrow';
import { ChannelManager } from './channels';
import { StealthPayConfig, WalletInfo, Payment, StealthAddress, EscrowDeal, EscrowStatus, PaymentChannel, ChannelStatus, ChannelState } from './types';
export declare class StealthPay {
    private wallet;
    private stealth;
    private accountIndex;
    escrow: EscrowManager;
    channels: ChannelManager;
    /**
     * Create StealthPay client
     */
    constructor(config: StealthPayConfig);
    /**
     * Create client from environment variables
     */
    static fromEnv(): StealthPay;
    /**
     * Get wallet information
     */
    getInfo(): Promise<WalletInfo>;
    /**
     * Get current balance
     */
    getBalance(): Promise<number>;
    /**
     * Get wallet address
     */
    getAddress(): Promise<string>;
    /**
     * Create stealth address for receiving payment
     */
    createStealthAddress(label?: string, purpose?: string): Promise<StealthAddress>;
    /**
     * Create multiple stealth addresses
     */
    createStealthBatch(count: number): Promise<StealthAddress[]>;
    /**
     * Send anonymous payment
     */
    pay(toAddress: string, amount: number, options?: {
        memo?: string;
        priority?: number;
        mixin?: number;
    }): Promise<Payment>;
    /**
     * Get payment by tx hash
     */
    getPayment(txHash: string): Promise<Payment | null>;
    /**
     * Get payment history
     */
    getPayments(options?: {
        incoming?: boolean;
        outgoing?: boolean;
        limit?: number;
    }): Promise<Payment[]>;
    /**
     * Wait for transaction confirmation
     */
    waitForConfirmation(txHash: string, options?: {
        confirmations?: number;
        timeout?: number;
        pollInterval?: number;
    }): Promise<Payment>;
    /**
     * Create escrow deal
     */
    createEscrow(sellerAddress: string, arbiterAddress: string, amount: number, description: string, timeoutHours?: number): Promise<EscrowDeal>;
    /**
     * Fund escrow deal
     */
    fundEscrow(dealId: string, multisigAddress: string): Promise<EscrowDeal>;
    /**
     * Release escrow to seller
     */
    releaseEscrow(dealId: string): Promise<EscrowDeal>;
    /**
     * Open dispute on escrow
     */
    disputeEscrow(dealId: string, reason: string): Promise<EscrowDeal>;
    /**
     * Get escrow deal
     */
    getEscrow(dealId: string): EscrowDeal | undefined;
    /**
     * List my escrow deals
     */
    listEscrows(status?: EscrowStatus): Promise<EscrowDeal[]>;
    /**
     * Open payment channel
     */
    openChannel(counterpartyAddress: string, capacity: number, theirCapacity?: number): Promise<PaymentChannel>;
    /**
     * Pay through channel (off-chain)
     */
    channelPay(channelId: string, amount: number): ChannelState;
    /**
     * Receive channel payment
     */
    receiveChannelPayment(channelId: string, amount: number): ChannelState;
    /**
     * Close payment channel
     */
    closeChannel(channelId: string, cooperative?: boolean): PaymentChannel;
    /**
     * Get channel
     */
    getChannel(channelId: string): PaymentChannel | undefined;
    /**
     * List my channels
     */
    listChannels(status?: ChannelStatus): Promise<PaymentChannel[]>;
    /**
     * Get balance in specific channel
     */
    getChannelBalance(channelId: string): Promise<number>;
    private transferToPayment;
}
