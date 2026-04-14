"use strict";
/**
 * Stealth address management for TypeScript
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StealthAddressManager = void 0;
class StealthAddressManager {
    constructor(wallet, accountIndex = 0) {
        this.wallet = wallet;
        this.accountIndex = accountIndex;
        this.cache = new Map();
    }
    /**
     * Generate new stealth address for receiving payment
     */
    async generate(label, purpose) {
        const fullLabel = purpose ? `${label || ''}:${purpose}`.replace(/^:/, '') : (label || '');
        const result = await this.wallet.createAddress(this.accountIndex, fullLabel);
        const stealth = {
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
    async generateBatch(count, prefix) {
        const addresses = [];
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
    async markUsed(address) {
        try {
            const result = await this.wallet.getAddressIndex(address);
            const index = result.index.minor;
            const cached = this.cache.get(index);
            if (cached) {
                cached.used = true;
            }
        }
        catch {
            // Address not found or not ours
        }
    }
    /**
     * Check if address belongs to our wallet
     */
    async isOurs(address) {
        try {
            await this.wallet.getAddressIndex(address);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get all unused stealth addresses
     */
    getUnused() {
        return Array.from(this.cache.values()).filter(addr => !addr.used);
    }
    /**
     * Rotate to new address after use
     */
    async rotate(oldAddress, purpose) {
        await this.markUsed(oldAddress);
        return this.generate(undefined, purpose || 'rotated');
    }
}
exports.StealthAddressManager = StealthAddressManager;
