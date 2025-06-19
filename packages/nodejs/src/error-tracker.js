const { trace } = require('@opentelemetry/api');

class ErrorTracker {
  constructor(dataStore) {
    this.dataStore = dataStore;
    this.isRunning = false;
    this.originalEmitWarning = null;
    this.originalConsoleError = null;
    
    // Track error patterns
    this.errorPatterns = new Map();
    this.errorCounts = new Map();
  }

  /**
   * Start error tracking
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Capture uncaught exceptions
    process.on('uncaughtException', this._handleUncaughtException.bind(this));
    
    // Capture unhandled promise rejections
    process.on('unhandledRejection', this._handleUnhandledRejection.bind(this));
    
    // Capture warnings
    this._interceptWarnings();
    
    // Capture console errors (optional, can be noisy)
    if (this.dataStore.config.get('captureConsoleErrors')) {
      this._interceptConsoleErrors();
    }
    
    console.log('[ErrorTracker] Started error tracking');
  }

  /**
   * Stop error tracking
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Remove process listeners
    process.removeListener('uncaughtException', this._handleUncaughtException.bind(this));
    process.removeListener('unhandledRejection', this._handleUnhandledRejection.bind(this));
    
    // Restore original warning handler
    if (this.originalEmitWarning) {
      process.emitWarning = this.originalEmitWarning;
      this.originalEmitWarning = null;
    }
    
    // Restore original console.error
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = null;
    }
    
    console.log('[ErrorTracker] Stopped error tracking');
  }

  /**
   * Handle uncaught exceptions
   * @private
   */
  _handleUncaughtException(error) {
    this._recordError({
      type: 'uncaughtException',
      error: error,
      severity: 'critical',
      fatal: true,
    });
    
    // Log to console as well
    console.error('[ErrorTracker] Uncaught Exception:', error);
    
    // In production, you might want to exit gracefully
    if (this.dataStore.config.get('environment') === 'production') {
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  }

  /**
   * Handle unhandled promise rejections
   * @private
   */
  _handleUnhandledRejection(reason, promise) {
    this._recordError({
      type: 'unhandledRejection',
      error: reason,
      promise: promise,
      severity: 'high',
      fatal: false,
    });
    
    console.error('[ErrorTracker] Unhandled Rejection:', reason);
  }

  /**
   * Intercept process warnings
   * @private
   */
  _interceptWarnings() {
    this.originalEmitWarning = process.emitWarning;
    
    process.emitWarning = (warning, ...args) => {
      // Record the warning
      this._recordError({
        type: 'warning',
        error: warning,
        severity: 'low',
        fatal: false,
      });
      
      // Call original handler
      if (this.originalEmitWarning) {
        this.originalEmitWarning.call(process, warning, ...args);
      }
    };
  }

  /**
   * Intercept console errors
   * @private
   */
  _interceptConsoleErrors() {
    this.originalConsoleError = console.error;
    
    console.error = (...args) => {
      // Check if this looks like an error
      const hasError = args.some(arg => arg instanceof Error);
      
      if (hasError) {
        const error = args.find(arg => arg instanceof Error);
        this._recordError({
          type: 'consoleError',
          error: error,
          args: args,
          severity: 'medium',
          fatal: false,
        });
      }
      
      // Call original console.error
      this.originalConsoleError.apply(console, args);
    };
  }

  /**
   * Record an error
   * @private
   */
  _recordError(errorData) {
    if (!this.isRunning) {
      return;
    }

    try {
      const errorInfo = this._extractErrorInfo(errorData.error);
      const currentSpan = trace.getActiveSpan();
      
      const record = {
        id: this._generateErrorId(),
        timestamp: Date.now(),
        type: errorData.type,
        severity: errorData.severity,
        fatal: errorData.fatal,
        message: errorInfo.message,
        stack: errorInfo.stack,
        name: errorInfo.name,
        code: errorInfo.code,
        
        // Context information
        context: {
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          
          // Trace context if available
          traceId: currentSpan ? currentSpan.spanContext().traceId : null,
          spanId: currentSpan ? currentSpan.spanContext().spanId : null,
        },
        
        // Additional data
        ...errorData,
      };

      // Track error patterns
      this._trackErrorPattern(record);
      
      // Record in data store
      this.dataStore.recordError(record);
      
      // Add span error if in trace context
      if (currentSpan) {
        currentSpan.recordException(errorData.error);
        currentSpan.setStatus({
          code: require('@opentelemetry/api').SpanStatusCode.ERROR,
          message: errorInfo.message,
        });
      }
      
    } catch (err) {
      // Avoid infinite recursion if error tracking itself fails
      console.error('[ErrorTracker] Failed to record error:', err);
    }
  }

  /**
   * Extract error information
   * @private
   */
  _extractErrorInfo(error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
      };
    }
    
    if (typeof error === 'string') {
      return {
        name: 'StringError',
        message: error,
        stack: new Error(error).stack,
        code: null,
      };
    }
    
    if (typeof error === 'object' && error !== null) {
      return {
        name: 'ObjectError',
        message: JSON.stringify(error),
        stack: new Error(JSON.stringify(error)).stack,
        code: error.code || null,
      };
    }
    
    return {
      name: 'UnknownError',
      message: String(error),
      stack: new Error(String(error)).stack,
      code: null,
    };
  }

  /**
   * Generate unique error ID
   * @private
   */
  _generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track error patterns
   * @private
   */
  _trackErrorPattern(errorRecord) {
    const pattern = this._getErrorPattern(errorRecord);
    
    // Count occurrences
    const count = this.errorCounts.get(pattern) || 0;
    this.errorCounts.set(pattern, count + 1);
    
    // Track pattern details
    if (!this.errorPatterns.has(pattern)) {
      this.errorPatterns.set(pattern, {
        pattern,
        firstSeen: errorRecord.timestamp,
        lastSeen: errorRecord.timestamp,
        count: 1,
        severity: errorRecord.severity,
        examples: [errorRecord],
      });
    } else {
      const patternInfo = this.errorPatterns.get(pattern);
      patternInfo.lastSeen = errorRecord.timestamp;
      patternInfo.count += 1;
      
      // Keep only a few examples
      if (patternInfo.examples.length < 3) {
        patternInfo.examples.push(errorRecord);
      }
    }
  }

  /**
   * Get error pattern key
   * @private
   */
  _getErrorPattern(errorRecord) {
    // Create a pattern based on error type, name, and normalized message
    const normalizedMessage = this._normalizeErrorMessage(errorRecord.message);
    return `${errorRecord.type}:${errorRecord.name}:${normalizedMessage}`;
  }

  /**
   * Normalize error message to identify patterns
   * @private
   */
  _normalizeErrorMessage(message) {
    if (!message) return 'unknown';
    
    // Remove file paths, line numbers, and other variable parts
    return message
      .replace(/\/[^\s]+:\d+:\d+/g, '/PATH:LINE:COL')
      .replace(/\/[^\s]+/g, '/PATH')
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8,}/gi, 'HEX')
      .toLowerCase()
      .substring(0, 100);
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;
    
    const errors = this.dataStore.getErrors(1000);
    
    const stats = {
      total: errors.length,
      lastHour: errors.filter(e => e.timestamp > oneHourAgo).length,
      lastDay: errors.filter(e => e.timestamp > oneDayAgo).length,
      
      bySeverity: {
        critical: errors.filter(e => e.severity === 'critical').length,
        high: errors.filter(e => e.severity === 'high').length,
        medium: errors.filter(e => e.severity === 'medium').length,
        low: errors.filter(e => e.severity === 'low').length,
      },
      
      byType: {},
      patterns: Array.from(this.errorPatterns.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
    
    // Count by type
    errors.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
    });
    
    return stats;
  }

  /**
   * Get recent error patterns
   * @param {number} limit - Maximum number of patterns
   * @returns {Array} Recent error patterns
   */
  getRecentPatterns(limit = 10) {
    return Array.from(this.errorPatterns.values())
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }

  /**
   * Manually record an error
   * @param {Error|string|Object} error - Error to record
   * @param {Object} options - Additional options
   */
  recordError(error, options = {}) {
    this._recordError({
      type: 'manual',
      error: error,
      severity: options.severity || 'medium',
      fatal: options.fatal || false,
      context: options.context || {},
      ...options,
    });
  }

  /**
   * Clear error patterns older than specified time
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupPatterns(maxAge = 86400000) { // Default: 24 hours
    const cutoff = Date.now() - maxAge;
    
    for (const [pattern, info] of this.errorPatterns.entries()) {
      if (info.lastSeen < cutoff) {
        this.errorPatterns.delete(pattern);
        this.errorCounts.delete(pattern);
      }
    }
  }
}

module.exports = { ErrorTracker };