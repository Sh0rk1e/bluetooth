const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');

class BluetoothSerial extends EventEmitter {
  constructor(port, baudRate = 9600) {
    super();
    this.port = port;
    this.baudRate = baudRate;
    this.serialPort = null;
    this.parser = null;
    this.isConnected = false;
    this.reconnectInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // 5 seconds
    this.buffer = '';
  }

  async connect() {
    try {
      console.log(`Connecting to ${this.port} at ${this.baudRate} baud...`);
      
      // Close existing connection if any
      if (this.serialPort) {
        await this.close();
      }

      // Create new serial port instance
      this.serialPort = new SerialPort({
        path: this.port,
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: true
      });

      // Setup parser
      this.parser = this.serialPort.pipe(new ReadlineParser({
        delimiter: '\n',
        encoding: 'utf8'
      }));

      // Event handlers
      this.serialPort.on('open', () => {
        console.log(`✅ Successfully connected to ${this.port}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
        
        this.emit('connect');
        
        // Send test message to Arduino
        setTimeout(() => {
          this.sendCommand('?'); // Test command
        }, 1000);
      });

      this.parser.on('data', (data) => {
        const trimmedData = data.trim();
        if (trimmedData) {
          console.log(`📥 Arduino: ${trimmedData}`);
          this.emit('data', trimmedData);
        }
      });

      this.serialPort.on('error', (error) => {
        console.error(`❌ Serial port error: ${error.message}`);
        this.isConnected = false;
        this.emit('error', error);
        
        // Attempt to reconnect
        if (!this.reconnectInterval) {
          this._scheduleReconnect();
        }
      });

      this.serialPort.on('close', () => {
        console.log(`🔌 Disconnected from ${this.port}`);
        this.isConnected = false;
        this.emit('disconnect');
        
        if (!this.reconnectInterval) {
          this._scheduleReconnect();
        }
      });

      // Handle unpipe events
      this.parser.on('close', () => {
        console.log('Parser closed');
      });

    } catch (error) {
      console.error(`❌ Failed to initialize serial port: ${error.message}`);
      this.emit('error', error);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectInterval || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay/1000} seconds...`);

    this.reconnectInterval = setInterval(() => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        console.log('Attempting to reconnect...');
        this.connect();
      } else {
        console.log('Max reconnection attempts reached. Please check your connection.');
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
        this.emit('max_reconnect');
      }
    }, this.reconnectDelay);
  }

  sendCommand(command) {
    if (!this.isConnected || !this.serialPort) {
      console.error('❌ Cannot send command: Bluetooth not connected');
      this.emit('send_error', 'Bluetooth not connected');
      return false;
    }

    try {
      // Ensure command ends with newline
      const cmd = command.endsWith('\n') ? command : command + '\n';
      this.serialPort.write(cmd, (error) => {
        if (error) {
          console.error(`❌ Failed to send command "${command}":`, error.message);
          this.emit('send_error', error.message);
        } else {
          console.log(`📤 Sent to Arduino: ${command}`);
          this.emit('send_success', command);
        }
      });
      return true;
    } catch (error) {
      console.error(`❌ Error sending command: ${error.message}`);
      this.emit('error', error);
      return false;
    }
  }

  async close() {
    console.log('Closing Bluetooth connection...');
    
    // Clear reconnect interval
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    // Close serial port if open
    if (this.serialPort && this.serialPort.isOpen) {
      return new Promise((resolve) => {
        this.serialPort.close((error) => {
          if (error) {
            console.error('Error closing serial port:', error.message);
          } else {
            console.log('Serial port closed');
          }
          this.isConnected = false;
          resolve();
        });
      });
    }

    this.isConnected = false;
    return Promise.resolve();
  }

  // Helper method to get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      port: this.port,
      baudRate: this.baudRate,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  // Static method to list available ports
  static async listPorts() {
    try {
      const ports = await SerialPort.list();
      console.log('\n🔍 Available serial ports:');
      ports.forEach((port, index) => {
        console.log(`${index + 1}. ${port.path}`);
        console.log(`   Manufacturer: ${port.manufacturer || 'Unknown'}`);
        console.log(`   Product ID: ${port.productId || 'Unknown'}`);
        console.log(`   Vendor ID: ${port.vendorId || 'Unknown'}`);
        if (port.pnpId) console.log(`   PNP ID: ${port.pnpId}`);
        console.log('');
      });
      return ports;
    } catch (error) {
      console.error('Error listing ports:', error);
      return [];
    }
  }
}

module.exports = BluetoothSerial;