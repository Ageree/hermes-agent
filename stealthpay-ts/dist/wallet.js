"use strict";
/**
 * Monero wallet RPC client for TypeScript
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletRPCError = exports.MoneroWalletRPC = void 0;
const axios_1 = __importDefault(require("axios"));
class MoneroWalletRPC {
    constructor(host = '127.0.0.1', port = 18082, user, password, timeout = 30000) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.timeout = timeout;
        this.url = `http://${host}:${port}/json_rpc`;
        const auth = (user && password)
            ? { username: user, password: password }
            : undefined;
        this.client = axios_1.default.create({
            timeout,
            auth: auth ? auth : undefined,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async call(method, params) {
        const payload = {
            jsonrpc: '2.0',
            id: '0',
            method,
            params: params || {},
        };
        try {
            const response = await this.client.post(this.url, payload);
            if (response.data.error) {
                throw new WalletRPCError(response.data.error.message);
            }
            if (response.data.result === undefined) {
                throw new WalletRPCError('Empty response from RPC');
            }
            return response.data.result;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    throw new WalletRPCError(`Cannot connect to monero-wallet-rpc at ${this.url}. Make sure wallet is running.`);
                }
                throw new WalletRPCError(`RPC request failed: ${error.message}`);
            }
            throw error;
        }
    }
    // === Wallet Info ===
    async getBalance(accountIndex = 0) {
        return this.call('get_balance', { account_index: accountIndex });
    }
    async getAddress(accountIndex = 0) {
        return this.call('get_address', { account_index: accountIndex });
    }
    async getHeight() {
        const result = await this.call('get_height');
        return result.height;
    }
    // === Transfers ===
    async transfer(destination, amount, priority = 2, mixin = 10) {
        // Convert XMR to atomic units
        const atomicAmount = Math.floor(amount * 1e12);
        const params = {
            destinations: [{ address: destination, amount: atomicAmount }],
            priority,
            ring_size: mixin + 1,
            get_tx_key: true,
        };
        return this.call('transfer', params);
    }
    async getTransfers(options = {}) {
        const params = {
            in: options.incoming ?? true,
            out: options.outgoing ?? true,
            pending: options.pending ?? true,
            failed: options.failed ?? false,
            pool: options.pool ?? true,
        };
        if (options.minHeight !== undefined) {
            params.filter_by_height = true;
            params.min_height = options.minHeight;
        }
        return this.call('get_transfers', params);
    }
    async getTransferByTxid(txid) {
        return this.call('get_transfer_by_txid', { txid });
    }
    // === Subaddresses (Stealth) ===
    async createAddress(accountIndex = 0, label = '') {
        return this.call('create_address', {
            account_index: accountIndex,
            label,
        });
    }
    async getAddressIndex(address) {
        return this.call('get_address_index', { address });
    }
    async labelAddress(index, label) {
        await this.call('label_address', { index, label });
    }
}
exports.MoneroWalletRPC = MoneroWalletRPC;
class WalletRPCError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WalletRPCError';
    }
}
exports.WalletRPCError = WalletRPCError;
