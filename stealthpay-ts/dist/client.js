"use strict";
/**
 * Main StealthPay client for TypeScript
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StealthPay = void 0;
const wallet_1 = require("./wallet");
const stealth_1 = require("./stealth");
const escrow_1 = require("./escrow");
const channels_1 = require("./channels");
const types_1 = require("./types");
class StealthPay {
    /**
     * Create StealthPay client
     */
    constructor(config) {
        this.wallet = new wallet_1.MoneroWalletRPC(config.rpcHost, config.rpcPort, config.rpcUser, config.rpcPass);
        this.accountIndex = config.accountIndex ?? 0;
        this.stealth = new stealth_1.StealthAddressManager(this.wallet, this.accountIndex);
        this.escrow = new escrow_1.EscrowManager(this.wallet);
        this.channels = new channels_1.ChannelManager();
        // Verify connection
        this.wallet.getHeight().catch((e) => {
            throw new ConnectionError(`Cannot connect to Monero wallet RPC: ${e.message}`);
        });
    }
    /**
     * Create client from environment variables
     */
    static fromEnv() {
        return new StealthPay({
            rpcHost: process.env.MONERO_RPC_HOST || '127.0.0.1',
            rpcPort: parseInt(process.env.MONERO_RPC_PORT || '18082'),
            rpcUser: process.env.MONERO_RPC_USER,
            rpcPass: process.env.MONERO_RPC_PASS,
        });
    }
    // === Wallet Info ===
    /**
     * Get wallet information
     */
    async getInfo() {
        const [balanceResult, addrResult, height] = await Promise.all([
            this.wallet.getBalance(this.accountIndex),
            this.wallet.getAddress(this.accountIndex),
            this.wallet.getHeight(),
        ]);
        const balance = balanceResult.balance / 1e12;
        const unlockedBalance = balanceResult.unlocked_balance / 1e12;
        return {
            address: addrResult.address,
            primaryAddress: addrResult.address,
            balance,
            unlockedBalance,
            height,
            viewOnly: false,
        };
    }
    /**
     * Get current balance
     */
    async getBalance() {
        const info = await this.getInfo();
        return info.balance;
    }
    /**
     * Get wallet address
     */
    async getAddress() {
        const result = await this.wallet.getAddress(this.accountIndex);
        return result.address;
    }
    // === Stealth Addresses ===
    /**
     * Create stealth address for receiving payment
     */
    async createStealthAddress(label, purpose) {
        return this.stealth.generate(label, purpose);
    }
    /**
     * Create multiple stealth addresses
     */
    async createStealthBatch(count) {
        return this.stealth.generateBatch(count, 'payment');
    }
    // === Payments ===
    /**
     * Send anonymous payment
     */
    async pay(toAddress, amount, options = {}) {
        if (amount <= 0)
            throw new Error('Amount must be positive');
        const result = await this.wallet.transfer(toAddress, amount, options.priority ?? 2, options.mixin ?? 10);
        return {
            txHash: result.tx_hash,
            amount,
            fromAddress: null, // Hidden in Monero
            toAddress,
            status: types_1.PaymentStatus.PENDING,
            confirmations: 0,
            fee: result.fee / 1e12,
            timestamp: new Date(),
            memo: options.memo,
        };
    }
    /**
     * Get payment by tx hash
     */
    async getPayment(txHash) {
        try {
            const result = await this.wallet.getTransferByTxid(txHash);
            return this.transferToPayment(result.transfer);
        }
        catch {
            return null;
        }
    }
    /**
     * Get payment history
     */
    async getPayments(options = {}) {
        const result = await this.wallet.getTransfers({
            incoming: options.incoming ?? true,
            outgoing: options.outgoing ?? true,
        });
        const payments = [];
        for (const key of ['in', 'out', 'pending', 'pool']) {
            const transfers = result[key];
            if (transfers) {
                for (const transfer of transfers) {
                    payments.push(this.transferToPayment(transfer));
                }
            }
        }
        // Sort by timestamp desc
        payments.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        if (options.limit) {
            return payments.slice(0, options.limit);
        }
        return payments;
    }
    /**
     * Wait for transaction confirmation
     */
    async waitForConfirmation(txHash, options = {}) {
        const confirmations = options.confirmations ?? 10;
        const timeout = options.timeout ?? 600000; // 10 min
        const pollInterval = options.pollInterval ?? 10000; // 10 sec
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const payment = await this.getPayment(txHash);
            if (payment && payment.confirmations >= confirmations) {
                return payment;
            }
            await sleep(pollInterval);
        }
        throw new Error(`Transaction ${txHash} not confirmed within ${timeout}ms`);
    }
    // === Escrow ===
    /**
     * Create escrow deal
     */
    async createEscrow(sellerAddress, arbiterAddress, amount, description, timeoutHours = 48) {
        const myAddress = await this.getAddress();
        return this.escrow.createDeal({
            buyerAddress: myAddress,
            sellerAddress,
            arbiterAddress,
            amount,
            description,
            timeoutHours,
        });
    }
    /**
     * Fund escrow deal
     */
    async fundEscrow(dealId, multisigAddress) {
        const txHash = 'placeholder_tx'; // Would be real transaction
        return this.escrow.fundDeal(dealId, txHash, multisigAddress);
    }
    /**
     * Release escrow to seller
     */
    async releaseEscrow(dealId) {
        return this.escrow.release(dealId, 'my_signature');
    }
    /**
     * Open dispute on escrow
     */
    async disputeEscrow(dealId, reason) {
        const myAddress = await this.getAddress();
        return this.escrow.openDispute(dealId, reason, myAddress);
    }
    /**
     * Get escrow deal
     */
    getEscrow(dealId) {
        return this.escrow.getDeal(dealId);
    }
    /**
     * List my escrow deals
     */
    async listEscrows(status) {
        const myAddress = await this.getAddress();
        return this.escrow.listDeals(myAddress, status);
    }
    // === Payment Channels ===
    /**
     * Open payment channel
     */
    async openChannel(counterpartyAddress, capacity, theirCapacity = 0) {
        const myAddress = await this.getAddress();
        return this.channels.proposeChannel({
            myAddress,
            counterpartyAddress,
            myCapacity: capacity,
            theirCapacity,
        });
    }
    /**
     * Pay through channel (off-chain)
     */
    channelPay(channelId, amount) {
        return this.channels.pay(channelId, amount, 'a_to_b');
    }
    /**
     * Receive channel payment
     */
    receiveChannelPayment(channelId, amount) {
        return this.channels.pay(channelId, amount, 'b_to_a');
    }
    /**
     * Close payment channel
     */
    closeChannel(channelId, cooperative = true) {
        if (cooperative) {
            return this.channels.closeCooperative(channelId);
        }
        return this.channels.closeForce(channelId);
    }
    /**
     * Get channel
     */
    getChannel(channelId) {
        return this.channels.getChannel(channelId);
    }
    /**
     * List my channels
     */
    async listChannels(status) {
        const myAddress = await this.getAddress();
        return this.channels.listChannels(myAddress, status);
    }
    /**
     * Get balance in specific channel
     */
    async getChannelBalance(channelId) {
        const myAddress = await this.getAddress();
        return this.channels.getBalance(channelId, myAddress);
    }
    // === Private ===
    transferToPayment(transfer) {
        const amount = Math.abs(transfer.amount) / 1e12;
        const fee = transfer.fee / 1e12;
        const isOutgoing = transfer.amount < 0;
        return {
            txHash: transfer.txid,
            amount,
            fromAddress: isOutgoing ? null : transfer.address,
            toAddress: transfer.address,
            status: transfer.confirmations >= 10
                ? types_1.PaymentStatus.CONFIRMED
                : types_1.PaymentStatus.PENDING,
            confirmations: transfer.confirmations || 0,
            fee,
            timestamp: new Date(transfer.timestamp * 1000),
        };
    }
}
exports.StealthPay = StealthPay;
class ConnectionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConnectionError';
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
