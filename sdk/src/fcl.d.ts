declare module "@onflow/fcl" {
  interface ConfigInstance {
    put(key: string, value: string): ConfigInstance;
    get(key: string): Promise<string>;
  }

  interface UserSnapshot {
    addr: string | null;
    loggedIn: boolean;
  }

  interface CurrentUser {
    snapshot(): Promise<UserSnapshot>;
    subscribe(callback: (user: UserSnapshot) => void): () => void;
  }

  interface TransactionResult {
    status: number;
    statusCode: number;
    errorMessage: string;
    events: Array<{
      type: string;
      transactionId: string;
      transactionIndex: number;
      eventIndex: number;
      data: Record<string, unknown>;
    }>;
  }

  interface TransactionWatcher {
    onceSealed(): Promise<TransactionResult>;
    onceExecuted(): Promise<TransactionResult>;
    onceFinalized(): Promise<TransactionResult>;
    subscribe(callback: (tx: TransactionResult) => void): () => void;
  }

  type ArgFn = (value: string, type: string) => unknown;
  type TypeDefs = Record<string, string>;

  interface MutateOptions {
    cadence: string;
    args?: (arg: ArgFn, t: TypeDefs) => unknown[];
    limit?: number;
    proposer?: unknown;
    payer?: unknown;
    authorizations?: unknown[];
    authz?: unknown;
  }

  interface QueryOptions {
    cadence: string;
    args?: (arg: ArgFn, t: TypeDefs) => unknown[];
  }

  export function config(overrides?: Record<string, string>): ConfigInstance;
  export function authenticate(): Promise<UserSnapshot>;
  export function unauthenticate(): Promise<void>;
  export const currentUser: CurrentUser;
  export function mutate(opts: MutateOptions): Promise<string>;
  export function query(opts: QueryOptions): Promise<unknown>;
  export function tx(txId: string): TransactionWatcher;
  export function arg(value: string, type: string): unknown;
}
