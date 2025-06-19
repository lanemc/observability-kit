"""Configuration management for lite observability."""

import os
from typing import Any, Dict, Optional, Union


class ConfigManager:
    """Manages configuration for the observability kit."""
    
    def __init__(self, options: Optional[Dict[str, Any]] = None):
        """Initialize configuration.
        
        Args:
            options: Configuration options dict
        """
        self.config = self._build_config(options or {})
    
    def _build_config(self, options: Dict[str, Any]) -> Dict[str, Any]:
        """Build configuration from options and environment variables.
        
        Args:
            options: User-provided options
            
        Returns:
            Complete configuration dict
        """
        default_config = {
            # Core settings
            'service_name': os.getenv('LITEOBS_SERVICE_NAME', 'unknown-service'),
            'service_version': os.getenv('LITEOBS_SERVICE_VERSION', '1.0.0'),
            'environment': os.getenv('ENVIRONMENT', 'development'),
            
            # Dashboard settings
            'dashboard': self._parse_bool(os.getenv('LITEOBS_DASHBOARD'), True),
            'dashboard_port': int(os.getenv('LITEOBS_DASHBOARD_PORT', '8001')),
            'auto_open': self._parse_bool(os.getenv('LITEOBS_AUTO_OPEN'), True),
            
            # Tracing settings
            'enable_tracing': self._parse_bool(os.getenv('LITEOBS_ENABLE_TRACING'), True),
            'sample_rate': float(os.getenv('LITEOBS_SAMPLE_RATE', '1.0')),
            
            # Metrics settings
            'enable_metrics': self._parse_bool(os.getenv('LITEOBS_ENABLE_METRICS'), True),
            'metrics_interval': int(os.getenv('LITEOBS_METRICS_INTERVAL', '5000')),
            
            # Resource monitoring
            'enable_resource_monitoring': self._parse_bool(os.getenv('LITEOBS_ENABLE_RESOURCE_MONITORING'), True),
            'resource_interval': int(os.getenv('LITEOBS_RESOURCE_INTERVAL', '5000')),
            
            # Error tracking
            'enable_error_tracking': self._parse_bool(os.getenv('LITEOBS_ENABLE_ERROR_TRACKING'), True),
            
            # Data retention
            'max_traces': int(os.getenv('LITEOBS_MAX_TRACES', '1000')),
            'max_errors': int(os.getenv('LITEOBS_MAX_ERRORS', '500')),
            'max_metric_points': int(os.getenv('LITEOBS_MAX_METRIC_POINTS', '1440')),  # 24h at 1min intervals
            
            # Persistence
            'persistence': self._parse_bool(os.getenv('LITEOBS_PERSISTENCE'), False),
            'persistence_path': os.getenv('LITEOBS_PERSISTENCE_PATH', '.observability'),
            
            # External integrations
            'enable_prometheus': self._parse_bool(os.getenv('LITEOBS_ENABLE_PROMETHEUS'), False),
            'prometheus_port': int(os.getenv('LITEOBS_PROMETHEUS_PORT', '9090')),
            
            # OTLP export
            'otlp_endpoint': os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT'),
            'otlp_headers': self._parse_headers(os.getenv('OTEL_EXPORTER_OTLP_HEADERS')),
            
            # Performance settings
            'max_concurrent_requests': int(os.getenv('LITEOBS_MAX_CONCURRENT_REQUESTS', '1000')),
            'memory_threshold': int(os.getenv('LITEOBS_MEMORY_THRESHOLD', str(512 * 1024 * 1024))),  # 512MB
            'cpu_threshold': float(os.getenv('LITEOBS_CPU_THRESHOLD', '80.0')),
            
            # FastAPI specific
            'auto_instrument_fastapi': self._parse_bool(os.getenv('LITEOBS_AUTO_INSTRUMENT_FASTAPI'), True),
            'capture_request_bodies': self._parse_bool(os.getenv('LITEOBS_CAPTURE_REQUEST_BODIES'), False),
            'capture_response_bodies': self._parse_bool(os.getenv('LITEOBS_CAPTURE_RESPONSE_BODIES'), False),
        }
        
        # Merge with provided options (options take precedence)
        merged_config = {**default_config, **options}
        
        # Validate configuration
        self._validate_config(merged_config)
        
        return merged_config
    
    def _parse_bool(self, value: Optional[str], default: bool = False) -> bool:
        """Parse boolean environment variable.
        
        Args:
            value: Environment variable value
            default: Default value if not set
            
        Returns:
            Boolean value
        """
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        return value.lower() in ('true', '1', 'yes', 'on')
    
    def _parse_headers(self, headers_string: Optional[str]) -> Dict[str, str]:
        """Parse headers from environment variable.
        
        Args:
            headers_string: Comma-separated headers string
            
        Returns:
            Headers dict
        """
        if not headers_string:
            return {}
        
        headers = {}
        for header in headers_string.split(','):
            if '=' in header:
                key, value = header.split('=', 1)
                headers[key.strip()] = value.strip()
        
        return headers
    
    def _validate_config(self, config: Dict[str, Any]) -> None:
        """Validate configuration.
        
        Args:
            config: Configuration to validate
            
        Raises:
            ValueError: If configuration is invalid
        """
        # Validate ports
        if not (1 <= config['dashboard_port'] <= 65535):
            raise ValueError(f"Invalid dashboard port: {config['dashboard_port']}")
        
        if not (1 <= config['prometheus_port'] <= 65535):
            raise ValueError(f"Invalid Prometheus port: {config['prometheus_port']}")
        
        # Validate sample rate
        if not (0.0 <= config['sample_rate'] <= 1.0):
            raise ValueError(f"Invalid sample rate: {config['sample_rate']}. Must be between 0 and 1")
        
        # Validate intervals
        if config['metrics_interval'] < 1000:
            raise ValueError(f"Metrics interval too low: {config['metrics_interval']}ms. Minimum is 1000ms")
        
        if config['resource_interval'] < 1000:
            raise ValueError(f"Resource interval too low: {config['resource_interval']}ms. Minimum is 1000ms")
        
        # Validate limits
        if config['max_traces'] < 1:
            raise ValueError(f"Invalid max_traces: {config['max_traces']}. Must be at least 1")
        
        if config['max_errors'] < 1:
            raise ValueError(f"Invalid max_errors: {config['max_errors']}. Must be at least 1")
        
        # Validate thresholds
        if not (0.0 <= config['cpu_threshold'] <= 100.0):
            raise ValueError(f"Invalid CPU threshold: {config['cpu_threshold']}%. Must be between 0 and 100")
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value.
        
        Args:
            key: Configuration key
            default: Default value if key not found
            
        Returns:
            Configuration value
        """
        return self.config.get(key, default)
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value.
        
        Args:
            key: Configuration key
            value: Configuration value
        """
        self.config[key] = value
    
    def get_all(self) -> Dict[str, Any]:
        """Get all configuration.
        
        Returns:
            Complete configuration dict
        """
        return self.config.copy()
    
    def is_development(self) -> bool:
        """Check if running in development mode.
        
        Returns:
            True if in development mode
        """
        return self.config['environment'] == 'development'
    
    def is_production(self) -> bool:
        """Check if running in production mode.
        
        Returns:
            True if in production mode
        """
        return self.config['environment'] == 'production'
    
    def get_summary(self) -> Dict[str, Any]:
        """Get configuration summary for logging.
        
        Returns:
            Configuration summary
        """
        return {
            'service_name': self.config['service_name'],
            'environment': self.config['environment'],
            'dashboard': self.config['dashboard'],
            'dashboard_port': self.config['dashboard_port'],
            'enable_tracing': self.config['enable_tracing'],
            'enable_metrics': self.config['enable_metrics'],
            'sample_rate': self.config['sample_rate'],
            'persistence': self.config['persistence'],
        }