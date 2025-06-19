export interface ObservabilityConfig {
  /** Enable web dashboard */
  dashboard?: boolean;
  
  /** Dashboard port */
  dashboardPort?: number;
  
  /** Auto-open dashboard in browser */
  autoOpen?: boolean;
  
  /** Service name */
  serviceName?: string;
  
  /** Service version */
  serviceVersion?: string;
  
  /** Environment (development, production) */
  environment?: string;
  
  /** Enable distributed tracing */
  enableTracing?: boolean;
  
  /** Trace sampling rate (0.0-1.0) */
  sampleRate?: number;
  
  /** Enable metrics collection */
  enableMetrics?: boolean;
  
  /** Metrics collection interval (ms) */
  metricsInterval?: number;
  
  /** Enable resource monitoring */
  enableResourceMonitoring?: boolean;
  
  /** Resource monitoring interval (ms) */
  resourceInterval?: number;
  
  /** Enable error tracking */
  enableErrorTracking?: boolean;
  
  /** Maximum number of traces to store */
  maxTraces?: number;
  
  /** Maximum number of errors to store */
  maxErrors?: number;
  
  /** Maximum number of metric data points */
  maxMetricPoints?: number;
  
  /** Enable data persistence */
  persistence?: boolean;
  
  /** Persistence file path */
  persistencePath?: string;
  
  /** Enable Prometheus exporter */
  enablePrometheus?: boolean;
  
  /** Prometheus port */
  prometheusPort?: number;
  
  /** OTLP endpoint for external export */
  otlpEndpoint?: string;
  
  /** OTLP headers */
  otlpHeaders?: Record<string, string>;
  
  /** Maximum concurrent requests threshold */
  maxConcurrentRequests?: number;
  
  /** Event loop lag threshold (ms) */
  eventLoopLagThreshold?: number;
  
  /** Memory usage threshold (bytes) */
  memoryThreshold?: number;
  
  /** CPU usage threshold (%) */
  cpuThreshold?: number;
}

export interface MetricValue {
  value: number;
  timestamp: number;
}

export interface TimeSeriesMetric {
  values: Array<{ value: number; timestamp: number }>;
  timestamp: number;
}

export interface RequestMetric {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
}

export interface TraceData {
  id: string;
  traceId: string;
  spanId: string;
  operationName: string;
  startTime: number;
  endTime: number;
  duration: number;
  tags?: Record<string, any>;
  logs?: Array<{ timestamp: number; fields: Record<string, any> }>;
  spans?: TraceData[];
}

export interface ErrorData {
  id: string;
  timestamp: number;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fatal: boolean;
  message: string;
  stack?: string;
  name: string;
  code?: string | number;
  context: {
    pid: number;
    platform: string;
    nodeVersion: string;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    traceId?: string;
    spanId?: string;
  };
}

export interface ResourceData {
  timestamp: number;
  pid: number;
  cpu: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
    usage?: number;
  };
  uptime: number;
  eventLoopLag: number;
  eventLoopPercentiles?: {
    p50: number;
    p90: number;
    p99: number;
  };
  gc?: {
    type: string;
    duration: number;
    timestamp: number;
  };
  system?: {
    cpu: {
      usage: number;
      idle: number;
      system: number;
      user: number;
      nice: number;
      irq: number;
    };
    memory: {
      total: number;
      free: number;
      used: number;
      active: number;
      available: number;
      usage: number;
    };
    loadAverage?: number[];
    network?: {
      rx_bytes: number;
      tx_bytes: number;
      rx_dropped: number;
      tx_dropped: number;
      rx_errors: number;
      tx_errors: number;
    };
    disk?: {
      reads: number;
      writes: number;
      readBytes: number;
      writeBytes: number;
      readTime: number;
      writeTime: number;
    };
  };
  handles?: {
    active?: number;
    requests?: number;
    fileDescriptors?: number;
  };
}

export interface MetricsData {
  system: Record<string, MetricValue | TimeSeriesMetric>;
  custom: Record<string, { values: Array<{ value: number; timestamp: number }>; attributes: Record<string, any> }>;
  summary: {
    requests: {
      total: number;
      perMinute: number;
      errorRate: number;
      latency: {
        p50: number;
        p95: number;
        p99: number;
      };
    };
    resources: {
      cpu: number;
      memory: NodeJS.MemoryUsage;
      eventLoopLag: number;
      uptime: number;
    };
    errors: number;
    traces: number;
  };
}

export interface DiagnosticResult {
  status: string;
  timestamp: string;
  metrics?: MetricsData;
  uptime?: number;
  memory?: NodeJS.MemoryUsage;
}

export interface Span {
  recordException(exception: Error): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}

export declare class LiteObservability {
  constructor();
  
  /**
   * Initialize observability
   */
  init(options?: ObservabilityConfig): Promise<void>;
  
  /**
   * Get current metrics
   */
  getMetrics(): MetricsData;
  
  /**
   * Get recent traces
   */
  getTraces(limit?: number): TraceData[];
  
  /**
   * Get recent errors
   */
  getErrors(limit?: number): ErrorData[];
  
  /**
   * Create a custom span
   */
  createSpan<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T>;
  
  /**
   * Record a custom metric
   */
  recordMetric(name: string, value: number, attributes?: Record<string, any>): void;
  
  /**
   * Run diagnostics
   */
  runDiagnostics(): Promise<DiagnosticResult>;
  
  /**
   * Shutdown observability
   */
  shutdown(): Promise<void>;
}

declare const liteObs: LiteObservability;

export = liteObs;
export { LiteObservability };