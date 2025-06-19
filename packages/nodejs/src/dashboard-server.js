const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const cors = require('cors');

class DashboardServer {
  constructor(dataStore, config) {
    this.dataStore = dataStore;
    this.config = config;
    this.server = null;
    this.app = null;
    this.wss = null;
    this.httpServer = null;
    this.clients = new Set();
    
    this._setupExpress();
    this._setupWebSocket();
    this._setupRoutes();
    this._setupStaticFiles();
  }

  /**
   * Setup Express application
   * @private
   */
  _setupExpress() {
    this.app = express();
    
    // Basic middleware
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[Dashboard] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup WebSocket server
   * @private
   */
  _setupWebSocket() {
    this.httpServer = http.createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: '/ws'
    });
    
    this.wss.on('connection', (ws, _req) => {
      console.log('[Dashboard] WebSocket client connected');
      this.clients.add(ws);
      
      // Send initial data
      this._sendToClient(ws, {
        type: 'initial',
        data: {
          metrics: this.dataStore.getMetrics(),
          traces: this.dataStore.getTraces(20),
          errors: this.dataStore.getErrors(20),
        }
      });
      
      ws.on('close', () => {
        console.log('[Dashboard] WebSocket client disconnected');
        this.clients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('[Dashboard] WebSocket error:', error);
        this.clients.delete(ws);
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this._handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('[Dashboard] Failed to parse WebSocket message:', error);
        }
      });
    });
    
    // Setup data store listeners for real-time updates
    this.dataStore.on('request', (data) => {
      this._broadcast({ type: 'request', data });
    });
    
    this.dataStore.on('error', (data) => {
      this._broadcast({ type: 'error', data });
    });
    
    this.dataStore.on('resource', (data) => {
      this._broadcast({ type: 'resource', data });
    });
    
    this.dataStore.on('alerts', (data) => {
      this._broadcast({ type: 'alerts', data });
    });
  }

  /**
   * Setup API routes
   * @private
   */
  _setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Get all metrics
    this.app.get('/api/metrics', (req, res) => {
      try {
        const metrics = this.dataStore.getMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get traces
    this.app.get('/api/traces', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const traces = this.dataStore.getTraces(limit);
        res.json(traces);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get specific trace
    this.app.get('/api/traces/:traceId', (req, res) => {
      try {
        const traces = this.dataStore.getTraces(1000);
        const trace = traces.find(t => t.traceId === req.params.traceId);
        if (!trace) {
          return res.status(404).json({ error: 'Trace not found' });
        }
        res.json(trace);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get errors
    this.app.get('/api/errors', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const errors = this.dataStore.getErrors(limit);
        res.json(errors);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get requests
    this.app.get('/api/requests', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 100;
        const requests = this.dataStore.getRequests(limit);
        res.json(requests);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get system status
    this.app.get('/api/status', (req, res) => {
      try {
        const metrics = this.dataStore.getMetrics();
        const status = {
          service: {
            name: this.config.get('serviceName'),
            version: this.config.get('serviceVersion'),
            environment: this.config.get('environment'),
            uptime: process.uptime(),
            pid: process.pid,
          },
          summary: metrics.summary,
          dataStore: this.dataStore.getStats(),
          timestamp: new Date().toISOString(),
        };
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Run diagnostics
    this.app.post('/api/diagnostics', async (req, res) => {
      try {
        // This would implement the diagnostic functionality
        const results = await this._runDiagnostics();
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Clear data
    this.app.post('/api/clear', (req, res) => {
      try {
        this.dataStore.clear();
        res.json({ status: 'cleared', timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Export data
    this.app.get('/api/export', (req, res) => {
      try {
        const format = req.query.format || 'json';
        const data = {
          metrics: this.dataStore.getMetrics(),
          traces: this.dataStore.getTraces(),
          errors: this.dataStore.getErrors(),
          requests: this.dataStore.getRequests(),
          timestamp: new Date().toISOString(),
        };

        if (format === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename=observability-data.json');
          res.json(data);
        } else {
          res.status(400).json({ error: 'Unsupported format' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Setup static file serving
   * @private
   */
  _setupStaticFiles() {
    // Serve dashboard static files
    const dashboardPath = path.join(__dirname, '..', '..', 'dashboard', 'static');
    this.app.use('/static', express.static(dashboardPath));
    
    // Serve main dashboard page
    this.app.get('/', (req, res) => {
      res.send(this._generateDashboardHTML());
    });
  }

  /**
   * Generate dashboard HTML
   * @private
   */
  _generateDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lite Observability Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #f5f5f5; }
        .header { background: #2563eb; color: white; padding: 1rem 2rem; }
        .header h1 { font-size: 1.5rem; font-weight: 600; }
        .header p { opacity: 0.9; margin-top: 0.25rem; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
        .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.5rem; }
        .card h3 { color: #374151; margin-bottom: 1rem; font-size: 1.125rem; }
        .metric { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #e5e7eb; }
        .metric:last-child { border-bottom: none; }
        .metric-label { color: #6b7280; }
        .metric-value { font-weight: 600; color: #111827; }
        .status-ok { color: #059669; }
        .status-warning { color: #d97706; }
        .status-error { color: #dc2626; }
        .loading { text-align: center; padding: 2rem; color: #6b7280; }
        .error { background: #fee2e2; color: #991b1b; padding: 1rem; border-radius: 6px; margin: 1rem 0; }
        .btn { background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
        .btn:hover { background: #1d4ed8; }
        .btn-secondary { background: #6b7280; }
        .btn-secondary:hover { background: #4b5563; }
        .log-entry { font-family: 'Monaco', 'Consolas', monospace; font-size: 0.875rem; background: #f9fafb; padding: 0.5rem; border-radius: 4px; margin: 0.25rem 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 Lite Observability Dashboard</h1>
        <p>Real-time application monitoring and performance insights</p>
    </div>
    
    <div class="container">
        <div class="loading" id="loading">Loading dashboard...</div>
        <div id="dashboard" style="display: none;">
            <div class="grid">
                <div class="card">
                    <h3>📊 Request Metrics</h3>
                    <div id="request-metrics">
                        <div class="metric">
                            <span class="metric-label">Total Requests</span>
                            <span class="metric-value" id="total-requests">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Requests/min</span>
                            <span class="metric-value" id="requests-per-min">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Error Rate</span>
                            <span class="metric-value" id="error-rate">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">P50 Latency</span>
                            <span class="metric-value" id="p50-latency">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">P95 Latency</span>
                            <span class="metric-value" id="p95-latency">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">P99 Latency</span>
                            <span class="metric-value" id="p99-latency">-</span>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <h3>💻 System Resources</h3>
                    <div id="resource-metrics">
                        <div class="metric">
                            <span class="metric-label">CPU Usage</span>
                            <span class="metric-value" id="cpu-usage">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Memory (RSS)</span>
                            <span class="metric-value" id="memory-rss">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Heap Used</span>
                            <span class="metric-value" id="heap-used">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Event Loop Lag</span>
                            <span class="metric-value" id="event-loop-lag">-</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Uptime</span>
                            <span class="metric-value" id="uptime">-</span>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <h3>🐛 Recent Errors</h3>
                    <div id="recent-errors">
                        <p class="loading">No errors recorded</p>
                    </div>
                </div>
                
                <div class="card">
                    <h3>🔍 Recent Traces</h3>
                    <div id="recent-traces">
                        <p class="loading">No traces available</p>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 2rem; text-align: center;">
                <button class="btn" onclick="runDiagnostics()">🔧 Run Diagnostics</button>
                <button class="btn btn-secondary" onclick="clearData()">🗑️ Clear Data</button>
                <button class="btn btn-secondary" onclick="exportData()">📊 Export Data</button>
            </div>
        </div>
    </div>

    <script>
        let ws = null;
        let data = { metrics: {}, traces: [], errors: [] };
        
        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host + '/ws');
            
            ws.onopen = function() {
                console.log('Connected to observability dashboard');
            };
            
            ws.onmessage = function(event) {
                const message = JSON.parse(event.data);
                handleMessage(message);
            };
            
            ws.onclose = function() {
                console.log('Disconnected from dashboard');
                setTimeout(connect, 5000);
            };
            
            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
        }
        
        function handleMessage(message) {
            switch(message.type) {
                case 'initial':
                    data = message.data;
                    updateDashboard();
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('dashboard').style.display = 'block';
                    break;
                case 'request':
                case 'error':  
                case 'resource':
                    fetchLatestData();
                    break;
            }
        }
        
        async function fetchLatestData() {
            try {
                const [metricsRes, tracesRes, errorsRes] = await Promise.all([
                    fetch('/api/metrics'),
                    fetch('/api/traces?limit=10'),
                    fetch('/api/errors?limit=10')
                ]);
                
                data.metrics = await metricsRes.json();
                data.traces = await tracesRes.json();
                data.errors = await errorsRes.json();
                
                updateDashboard();
            } catch (error) {
                console.error('Failed to fetch data:', error);
            }
        }
        
        function updateDashboard() {
            updateRequestMetrics();
            updateResourceMetrics();
            updateRecentErrors();
            updateRecentTraces();
        }
        
        function updateRequestMetrics() {
            const summary = data.metrics.summary || {};
            const requests = summary.requests || {};
            
            document.getElementById('total-requests').textContent = requests.total || 0;
            document.getElementById('requests-per-min').textContent = requests.perMinute || 0;
            document.getElementById('error-rate').textContent = (requests.errorRate || 0).toFixed(1) + '%';
            document.getElementById('p50-latency').textContent = (requests.latency?.p50 || 0).toFixed(1) + 'ms';
            document.getElementById('p95-latency').textContent = (requests.latency?.p95 || 0).toFixed(1) + 'ms';
            document.getElementById('p99-latency').textContent = (requests.latency?.p99 || 0).toFixed(1) + 'ms';
        }
        
        function updateResourceMetrics() {
            const summary = data.metrics.summary || {};
            const resources = summary.resources || {};
            
            document.getElementById('cpu-usage').textContent = (resources.cpu || 0).toFixed(1) + '%';
            document.getElementById('memory-rss').textContent = formatBytes(resources.memory?.rss || 0);
            document.getElementById('heap-used').textContent = formatBytes(resources.memory?.heapUsed || 0);
            document.getElementById('event-loop-lag').textContent = (resources.eventLoopLag || 0).toFixed(1) + 'ms';
            document.getElementById('uptime').textContent = formatUptime(resources.uptime || 0);
        }
        
        function updateRecentErrors() {
            const container = document.getElementById('recent-errors');
            if (!data.errors || data.errors.length === 0) {
                container.innerHTML = '<p class="loading">No errors recorded</p>';
                return;
            }
            
            container.innerHTML = data.errors.slice(0, 5).map(error => 
                '<div class="log-entry">' +
                '<strong>' + error.type + ':</strong> ' + error.message +
                '<br><small>' + new Date(error.timestamp).toLocaleString() + '</small>' +
                '</div>'
            ).join('');
        }
        
        function updateRecentTraces() {
            const container = document.getElementById('recent-traces');
            if (!data.traces || data.traces.length === 0) {
                container.innerHTML = '<p class="loading">No traces available</p>';
                return;
            }
            
            container.innerHTML = data.traces.slice(0, 5).map(trace => 
                '<div class="log-entry">' +
                '<strong>' + (trace.operationName || 'Request') + '</strong> ' +
                (trace.duration ? '(' + trace.duration.toFixed(1) + 'ms)' : '') +
                '<br><small>' + new Date(trace.timestamp).toLocaleString() + '</small>' +
                '</div>'
            ).join('');
        }
        
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }
        
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return hours + 'h ' + minutes + 'm ' + secs + 's';
        }
        
        async function runDiagnostics() {
            try {
                const response = await fetch('/api/diagnostics', { method: 'POST' });
                const result = await response.json();
                alert('Diagnostics completed: ' + JSON.stringify(result, null, 2));
            } catch (error) {
                alert('Diagnostics failed: ' + error.message);
            }
        }
        
        async function clearData() {
            if (confirm('Are you sure you want to clear all data?')) {
                try {
                    await fetch('/api/clear', { method: 'POST' });
                    location.reload();
                } catch (error) {
                    alert('Failed to clear data: ' + error.message);
                }
            }
        }
        
        function exportData() {
            window.open('/api/export?format=json', '_blank');
        }
        
        // Initialize
        connect();
        
        // Periodic refresh
        setInterval(fetchLatestData, 5000);
    </script>
</body>
</html>`;
  }

  /**
   * Handle WebSocket messages
   * @private
   */
  _handleWebSocketMessage(ws, message) {
    switch (message.type) {
    case 'ping':
      this._sendToClient(ws, { type: 'pong' });
      break;
    case 'subscribe':
      // Handle subscription to specific events
      break;
    default:
      console.warn('[Dashboard] Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * Send message to specific client
   * @private
   */
  _sendToClient(ws, message) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[Dashboard] Failed to send WebSocket message:', error);
      }
    }
  }

  /**
   * Broadcast message to all clients
   * @private
   */
  _broadcast(message) {
    for (const client of this.clients) {
      this._sendToClient(client, message);
    }
  }

  /**
   * Run diagnostics
   * @private
   */
  async _runDiagnostics() {
    // This is a placeholder for the diagnostics functionality
    // In a full implementation, this would run various health checks
    return {
      status: 'completed',
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'Memory Usage', status: 'ok', value: process.memoryUsage().heapUsed },
        { name: 'CPU Usage', status: 'ok', value: process.cpuUsage() },
        { name: 'Event Loop', status: 'ok', value: 'responsive' },
        { name: 'Data Store', status: 'ok', value: this.dataStore.getStats() },
      ]
    };
  }

  /**
   * Start the dashboard server
   */
  async start() {
    return new Promise((resolve, reject) => {
      const port = this.config.get('dashboardPort');
      
      this.httpServer.listen(port, '127.0.0.1', (error) => {
        if (error) {
          reject(error);
          return;
        }
        
        console.log(`[Dashboard] Server started on http://localhost:${port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[Dashboard] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = { DashboardServer };