/**
 * Stealth address management for TypeScript
 */
import { MoneroWalletRPC } from './wallet';
import { StealthAddress } from './types';
export declare class StealthAddressManager {
    private wallet;
    private accountIndex;
    private cache;
    constructor(wallet: MoneroWalletRPC, accountIndex?: number);
    /**
     * Generate new stealth address for receiving payment
     */
    generate(label?: string, purpose?: string): Promise<StealthAddress>;
    /**
     * Generate multiple stealth addresses at once
     */
    generateBatch(count: number, prefix?: string): Promise<StealthAddress[]>;
    /**
     * Mark address as used
     */
    markUsed(address: string): Promise<void>;
    /**
     * Check if address belongs to our wallet
     */
    isOurs(address: string): Promise<boolean>;
    /**
     * Get all unused stealth addresses
     */
    getUnused(): StealthAddress[];
    /**
     * Rotate to new address after use
     */
    rotate(oldAddress: string, purpose?: string): Promise<StealthAddress>;
}
