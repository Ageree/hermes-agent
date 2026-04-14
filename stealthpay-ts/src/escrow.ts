/**
 * Multi-signature escrow for TypeScript
 */

import { MoneroWalletRPC } from './wallet';
import { EscrowDeal, EscrowStatus, EscrowParticipant } from './types';

export interface CreateEscrowParams {
  buyerAddress: string;
  sellerAddress: string;
  arbiterAddress: string;
  amount: number;
  description: string;
  timeoutHours?: number;
}

export class EscrowManager {
  private deals: Map<string, EscrowDeal> = new Map();

  constructor(private wallet: MoneroWalletRPC) {}

  /**
   * Create new escrow deal
   */
  createDeal(params: CreateEscrowParams): EscrowDeal {
    const dealId = this.generateDealId(params);
    
    const deal: EscrowDeal = {
      id: dealId,
      status: EscrowStatus.PENDING,
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
  fundDeal(dealId: string, txHash: string, multisigAddress: string): EscrowDeal {
    const deal = this.getDeal(dealId);
    if (!deal) throw new Error(`Deal ${dealId} not found`);
    if (deal.status !== EscrowStatus.PENDING) {
      throw new Error(`Cannot fund deal in status ${deal.status}`);
    }

    deal.status = EscrowStatus.FUNDED;
    deal.multisigAddress = multisigAddress;
    deal.depositTxHash = txHash;
    deal.fundedAt = new Date();
    
    return deal;
  }

  /**
   * Seller marks work as delivered
   */
  markDelivered(dealId: string): EscrowDeal {
    const deal = this.getDeal(dealId);
    if (!deal) throw new Error(`Deal ${dealId} not found`);
    if (deal.status !== EscrowStatus.FUNDED) {
      throw new Error(`Cannot mark delivered in status ${deal.status}`);
    }

    deal.status = EscrowStatus.DELIVERED;
    return deal;
  }

  /**
   * Buyer releases funds to seller
   */
  release(dealId: string, buyerSignature: string): EscrowDeal {
    const deal = this.getDeal(dealId);
    if (!deal) throw new Error(`Deal ${dealId} not found`);
    
    if (!this.canRelease(deal)) {
      throw new Error(`Cannot release in status ${deal.status}`);
    }

    deal.buyer.signature = buyerSignature;
    deal.status = EscrowStatus.COMPLETED;
    deal.completedAt = new Date();
    
    return deal;
  }

  /**
   * Open dispute
   */
  openDispute(dealId: string, reason: string, openedBy: string): EscrowDeal {
    const deal = this.getDeal(dealId);
    if (!deal) throw new Error(`Deal ${dealId} not found`);
    
    if (![EscrowStatus.FUNDED, EscrowStatus.DELIVERED].includes(deal.status)) {
      throw new Error(`Cannot dispute in status ${deal.status}`);
    }

    deal.status = EscrowStatus.DISPUTED;
    deal.disputedBy = openedBy;
    deal.disputeReason = reason;
    
    return deal;
  }

  /**
   * Arbiter makes decision
   */
  arbitrate(
    dealId: string,
    decision: 'release' | 'refund',
    arbiterSignature: string
  ): EscrowDeal {
    const deal = this.getDeal(dealId);
    if (!deal) throw new Error(`Deal ${dealId} not found`);
    if (deal.status !== EscrowStatus.DISPUTED) {
      throw new Error(`Cannot arbitrate in status ${deal.status}`);
    }

    deal.arbiterDecision = decision;
    deal.arbiter.signature = arbiterSignature;
    
    if (decision === 'release') {
      deal.status = EscrowStatus.COMPLETED;
      deal.completedAt = new Date();
    } else {
      deal.status = EscrowStatus.REFUNDED;
    }
    
    return deal;
  }

  /**
   * Get deal by ID
   */
  getDeal(dealId: string): EscrowDeal | undefined {
    return this.deals.get(dealId);
  }

  /**
   * List deals
   */
  listDeals(address?: string, status?: EscrowStatus): EscrowDeal[] {
    let deals = Array.from(this.deals.values());

    if (address) {
      deals = deals.filter(d => 
        d.buyer.address === address ||
        d.seller.address === address ||
        d.arbiter.address === address
      );
    }

    if (status) {
      deals = deals.filter(d => d.status === status);
    }

    return deals;
  }

  /**
   * Check if deal can be released
   */
  private canRelease(deal: EscrowDeal): boolean {
    return [EscrowStatus.FUNDED, EscrowStatus.DELIVERED].includes(deal.status);
  }

  /**
   * Generate unique deal ID
   */
  private generateDealId(params: CreateEscrowParams): string {
    const crypto = require('crypto');
    const data = `${params.buyerAddress}:${params.sellerAddress}:${params.amount}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }
}
