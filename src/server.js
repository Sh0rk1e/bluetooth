require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const BluetoothSerial = require('./serial');

// Configuration
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM6';
const BAUD_RATE = parseInt(process.env.BAUD_RATE) || 9600;
const HTTP_PORT = parseInt(process.env.HTTP_PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Initialize
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const bluetooth = new BluetoothSerial(SERIAL_PORT, BAUD_RATE);

// Store connected clients
const clients = new Set();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(PUBLIC_DIR));

// Create public directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  console.log(`Created public directory: ${PUBLIC_DIR}`);
  
  // Copy the HTML file if it exists in root
  const rootHtml = path.join(__dirname, 'index.html');
  if (fs.existsSync(rootHtml)) {
    fs.copyFileSync(rootHtml, path.join(PUBLIC_DIR, 'index.html'));
    console.log('Copied HTML file to public directory');
  }
}

// API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    bluetooth: bluetooth.getStatus(),
    clients: clients.size,
    server: {
      port: HTTP_PORT,
      uptime: process.uptime()
    }
  });
});

app.get('/api/ports', async (req, res) => {
  try {
    const ports = await BluetoothSerial.listPorts();
    res.json({ ports });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send', (req, res) => {
  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  const success = bluetooth.sendCommand(command);
  
  if (success) {
    res.json({ success: true, message: `Command "${command}" sent` });
  } else {
    res.status(500).json({ error: 'Failed to send command' });
  }
});

app.get('/api/connect', (req, res) => {
  bluetooth.connect();
  res.json({ message: 'Attempting to connect to Bluetooth' });
});

app.get('/api/disconnect', async (req, res) => {
  await bluetooth.close();
  res.json({ message: 'Bluetooth disconnected' });
});

// WebSocket Server
wss.on('connection', (ws, req) => {
  console.log(`🌐 New WebSocket client connected from ${req.socket.remoteAddress}`);
  clients.add(ws);
  
  // Send initial status
  ws.send(JSON.stringify({
    type: 'status',
    timestamp: Date.now(),
    bluetoothConnected: bluetooth.isConnected,
    message: 'Connected to server'
  }));
  
  // Send Bluetooth status
  ws.send(JSON.stringify({
    type: 'bluetooth_status',
    connected: bluetooth.isConnected,
    port: SERIAL_PORT,
    baudRate: BAUD_RATE
  }));
  
  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 WebSocket message: ${JSON.stringify(data)}`);
      
      switch (data.type) {
        case 'command':
          if (data.command) {
            const success = bluetooth.sendCommand(data.command);
            
            // Send acknowledgment
            ws.send(JSON.stringify({
              type: 'ack',
              command: data.command,
              success: success,
              timestamp: Date.now()
            }));
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          break;
          
        case 'get_status':
          ws.send(JSON.stringify({
            type: 'status_update',
            bluetoothConnected: bluetooth.isConnected,
            clients: clients.size
          }));
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        timestamp: Date.now()
      }));
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('🌐 WebSocket client disconnected');
    clients.delete(ws);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Bluetooth Event Handlers
bluetooth.on('connect', () => {
  console.log('✅ Bluetooth connected event - notifying all clients');
  
  // Broadcast to all connected clients
  broadcast({
    type: 'bluetooth_status',
    connected: true,
    port: SERIAL_PORT,
    baudRate: BAUD_RATE,
    timestamp: Date.now()
  });
});

bluetooth.on('data', (data) => {
  console.log(`📥 Broadcasting Arduino data: ${data}`);
  
  // Broadcast to all connected clients
  broadcast({
    type: 'arduino_data',
    data: data,
    timestamp: Date.now()
  });
});

bluetooth.on('error', (error) => {
  console.error('❌ Bluetooth error:', error.message);
  
  broadcast({
    type: 'bluetooth_error',
    error: error.message,
    timestamp: Date.now()
  });
});

bluetooth.on('disconnect', () => {
  console.log('🔌 Bluetooth disconnected event');
  
  broadcast({
    type: 'bluetooth_status',
    connected: false,
    timestamp: Date.now()
  });
});

bluetooth.on('send_success', (command) => {
  console.log(`✅ Command sent successfully: ${command}`);
});

bluetooth.on('send_error', (error) => {
  console.error(`❌ Command send error: ${error}`);
});

// Helper function to broadcast to all clients
function broadcast(message) {
  const messageStr = JSON.stringify(message);
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Start Server
server.listen(HTTP_PORT, () => {
  console.log(`🚀 Server running on http://localhost:${HTTP_PORT}`);
  console.log(`📡 WebSocket server on ws://localhost:${HTTP_PORT}`);
  console.log(`🔌 Connecting to Bluetooth on ${SERIAL_PORT} at ${BAUD_RATE} baud`);
  
  // List available ports on startup
  BluetoothSerial.listPorts();
  
  // Auto-connect to Bluetooth
  bluetooth.connect();
});

// Graceful Shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close all WebSocket connections
  clients.forEach((client) => {
    client.close();
  });
  wss.close();
  
  // Close Bluetooth connection
  await bluetooth.close();
  
  server.close(() => {
    console.log('✅ Server shut down successfully');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('⚠️ Forcing shutdown...');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});