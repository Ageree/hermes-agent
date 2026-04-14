"use strict";
/**
 * Payment channels for TypeScript
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelManager = void 0;
const types_1 = require("./types");
class ChannelManager {
    constructor() {
        this.channels = new Map();
    }
    /**
     * Propose new payment channel
     */
    proposeChannel(params) {
        const total = params.myCapacity + (params.theirCapacity || 0);
        const channelId = this.generateChannelId(params);
        const channel = {
            id: channelId,
            agentAAddress: params.myAddress,
            agentBAddress: params.counterpartyAddress,
            capacity: total,
            status: types_1.ChannelStatus.PENDING,
            statesHistory: [],
            currentState: {
                sequenceNumber: 0,
                balanceA: params.myCapacity,
                balanceB: params.theirCapacity || 0,
                timestamp: Date.now(),
            },
            createdAt: new Date(),
        };
        this.channels.set(channelId, channel);
        return channel;
    }
    /**
     * Accept channel proposal
     */
    acceptChannel(channelId) {
        const channel = this.getChannel(channelId);
        if (!channel)
            throw new Error(`Channel ${channelId} not found`);
        if (channel.status !== types_1.ChannelStatus.PENDING) {
            throw new Error('Channel not pending');
        }
        channel.status = types_1.ChannelStatus.OPEN;
        return channel;
    }
    /**
     * Fund channel
     */
    fundChannel(channelId, fundingTxHash) {
        const channel = this.getChannel(channelId);
        if (!channel)
            throw new Error(`Channel ${channelId} not found`);
        channel.fundingTxHash = fundingTxHash;
        channel.status = types_1.ChannelStatus.OPEN;
        return channel;
    }
    /**
     * Make off-chain payment
     */
    pay(channelId, amount, direction) {
        const channel = this.getChannel(channelId);
        if (!channel)
            throw new Error(`Channel ${channelId} not found`);
        if (channel.status !== types_1.ChannelStatus.OPEN) {
            throw new Error('Channel not open');
        }
        if (amount <= 0)
            throw new Error('Amount must be positive');
        const oldState = channel.currentState;
        let newState;
        if (direction === 'a_to_b') {
            if (oldState.balanceA < amount)
                throw new Error('Insufficient balance');
            newState = {
                sequenceNumber: oldState.sequenceNumber + 1,
                balanceA: oldState.balanceA - amount,
                balanceB: oldState.balanceB + amount,
                timestamp: Date.now(),
            };
        }
        else {
            if (oldState.balanceB < amount)
                throw new Error('Insufficient balance');
            newState = {
                sequenceNumber: oldState.sequenceNumber + 1,
                balanceA: oldState.balanceA + amount,
                balanceB: oldState.balanceB - amount,
                timestamp: Date.now(),
            };
        }
        // Simulate signatures
        newState.signatureA = `sig_a_${this.hashState(newState)}`;
        newState.signatureB = `sig_b_${this.hashState(newState)}`;
        channel.statesHistory.push(oldState);
        channel.currentState = newState;
        return newState;
    }
    /**
     * Cooperative close
     */
    closeCooperative(channelId) {
        const channel = this.getChannel(channelId);
        if (!channel)
            throw new Error(`Channel ${channelId} not found`);
        if (channel.status !== types_1.ChannelStatus.OPEN) {
            throw new Error('Channel not open');
        }
        channel.status = types_1.ChannelStatus.CLOSING;
        return channel;
    }
    /**
     * Force close
     */
    closeForce(channelId) {
        const channel = this.getChannel(channelId);
        if (!channel)
            throw new Error(`Channel ${channelId} not found`);
        if (!this.canForceClose(channel)) {
            throw new Error('Cannot force close yet');
        }
        channel.status = types_1.ChannelStatus.DISPUTED;
        return channel;
    }
    /**
     * Finalize close
     */
    finalizeClose(channelId, closingTxHash) {
        const channel = this.getChannel(channelId);
        if (!channel)
            throw new Error(`Channel ${channelId} not found`);
        channel.closingTxHash = closingTxHash;
        channel.status = types_1.ChannelStatus.CLOSED;
        return channel;
    }
    /**
     * Get channel
     */
    getChannel(channelId) {
        return this.channels.get(channelId);
    }
    /**
     * List channels
     */
    listChannels(myAddress, status) {
        let channels = Array.from(this.channels.values()).filter(c => c.agentAAddress === myAddress || c.agentBAddress === myAddress);
        if (status) {
            channels = channels.filter(c => c.status === status);
        }
        return channels;
    }
    /**
     * Get balance for specific address in channel
     */
    getBalance(channelId, myAddress) {
        const channel = this.getChannel(channelId);
        if (!channel)
            throw new Error(`Channel ${channelId} not found`);
        const state = channel.currentState;
        if (!state)
            throw new Error('No state');
        if (channel.agentAAddress === myAddress)
            return state.balanceA;
        if (channel.agentBAddress === myAddress)
            return state.balanceB;
        throw new Error('Not a participant');
    }
    /**
     * Check if can force close
     */
    canForceClose(channel) {
        if (channel.status !== types_1.ChannelStatus.OPEN)
            return false;
        if (!channel.expiresAt)
            return false;
        return new Date() > channel.expiresAt;
    }
    /**
     * Generate channel ID
     */
    generateChannelId(params) {
        const crypto = require('crypto');
        const total = params.myCapacity + (params.theirCapacity || 0);
        const data = `${params.myAddress}:${params.counterpartyAddress}:${total}:${Date.now()}`;
        return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
    }
    /**
     * Hash state for signatures
     */
    hashState(state) {
        const crypto = require('crypto');
        const data = `${state.sequenceNumber}:${state.balanceA}:${state.balanceB}:${state.timestamp}`;
        return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
    }
}
exports.ChannelManager = ChannelManager;
