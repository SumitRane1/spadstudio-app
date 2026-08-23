// ═══ WEBSERIAL — Connection layer for ZMK Studio RPC ═══
// Handles opening/closing a serial connection to the nice!nano
// running Studio-enabled firmware (CONFIG_ZMK_STUDIO=y + studio-rpc-usb-uart).
//
// This module ONLY handles raw serial transport (connect/read/write/disconnect).
// Protobuf RPC framing/parsing lives in studioRpc.js.
//
// IMPORTANT FOR FIRST TESTING:
// requestPort() intentionally has NO vendor/product filter. ZMK Studio's
// USB-CDC serial interface can use a VID/PID different from the board's
// bootloader VID/PID. A filter caused Chrome to display "No compatible
// devices found" even if the device was present. Once a real device is
// confirmed in the chooser, add its exact VID/PID later if desired.


const WebSerial = (() => {

  let _port                 = null;
  let _reader               = null;
  let _writer               = null;
  let _readLoopAbort        = false;
  let _onDataCallback       = null;
  let _onDisconnectCallback = null;

  // ════════════════════════════════════════
  //  SUPPORT CHECK
  // ════════════════════════════════════════

  function isSupported() {
    return 'serial' in navigator;
  }

  // ════════════════════════════════════════
  //  CONNECT — must be called from a user gesture (button click)
  // ════════════════════════════════════════

  async function connect(options = {}) {
    if (!isSupported()) {
      throw new Error('WebSerial is not supported. Use Chrome or Edge.');
    }

    if (_port) {
      throw new Error('Already connected. Disconnect first.');
    }

    try {
      // Do NOT pass filters during initial testing.
      // This displays every serial device that Windows/Chrome can see.
      _port = await navigator.serial.requestPort();
    } catch (e) {
      if (e.name === 'NotFoundError') throw new Error('No device selected.');
      throw new Error('Could not open the serial device picker: ' + e.message);
    }

    // The studio-rpc-usb-uart snippet uses USB CDC ACM. For CDC devices the
    // baud rate is generally ignored by USB itself, but Web Serial still
    // requires one when opening the port; 115200 is ZMK Studio's convention.
    const baudRate = options.baudRate || 115200;

    try {
      await _port.open({ baudRate });
    } catch (e) {
      _port = null;
      throw new Error('Failed to open serial port: ' + e.message);
    }

    navigator.serial.addEventListener('disconnect', _handleHardwareDisconnect);

    const info = _port.getInfo ? _port.getInfo() : {};
    console.log('[WebSerial] Connected @', baudRate, 'baud', info);
    return true;
  }

  // ════════════════════════════════════════
  //  START READ LOOP — streams raw bytes to a callback
  // ════════════════════════════════════════

  function startReading(onData) {
    if (!_port || !_port.readable) {
      throw new Error('Port not open. Call connect() first.');
    }

    _onDataCallback = onData;
    _readLoopAbort = false;
    _readLoop(); // fire-and-forget async loop
  }

  async function _readLoop() {
    if (!_port?.readable) return;

    _reader = _port.readable.getReader();
    try {
      while (!_readLoopAbort) {
        const { value, done } = await _reader.read();
        if (done) break;
        if (value && _onDataCallback) {
          _onDataCallback(value); // Uint8Array chunk
        }
      }
    } catch (e) {
      // cancel()/unplug commonly ends read() with an error; only log it.
      if (!_readLoopAbort) {
        console.warn('[WebSerial] Read loop ended:', e.message);
      }
    } finally {
      try { _reader?.releaseLock(); } catch (e) {}
      _reader = null;
    }
  }

  // ════════════════════════════════════════
  //  WRITE — send raw bytes (protobuf frames from studioRpc.js)
  // ════════════════════════════════════════

  async function write(bytes) {
    if (!_port || !_port.writable) {
      throw new Error('Port not open. Call connect() first.');
    }

    // A writer lock is temporary for each write. This avoids holding it while
    // the read loop is running on its separate readable stream.
    const writer = _port.writable.getWriter();
    try {
      await writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    } finally {
      writer.releaseLock();
    }
  }

  // ════════════════════════════════════════
  //  DISCONNECT
  // ════════════════════════════════════════

  async function disconnect() {
    _readLoopAbort = true;

    try { await _reader?.cancel(); } catch (e) {}
    try { _reader?.releaseLock(); } catch (e) {}
    _reader = null;

    const portToClose = _port;
    _port = null;
    _onDataCallback = null;

    navigator.serial.removeEventListener('disconnect', _handleHardwareDisconnect);

    if (portToClose) {
      try { await portToClose.close(); } catch (e) {}
    }

    console.log('[WebSerial] Disconnected');
  }

  // ════════════════════════════════════════
  //  HARDWARE DISCONNECT HANDLER (device unplugged)
  // ════════════════════════════════════════

  function _handleHardwareDisconnect(event) {
    if (event.target === _port) {
      console.warn('[WebSerial] Device physically unplugged');
      _readLoopAbort = true;
      _port = null;
      _reader = null;
      _writer = null;
      _onDataCallback = null;

      navigator.serial.removeEventListener('disconnect', _handleHardwareDisconnect);
      if (_onDisconnectCallback) _onDisconnectCallback();
    }
  }

  function onDisconnect(callback) {
    _onDisconnectCallback = callback;
  }

  // ════════════════════════════════════════
  //  STATE HELPERS
  // ════════════════════════════════════════

  function isConnected() {
    return _port !== null;
  }

  function getDeviceInfo() {
    return _port?.getInfo ? _port.getInfo() : null;
  }

  // ════════════════════════════════════════
  //  RECONNECT TO A PREVIOUSLY GRANTED PORT (no picker popup)
  // ════════════════════════════════════════

  async function reconnectSilently(baudRate = 115200) {
    if (!isSupported() || _port) return false;

    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) return false;

    // Usually only one device was granted. If multiple exist, the next normal
    // Send to Device click lets the user choose explicitly in the picker.
    const candidate = ports[0];

    try {
      await candidate.open({ baudRate });
      _port = candidate;
      navigator.serial.addEventListener('disconnect', _handleHardwareDisconnect);
      console.log('[WebSerial] Silently reconnected to previously granted port', getDeviceInfo());
      return true;
    } catch (e) {
      _port = null;
      return false;
    }
  }

  return {
    isSupported,
    connect,
    startReading,
    write,
    disconnect,
    isConnected,
    getDeviceInfo,
    onDisconnect,
    reconnectSilently,
  };

})();
