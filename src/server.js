const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const BluetoothSerial = require('./serial');

// Configuration
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM6';
const BAUD_RATE = parseInt(process.env.BAUD_RATE) || 9600;
const HTTP_PORT = parseInt(process.env.HTTP_PORT) || 3000;

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Initialize Bluetooth serial connection
const bluetooth = new BluetoothSerial(SERIAL_PORT, BAUD_RATE);

// Store connected WebSocket clients
const clients = new Set();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bluetoothConnected: bluetooth.isConnected,
    clientsConnected: clients.size,
    serialPort: SERIAL_PORT
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  clients.add(ws);

  // Send connection status
  ws.send(JSON.stringify({
    type: 'status',
    bluetoothConnected: bluetooth.isConnected
  }));

  // Handle incoming messages from web client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.command) {
        console.log(`Received command from web: ${data.command}`);
        
        // Send command to Arduino
        const success = bluetooth.sendCommand(data.command);
        
        // Send acknowledgment back to client
        ws.send(JSON.stringify({
          type: 'ack',
          command: data.command,
          success: success
        }));
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Bluetooth event handlers
bluetooth.onConnect(() => {
  console.log('Bluetooth connected - notifying clients');
  
  // Notify all connected clients
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'status',
        bluetoothConnected: true
      }));
    }
  });
});

bluetooth.onData((data) => {
  // Broadcast Arduino messages to all connected clients
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'data',
        from: 'arduino',
        message: data
      }));
    }
  });
});

bluetooth.onError((error) => {
  console.error('Bluetooth error:', error);
  
  // Notify clients
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'status',
        bluetoothConnected: false,
        error: error.message
      }));
    }
  });
});

// Start the server
server.listen(HTTP_PORT, () => {
  console.log(`Server running on http://localhost:${HTTP_PORT}`);
  console.log(`WebSocket server running on ws://localhost:${HTTP_PORT}`);
  
  // Connect to Bluetooth
  bluetooth.connect();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  
  // Close all WebSocket connections
  clients.forEach(client => client.close());
  wss.close();
  
  // Close Bluetooth connection
  bluetooth.close();
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});