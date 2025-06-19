# Lite Observability - Node.js Package

Lightweight observability starter kit for Node.js and Express applications with zero-configuration setup.

## Installation

```bash
npm install lite-observability
```

## Quick Start

```javascript
const obs = require('lite-observability');

// Initialize with dashboard
obs.init({ 
  dashboard: true,
  port: 3001 
});

// Your existing Express app
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
  console.log('Observability dashboard at http://localhost:3001');
});
```

## Features

- **Auto-instrumentation**: Automatic Express, HTTP, and database instrumentation
- **Real-time metrics**: Request latency, throughput, error rates
- **Resource monitoring**: CPU, memory, event loop lag
- **Distributed tracing**: Request flow visualization
- **Error tracking**: Automatic exception capture
- **Embedded dashboard**: Built-in web UI

## Configuration

```javascript
obs.init({
  dashboard: true,           // Enable web dashboard
  dashboardPort: 3001,      // Dashboard port
  sampleRate: 1.0,          // Trace sampling rate (0.0-1.0)
  environment: 'development', // Environment mode
  enableTracing: true,       // Enable distributed tracing
  enableMetrics: true,       // Enable metrics collection
  persistence: false,        // Enable data persistence
  exporters: []             // External exporters
});
```

## API Reference

### Core Methods

- `obs.init(options)` - Initialize observability
- `obs.getMetrics()` - Get current metrics
- `obs.createSpan(name, fn)` - Create custom span
- `obs.recordMetric(name, value)` - Record custom metric
- `obs.shutdown()` - Graceful shutdown

### Dashboard

The embedded dashboard provides:
- Real-time request metrics
- Resource utilization graphs
- Distributed trace viewer
- Error log inspection
- Performance diagnostics

## License

MIT