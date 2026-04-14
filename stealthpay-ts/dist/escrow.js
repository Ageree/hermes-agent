"use strict";
/**
 * Multi-signature escrow for TypeScript
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscrowManager = void 0;
const types_1 = require("./types");
class EscrowManager {
    constructor(wallet) {
        this.wallet = wallet;
        this.deals = new Map();
    }
    /**
     * Create new escrow deal
     */
    createDeal(params) {
        const dealId = this.generateDealId(params);
        const deal = {
            id: dealId,
            status: types_1.EscrowStatus.PENDING,
            buyer: { role: 'buyer', address: params.buyerAddress },
            seller: { role: 'seller', address: params.sellerAddress },
            arbiter: { role: 'arbiter', address: params.arbiterAddress },
            amount: params.amount,
            description: params.description,
            createdAt: new Date(),
            timeoutHours: params.timeoutHours || 48,
        };
        this.deals.set(dealId, deal);
        return deal;
    }
    /**
     * Mark deal as funded
     */
    fundDeal(dealId, txHash, multisigAddress) {
        const deal = this.getDeal(dealId);
        if (!deal)
            throw new Error(`Deal ${dealId} not found`);
        if (deal.status !== types_1.EscrowStatus.PENDING) {
            throw new Error(`Cannot fund deal in status ${deal.status}`);
        }
        deal.status = types_1.EscrowStatus.FUNDED;
        deal.multisigAddress = multisigAddress;
        deal.depositTxHash = txHash;
        deal.fundedAt = new Date();
        return deal;
    }
    /**
     * Seller marks work as delivered
     */
    markDelivered(dealId) {
        const deal = this.getDeal(dealId);
        if (!deal)
            throw new Error(`Deal ${dealId} not found`);
        if (deal.status !== types_1.EscrowStatus.FUNDED) {
            throw new Error(`Cannot mark delivered in status ${deal.status}`);
        }
        deal.status = types_1.EscrowStatus.DELIVERED;
        return deal;
    }
    /**
     * Buyer releases funds to seller
     */
    release(dealId, buyerSignature) {
        const deal = this.getDeal(dealId);
        if (!deal)
            throw new Error(`Deal ${dealId} not found`);
        if (!this.canRelease(deal)) {
            throw new Error(`Cannot release in status ${deal.status}`);
        }
        deal.buyer.signature = buyerSignature;
        deal.status = types_1.EscrowStatus.COMPLETED;
        deal.completedAt = new Date();
        return deal;
    }
    /**
     * Open dispute
     */
    openDispute(dealId, reason, openedBy) {
        const deal = this.getDeal(dealId);
        if (!deal)
            throw new Error(`Deal ${dealId} not found`);
        if (![types_1.EscrowStatus.FUNDED, types_1.EscrowStatus.DELIVERED].includes(deal.status)) {
            throw new Error(`Cannot dispute in status ${deal.status}`);
        }
        deal.status = types_1.EscrowStatus.DISPUTED;
        deal.disputedBy = openedBy;
        deal.disputeReason = reason;
        return deal;
    }
    /**
     * Arbiter makes decision
     */
    arbitrate(dealId, decision, arbiterSignature) {
        const deal = this.getDeal(dealId);
        if (!deal)
            throw new Error(`Deal ${dealId} not found`);
        if (deal.status !== types_1.EscrowStatus.DISPUTED) {
            throw new Error(`Cannot arbitrate in status ${deal.status}`);
        }
        deal.arbiterDecision = decision;
        deal.arbiter.signature = arbiterSignature;
        if (decision === 'release') {
            deal.status = types_1.EscrowStatus.COMPLETED;
            deal.completedAt = new Date();
        }
        else {
            deal.status = types_1.EscrowStatus.REFUNDED;
        }
        return deal;
    }
    /**
     * Get deal by ID
     */
    getDeal(dealId) {
        return this.deals.get(dealId);
    }
    /**
     * List deals
     */
    listDeals(address, status) {
        let deals = Array.from(this.deals.values());
        if (address) {
            deals = deals.filter(d => d.buyer.address === address ||
                d.seller.address === address ||
                d.arbiter.address === address);
        }
        if (status) {
            deals = deals.filter(d => d.status === status);
        }
        return deals;
    }
    /**
     * Check if deal can be released
     */
    canRelease(deal) {
        return [types_1.EscrowStatus.FUNDED, types_1.EscrowStatus.DELIVERED].includes(deal.status);
    }
    /**
     * Generate unique deal ID
     */
    generateDealId(params) {
        const crypto = require('crypto');
        const data = `${params.buyerAddress}:${params.sellerAddress}:${params.amount}:${Date.now()}`;
        return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
    }
}
exports.EscrowManager = EscrowManager;
