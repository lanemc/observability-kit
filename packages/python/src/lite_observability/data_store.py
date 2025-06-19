"""Data storage for observability metrics, traces, and errors."""

import json
import asyncio
import time
import threading
from collections import deque, defaultdict
from typing import Any, Dict, List, Optional, Union
from pathlib import Path

from .config import ConfigManager


class DataStore:
    """In-memory data store for observability data."""
    
    def __init__(self, config: ConfigManager):
        """Initialize data store.
        
        Args:
            config: Configuration manager
        """
        self.config = config
        self.metrics: Dict[str, Any] = {}
        self.traces: deque = deque(maxlen=config.get('max_traces'))
        self.errors: deque = deque(maxlen=config.get('max_errors'))
        self.custom_metrics: Dict[str, Dict[str, Any]] = {}
        self.resource_metrics: deque = deque(maxlen=config.get('max_metric_points'))
        self.request_metrics: deque = deque(maxlen=config.get('max_metric_points'))
        
        # Event callbacks
        self._callbacks: Dict[str, List] = defaultdict(list)
        
        # Thread lock for thread-safe operations
        self._lock = threading.RLock()
        
        # Initialize metric structures
        self._initialize_metrics()
        
        # Setup persistence if enabled
        if config.get('persistence'):
            self._setup_persistence()
    
    def _initialize_metrics(self) -> None:
        """Initialize metric structures."""
        now = time.time()
        
        # HTTP metrics
        self.metrics.update({
            'http_requests_total': {'value': 0, 'timestamp': now},
            'http_request_duration_seconds': {'values': [], 'timestamp': now},
            'http_requests_per_minute': {'values': [], 'timestamp': now},
            'http_error_rate': {'value': 0.0, 'timestamp': now},
            'active_requests': {'value': 0, 'timestamp': now},
            
            # Resource metrics
            'process_cpu_percent': {'values': [], 'timestamp': now},
            'process_memory_bytes': {'values': [], 'timestamp': now},
            'process_memory_percent': {'values': [], 'timestamp': now},
            'system_load_average': {'values': [], 'timestamp': now},
            'system_memory_usage': {'values': [], 'timestamp': now},
        })
    
    def _setup_persistence(self) -> None:
        """Setup persistence if configured."""
        try:
            persistence_path = Path(self.config.get('persistence_path'))
            persistence_path.mkdir(exist_ok=True)
            
            # Setup periodic persistence (run in background thread)
            def persist_worker():
                while True:
                    time.sleep(60)  # Persist every minute
                    try:
                        self._persist_data()
                    except Exception as e:
                        print(f"[DataStore] Persistence error: {e}")
            
            thread = threading.Thread(target=persist_worker, daemon=True)
            thread.start()
            
            # Load existing data
            self._load_persisted_data()
        except Exception as error:
            print(f"[DataStore] Failed to setup persistence: {error}")
    
    def on(self, event: str, callback) -> None:
        """Register event callback.
        
        Args:
            event: Event name
            callback: Callback function
        """
        self._callbacks[event].append(callback)
    
    def emit(self, event: str, data: Any) -> None:
        """Emit event to callbacks.
        
        Args:
            event: Event name
            data: Event data
        """
        for callback in self._callbacks.get(event, []):
            try:
                if asyncio.iscoroutinefunction(callback):
                    # Schedule coroutine
                    try:
                        loop = asyncio.get_event_loop()
                        loop.create_task(callback(data))
                    except RuntimeError:
                        # No event loop running
                        pass
                else:
                    callback(data)
            except Exception as e:
                print(f"[DataStore] Callback error: {e}")
    
    def record_request(self, request_data: Dict[str, Any]) -> None:
        """Record HTTP request metrics.
        
        Args:
            request_data: Request data
        """
        with self._lock:
            now = time.time()
            
            # Update total requests
            self.metrics['http_requests_total']['value'] += 1
            self.metrics['http_requests_total']['timestamp'] = now
            
            # Record request duration
            duration = request_data.get('duration', 0)
            self._add_time_series('http_request_duration_seconds', duration / 1000, now)
            
            # Update error rate if error
            status_code = request_data.get('status_code', 200)
            if status_code >= 400:
                self._update_error_rate()
            
            # Store request for detailed analysis
            self.request_metrics.append({
                'timestamp': now,
                'method': request_data.get('method', 'GET'),
                'path': request_data.get('path', '/'),
                'status_code': status_code,
                'duration': duration,
                'user_agent': request_data.get('user_agent'),
                'ip': request_data.get('ip'),
            })
            
            # Calculate requests per minute
            self._calculate_requests_per_minute()
            
            self.emit('request', request_data)
    
    def record_trace(self, trace_data: Dict[str, Any]) -> None:
        """Record a trace.
        
        Args:
            trace_data: Trace data
        """
        with self._lock:
            trace_record = {
                **trace_data,
                'timestamp': time.time(),
            }
            self.traces.append(trace_record)
            self.emit('trace', trace_record)
    
    def record_error(self, error_data: Dict[str, Any]) -> None:
        """Record an error.
        
        Args:
            error_data: Error data
        """
        with self._lock:
            error_record = {
                **error_data,
                'timestamp': time.time(),
            }
            self.errors.append(error_record)
            self.emit('error', error_record)
    
    def record_resource_metrics(self, resource_data: Dict[str, Any]) -> None:
        """Record resource metrics.
        
        Args:
            resource_data: Resource data
        """
        with self._lock:
            now = time.time()
            
            # CPU usage
            if 'cpu' in resource_data:
                self._add_time_series('process_cpu_percent', resource_data['cpu'], now)
            
            # Memory usage
            if 'memory' in resource_data:
                memory = resource_data['memory']
                if 'rss' in memory:
                    self._add_time_series('process_memory_bytes', memory['rss'], now)
                if 'percent' in memory:
                    self._add_time_series('process_memory_percent', memory['percent'], now)
            
            # System metrics
            if 'system' in resource_data:
                system = resource_data['system']
                if 'load_average' in system and system['load_average']:
                    self._add_time_series('system_load_average', system['load_average'][0], now)
                if 'memory' in system:
                    memory_usage = system['memory'].get('percent', 0)
                    self._add_time_series('system_memory_usage', memory_usage, now)
            
            # Store complete resource snapshot
            resource_record = {
                'timestamp': now,
                **resource_data,
            }
            self.resource_metrics.append(resource_record)
            
            self.emit('resource', resource_record)
    
    def record_custom_metric(self, name: str, value: Union[int, float], attributes: Dict[str, Any]) -> None:
        """Record custom metric.
        
        Args:
            name: Metric name
            value: Metric value
            attributes: Metric attributes
        """
        with self._lock:
            now = time.time()
            
            if name not in self.custom_metrics:
                self.custom_metrics[name] = {'values': deque(maxlen=self.config.get('max_metric_points')), 'attributes': {}}
            
            metric = self.custom_metrics[name]
            metric['values'].append({'value': value, 'timestamp': now})
            metric['attributes'].update(attributes)
            
            self.emit('customMetric', {'name': name, 'value': value, 'attributes': attributes})
    
    def _add_time_series(self, metric_name: str, value: Union[int, float], timestamp: float) -> None:
        """Add time series data point.
        
        Args:
            metric_name: Metric name
            value: Metric value
            timestamp: Timestamp
        """
        metric = self.metrics[metric_name]
        if 'values' not in metric:
            metric['values'] = deque(maxlen=self.config.get('max_metric_points'))
        
        metric['values'].append({'value': value, 'timestamp': timestamp})
        metric['timestamp'] = timestamp
    
    def _calculate_requests_per_minute(self) -> None:
        """Calculate requests per minute."""
        now = time.time()
        one_minute_ago = now - 60
        
        recent_requests = [req for req in self.request_metrics if req['timestamp'] > one_minute_ago]
        self._add_time_series('http_requests_per_minute', len(recent_requests), now)
    
    def _update_error_rate(self) -> None:
        """Update error rate."""
        now = time.time()
        five_minutes_ago = now - 300
        
        recent_requests = [req for req in self.request_metrics if req['timestamp'] > five_minutes_ago]
        error_requests = [req for req in recent_requests if req['status_code'] >= 400]
        
        error_rate = (len(error_requests) / len(recent_requests) * 100) if recent_requests else 0.0
        
        self.metrics['http_error_rate']['value'] = error_rate
        self.metrics['http_error_rate']['timestamp'] = now
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get all metrics.
        
        Returns:
            All metrics data
        """
        with self._lock:
            return {
                'system': dict(self.metrics),
                'custom': {k: {'values': list(v['values']), 'attributes': v['attributes']} 
                          for k, v in self.custom_metrics.items()},
                'summary': self._get_metrics_summary(),
            }
    
    def _get_metrics_summary(self) -> Dict[str, Any]:
        """Get metrics summary.
        
        Returns:
            Metrics summary
        """
        now = time.time()
        five_minutes_ago = now - 300
        
        recent_requests = [req for req in self.request_metrics if req['timestamp'] > five_minutes_ago]
        error_requests = [req for req in recent_requests if req['status_code'] >= 400]
        
        # Calculate percentiles for response time
        durations = sorted([req['duration'] for req in recent_requests])
        p50 = self._percentile(durations, 0.5)
        p95 = self._percentile(durations, 0.95)
        p99 = self._percentile(durations, 0.99)
        
        return {
            'requests': {
                'total': self.metrics['http_requests_total']['value'],
                'per_minute': len(recent_requests),
                'error_rate': (len(error_requests) / len(recent_requests) * 100) if recent_requests else 0.0,
                'latency': {
                    'p50': p50 or 0,
                    'p95': p95 or 0,
                    'p99': p99 or 0,
                },
            },
            'resources': self._get_latest_resource_metrics(),
            'errors': len(self.errors),
            'traces': len(self.traces),
        }
    
    def _percentile(self, values: List[float], percentile: float) -> Optional[float]:
        """Calculate percentile.
        
        Args:
            values: Sorted values list
            percentile: Percentile (0.0-1.0)
            
        Returns:
            Percentile value
        """
        if not values:
            return None
        index = int(len(values) * percentile)
        if index >= len(values):
            index = len(values) - 1
        return values[index]
    
    def _get_latest_resource_metrics(self) -> Dict[str, Any]:
        """Get latest resource metrics.
        
        Returns:
            Latest resource metrics
        """
        if not self.resource_metrics:
            return {}
        
        latest = self.resource_metrics[-1]
        return {
            'cpu': latest.get('cpu', 0),
            'memory': latest.get('memory', {}),
            'system': latest.get('system', {}),
            'timestamp': latest.get('timestamp', time.time()),
        }
    
    def get_traces(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get traces.
        
        Args:
            limit: Maximum number of traces
            
        Returns:
            Traces list
        """
        with self._lock:
            traces = list(self.traces)
            return traces[-limit:][::-1]  # Return most recent first
    
    def get_errors(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get errors.
        
        Args:
            limit: Maximum number of errors
            
        Returns:
            Errors list
        """
        with self._lock:
            errors = list(self.errors)
            return errors[-limit:][::-1]  # Return most recent first
    
    def get_requests(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get request metrics.
        
        Args:
            limit: Maximum number of requests
            
        Returns:
            Request metrics list
        """
        with self._lock:
            requests = list(self.request_metrics)
            return requests[-limit:][::-1]  # Return most recent first
    
    def _persist_data(self) -> None:
        """Persist data to disk."""
        if not self.config.get('persistence'):
            return
        
        try:
            persistence_path = Path(self.config.get('persistence_path'))
            data = {
                'metrics': dict(self.metrics),
                'custom_metrics': {k: {'values': list(v['values']), 'attributes': v['attributes']} 
                                 for k, v in self.custom_metrics.items()},
                'traces': list(self.traces),
                'errors': list(self.errors),
                'request_metrics': list(self.request_metrics),
                'resource_metrics': list(self.resource_metrics),
                'timestamp': time.time(),
            }
            
            with open(persistence_path / 'data.json', 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as error:
            print(f"[DataStore] Failed to persist data: {error}")
    
    def _load_persisted_data(self) -> None:
        """Load persisted data."""
        try:
            persistence_path = Path(self.config.get('persistence_path'))
            data_file = persistence_path / 'data.json'
            
            if not data_file.exists():
                print("[DataStore] No persisted data found, starting fresh")
                return
            
            with open(data_file, 'r') as f:
                data = json.load(f)
            
            # Restore data
            self.metrics.update(data.get('metrics', {}))
            
            # Restore custom metrics
            for name, metric_data in data.get('custom_metrics', {}).items():
                self.custom_metrics[name] = {
                    'values': deque(metric_data['values'], maxlen=self.config.get('max_metric_points')),
                    'attributes': metric_data['attributes']
                }
            
            # Restore collections
            self.traces.extend(data.get('traces', []))
            self.errors.extend(data.get('errors', []))
            self.request_metrics.extend(data.get('request_metrics', []))
            self.resource_metrics.extend(data.get('resource_metrics', []))
            
            print("[DataStore] Loaded persisted data")
        except Exception as error:
            print(f"[DataStore] Failed to load persisted data: {error}")
    
    def clear(self) -> None:
        """Clear all data."""
        with self._lock:
            self.metrics.clear()
            self.custom_metrics.clear()
            self.traces.clear()
            self.errors.clear()
            self.request_metrics.clear()
            self.resource_metrics.clear()
            self._initialize_metrics()
            self.emit('clear', {})
    
    def get_stats(self) -> Dict[str, Any]:
        """Get data store statistics.
        
        Returns:
            Statistics dict
        """
        with self._lock:
            return {
                'metrics': len(self.metrics),
                'custom_metrics': len(self.custom_metrics),
                'traces': len(self.traces),
                'errors': len(self.errors),
                'requests': len(self.request_metrics),
                'resource_metrics': len(self.resource_metrics),
            }
    
    def shutdown(self) -> None:
        """Cleanup and shutdown."""
        if self.config.get('persistence'):
            self._persist_data()