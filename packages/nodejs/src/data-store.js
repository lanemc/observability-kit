const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class DataStore extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.metrics = new Map();
    this.traces = [];
    this.errors = [];
    this.customMetrics = new Map();
    this.resourceMetrics = [];
    this.requestMetrics = [];
    
    // Initialize metric collectors
    this._initializeMetrics();
    
    // Setup persistence if enabled
    if (config.get('persistence')) {
      this._setupPersistence();
    }
  }

  /**
   * Initialize metric structures
   * @private
   */
  _initializeMetrics() {
    const now = Date.now();
    
    // HTTP metrics
    this.metrics.set('http_requests_total', { value: 0, timestamp: now });
    this.metrics.set('http_request_duration_seconds', { values: [], timestamp: now });
    this.metrics.set('http_requests_per_minute', { values: [], timestamp: now });
    this.metrics.set('http_error_rate', { value: 0, timestamp: now });
    this.metrics.set('active_requests', { value: 0, timestamp: now });
    
    // Resource metrics
    this.metrics.set('process_cpu_percent', { values: [], timestamp: now });
    this.metrics.set('process_memory_bytes', { values: [], timestamp: now });
    this.metrics.set('process_heap_bytes', { values: [], timestamp: now });
    this.metrics.set('nodejs_eventloop_lag_seconds', { values: [], timestamp: now });
    this.metrics.set('nodejs_gc_duration_seconds', { values: [], timestamp: now });
    
    // System metrics
    this.metrics.set('system_load_average', { values: [], timestamp: now });
    this.metrics.set('system_memory_usage', { values: [], timestamp: now });
  }

  /**
   * Setup persistence if configured
   * @private
   */
  async _setupPersistence() {
    try {
      const persistencePath = this.config.get('persistencePath');
      await fs.mkdir(persistencePath, { recursive: true });
      
      // Setup periodic persistence
      this.persistenceInterval = setInterval(() => {
        this._persistData().catch(console.error);
      }, 60000); // Persist every minute
      
      // Load existing data
      await this._loadPersistedData();
    } catch (error) {
      console.error('[DataStore] Failed to setup persistence:', error);
    }
  }

  /**
   * Record HTTP request metrics
   * @param {Object} requestData - Request data
   */
  recordRequest(requestData) {
    const now = Date.now();
    
    // Update total requests
    const totalRequests = this.metrics.get('http_requests_total');
    totalRequests.value += 1;
    totalRequests.timestamp = now;
    
    // Record request duration
    const duration = requestData.duration || 0;
    this._addTimeSeries('http_request_duration_seconds', duration / 1000, now);
    
    // Update error rate if error
    if (requestData.statusCode >= 400) {
      this._updateErrorRate();
    }
    
    // Store request for detailed analysis
    this.requestMetrics.push({
      timestamp: now,
      method: requestData.method,
      path: requestData.path,
      statusCode: requestData.statusCode,
      duration: duration,
      userAgent: requestData.userAgent,
      ip: requestData.ip,
    });
    
    // Limit request history
    if (this.requestMetrics.length > this.config.get('maxMetricPoints')) {
      this.requestMetrics.shift();
    }
    
    // Calculate requests per minute
    this._calculateRequestsPerMinute();
    
    this.emit('request', requestData);
  }

  /**
   * Record a trace
   * @param {Object} traceData - Trace data
   */
  recordTrace(traceData) {
    this.traces.push({
      ...traceData,
      timestamp: Date.now(),
    });
    
    // Limit trace history
    if (this.traces.length > this.config.get('maxTraces')) {
      this.traces.shift();
    }
    
    this.emit('trace', traceData);
  }

  /**
   * Record an error
   * @param {Object} errorData - Error data
   */
  recordError(errorData) {
    this.errors.push({
      ...errorData,
      timestamp: Date.now(),
    });
    
    // Limit error history
    if (this.errors.length > this.config.get('maxErrors')) {
      this.errors.shift();
    }
    
    this.emit('error', errorData);
  }

  /**
   * Record resource metrics
   * @param {Object} resourceData - Resource data
   */
  recordResourceMetrics(resourceData) {
    const now = Date.now();
    
    // CPU usage
    if (resourceData.cpu !== undefined) {
      this._addTimeSeries('process_cpu_percent', resourceData.cpu, now);
    }
    
    // Memory usage
    if (resourceData.memory) {
      this._addTimeSeries('process_memory_bytes', resourceData.memory.rss, now);
      this._addTimeSeries('process_heap_bytes', resourceData.memory.heapUsed, now);
    }
    
    // Event loop lag
    if (resourceData.eventLoopLag !== undefined) {
      this._addTimeSeries('nodejs_eventloop_lag_seconds', resourceData.eventLoopLag / 1000, now);
    }
    
    // GC metrics
    if (resourceData.gc) {
      this._addTimeSeries('nodejs_gc_duration_seconds', resourceData.gc.duration / 1000, now);
    }
    
    // System metrics
    if (resourceData.system) {
      if (resourceData.system.loadAverage) {
        this._addTimeSeries('system_load_average', resourceData.system.loadAverage[0], now);
      }
      if (resourceData.system.memory) {
        this._addTimeSeries('system_memory_usage', resourceData.system.memory.used / resourceData.system.memory.total, now);
      }
    }
    
    // Store complete resource snapshot
    this.resourceMetrics.push({
      timestamp: now,
      ...resourceData,
    });
    
    // Limit resource history
    if (this.resourceMetrics.length > this.config.get('maxMetricPoints')) {
      this.resourceMetrics.shift();
    }
    
    this.emit('resource', resourceData);
  }

  /**
   * Record custom metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} attributes - Metric attributes
   */
  recordCustomMetric(name, value, attributes = {}) {
    const now = Date.now();
    
    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, { values: [], attributes: {} });
    }
    
    const metric = this.customMetrics.get(name);
    metric.values.push({ value, timestamp: now });
    metric.attributes = { ...metric.attributes, ...attributes };
    
    // Limit custom metric history
    if (metric.values.length > this.config.get('maxMetricPoints')) {
      metric.values.shift();
    }
    
    this.emit('customMetric', { name, value, attributes });
  }

  /**
   * Add time series data point
   * @private
   */
  _addTimeSeries(metricName, value, timestamp) {
    const metric = this.metrics.get(metricName);
    if (!metric.values) {
      metric.values = [];
    }
    
    metric.values.push({ value, timestamp });
    metric.timestamp = timestamp;
    
    // Limit time series history
    if (metric.values.length > this.config.get('maxMetricPoints')) {
      metric.values.shift();
    }
  }

  /**
   * Calculate requests per minute
   * @private
   */
  _calculateRequestsPerMinute() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentRequests = this.requestMetrics.filter(req => req.timestamp > oneMinuteAgo);
    this._addTimeSeries('http_requests_per_minute', recentRequests.length, now);
  }

  /**
   * Update error rate
   * @private
   */
  _updateErrorRate() {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    const recentRequests = this.requestMetrics.filter(req => req.timestamp > fiveMinutesAgo);
    const errorRequests = recentRequests.filter(req => req.statusCode >= 400);
    
    const errorRate = recentRequests.length > 0 ? (errorRequests.length / recentRequests.length) * 100 : 0;
    
    const errorRateMetric = this.metrics.get('http_error_rate');
    errorRateMetric.value = errorRate;
    errorRateMetric.timestamp = now;
  }

  /**
   * Get all metrics
   * @returns {Object} All metrics data
   */
  getMetrics() {
    const metrics = {};
    
    // Convert Map to object
    for (const [key, value] of this.metrics.entries()) {
      metrics[key] = value;
    }
    
    // Add custom metrics
    const customMetrics = {};
    for (const [key, value] of this.customMetrics.entries()) {
      customMetrics[key] = value;
    }
    
    return {
      system: metrics,
      custom: customMetrics,
      summary: this._getMetricsSummary(),
    };
  }

  /**
   * Get metrics summary
   * @private
   */
  _getMetricsSummary() {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    const recentRequests = this.requestMetrics.filter(req => req.timestamp > fiveMinutesAgo);
    const errorRequests = recentRequests.filter(req => req.statusCode >= 400);
    
    // Calculate percentiles for response time
    const durations = recentRequests.map(req => req.duration).sort((a, b) => a - b);
    const p50 = this._percentile(durations, 0.5);
    const p95 = this._percentile(durations, 0.95);
    const p99 = this._percentile(durations, 0.99);
    
    return {
      requests: {
        total: this.metrics.get('http_requests_total').value,
        perMinute: recentRequests.length,
        errorRate: recentRequests.length > 0 ? (errorRequests.length / recentRequests.length) * 100 : 0,
        latency: {
          p50: p50 || 0,
          p95: p95 || 0,
          p99: p99 || 0,
        },
      },
      resources: this._getLatestResourceMetrics(),
      errors: this.errors.length,
      traces: this.traces.length,
    };
  }

  /**
   * Calculate percentile
   * @private
   */
  _percentile(values, percentile) {
    if (values.length === 0) return 0;
    const index = Math.ceil(values.length * percentile) - 1;
    return values[index];
  }

  /**
   * Get latest resource metrics
   * @private
   */
  _getLatestResourceMetrics() {
    if (this.resourceMetrics.length === 0) {
      return {};
    }
    
    const latest = this.resourceMetrics[this.resourceMetrics.length - 1];
    return {
      cpu: latest.cpu || 0,
      memory: latest.memory || {},
      eventLoopLag: latest.eventLoopLag || 0,
      uptime: process.uptime(),
    };
  }

  /**
   * Get traces
   * @param {number} limit - Maximum number of traces
   * @returns {Array} Traces
   */
  getTraces(limit = 50) {
    return this.traces.slice(-limit).reverse();
  }

  /**
   * Get errors
   * @param {number} limit - Maximum number of errors
   * @returns {Array} Errors
   */
  getErrors(limit = 50) {
    return this.errors.slice(-limit).reverse();
  }

  /**
   * Get request metrics
   * @param {number} limit - Maximum number of requests
   * @returns {Array} Request metrics
   */
  getRequests(limit = 100) {
    return this.requestMetrics.slice(-limit).reverse();
  }

  /**
   * Persist data to disk
   * @private
   */
  async _persistData() {
    if (!this.config.get('persistence')) {
      return;
    }
    
    try {
      const persistencePath = this.config.get('persistencePath');
      const data = {
        metrics: Object.fromEntries(this.metrics),
        customMetrics: Object.fromEntries(this.customMetrics),
        traces: this.traces,
        errors: this.errors,
        requestMetrics: this.requestMetrics,
        resourceMetrics: this.resourceMetrics,
        timestamp: Date.now(),
      };
      
      await fs.writeFile(
        path.join(persistencePath, 'data.json'),
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error('[DataStore] Failed to persist data:', error);
    }
  }

  /**
   * Load persisted data
   * @private
   */
  async _loadPersistedData() {
    try {
      const persistencePath = this.config.get('persistencePath');
      const dataPath = path.join(persistencePath, 'data.json');
      
      const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
      
      // Restore data
      this.metrics = new Map(Object.entries(data.metrics || {}));
      this.customMetrics = new Map(Object.entries(data.customMetrics || {}));
      this.traces = data.traces || [];
      this.errors = data.errors || [];
      this.requestMetrics = data.requestMetrics || [];
      this.resourceMetrics = data.resourceMetrics || [];
      
      console.log('[DataStore] Loaded persisted data');
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      console.log('[DataStore] No persisted data found, starting fresh');
    }
  }

  /**
   * Clear all data
   */
  clear() {
    this.metrics.clear();
    this.customMetrics.clear();
    this.traces = [];
    this.errors = [];
    this.requestMetrics = [];
    this.resourceMetrics = [];
    this._initializeMetrics();
    this.emit('clear');
  }

  /**
   * Get data store statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      metrics: this.metrics.size,
      customMetrics: this.customMetrics.size,
      traces: this.traces.length,
      errors: this.errors.length,
      requests: this.requestMetrics.length,
      resourceMetrics: this.resourceMetrics.length,
    };
  }

  /**
   * Cleanup and shutdown
   */
  shutdown() {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    
    if (this.config.get('persistence')) {
      this._persistData().catch(console.error);
    }
  }
}

module.exports = { DataStore };