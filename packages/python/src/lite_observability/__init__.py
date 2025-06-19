"""
Lite Observability - Lightweight observability starter kit for Python and FastAPI applications.
"""

import asyncio
import logging
import os
import sys
import threading
import webbrowser
from typing import Any, Dict, Optional, Callable, Awaitable, Union

from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.instrumentation.auto_instrumentation import sitecustomize

from .config import ConfigManager
from .data_store import DataStore
from .dashboard_server import DashboardServer
from .resource_monitor import ResourceMonitor
from .error_tracker import ErrorTracker
from .instrumentor import FastAPIInstrumentor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

__version__ = "1.0.0"
__all__ = ["init_observability", "LiteObservability", "get_metrics", "create_span", "record_metric", "shutdown"]


class LiteObservability:
    """Main observability class for Python applications."""
    
    def __init__(self):
        self.is_initialized = False
        self.config: Optional[ConfigManager] = None
        self.data_store: Optional[DataStore] = None
        self.dashboard_server: Optional[DashboardServer] = None
        self.resource_monitor: Optional[ResourceMonitor] = None
        self.error_tracker: Optional[ErrorTracker] = None
        self.instrumentor: Optional[FastAPIInstrumentor] = None
        self._tracer = None
        self._meter = None
        self._shutdown_event = threading.Event()
    
    async def init(self, **options) -> None:
        """Initialize the observability kit.
        
        Args:
            **options: Configuration options
        """
        if self.is_initialized:
            logger.warning("[LiteObs] Already initialized")
            return
        
        try:
            # Initialize configuration
            self.config = ConfigManager(options)
            
            # Initialize data store
            self.data_store = DataStore(self.config)
            
            # Initialize OpenTelemetry
            await self._initialize_otel()
            
            # Initialize error tracking
            self.error_tracker = ErrorTracker(self.data_store)
            self.error_tracker.start()
            
            # Initialize resource monitoring
            self.resource_monitor = ResourceMonitor(self.data_store)
            self.resource_monitor.start()
            
            # Initialize FastAPI instrumentation
            self.instrumentor = FastAPIInstrumentor(self.data_store, self.config)
            self.instrumentor.start()
            
            # Initialize dashboard if enabled
            if self.config.get('dashboard'):
                self.dashboard_server = DashboardServer(self.data_store, self.config)
                await self.dashboard_server.start()
                
                # Auto-open dashboard in development
                if (self.config.get('environment') == 'development' and 
                    self.config.get('auto_open')):
                    dashboard_url = f"http://localhost:{self.config.get('dashboard_port')}"
                    try:
                        webbrowser.open(dashboard_url)
                    except Exception:
                        logger.info(f"[LiteObs] Dashboard available at {dashboard_url}")
            
            self.is_initialized = True
            logger.info("[LiteObs] Observability initialized successfully")
            
            if self.config.get('dashboard'):
                logger.info(f"[LiteObs] Dashboard: http://localhost:{self.config.get('dashboard_port')}")
                
        except Exception as error:
            logger.error(f"[LiteObs] Failed to initialize: {error}")
            raise
    
    async def _initialize_otel(self) -> None:
        """Initialize OpenTelemetry SDK."""
        resource = Resource.create({
            ResourceAttributes.SERVICE_NAME: self.config.get('service_name'),
            ResourceAttributes.SERVICE_VERSION: self.config.get('service_version'),
            ResourceAttributes.DEPLOYMENT_ENVIRONMENT: self.config.get('environment'),
        })
        
        # Initialize tracing
        if self.config.get('enable_tracing'):
            tracer_provider = TracerProvider(resource=resource)
            trace.set_tracer_provider(tracer_provider)
            self._tracer = trace.get_tracer(__name__)
        
        # Initialize metrics
        if self.config.get('enable_metrics'):
            meter_provider = MeterProvider(resource=resource)
            metrics.set_meter_provider(meter_provider)
            self._meter = metrics.get_meter(__name__)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics.
        
        Returns:
            Current metrics data
        """
        if not self.data_store:
            raise RuntimeError("[LiteObs] Not initialized")
        return self.data_store.get_metrics()
    
    def get_traces(self, limit: int = 50) -> list:
        """Get recent traces.
        
        Args:
            limit: Maximum number of traces to return
            
        Returns:
            Recent traces
        """
        if not self.data_store:
            raise RuntimeError("[LiteObs] Not initialized")
        return self.data_store.get_traces(limit)
    
    def get_errors(self, limit: int = 50) -> list:
        """Get recent errors.
        
        Args:
            limit: Maximum number of errors to return
            
        Returns:
            Recent errors
        """
        if not self.data_store:
            raise RuntimeError("[LiteObs] Not initialized")
        return self.data_store.get_errors(limit)
    
    def create_span(self, name: str):
        """Create a custom span context manager.
        
        Args:
            name: Span name
            
        Returns:
            Span context manager
        """
        if not self._tracer:
            # Return a no-op context manager if tracing is disabled
            from contextlib import nullcontext
            return nullcontext()
        
        return self._tracer.start_as_current_span(name)
    
    def record_metric(self, name: str, value: Union[int, float], attributes: Optional[Dict[str, Any]] = None) -> None:
        """Record a custom metric.
        
        Args:
            name: Metric name
            value: Metric value
            attributes: Metric attributes
        """
        if not self.data_store:
            raise RuntimeError("[LiteObs] Not initialized")
        self.data_store.record_custom_metric(name, value, attributes or {})
    
    async def run_diagnostics(self) -> Dict[str, Any]:
        """Run diagnostics.
        
        Returns:
            Diagnostic results
        """
        if not self.is_initialized:
            raise RuntimeError("[LiteObs] Not initialized")
        
        # Basic health check
        import time
        import psutil
        
        return {
            'status': 'healthy',
            'timestamp': time.time(),
            'metrics': self.get_metrics(),
            'process': {
                'pid': os.getpid(),
                'cpu_percent': psutil.Process().cpu_percent(),
                'memory_info': psutil.Process().memory_info()._asdict(),
                'num_threads': psutil.Process().num_threads(),
            },
            'system': {
                'cpu_count': psutil.cpu_count(),
                'memory': psutil.virtual_memory()._asdict(),
                'disk': psutil.disk_usage('/')._asdict(),
            }
        }
    
    async def shutdown(self) -> None:
        """Shutdown observability."""
        if not self.is_initialized:
            return
        
        try:
            if self.resource_monitor:
                self.resource_monitor.stop()
            
            if self.error_tracker:
                self.error_tracker.stop()
            
            if self.instrumentor:
                self.instrumentor.stop()
            
            if self.dashboard_server:
                await self.dashboard_server.stop()
            
            self.is_initialized = False
            logger.info("[LiteObs] Shutdown complete")
        except Exception as error:
            logger.error(f"[LiteObs] Error during shutdown: {error}")


# Global instance
_lite_obs = LiteObservability()


# Public functions
async def init_observability(**options) -> None:
    """Initialize observability with the given options.
    
    Args:
        **options: Configuration options
    """
    await _lite_obs.init(**options)


def get_metrics() -> Dict[str, Any]:
    """Get current metrics.
    
    Returns:
        Current metrics data
    """
    return _lite_obs.get_metrics()


def get_traces(limit: int = 50) -> list:
    """Get recent traces.
    
    Args:
        limit: Maximum number of traces to return
        
    Returns:
        Recent traces
    """
    return _lite_obs.get_traces(limit)


def get_errors(limit: int = 50) -> list:
    """Get recent errors.
    
    Args:
        limit: Maximum number of errors to return
        
    Returns:
        Recent errors
    """
    return _lite_obs.get_errors(limit)


def create_span(name: str):
    """Create a custom span context manager.
    
    Args:
        name: Span name
        
    Returns:
        Span context manager
    """
    return _lite_obs.create_span(name)


def record_metric(name: str, value: Union[int, float], attributes: Optional[Dict[str, Any]] = None) -> None:
    """Record a custom metric.
    
    Args:
        name: Metric name
        value: Metric value
        attributes: Metric attributes
    """
    _lite_obs.record_metric(name, value, attributes)


async def run_diagnostics() -> Dict[str, Any]:
    """Run diagnostics.
    
    Returns:
        Diagnostic results
    """
    return await _lite_obs.run_diagnostics()


async def shutdown() -> None:
    """Shutdown observability."""
    await _lite_obs.shutdown()


# Decorators
def trace_function(name: Optional[str] = None):
    """Decorator to trace a function.
    
    Args:
        name: Optional span name, defaults to function name
    """
    def decorator(func):
        span_name = name or func.__name__
        
        if asyncio.iscoroutinefunction(func):
            async def async_wrapper(*args, **kwargs):
                with create_span(span_name):
                    return await func(*args, **kwargs)
            return async_wrapper
        else:
            def sync_wrapper(*args, **kwargs):
                with create_span(span_name):
                    return func(*args, **kwargs)
            return sync_wrapper
    
    return decorator


def monitor_function(metric_name: Optional[str] = None):
    """Decorator to monitor function execution.
    
    Args:
        metric_name: Optional metric name, defaults to function name
    """
    def decorator(func):
        func_metric_name = metric_name or f"{func.__name__}_duration"
        
        if asyncio.iscoroutinefunction(func):
            async def async_wrapper(*args, **kwargs):
                import time
                start_time = time.time()
                try:
                    result = await func(*args, **kwargs)
                    record_metric(func_metric_name, time.time() - start_time, 
                                {'status': 'success'})
                    return result
                except Exception as e:
                    record_metric(func_metric_name, time.time() - start_time, 
                                {'status': 'error', 'error_type': type(e).__name__})
                    raise
            return async_wrapper
        else:
            def sync_wrapper(*args, **kwargs):
                import time
                start_time = time.time()
                try:
                    result = func(*args, **kwargs)
                    record_metric(func_metric_name, time.time() - start_time, 
                                {'status': 'success'})
                    return result
                except Exception as e:
                    record_metric(func_metric_name, time.time() - start_time, 
                                {'status': 'error', 'error_type': type(e).__name__})
                    raise
            return sync_wrapper
    
    return decorator