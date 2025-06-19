const express = require('express');
const obs = require('../../packages/nodejs/src/index');

// Initialize observability with dashboard
obs.init({ 
  dashboard: true,
  dashboardPort: 3001,
  serviceName: 'example-express-app',
  environment: 'development'
});

// Create Express app
const app = express();

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hello from Express with Observability!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/users', async (req, res) => {
  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  
  // Use custom span
  await obs.createSpan('fetch-users', async (span) => {
    span.setAttributes({ userCount: 3 });
    
    // Simulate database call
    await new Promise(resolve => setTimeout(resolve, 50));
    
    res.json([
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      { id: 3, name: 'Bob Johnson', email: 'bob@example.com' }
    ]);
  });
});

app.post('/api/users', (req, res) => {
  // Record custom metric
  obs.recordMetric('user_created', 1, { source: 'api' });
  
  const newUser = {
    id: Date.now(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  
  res.status(201).json(newUser);
});

app.get('/api/slow', async (req, res) => {
  // Simulate slow endpoint
  await new Promise(resolve => setTimeout(resolve, 2000));
  res.json({ message: 'This was slow!' });
});

app.get('/api/error', (req, res) => {
  // Simulate error
  throw new Error('Simulated error for testing');
});

app.get('/api/metrics', (req, res) => {
  // Get current metrics
  res.json(obs.getMetrics());
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
  console.log(`📊 Observability dashboard: http://localhost:3001`);
  console.log('\\n📋 Try these endpoints:');
  console.log(`  GET  http://localhost:${PORT}/`);
  console.log(`  GET  http://localhost:${PORT}/api/users`);
  console.log(`  POST http://localhost:${PORT}/api/users`);
  console.log(`  GET  http://localhost:${PORT}/api/slow`);
  console.log(`  GET  http://localhost:${PORT}/api/error`);
  console.log(`  GET  http://localhost:${PORT}/api/metrics`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\\n🔄 Shutting down gracefully...');
  await obs.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\\n🔄 Shutting down gracefully...');
  await obs.shutdown();
  process.exit(0);
});