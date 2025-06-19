# Lite Observability - Python Package

Lightweight observability starter kit for Python and FastAPI applications with zero-configuration setup.

## Installation

```bash
pip install lite-observability
```

## Quick Start

```python
from lite_observability import init_observability
from fastapi import FastAPI

# Initialize observability with dashboard
init_observability(
    dashboard=True,
    dashboard_port=8001
)

# Your existing FastAPI app
app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}

if __name__ == "__main__":
    import uvicorn
    print("Server running on port 8000")
    print("Observability dashboard at http://localhost:8001")
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Features

- **Auto-instrumentation**: Automatic FastAPI, ASGI, and database instrumentation
- **Real-time metrics**: Request latency, throughput, error rates
- **Resource monitoring**: CPU, memory, async loop performance
- **Distributed tracing**: Request flow visualization
- **Error tracking**: Automatic exception capture
- **Embedded dashboard**: Built-in web UI

## Configuration

```python
from lite_observability import init_observability

init_observability(
    dashboard=True,             # Enable web dashboard
    dashboard_port=8001,        # Dashboard port
    sample_rate=1.0,           # Trace sampling rate (0.0-1.0)
    environment="development",  # Environment mode
    enable_tracing=True,       # Enable distributed tracing
    enable_metrics=True,       # Enable metrics collection
    persistence=False,         # Enable data persistence
    exporters=[]              # External exporters
)
```

## API Reference

### Core Functions

- `init_observability(options)` - Initialize observability
- `get_metrics()` - Get current metrics
- `create_span(name)` - Create custom span context manager
- `record_metric(name, value)` - Record custom metric
- `shutdown()` - Graceful shutdown

### Decorators

```python
from lite_observability import trace_function, monitor_function

@trace_function("custom_operation")
async def my_function():
    # Function will be traced automatically
    pass

@monitor_function("business_metric")  
def critical_function():
    # Function metrics will be collected
    pass
```

### Context Managers

```python
from lite_observability import trace_span

async def my_handler():
    async with trace_span("database_operation"):
        # This block will be traced
        result = await db.query("SELECT * FROM users")
        return result
```

## Dashboard

The embedded dashboard provides:
- Real-time request metrics
- Resource utilization graphs  
- Distributed trace viewer
- Error log inspection
- Performance diagnostics

## Async Support

Full support for async/await patterns:
- Automatic ASGI middleware integration
- Async context managers for tracing
- Non-blocking metrics collection
- Async-safe resource monitoring

## CLI Tool

```bash
# View current status
lite-obs status

# Stream live metrics
lite-obs tail

# View recent traces
lite-obs traces

# Run diagnostics
lite-obs diagnose
```

## License

MIT