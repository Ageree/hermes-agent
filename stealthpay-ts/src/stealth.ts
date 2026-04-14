/**
 * Stealth address management for TypeScript
 */

import { MoneroWalletRPC } from './wallet';
import { StealthAddress } from './types';

export class StealthAddressManager {
  private cache: Map<number, StealthAddress> = new Map();

  constructor(
    private wallet: MoneroWalletRPC,
    private accountIndex: number = 0
  ) {}

  /**
   * Generate new stealth address for receiving payment
   */
  async generate(label?: string, purpose?: string): Promise<StealthAddress> {
    const fullLabel = purpose ? `${label || ''}:${purpose}`.replace(/^:/, '') : (label || '');
    
    const result = await this.wallet.createAddress(this.accountIndex, fullLabel);
    
    const stealth: StealthAddress = {
      address: result.address,
      index: result.address_index,
      label: label,
      createdAt: new Date(),
      used: false,
    };
    
    this.cache.set(stealth.index, stealth);
    return stealth;
  }

  /**
   * Generate multiple stealth addresses at once
   */
  async generateBatch(count: number, prefix?: string): Promise<StealthAddress[]> {
    const addresses: StealthAddress[] = [];
    
    for (let i = 0; i < count; i++) {
      const label = prefix ? `${prefix}-${i}` : `batch-${i}`;
      const addr = await this.generate(label);
      addresses.push(addr);
    }
    
    return addresses;
  }

  /**
   * Mark address as used
   */
  async markUsed(address: string): Promise<void> {
    try {
      const result = await this.wallet.getAddressIndex(address);
      const index = result.index.minor;
      const cached = this.cache.get(index);
      if (cached) {
        cached.used = true;
      }
    } catch {
      // Address not found or not ours
    }
  }

  /**
   * Check if address belongs to our wallet
   */
  async isOurs(address: string): Promise<boolean> {
    try {
      await this.wallet.getAddressIndex(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all unused stealth addresses
   */
  getUnused(): StealthAddress[] {
    return Array.from(this.cache.values()).filter(addr => !addr.used);
  }

  /**
   * Rotate to new address after use
   */
  async rotate(oldAddress: string, purpose?: string): Promise<StealthAddress> {
    await this.markUsed(oldAddress);
    return this.generate(undefined, purpose || 'rotated');
  }
}
