export type ApiSurface = 'stable' | 'beta';
export type EndpointId =
  | 'core.currentNav'
  | 'core.homeBootstrap'
  | 'futarchy.activeMarkets'
  | 'futarchy.proposals'
  | 'futarchy.proposalHistory'
  | 'futarchy.marketData'
  | 'futarchy.programIntegrity'
  | 'futarchy.positions'
  | 'futarchy.recurringConfig'
  | 'futarchy.solanaRpc'
  | 'trading.decisionAttest'
  | 'trading.spotOrder'
  | 'trading.spotSubmit';

export interface EndpointDefinition {
  readonly id: EndpointId;
  readonly auth: 'public' | 'session';
  readonly contract: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly query: readonly string[];
  readonly required: readonly string[];
  readonly surface: ApiSurface;
  readonly view?: string;
}

export interface DegradedState {
  readonly active: boolean;
  readonly services: readonly string[];
  readonly issues?: readonly Record<string, unknown>[];
}

export interface ActiveMarketsData {
  readonly asOf?: string;
  readonly slot?: number | null;
  readonly pendingProposalCount?: number;
  readonly markets: readonly Record<string, unknown>[];
  readonly degraded?: DegradedState;
  readonly source?: Record<string, unknown>;
}

export interface ProposalArchiveData {
  readonly asOf?: string;
  readonly proposals: readonly Record<string, unknown>[];
  readonly summary?: Record<string, number>;
  readonly pagination?: {
    readonly limit?: number;
    readonly returned?: number;
    readonly total?: number;
    readonly nextCursor?: string | null;
  };
  readonly degraded?: DegradedState;
  readonly source?: Record<string, unknown>;
}

export interface ProposalHistoryPoint {
  readonly timestamp: string;
  readonly observedAt?: string | null;
  readonly underlyingPrice?: number | null;
  readonly passPrice?: number | null;
  readonly failPrice?: number | null;
  readonly passTwap?: number | null;
  readonly failTwap?: number | null;
  readonly sampleCount?: number;
}

export interface ProposalHistoryData {
  readonly proposalId: string;
  readonly interval: string;
  readonly availability?: string;
  readonly preTwap?: string | null;
  readonly series: readonly ProposalHistoryPoint[];
  readonly summary?: Record<string, unknown>;
  readonly degraded?: DegradedState;
  readonly source?: Record<string, unknown>;
}

export interface ProposalMarketData {
  readonly proposalId: string;
  readonly asOf?: string;
  readonly slot?: number | null;
  readonly cluster?: string;
  readonly books: Readonly<Record<string, unknown>>;
  readonly recentTrades?: readonly Record<string, unknown>[];
  readonly pagination?: {
    readonly page?: number;
    readonly limit?: number;
    readonly returned?: number;
    readonly indexed?: number;
    readonly total?: number | null;
    readonly nextCursor?: string | null;
    readonly complete?: boolean;
  };
  readonly openOrders?: readonly Record<string, unknown>[];
  readonly degraded?: DegradedState;
}

export interface ProgramIntegrityProgram {
  readonly key: string;
  readonly label: string;
  readonly programId: string;
  readonly programDataAddress: string;
  readonly expectedDeploymentSlot: string;
  readonly observedDeploymentSlot: string | null;
  readonly upgradeAuthority: string;
  readonly observedUpgradeAuthority: string | null;
  readonly status: 'verified' | 'mismatch' | 'unchecked';
}

export interface ProgramIntegrityData {
  readonly status: 'verified' | 'blocked' | 'unavailable';
  readonly canTransact: boolean;
  readonly cluster: 'solana:mainnet';
  readonly checkedAt: string;
  readonly rpcSlot: number | null;
  readonly programs: readonly ProgramIntegrityProgram[];
  readonly issues: readonly {
    readonly code: string;
    readonly program?: string;
    readonly message: string;
  }[];
}

export interface PositionsData {
  readonly owner: string;
  readonly proposal?: Record<string, unknown>;
  readonly proposalId?: string;
  readonly asOf?: string;
  readonly slot?: number | null;
  readonly balances: readonly Record<string, unknown>[];
  readonly degraded?: DegradedState;
}

export interface RecurringConfigData {
  readonly enabled: boolean;
  readonly keeperReady: boolean;
  readonly programId: string | null;
  readonly minimumIntervalSeconds: number;
  readonly maximumCycles: number;
}

export interface HomeBootstrapData {
  readonly builtAt?: string;
  readonly tokens?: readonly Record<string, unknown>[];
  readonly currentNav?: Record<string, unknown>;
  readonly marketTickers?: Record<string, unknown>;
}

export interface CurrentNavData {
  readonly asOf?: string;
  readonly publicationGateApplied?: boolean;
  readonly preview?: boolean;
  readonly source?: Record<string, unknown>;
  readonly tokens: readonly Record<string, unknown>[];
}

export interface SpotOrderQuote {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inputDecimals: number;
  readonly outputDecimals: number;
  readonly inAmountRaw: string;
  readonly outAmountRaw: string;
  readonly minimumAmountOutRaw: string;
  readonly amountIn: string;
  readonly estimatedAmountOut: string;
  readonly minimumAmountOut: string;
  readonly priceImpactPercent: number;
  readonly slippageBps: number;
  readonly platformFeeBps: number;
  readonly contextSlot: number;
  readonly lastValidBlockHeight: number | null;
  readonly route: readonly {
    readonly venue: string;
    readonly marketKey: string;
  }[];
}

export interface SpotOrderData {
  readonly cluster: 'solana:mainnet';
  readonly token: string;
  readonly ticker: string;
  readonly name: string;
  readonly side: 'buy' | 'sell';
  readonly owner: string | null;
  readonly amount: string;
  readonly quote: SpotOrderQuote;
  readonly transaction: string | null;
  readonly reviewToken: string | null;
  readonly review: {
    readonly transactionFingerprint: string;
    readonly feePayer: string;
    readonly programIds: readonly string[];
    readonly simulation: {
      readonly ok: boolean;
      readonly error: string;
      readonly logs: readonly string[];
      readonly unitsConsumed: number | null;
    };
    readonly networkFeeLamports: number | null;
  } | null;
}

export interface SpotSubmitData {
  readonly cluster: 'solana:mainnet';
  readonly signature: string;
  readonly status: 'submitted';
}

export interface DecisionAttestData {
  readonly authority: string;
  readonly cluster: 'solana:mainnet';
  readonly feeBps: 0;
  readonly inputAmountRaw: string;
  readonly marker: string;
  readonly minimumOutputAmountRaw: string;
  readonly outcome: 'pass' | 'fail';
  readonly proposal: string;
  readonly side: 'buy' | 'sell';
  readonly trader: string;
  readonly transaction: string;
  readonly venue: 'futarchy_amm' | 'manifest';
  readonly version: 1;
}

export interface EndpointResponseMap {
  readonly 'core.currentNav': CurrentNavData | Record<string, unknown>;
  readonly 'core.homeBootstrap': HomeBootstrapData;
  readonly 'futarchy.activeMarkets': ActiveMarketsData;
  readonly 'futarchy.proposals': ProposalArchiveData;
  readonly 'futarchy.proposalHistory': ProposalHistoryData;
  readonly 'futarchy.marketData': ProposalMarketData;
  readonly 'futarchy.programIntegrity': ProgramIntegrityData;
  readonly 'futarchy.positions': PositionsData;
  readonly 'futarchy.recurringConfig': RecurringConfigData;
  readonly 'futarchy.solanaRpc': unknown;
  readonly 'trading.decisionAttest': DecisionAttestData;
  readonly 'trading.spotOrder': SpotOrderData;
  readonly 'trading.spotSubmit': SpotSubmitData;
}

export const CONTRACT_RELEASE: string;
export const CONTRACT_HEADERS: Readonly<
  Record<'contract' | 'execution' | 'release' | 'surface', string>
>;
export const API_SURFACES: Readonly<Record<'STABLE' | 'BETA', ApiSurface>>;
export const DECISION_ATTRIBUTION: Readonly<{
  feeBps: 0;
  marker: string;
  memoProgramId: string;
  version: 1;
}>;
export const EXECUTION_RELEASE: Readonly<{
  code: 'MAINNET_EXECUTION_ENABLED';
  enabled: true;
  message: string;
  phase: 'mainnet-execution-v1';
}>;
export const API_ENDPOINTS: Readonly<Record<EndpointId, EndpointDefinition>>;
export const FUTARCHY_STABLE_V1_VIEWS: readonly string[];
export const FUTARCHY_BETA_VIEWS: readonly string[];
export const TRADING_BETA_VIEWS: readonly string[];
export function getEndpoint(endpointId: EndpointId): EndpointDefinition;
export function buildEndpointPath(
  endpointId: EndpointId,
  query?: Record<string, string | number | boolean | null | undefined>,
): string;
export function resolveFutarchySurface(view: string): ApiSurface | null;
