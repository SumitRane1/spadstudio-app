// ═══ WEBSERIAL — Connection layer for ZMK Studio RPC ═══
// Handles opening/closing a serial connection to the nice!nano
// running Studio-enabled firmware (CONFIG_ZMK_STUDIO=y + studio-rpc-usb-uart).
//
// This module ONLY handles the raw serial transport (connect, read, write,
// disconnect). The protobuf RPC framing/parsing lives in studioRpc.js.


const WebSerial = (() => {

  let _port              = null;
  let _reader             = null;
  let _writer             = null;
  let _readLoopAbort      = false;
  let _onDataCallback     = null;
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
      throw new Error('WebSerial not supported. Use Chrome or Edge.');
    }

    if (_port) {
      throw new Error('Already connected. Disconnect first.');
    }

    // Show browser's serial port picker.
    // Filter to known nice!nano / nRF52840 USB-serial VID/PIDs where possible,
    // but the picker still lets the user choose any device as fallback.
    const filters = [
      { usbVendorId: 0x239A }, // Adafruit (nice!nano)
      { usbVendorId: 0x1915 }, // Nordic Semiconductor
      { usbVendorId: 0x2341 }, // Arduino-compatible clones
    ];

    try {
      _port = await navigator.serial.requestPort({ filters });
    } catch (e) {
      if (e.name === 'NotFoundError') throw new Error('No device selected.');
      throw new Error('Could not open device picker: ' + e.message);
    }

    // Studio's RPC transport runs over USB-CDC ACM at 115200 baud by default.
    const baudRate = options.baudRate || 115200;

    try {
      await _port.open({ baudRate });
    } catch (e) {
      _port = null;
      throw new Error('Failed to open serial port: ' + e.message);
    }

    // Listen for physical disconnect (unplug)
    navigator.serial.addEventListener('disconnect', _handleHardwareDisconnect);

    console.log('[WebSerial] Connected @', baudRate, 'baud');
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
    _readLoop(); // fire and forget
  }

  async function _readLoop() {
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
      console.warn('[WebSerial] Read loop ended:', e.message);
    } finally {
      try { _reader.releaseLock(); } catch (e) {}
      _reader = null;
    }
  }

  // ════════════════════════════════════════
  //  WRITE — send raw bytes (protobuf-framed messages from studioRpc.js)
  // ════════════════════════════════════════

  async function write(bytes) {
    if (!_port || !_port.writable) {
      throw new Error('Port not open. Call connect() first.');
    }
    _writer = _port.writable.getWriter();
    try {
      await _writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    } finally {
      _writer.releaseLock();
      _writer = null;
    }
  }

  // ════════════════════════════════════════
  //  DISCONNECT
  // ════════════════════════════════════════

  async function disconnect() {
    _readLoopAbort = true;

    try { if (_reader) await _reader.cancel(); } catch (e) {}
    try { if (_writer) await _writer.close(); } catch (e) {}

    if (_port) {
      try { await _port.close(); } catch (e) {}
    }

    navigator.serial.removeEventListener('disconnect', _handleHardwareDisconnect);

    _port   = null;
    _reader = null;
    _writer = null;
    _onDataCallback = null;

    console.log('[WebSerial] Disconnected');
  }

  // ════════════════════════════════════════
  //  HARDWARE DISCONNECT HANDLER (device unplugged)
  // ════════════════════════════════════════

  function _handleHardwareDisconnect(event) {
    if (event.target === _port) {
      console.warn('[WebSerial] Device physically unplugged');
      _readLoopAbort = true;
      _port   = null;
      _reader = null;
      _writer = null;
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

  // ════════════════════════════════════════
  //  RECONNECT TO PREVIOUSLY GRANTED PORT (no picker popup)
  // ════════════════════════════════════════

  async function reconnectSilently(baudRate = 115200) {
    if (!isSupported()) return false;

    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) return false;

    // Use the first previously-granted port (usually only one macropad)
    _port = ports[0];
    try {
      await _port.open({ baudRate });
      navigator.serial.addEventListener('disconnect', _handleHardwareDisconnect);
      console.log('[WebSerial] Silently reconnected to previously granted port');
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
    onDisconnect,
    reconnectSilently,
  };

})();
