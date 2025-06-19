# Getting Started with Lite Observability

Lite Observability is a lightweight, zero-configuration observability library that provides instant visibility into application performance, errors, and health for Node.js and Python applications.

## Quick Start

### Node.js (Express)

1. **Install the package**:
   ```bash
   npm install lite-observability
   ```

2. **Add to your Express app**:
   ```javascript
   const obs = require('lite-observability');
   
   // Initialize observability (should be first)
   obs.init({ 
     dashboard: true,
     dashboardPort: 3001
   });
   
   // Your existing Express app code...
   const express = require('express');
   const app = express();
   
   app.get('/', (req, res) => {
     res.json({ message: 'Hello World!' });
   });
   
   app.listen(3000);
   ```

3. **View your dashboard**:
   - Your app: http://localhost:3000
   - Observability dashboard: http://localhost:3001

### Python (FastAPI)

1. **Install the package**:
   ```bash
   pip install lite-observability
   ```

2. **Add to your FastAPI app**:
   ```python
   from lite_observability import init_observability
   from fastapi import FastAPI
   
   app = FastAPI()
   
   @app.on_event("startup")
   async def startup_event():
       await init_observability(
           dashboard=True,
           dashboard_port=8001
       )
   
   @app.get("/")
   async def root():
       return {"message": "Hello World"}
   ```

3. **Run and view**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
   - Your app: http://localhost:8000
   - Observability dashboard: http://localhost:8001

## What You Get Out of the Box

### 📊 Real-time Metrics
- **HTTP Requests**: Total requests, requests/minute, error rates
- **Response Times**: P50, P95, P99 latencies
- **Resource Usage**: CPU, memory, event loop lag (Node.js)
- **System Metrics**: System load, memory usage

### 🔍 Distributed Tracing
- Automatic request tracing
- Database query tracking
- External API call monitoring
- Custom span creation

### 🐛 Error Tracking
- Uncaught exceptions
- Unhandled promise rejections
- HTTP errors
- Custom error recording

### 🎛️ Interactive Dashboard
- Live updating charts
- Request/error inspection
- Trace viewer
- Resource monitoring
- One-click diagnostics

## Configuration Options

### Node.js
```javascript
obs.init({
  // Dashboard settings
  dashboard: true,              // Enable web dashboard
  dashboardPort: 3001,         // Dashboard port
  autoOpen: true,              // Auto-open in browser
  
  // Service info
  serviceName: 'my-service',   // Service name
  serviceVersion: '1.0.0',     // Service version
  environment: 'development',  // Environment
  
  // Tracing
  enableTracing: true,         // Enable tracing
  sampleRate: 1.0,            // Sample rate (0.0-1.0)
  
  // Metrics
  enableMetrics: true,         // Enable metrics
  metricsInterval: 5000,       // Collection interval (ms)
  
  // Data retention
  maxTraces: 1000,            // Max traces to store
  maxErrors: 500,             // Max errors to store
  
  // Persistence
  persistence: false,          // Enable data persistence
  persistencePath: './data',   // Persistence directory
});
```

### Python
```python
await init_observability(
    # Dashboard settings
    dashboard=True,              # Enable web dashboard
    dashboard_port=8001,         # Dashboard port
    auto_open=True,             # Auto-open in browser
    
    # Service info
    service_name='my-service',   # Service name
    service_version='1.0.0',     # Service version
    environment='development',   # Environment
    
    # Tracing
    enable_tracing=True,         # Enable tracing
    sample_rate=1.0,            # Sample rate (0.0-1.0)
    
    # Metrics
    enable_metrics=True,         # Enable metrics
    metrics_interval=5000,       # Collection interval (ms)
    
    # Data retention
    max_traces=1000,            # Max traces to store
    max_errors=500,             # Max errors to store
    
    # Persistence
    persistence=False,           # Enable data persistence
    persistence_path='./data',   # Persistence directory
)
```

## Advanced Usage

### Custom Spans

#### Node.js
```javascript
// Using createSpan method
await obs.createSpan('database-query', async (span) => {
  span.setAttributes({ table: 'users', operation: 'select' });
  return await db.query('SELECT * FROM users');
});
```

#### Python
```python
# Using context manager
async with create_span('database_query'):
    result = await db.query('SELECT * FROM users')

# Using decorator
@trace_function('process_data')
async def process_data(data):
    # Function will be automatically traced
    return processed_data
```

### Custom Metrics

#### Node.js
```javascript
// Record custom metrics
obs.recordMetric('cache_hit_rate', 0.85, { cache: 'redis' });
obs.recordMetric('queue_size', 42, { queue: 'email' });
```

#### Python
```python
# Record custom metrics
record_metric('cache_hit_rate', 0.85, {'cache': 'redis'})
record_metric('queue_size', 42, {'queue': 'email'})

# Monitor function execution
@monitor_function('payment_processing')
async def process_payment(amount):
    # Function duration will be automatically recorded
    return result
```

### Error Tracking

#### Node.js
```javascript
// Errors are automatically captured, but you can also manually record them
try {
  await riskyOperation();
} catch (error) {
  // Error is automatically captured and will appear in dashboard
  throw error;
}
```

#### Python
```python
# Errors are automatically captured in FastAPI
# Custom error recording (if needed)
from lite_observability import record_error

try:
    await risky_operation()
except Exception as e:
    # Error is automatically captured
    raise
```

## Environment Variables

You can configure observability using environment variables:

```bash
# Core settings
LITEOBS_SERVICE_NAME=my-service
LITEOBS_SERVICE_VERSION=1.0.0
ENVIRONMENT=production

# Dashboard
LITEOBS_DASHBOARD=true
LITEOBS_DASHBOARD_PORT=3001

# Tracing
LITEOBS_ENABLE_TRACING=true
LITEOBS_SAMPLE_RATE=0.1

# Metrics
LITEOBS_ENABLE_METRICS=true
LITEOBS_METRICS_INTERVAL=10000

# Persistence
LITEOBS_PERSISTENCE=true
LITEOBS_PERSISTENCE_PATH=/var/lib/observability

# Thresholds
LITEOBS_CPU_THRESHOLD=80
LITEOBS_MEMORY_THRESHOLD=536870912  # 512MB
LITEOBS_EVENT_LOOP_LAG_THRESHOLD=50  # 50ms (Node.js only)
```

## Production Considerations

### Performance Impact
- **CPU**: < 5% overhead in typical applications
- **Memory**: ~10-50MB depending on data retention settings
- **Latency**: < 1ms per request

### Production Configuration
```javascript
// Node.js production config
obs.init({
  dashboard: false,           // Disable dashboard in production
  sampleRate: 0.1,           // Sample 10% of traces
  enablePrometheus: true,     // Enable Prometheus export
  otlpEndpoint: 'https://your-collector.com',
  persistence: true,
  environment: 'production'
});
```

```python
# Python production config
await init_observability(
    dashboard=False,           # Disable dashboard in production
    sample_rate=0.1,          # Sample 10% of traces
    enable_prometheus=True,    # Enable Prometheus export
    otlp_endpoint='https://your-collector.com',
    persistence=True,
    environment='production'
)
```

### Integration with External Systems

#### Prometheus
```bash
# Enable Prometheus exporter
LITEOBS_ENABLE_PROMETHEUS=true
LITEOBS_PROMETHEUS_PORT=9090
```

#### OpenTelemetry Collector
```bash
# Send to OTLP endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=YOUR_API_KEY
```

## Troubleshooting

### Common Issues

1. **Dashboard not opening**
   - Check if port is available
   - Verify dashboard is enabled
   - Check firewall settings

2. **No metrics appearing**
   - Ensure observability is initialized before creating Express/FastAPI app
   - Check configuration settings
   - Verify requests are being made to your app

3. **High memory usage**
   - Reduce data retention limits
   - Enable persistence to offload old data
   - Adjust sampling rates

### Debug Mode
```bash
# Enable debug logging
DEBUG=lite-observability:* node app.js
```

```python
# Python logging
import logging
logging.getLogger('lite_observability').setLevel(logging.DEBUG)
```

## Next Steps

- [API Reference](./api-reference.md)
- [Dashboard Guide](./dashboard-guide.md)
- [Production Deployment](./production-guide.md)
- [Integration Examples](./integrations.md)
- [Troubleshooting Guide](./troubleshooting.md)