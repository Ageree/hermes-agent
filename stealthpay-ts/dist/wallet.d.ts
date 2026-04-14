/**
 * Monero wallet RPC client for TypeScript
 */
export interface RPCResponse<T = any> {
    id: string;
    jsonrpc: string;
    result?: T;
    error?: {
        code: number;
        message: string;
    };
}
export interface BalanceResponse {
    balance: number;
    unlocked_balance: number;
    blocks_to_unlock: number;
}
export interface AddressResponse {
    address: string;
    addresses: Array<{
        address: string;
        label: string;
        address_index: number;
        used: boolean;
    }>;
}
export interface TransferResponse {
    tx_hash: string;
    tx_key: string;
    amount: number;
    fee: number;
}
export interface Transfer {
    txid: string;
    payment_id: string;
    height: number;
    timestamp: number;
    amount: number;
    fee: number;
    note: string;
    confirmations: number;
    address: string;
    type: string;
}
export interface TransfersResponse {
    in?: Transfer[];
    out?: Transfer[];
    pending?: Transfer[];
    pool?: Transfer[];
    failed?: Transfer[];
}
export declare class MoneroWalletRPC {
    private host;
    private port;
    private user?;
    private password?;
    private timeout;
    private client;
    private url;
    constructor(host?: string, port?: number, user?: string | undefined, password?: string | undefined, timeout?: number);
    private call;
    getBalance(accountIndex?: number): Promise<BalanceResponse>;
    getAddress(accountIndex?: number): Promise<AddressResponse>;
    getHeight(): Promise<number>;
    transfer(destination: string, amount: number, priority?: number, mixin?: number): Promise<TransferResponse>;
    getTransfers(options?: {
        incoming?: boolean;
        outgoing?: boolean;
        pending?: boolean;
        failed?: boolean;
        pool?: boolean;
        minHeight?: number;
    }): Promise<TransfersResponse>;
    getTransferByTxid(txid: string): Promise<{
        transfer: Transfer;
    }>;
    createAddress(accountIndex?: number, label?: string): Promise<{
        address: string;
        address_index: number;
    }>;
    getAddressIndex(address: string): Promise<{
        index: {
            major: number;
            minor: number;
        };
    }>;
    labelAddress(index: {
        major: number;
        minor: number;
    }, label: string): Promise<void>;
}
export declare class WalletRPCError extends Error {
    constructor(message: string);
}
