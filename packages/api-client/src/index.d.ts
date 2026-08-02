import type {
  ActiveMarketsData,
  CurrentNavData,
  EndpointId,
  HomeBootstrapData,
  PositionsData,
  ProgramIntegrityData,
  ProposalArchiveData,
  ProposalHistoryData,
  ProposalMarketData,
  RecurringConfigData,
  DecisionAttestData,
  SpotOrderData,
  SpotSubmitData,
} from '@01resolved/contracts';

export interface ClientCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface JsonTransport {
  json(url: string, options?: {
    cancelSignal?: AbortSignal;
    timeoutMs?: number;
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: string;
  }): Promise<unknown>;
}

export interface CreateClientOptions {
  baseUrl?: string;
  futarchyReadBaseUrl?: string;
  futarchyExecutionBaseUrl?: string;
  timeoutMs?: number;
  transport: JsonTransport;
}

export interface FutarchyClient {
  activeMarkets(options?: ClientCallOptions): Promise<ActiveMarketsData>;
  proposals(query?: {
    token?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }, options?: ClientCallOptions): Promise<ProposalArchiveData>;
  proposalHistory(query: { proposal: string; interval?: string }, options?: ClientCallOptions): Promise<ProposalHistoryData>;
  marketData(query: {
    proposal: string;
    owner?: string;
    limit?: number;
    cursor?: string;
  }, options?: ClientCallOptions): Promise<ProposalMarketData>;
  programIntegrity(options?: ClientCallOptions): Promise<ProgramIntegrityData>;
  positions(query: { owner: string; proposal: string }, options?: ClientCallOptions): Promise<PositionsData>;
  recurringConfig(options?: ClientCallOptions): Promise<RecurringConfigData>;
  solanaRpcUrl(): string;
}

export interface TradingClient {
  decisionAttest(body: {
    transaction: string;
  }, options?: ClientCallOptions): Promise<DecisionAttestData>;
  spotOrder(body: {
    token: string;
    side: 'buy' | 'sell';
    amount: string;
    slippageBps?: number;
    owner?: string;
  }, options?: ClientCallOptions): Promise<SpotOrderData>;
  spotSubmit(body: {
    signedTransaction: string;
    reviewToken: string;
  }, options?: ClientCallOptions): Promise<SpotSubmitData>;
}

export function create01ResolvedClient(options: CreateClientOptions): {
  readonly contractRelease: string;
  endpointBaseUrl(endpointId: EndpointId): string;
  endpointUrl(
    endpointId: EndpointId,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): string;
  readonly core: {
    currentNav(query?: {
      token?: string;
      includeInactive?: boolean;
      compact?: boolean;
      includeDaoBreakdown?: boolean;
      cache?: boolean;
    }, options?: ClientCallOptions): Promise<CurrentNavData | Record<string, unknown>>;
    homeBootstrap(query?: { cacheOnly?: boolean }, options?: ClientCallOptions): Promise<HomeBootstrapData>;
  };
  readonly futarchy: FutarchyClient;
  readonly trading: TradingClient;
};
