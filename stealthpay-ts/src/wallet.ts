/**
 * Monero wallet RPC client for TypeScript
 */

import axios, { AxiosInstance, AxiosBasicCredentials } from 'axios';

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

export class MoneroWalletRPC {
  private client: AxiosInstance;
  private url: string;

  constructor(
    private host: string = '127.0.0.1',
    private port: number = 18082,
    private user?: string,
    private password?: string,
    private timeout: number = 30000
  ) {
    this.url = `http://${host}:${port}/json_rpc`;
    
    const auth: AxiosBasicCredentials | undefined = (user && password) 
      ? { username: user, password: password }
      : undefined;

    this.client = axios.create({
      timeout,
      auth: auth ? auth : undefined,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async call<T>(method: string, params?: Record<string, any>): Promise<T> {
    const payload = {
      jsonrpc: '2.0',
      id: '0',
      method,
      params: params || {},
    };

    try {
      const response = await this.client.post<RPCResponse<T>>(this.url, payload);
      
      if (response.data.error) {
        throw new WalletRPCError(response.data.error.message);
      }
      
      if (response.data.result === undefined) {
        throw new WalletRPCError('Empty response from RPC');
      }
      
      return response.data.result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new WalletRPCError(
            `Cannot connect to monero-wallet-rpc at ${this.url}. Make sure wallet is running.`
          );
        }
        throw new WalletRPCError(`RPC request failed: ${error.message}`);
      }
      throw error;
    }
  }

  // === Wallet Info ===

  async getBalance(accountIndex: number = 0): Promise<BalanceResponse> {
    return this.call('get_balance', { account_index: accountIndex });
  }

  async getAddress(accountIndex: number = 0): Promise<AddressResponse> {
    return this.call('get_address', { account_index: accountIndex });
  }

  async getHeight(): Promise<number> {
    const result = await this.call<{ height: number }>('get_height');
    return result.height;
  }

  // === Transfers ===

  async transfer(
    destination: string,
    amount: number,
    priority: number = 2,
    mixin: number = 10
  ): Promise<TransferResponse> {
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

  async getTransfers(options: {
    incoming?: boolean;
    outgoing?: boolean;
    pending?: boolean;
    failed?: boolean;
    pool?: boolean;
    minHeight?: number;
  } = {}): Promise<TransfersResponse> {
    const params: Record<string, any> = {
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

  async getTransferByTxid(txid: string): Promise<{ transfer: Transfer }> {
    return this.call('get_transfer_by_txid', { txid });
  }

  // === Subaddresses (Stealth) ===

  async createAddress(accountIndex: number = 0, label: string = ''): Promise<{
    address: string;
    address_index: number;
  }> {
    return this.call('create_address', {
      account_index: accountIndex,
      label,
    });
  }

  async getAddressIndex(address: string): Promise<{
    index: { major: number; minor: number };
  }> {
    return this.call('get_address_index', { address });
  }

  async labelAddress(index: { major: number; minor: number }, label: string): Promise<void> {
    await this.call('label_address', { index, label });
  }
}

export class WalletRPCError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletRPCError';
  }
}
