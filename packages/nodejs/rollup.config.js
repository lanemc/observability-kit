import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';
import { terser } from 'rollup-plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

export default [
  // ES Module build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      resolve({
        preferBuiltins: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        rootDir: 'src'
      }),
      copy({
        targets: [
          { src: 'README.md', dest: 'dist' },
          { src: 'src/index.d.ts', dest: 'dist' }
        ]
      }),
      isProduction && terser()
    ].filter(Boolean),
    external: [
      // OpenTelemetry dependencies
      '@opentelemetry/api',
      '@opentelemetry/sdk-node',
      '@opentelemetry/auto-instrumentations-node',
      '@opentelemetry/instrumentation-express',
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-fs',
      '@opentelemetry/instrumentation-mongodb',
      '@opentelemetry/instrumentation-mysql',
      '@opentelemetry/instrumentation-redis',
      '@opentelemetry/resources',
      '@opentelemetry/semantic-conventions',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-metrics-otlp-http',
      '@opentelemetry/exporter-prometheus',
      '@opentelemetry/exporter-jaeger',
      // Node.js built-ins
      'http',
      'https',
      'fs',
      'path',
      'os',
      'url',
      'events',
      'stream',
      'util',
      // NPM dependencies
      'express',
      'cors',
      'ws',
      'open',
      'pidusage',
      'systeminformation'
    ]
  },
  // CommonJS build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'auto'
    },
    plugins: [
      resolve({
        preferBuiltins: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json'
      }),
      isProduction && terser()
    ].filter(Boolean),
    external: [
      // OpenTelemetry dependencies
      '@opentelemetry/api',
      '@opentelemetry/sdk-node',
      '@opentelemetry/auto-instrumentations-node',
      '@opentelemetry/instrumentation-express',
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-fs',
      '@opentelemetry/instrumentation-mongodb',
      '@opentelemetry/instrumentation-mysql',
      '@opentelemetry/instrumentation-redis',
      '@opentelemetry/resources',
      '@opentelemetry/semantic-conventions',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/exporter-metrics-otlp-http',
      '@opentelemetry/exporter-prometheus',
      '@opentelemetry/exporter-jaeger',
      // Node.js built-ins
      'http',
      'https',
      'fs',
      'path',
      'os',
      'url',
      'events',
      'stream',
      'util',
      // NPM dependencies
      'express',
      'cors',
      'ws',
      'open',
      'pidusage',
      'systeminformation'
    ]
  }
];