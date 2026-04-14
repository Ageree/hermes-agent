/**
 * Multi-signature escrow for TypeScript
 */
import { MoneroWalletRPC } from './wallet';
import { EscrowDeal, EscrowStatus } from './types';
export interface CreateEscrowParams {
    buyerAddress: string;
    sellerAddress: string;
    arbiterAddress: string;
    amount: number;
    description: string;
    timeoutHours?: number;
}
export declare class EscrowManager {
    private wallet;
    private deals;
    constructor(wallet: MoneroWalletRPC);
    /**
     * Create new escrow deal
     */
    createDeal(params: CreateEscrowParams): EscrowDeal;
    /**
     * Mark deal as funded
     */
    fundDeal(dealId: string, txHash: string, multisigAddress: string): EscrowDeal;
    /**
     * Seller marks work as delivered
     */
    markDelivered(dealId: string): EscrowDeal;
    /**
     * Buyer releases funds to seller
     */
    release(dealId: string, buyerSignature: string): EscrowDeal;
    /**
     * Open dispute
     */
    openDispute(dealId: string, reason: string, openedBy: string): EscrowDeal;
    /**
     * Arbiter makes decision
     */
    arbitrate(dealId: string, decision: 'release' | 'refund', arbiterSignature: string): EscrowDeal;
    /**
     * Get deal by ID
     */
    getDeal(dealId: string): EscrowDeal | undefined;
    /**
     * List deals
     */
    listDeals(address?: string, status?: EscrowStatus): EscrowDeal[];
    /**
     * Check if deal can be released
     */
    private canRelease;
    /**
     * Generate unique deal ID
     */
    private generateDealId;
}
