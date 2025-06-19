const { describe, test, expect } = require('@jest/globals');

describe('Observability Kit', () => {
  test('should export main functions', () => {
    // Test that main module exists and has expected structure
    const fs = require('fs');
    const path = require('path');
    
    const indexPath = path.join(__dirname, '../src/index.js');
    expect(fs.existsSync(indexPath)).toBe(true);
    
    // Read the file content to verify it has exports
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toContain('module.exports');
  });

  test('package.json should have correct structure', () => {
    const pkg = require('../package.json');
    
    expect(pkg.name).toBe('@thesaasdevkit/observability-kit');
    expect(pkg.version).toBeDefined();
    expect(pkg.main).toBe('dist/index.cjs.js');
    expect(pkg.module).toBe('dist/index.esm.js');
    expect(pkg.types).toBe('dist/index.d.ts');
  });

  test('should have required dependencies', () => {
    const pkg = require('../package.json');
    
    // Check for key OpenTelemetry dependencies
    expect(pkg.dependencies['@opentelemetry/api']).toBeDefined();
    expect(pkg.dependencies['@opentelemetry/sdk-node']).toBeDefined();
    expect(pkg.dependencies['express']).toBeDefined();
  });
});