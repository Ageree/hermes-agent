/**
 * Payment channels for TypeScript
 */
import { PaymentChannel, ChannelState, ChannelStatus } from './types';
export interface OpenChannelParams {
    myAddress: string;
    counterpartyAddress: string;
    myCapacity: number;
    theirCapacity?: number;
}
export declare class ChannelManager {
    private channels;
    /**
     * Propose new payment channel
     */
    proposeChannel(params: OpenChannelParams): PaymentChannel;
    /**
     * Accept channel proposal
     */
    acceptChannel(channelId: string): PaymentChannel;
    /**
     * Fund channel
     */
    fundChannel(channelId: string, fundingTxHash: string): PaymentChannel;
    /**
     * Make off-chain payment
     */
    pay(channelId: string, amount: number, direction: 'a_to_b' | 'b_to_a'): ChannelState;
    /**
     * Cooperative close
     */
    closeCooperative(channelId: string): PaymentChannel;
    /**
     * Force close
     */
    closeForce(channelId: string): PaymentChannel;
    /**
     * Finalize close
     */
    finalizeClose(channelId: string, closingTxHash: string): PaymentChannel;
    /**
     * Get channel
     */
    getChannel(channelId: string): PaymentChannel | undefined;
    /**
     * List channels
     */
    listChannels(myAddress: string, status?: ChannelStatus): PaymentChannel[];
    /**
     * Get balance for specific address in channel
     */
    getBalance(channelId: string, myAddress: string): number;
    /**
     * Check if can force close
     */
    private canForceClose;
    /**
     * Generate channel ID
     */
    private generateChannelId;
    /**
     * Hash state for signatures
     */
    private hashState;
}
