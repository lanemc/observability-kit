const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
// const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { DataStore } = require('./data-store');
const { DashboardServer } = require('./dashboard-server');
const { ResourceMonitor } = require('./resource-monitor');
const { ErrorTracker } = require('./error-tracker');
const { ConfigManager } = require('./config');
const open = require('open');

class LiteObservability {
  constructor() {
    this.isInitialized = false;
    this.config = null;
    this.sdk = null;
    this.dataStore = null;
    this.dashboardServer = null;
    this.resourceMonitor = null;
    this.errorTracker = null;
  }

  /**
   * Initialize the observability kit
   * @param {Object} options - Configuration options
   */
  async init(options = {}) {
    if (this.isInitialized) {
      console.warn('[LiteObs] Already initialized');
      return;
    }

    try {
      // Initialize configuration
      this.config = new ConfigManager(options);
      
      // Initialize data store
      this.dataStore = new DataStore(this.config);
      
      // Initialize OpenTelemetry SDK
      await this._initializeSDK();
      
      // Initialize error tracking
      this.errorTracker = new ErrorTracker(this.dataStore);
      this.errorTracker.start();
      
      // Initialize resource monitoring
      this.resourceMonitor = new ResourceMonitor(this.dataStore);
      this.resourceMonitor.start();
      
      // Initialize dashboard if enabled
      if (this.config.get('dashboard')) {
        this.dashboardServer = new DashboardServer(this.dataStore, this.config);
        await this.dashboardServer.start();
        
        // Auto-open dashboard in development
        if (this.config.get('environment') === 'development' && this.config.get('autoOpen')) {
          const dashboardUrl = `http://localhost:${this.config.get('dashboardPort')}`;
          try {
            await open(dashboardUrl);
          } catch (err) {
            console.log(`[LiteObs] Dashboard available at ${dashboardUrl}`);
          }
        }
      }
      
      this.isInitialized = true;
      console.log('[LiteObs] Observability initialized successfully');
      
      if (this.config.get('dashboard')) {
        console.log(`[LiteObs] Dashboard: http://localhost:${this.config.get('dashboardPort')}`);
      }
      
    } catch (error) {
      console.error('[LiteObs] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Initialize OpenTelemetry SDK
   * @private
   */
  async _initializeSDK() {
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.get('serviceName'),
      [SemanticResourceAttributes.SERVICE_VERSION]: this.config.get('serviceVersion'),
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.get('environment'),
    });

    // Configure instrumentations
    const instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable filesystem instrumentation to reduce overhead
      },
    });

    // Configure metric readers
    const metricReaders = [];
    
    // Add Prometheus exporter if configured
    if (this.config.get('enablePrometheus')) {
      metricReaders.push(new PrometheusExporter({
        port: this.config.get('prometheusPort'),
      }));
    }

    // Initialize SDK
    this.sdk = new NodeSDK({
      resource,
      instrumentations,
      metricReader: metricReaders.length > 0 ? metricReaders[0] : undefined,
    });

    // Start the SDK
    await this.sdk.start();
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics data
   */
  getMetrics() {
    if (!this.dataStore) {
      throw new Error('[LiteObs] Not initialized');
    }
    return this.dataStore.getMetrics();
  }

  /**
   * Get recent traces
   * @param {number} limit - Maximum number of traces to return
   * @returns {Array} Recent traces
   */
  getTraces(limit = 50) {
    if (!this.dataStore) {
      throw new Error('[LiteObs] Not initialized');
    }
    return this.dataStore.getTraces(limit);
  }

  /**
   * Get recent errors
   * @param {number} limit - Maximum number of errors to return
   * @returns {Array} Recent errors
   */
  getErrors(limit = 50) {
    if (!this.dataStore) {
      throw new Error('[LiteObs] Not initialized');
    }
    return this.dataStore.getErrors(limit);
  }

  /**
   * Create a custom span
   * @param {string} name - Span name
   * @param {Function} fn - Function to wrap with span
   * @returns {*} Function result
   */
  async createSpan(name, fn) {
    const tracer = require('@opentelemetry/api').trace.getTracer('lite-observability');
    return tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: require('@opentelemetry/api').SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ 
          code: require('@opentelemetry/api').SpanStatusCode.ERROR,
          message: error.message 
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Record a custom metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} attributes - Metric attributes
   */
  recordMetric(name, value, attributes = {}) {
    if (!this.dataStore) {
      throw new Error('[LiteObs] Not initialized');
    }
    this.dataStore.recordCustomMetric(name, value, attributes);
  }

  /**
   * Run diagnostics
   * @returns {Object} Diagnostic results
   */
  async runDiagnostics() {
    if (!this.isInitialized) {
      throw new Error('[LiteObs] Not initialized');
    }
    
    // This would implement the diagnostic button functionality
    // For now, return basic health check
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  /**
   * Shutdown observability
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    try {
      if (this.resourceMonitor) {
        this.resourceMonitor.stop();
      }
      
      if (this.errorTracker) {
        this.errorTracker.stop();
      }
      
      if (this.dashboardServer) {
        await this.dashboardServer.stop();
      }
      
      if (this.sdk) {
        await this.sdk.shutdown();
      }
      
      this.isInitialized = false;
      console.log('[LiteObs] Shutdown complete');
    } catch (error) {
      console.error('[LiteObs] Error during shutdown:', error);
    }
  }
}

// Create singleton instance
const liteObs = new LiteObservability();

// Export both the instance and the class
module.exports = liteObs;
module.exports.LiteObservability = LiteObservability;

// Graceful shutdown on process termination
process.on('SIGTERM', () => liteObs.shutdown());
process.on('SIGINT', () => liteObs.shutdown());