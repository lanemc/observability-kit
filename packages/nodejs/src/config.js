const path = require('path');

class ConfigManager {
  constructor(options = {}) {
    this.config = this._buildConfig(options);
  }

  /**
   * Build configuration from options and environment variables
   * @private
   */
  _buildConfig(options) {
    const defaultConfig = {
      // Core settings
      serviceName: process.env.LITEOBS_SERVICE_NAME || 'unknown-service',
      serviceVersion: process.env.LITEOBS_SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      
      // Dashboard settings
      dashboard: this._parseBoolean(process.env.LITEOBS_DASHBOARD, true),
      dashboardPort: parseInt(process.env.LITEOBS_DASHBOARD_PORT) || 3001,
      autoOpen: this._parseBoolean(process.env.LITEOBS_AUTO_OPEN, true),
      
      // Tracing settings
      enableTracing: this._parseBoolean(process.env.LITEOBS_ENABLE_TRACING, true),
      sampleRate: parseFloat(process.env.LITEOBS_SAMPLE_RATE) || 1.0,
      
      // Metrics settings
      enableMetrics: this._parseBoolean(process.env.LITEOBS_ENABLE_METRICS, true),
      metricsInterval: parseInt(process.env.LITEOBS_METRICS_INTERVAL) || 5000,
      
      // Resource monitoring
      enableResourceMonitoring: this._parseBoolean(process.env.LITEOBS_ENABLE_RESOURCE_MONITORING, true),
      resourceInterval: parseInt(process.env.LITEOBS_RESOURCE_INTERVAL) || 5000,
      
      // Error tracking
      enableErrorTracking: this._parseBoolean(process.env.LITEOBS_ENABLE_ERROR_TRACKING, true),
      
      // Data retention
      maxTraces: parseInt(process.env.LITEOBS_MAX_TRACES) || 1000,
      maxErrors: parseInt(process.env.LITEOBS_MAX_ERRORS) || 500,
      maxMetricPoints: parseInt(process.env.LITEOBS_MAX_METRIC_POINTS) || 1440, // 24h at 1min intervals
      
      // Persistence
      persistence: this._parseBoolean(process.env.LITEOBS_PERSISTENCE, false),
      persistencePath: process.env.LITEOBS_PERSISTENCE_PATH || path.join(process.cwd(), '.observability'),
      
      // External integrations
      enablePrometheus: this._parseBoolean(process.env.LITEOBS_ENABLE_PROMETHEUS, false),
      prometheusPort: parseInt(process.env.LITEOBS_PROMETHEUS_PORT) || 9090,
      
      // OTLP export
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      otlpHeaders: this._parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
      
      // Performance settings
      maxConcurrentRequests: parseInt(process.env.LITEOBS_MAX_CONCURRENT_REQUESTS) || 1000,
      eventLoopLagThreshold: parseInt(process.env.LITEOBS_EVENT_LOOP_LAG_THRESHOLD) || 50,
      memoryThreshold: parseInt(process.env.LITEOBS_MEMORY_THRESHOLD) || 512 * 1024 * 1024, // 512MB
      cpuThreshold: parseFloat(process.env.LITEOBS_CPU_THRESHOLD) || 80.0,
    };

    // Merge with provided options (options take precedence)
    const mergedConfig = { ...defaultConfig, ...options };

    // Validate configuration
    this._validateConfig(mergedConfig);

    return mergedConfig;
  }

  /**
   * Parse boolean environment variable
   * @private
   */
  _parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
  }

  /**
   * Parse headers from environment variable
   * @private
   */
  _parseHeaders(headersString) {
    if (!headersString) {
      return {};
    }
    
    const headers = {};
    headersString.split(',').forEach(header => {
      const [key, value] = header.split('=');
      if (key && value) {
        headers[key.trim()] = value.trim();
      }
    });
    
    return headers;
  }

  /**
   * Validate configuration
   * @private
   */
  _validateConfig(config) {
    // Validate ports
    if (config.dashboardPort < 1 || config.dashboardPort > 65535) {
      throw new Error(`Invalid dashboard port: ${config.dashboardPort}`);
    }
    
    if (config.prometheusPort < 1 || config.prometheusPort > 65535) {
      throw new Error(`Invalid Prometheus port: ${config.prometheusPort}`);
    }

    // Validate sample rate
    if (config.sampleRate < 0 || config.sampleRate > 1) {
      throw new Error(`Invalid sample rate: ${config.sampleRate}. Must be between 0 and 1`);
    }

    // Validate intervals
    if (config.metricsInterval < 1000) {
      throw new Error(`Metrics interval too low: ${config.metricsInterval}ms. Minimum is 1000ms`);
    }
    
    if (config.resourceInterval < 1000) {
      throw new Error(`Resource interval too low: ${config.resourceInterval}ms. Minimum is 1000ms`);
    }

    // Validate limits
    if (config.maxTraces < 1) {
      throw new Error(`Invalid maxTraces: ${config.maxTraces}. Must be at least 1`);
    }
    
    if (config.maxErrors < 1) {
      throw new Error(`Invalid maxErrors: ${config.maxErrors}. Must be at least 1`);
    }

    // Validate thresholds
    if (config.cpuThreshold < 0 || config.cpuThreshold > 100) {
      throw new Error(`Invalid CPU threshold: ${config.cpuThreshold}%. Must be between 0 and 100`);
    }
  }

  /**
   * Get configuration value
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    return this.config[key];
  }

  /**
   * Set configuration value
   * @param {string} key - Configuration key
   * @param {*} value - Configuration value
   */
  set(key, value) {
    this.config[key] = value;
  }

  /**
   * Get all configuration
   * @returns {Object} Complete configuration object
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Check if running in development mode
   * @returns {boolean} True if in development mode
   */
  isDevelopment() {
    return this.config.environment === 'development';
  }

  /**
   * Check if running in production mode
   * @returns {boolean} True if in production mode
   */
  isProduction() {
    return this.config.environment === 'production';
  }

  /**
   * Get configuration summary for logging
   * @returns {Object} Configuration summary
   */
  getSummary() {
    return {
      serviceName: this.config.serviceName,
      environment: this.config.environment,
      dashboard: this.config.dashboard,
      dashboardPort: this.config.dashboardPort,
      enableTracing: this.config.enableTracing,
      enableMetrics: this.config.enableMetrics,
      sampleRate: this.config.sampleRate,
      persistence: this.config.persistence,
    };
  }
}

module.exports = { ConfigManager };