export interface MetricsTotals {
  all: number;
  terminal: number;
  pending: number;
}

export interface MetricsRate {
  last_15min: number;
  per_hour: number;
  eta_hours: number | null;
}

export interface MetricsThroughputPoint {
  minute: string;
  count: number;
}

export interface MetricsBackend {
  error_pct: number;
  total: number;
  [verdict: string]: number;
}

export interface MetricsDiscovery {
  dns: number;
  serper: number;
  failed: number;
  total_input: number;
  hit_rate_pct: number;
}

export interface MetricsCost {
  spent_usd: number;
  ceiling_usd: number | null;
  pct: number | null;
}

export interface MetricsCostService {
  name: string;
  calls: number;
  cost_usd: number;
}

export interface MetricsRunHistoryRow {
  hour: string;
  valid: number;
  catch_all: number;
  invalid: number;
  errored: number;
  disc_failed: number;
}

export interface MetricsValidatedRow {
  unique_id: string | null;
  candidate_email: string | null;
  racknerd_status: string | null;
  zuhal_status: string | null;
  final_verdict: string | null;
  updated_at: string | null;
}

export interface MetricsErrorRow {
  source: string;
  message: string;
  n: number;
}

export interface MetricsResponse {
  run_id: string | null;
  as_of: string;
  build_ms: number;
  states: Record<string, number>;
  totals: MetricsTotals;
  rate: MetricsRate;
  throughput_60min: MetricsThroughputPoint[];
  backends: {
    racknerd: MetricsBackend;
    zuhal: MetricsBackend;
  };
  discovery: MetricsDiscovery;
  cost: MetricsCost;
  cost_breakdown: { services: MetricsCostService[] };
  run_history: MetricsRunHistoryRow[];
  recent_validated: MetricsValidatedRow[];
  top_recent_errors: MetricsErrorRow[];
}
