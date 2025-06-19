const { PerformanceObserver } = require('perf_hooks');
const { monitorEventLoopDelay } = require('perf_hooks');
const pidusage = require('pidusage');
const si = require('systeminformation');

class ResourceMonitor {
  constructor(dataStore) {
    this.dataStore = dataStore;
    this.isRunning = false;
    this.monitorInterval = null;
    this.eventLoopMonitor = null;
    this.gcObserver = null;
    this.lastCpuTime = null;
    this.lastCpuTimestamp = null;
    
    // Event loop delay monitoring
    this.eventLoopDelay = {
      min: 0,
      max: 0,
      mean: 0,
      percentiles: { p50: 0, p90: 0, p99: 0 }
    };
  }

  /**
   * Start resource monitoring
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Start event loop monitoring
    this._startEventLoopMonitoring();
    
    // Start GC monitoring
    this._startGCMonitoring();
    
    // Start periodic resource collection
    const interval = this.dataStore.config.get('resourceInterval');
    this.monitorInterval = setInterval(() => {
      this._collectResourceMetrics();
    }, interval);
    
    // Collect initial metrics
    this._collectResourceMetrics();
    
    console.log('[ResourceMonitor] Started monitoring');
  }

  /**
   * Stop resource monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    if (this.eventLoopMonitor) {
      this.eventLoopMonitor.disable();
      this.eventLoopMonitor = null;
    }
    
    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = null;
    }
    
    console.log('[ResourceMonitor] Stopped monitoring');
  }

  /**
   * Start event loop delay monitoring
   * @private
   */
  _startEventLoopMonitoring() {
    try {
      this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
      this.eventLoopMonitor.enable();
      
      // Collect event loop metrics periodically
      setInterval(() => {
        if (this.eventLoopMonitor && this.isRunning) {
          this.eventLoopDelay = {
            min: this.eventLoopMonitor.min / 1e6, // Convert to milliseconds
            max: this.eventLoopMonitor.max / 1e6,
            mean: this.eventLoopMonitor.mean / 1e6,
            percentiles: {
              p50: this.eventLoopMonitor.percentile(50) / 1e6,
              p90: this.eventLoopMonitor.percentile(90) / 1e6,
              p99: this.eventLoopMonitor.percentile(99) / 1e6,
            }
          };
          
          // Reset for next collection
          this.eventLoopMonitor.reset();
        }
      }, 5000);
      
    } catch (error) {
      console.warn('[ResourceMonitor] Failed to start event loop monitoring:', error.message);
    }
  }

  /**
   * Start garbage collection monitoring
   * @private
   */
  _startGCMonitoring() {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            // Record GC metrics
            this.dataStore.recordResourceMetrics({
              gc: {
                type: this._getGCType(entry.detail?.kind),
                duration: entry.duration,
                timestamp: Date.now(),
              }
            });
          }
        }
      });
      
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch (error) {
      console.warn('[ResourceMonitor] Failed to start GC monitoring:', error.message);
    }
  }

  /**
   * Get GC type name
   * @private
   */
  _getGCType(kind) {
    const gcTypes = {
      1: 'scavenge',
      2: 'mark-sweep-compact',
      4: 'incremental-marking',
      8: 'weak-phantom',
      15: 'all'
    };
    return gcTypes[kind] || 'unknown';
  }

  /**
   * Collect resource metrics
   * @private
   */
  async _collectResourceMetrics() {
    try {
      const resourceData = {
        timestamp: Date.now(),
        pid: process.pid,
      };

      // Process metrics
      const processMetrics = await this._getProcessMetrics();
      Object.assign(resourceData, processMetrics);

      // System metrics
      const systemMetrics = await this._getSystemMetrics();
      resourceData.system = systemMetrics;

      // Event loop metrics
      resourceData.eventLoopLag = this.eventLoopDelay.mean;
      resourceData.eventLoopPercentiles = this.eventLoopDelay.percentiles;

      // Process handles and descriptors
      resourceData.handles = this._getHandleCounts();

      // Record metrics
      this.dataStore.recordResourceMetrics(resourceData);

      // Check for alerts
      this._checkResourceAlerts(resourceData);

    } catch (error) {
      console.error('[ResourceMonitor] Error collecting metrics:', error);
    }
  }

  /**
   * Get process metrics
   * @private
   */
  async _getProcessMetrics() {
    const metrics = {};

    try {
      // Memory usage
      const memoryUsage = process.memoryUsage();
      metrics.memory = {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
      };

      // CPU usage using pidusage
      const stats = await pidusage(process.pid);
      metrics.cpu = stats.cpu;
      metrics.memory.usage = stats.memory;

      // Process uptime
      metrics.uptime = process.uptime();

      // Resource usage
      if (process.getrusage) {
        const rusage = process.getrusage();
        metrics.rusage = {
          userCPUTime: rusage.userCPUTime,
          systemCPUTime: rusage.systemCPUTime,
          maxRSS: rusage.maxRSS,
          sharedMemorySize: rusage.sharedMemorySize,
          unsharedDataSize: rusage.unsharedDataSize,
          unsharedStackSize: rusage.unsharedStackSize,
          minorPageFault: rusage.minorPageFault,
          majorPageFault: rusage.majorPageFault,
          swapCount: rusage.swapCount,
          blockInputOpCount: rusage.blockInputOpCount,
          blockOutputOpCount: rusage.blockOutputOpCount,
          ipcSentCount: rusage.ipcSentCount,
          ipcReceivedCount: rusage.ipcReceivedCount,
          signalCount: rusage.signalCount,
          voluntaryContextSwitchCount: rusage.voluntaryContextSwitchCount,
          involuntaryContextSwitchCount: rusage.involuntaryContextSwitchCount,
        };
      }

    } catch (error) {
      console.error('[ResourceMonitor] Error getting process metrics:', error);
    }

    return metrics;
  }

  /**
   * Get system metrics
   * @private
   */
  async _getSystemMetrics() {
    const metrics = {};

    try {
      // CPU information
      const cpuLoad = await si.currentLoad();
      metrics.cpu = {
        usage: cpuLoad.currentLoad,
        idle: cpuLoad.currentLoadIdle,
        system: cpuLoad.currentLoadSystem,
        user: cpuLoad.currentLoadUser,
        nice: cpuLoad.currentLoadNice,
        irq: cpuLoad.currentLoadIrq,
      };

      // Memory information
      const memory = await si.mem();
      metrics.memory = {
        total: memory.total,
        free: memory.free,
        used: memory.used,
        active: memory.active,
        available: memory.available,
        usage: (memory.used / memory.total) * 100,
      };

      // Load average (Unix-like systems)
      if (process.platform !== 'win32') {
        const loadAvg = await si.currentLoad();
        metrics.loadAverage = loadAvg.avgLoad ? [loadAvg.avgLoad] : [0];
      }

      // Network statistics
      const networkStats = await si.networkStats();
      if (networkStats && networkStats.length > 0) {
        const totalStats = networkStats.reduce((acc, iface) => {
          acc.rx_bytes += iface.rx_bytes || 0;
          acc.tx_bytes += iface.tx_bytes || 0;
          acc.rx_dropped += iface.rx_dropped || 0;
          acc.tx_dropped += iface.tx_dropped || 0;
          acc.rx_errors += iface.rx_errors || 0;
          acc.tx_errors += iface.tx_errors || 0;
          return acc;
        }, { rx_bytes: 0, tx_bytes: 0, rx_dropped: 0, tx_dropped: 0, rx_errors: 0, tx_errors: 0 });
        
        metrics.network = totalStats;
      }

      // Disk IO
      const diskStats = await si.disksIO();
      if (diskStats) {
        metrics.disk = {
          reads: diskStats.rIO,
          writes: diskStats.wIO,
          readBytes: diskStats.rIO_sec,
          writeBytes: diskStats.wIO_sec,
          readTime: diskStats.tIO,
          writeTime: diskStats.tIO,
        };
      }

    } catch (error) {
      console.error('[ResourceMonitor] Error getting system metrics:', error);
    }

    return metrics;
  }

  /**
   * Get handle counts
   * @private
   */
  _getHandleCounts() {
    const handles = {};
    
    try {
      if (process._getActiveHandles) {
        handles.active = process._getActiveHandles().length;
      }
      
      if (process._getActiveRequests) {
        handles.requests = process._getActiveRequests().length;
      }
      
      // File descriptor count (Unix-like systems)
      if (process.platform !== 'win32') {
        try {
          const fs = require('fs');
          const fdCount = fs.readdirSync('/proc/self/fd').length;
          handles.fileDescriptors = fdCount;
        } catch (error) {
          // Ignore if /proc is not available
        }
      }
    } catch (error) {
      console.warn('[ResourceMonitor] Error getting handle counts:', error.message);
    }
    
    return handles;
  }

  /**
   * Check for resource alerts
   * @private
   */
  _checkResourceAlerts(resourceData) {
    const alerts = [];

    // Check CPU usage
    if (resourceData.cpu > this.dataStore.config.get('cpuThreshold')) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU usage: ${resourceData.cpu.toFixed(1)}%`,
        value: resourceData.cpu,
        threshold: this.dataStore.config.get('cpuThreshold'),
      });
    }

    // Check memory usage
    const memoryThreshold = this.dataStore.config.get('memoryThreshold');
    if (resourceData.memory && resourceData.memory.rss > memoryThreshold) {
      alerts.push({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage: ${(resourceData.memory.rss / 1024 / 1024).toFixed(1)}MB`,
        value: resourceData.memory.rss,
        threshold: memoryThreshold,
      });
    }

    // Check event loop lag
    const eventLoopThreshold = this.dataStore.config.get('eventLoopLagThreshold');
    if (resourceData.eventLoopLag > eventLoopThreshold) {
      alerts.push({
        type: 'eventloop',
        severity: 'warning',
        message: `High event loop lag: ${resourceData.eventLoopLag.toFixed(1)}ms`,
        value: resourceData.eventLoopLag,
        threshold: eventLoopThreshold,
      });
    }

    // Emit alerts
    if (alerts.length > 0) {
      this.dataStore.emit('alerts', alerts);
    }
  }

  /**
   * Get current resource summary
   * @returns {Object} Resource summary
   */
  getCurrentSummary() {
    return {
      cpu: this.lastCpuUsage || 0,
      memory: process.memoryUsage(),
      eventLoopLag: this.eventLoopDelay.mean,
      uptime: process.uptime(),
      pid: process.pid,
    };
  }

  /**
   * Get event loop statistics
   * @returns {Object} Event loop statistics
   */
  getEventLoopStats() {
    return { ...this.eventLoopDelay };
  }
}

module.exports = { ResourceMonitor };