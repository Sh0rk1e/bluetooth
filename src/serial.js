const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class BluetoothSerial {
  constructor(port = 'COM6', baudRate = 9600) {
    this.port = port;
    this.baudRate = baudRate;
    this.serialPort = null;
    this.parser = null;
    this.isConnected = false;
    this.onDataCallback = null;
    this.onErrorCallback = null;
    this.onConnectCallback = null;
    this.reconnectInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.autoReconnect = true;
  }

  async connect() {
    console.log(`Connecting to Bluetooth device on ${this.port} at ${this.baudRate} baud...`);
    
    // Check available ports first (for debugging)
    try {
      const ports = await SerialPort.list();
      console.log('Available serial ports:');
      ports.forEach(port => {
        console.log(`  - ${port.path} (${port.manufacturer || 'Unknown'})`);
      });
    } catch (err) {
      console.log('Could not list serial ports:', err.message);
    }

    try {
      // Create the serial port
      this.serialPort = new SerialPort({
        path: this.port,
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false // We'll open manually to handle errors better
      });

      // Handle connection open
      this.serialPort.on('open', () => {
        console.log(`Successfully connected to ${this.port}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Create a parser that reads lines
        this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        
        // Handle incoming data
        this.parser.on('data', (data) => {
          const trimmedData = data.trim();
          if (trimmedData) {
            console.log(`[Arduino] ${trimmedData}`);
            
            if (this.onDataCallback) {
              this.onDataCallback(trimmedData);
            }
          }
        });

        // Notify of successful connection
        if (this.onConnectCallback) {
          this.onConnectCallback();
        }
      });

      // Handle errors
      this.serialPort.on('error', (err) => {
        console.error('Serial port error:', err.message);
        this.isConnected = false;
        
        if (this.onErrorCallback) {
          this.onErrorCallback(err);
        }
        
        if (this.autoReconnect) {
          this.attemptReconnect();
        }
      });

      // Handle port close
      this.serialPort.on('close', () => {
        console.log('Serial port closed');
        this.isConnected = false;
        
        if (this.autoReconnect) {
          this.attemptReconnect();
        }
      });

      // Now open the port
      this.serialPort.open((err) => {
        if (err) {
          console.error('Failed to open serial port:', err.message);
          this.isConnected = false;
          
          if (this.onErrorCallback) {
            this.onErrorCallback(err);
          }
          
          if (this.autoReconnect) {
            this.attemptReconnect();
          }
        }
      });

    } catch (error) {
      console.error('Failed to create serial port:', error.message);
      if (this.autoReconnect) {
        this.attemptReconnect();
      }
    }
  }

  attemptReconnect() {
    if (this.reconnectInterval || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached. Giving up.');
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    
    console.log(`Attempting to reconnect in ${delay/1000} seconds (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      this.connect();
    }, delay);
  }

  sendCommand(command) {
    if (!this.isConnected || !this.serialPort) {
      console.error('Cannot send command: Not connected to Bluetooth device');
      return false;
    }

    if (!this.serialPort.isOpen) {
      console.error('Cannot send command: Serial port is not open');
      return false;
    }

    try {
      // Send command with newline
      this.serialPort.write(command + '\n');
      console.log(`Sent command: ${command}`);
      return true;
    } catch (error) {
      console.error('Failed to send command:', error.message);
      return false;
    }
  }

  sendRaw(data) {
    if (!this.isConnected || !this.serialPort) {
      console.error('Cannot send data: Not connected to Bluetooth device');
      return false;
    }

    try {
      this.serialPort.write(data);
      return true;
    } catch (error) {
      console.error('Failed to send raw data:', error.message);
      return false;
    }
  }

  close() {
    this.autoReconnect = false;
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.close((err) => {
        if (err) {
          console.error('Error closing serial port:', err.message);
        }
      });
    }
    
    this.isConnected = false;
    console.log('Bluetooth connection closed');
  }

  // Get current connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      port: this.port,
      baudRate: this.baudRate,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // Event handlers
  onData(callback) {
    this.onDataCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  onConnect(callback) {
    this.onConnectCallback = callback;
  }

  // Update port settings (useful if port changes)
  updatePort(newPort, newBaudRate = null) {
    this.close();
    this.port = newPort;
    if (newBaudRate) {
      this.baudRate = newBaudRate;
    }
    this.autoReconnect = true;
    this.connect();
  }
}

module.exports = BluetoothSerial;