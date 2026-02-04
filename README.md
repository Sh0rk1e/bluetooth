# Arduino Bluetooth Bridge with Web Control

A Node.js application that bridges a web browser to an Arduino via Bluetooth (HC-05 module), allowing you to control the Arduino from a web interface.

## Features

- Web interface with Forward, Backward, and Stop buttons
- Real-time communication via WebSockets
- Bluetooth serial communication with HC-05 module
- Automatic reconnection handling
- Logging of all Arduino messages

## Hardware Requirements

1. Arduino board (Uno, Nano, Mega, etc.)
2. HC-05 Bluetooth module
3. Proper wiring between Arduino and HC-05

### HC-05 to Arduino Wiring:
- VCC → 5V
- GND → GND
- TX → RX (Pin 0 on Uno/Nano)
- RX → TX (Pin 1 on Uno/Nano)

## Arduino Sketch Example

Upload this to your Arduino:

```cpp
void setup() {
  Serial.begin(9600);
  // Initialize your motors here
}

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();
    
    switch(command) {
      case 'F':
        // Move forward code
        Serial.println("Moving forward");
        break;
      case 'B':
        // Move backward code
        Serial.println("Moving backward");
        break;
      case 'S':
        // Stop code
        Serial.println("Stopping");
        break;
      default:
        Serial.println("Unknown command");
    }
  }
}