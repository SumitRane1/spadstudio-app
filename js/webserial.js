// ═══ WEBSERIAL — Connection layer for ZMK Studio RPC ═══
// Handles opening/closing a serial connection to the nice!nano
// running Studio-enabled firmware (CONFIG_ZMK_STUDIO=y + studio-rpc-usb-uart).
//
// This module ONLY handles raw serial transport (connect/read/write/disconnect).
// Protobuf RPC framing/parsing lives in studioRpc.js.
//
// ═══ FIX (2026-08-24) — SERIALIZED WRITES ═══
// StudioRpc.loadAllBehaviors() fires many getBehaviorDetails() calls in
// parallel via Promise.all(). Each one called write(), and each write()
// independently called _port.writable.getWriter(). When two writes
// overlapped in time, the second getWriter() threw:
//   "Cannot create writer when WritableStream is locked"
// Fix: all writes now go through a single promise chain (_writeQueue) so
// only one write is ever in flight on the stream at a time, regardless of
// how many callers invoke write() concurrently.


const WebSerial = (() => {

  let _port                 = null;
  let _reader               = null;
  let _readLoopAbort        = false;
  let _onDataCallback       = null;
  let _onDisconnectCallback = null;

  // Serializes all write() calls so only one is ever active on the
  // WritableStream at a time — prevents concurrent getWriter() lock errors.
  let _writeQueue = Promise.resolve();

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
      // No vendor/product filter — some Studio-enabled boards expose a
      // USB-CDC VID/PID that differs from their bootloader VID/PID, and a
      // filter here previously hid valid devices from the chooser.
      _port = await navigator.serial.requestPort();
    } catch (e) {
      if (e.name === 'NotFoundError') throw new Error('No device selected.');
      throw new Error('Could not open the serial device picker: ' + e.message);
    }

    const baudRate = options.baudRate || 115200;

    try {
      await _port.open({ baudRate });
    } catch (e) {
      _port = null;
      throw new Error('Failed to open serial port: ' + e.message);
    }

    _writeQueue = Promise.resolve(); // reset queue for the new connection

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
  //  SERIALIZED: every call is chained onto _writeQueue so writes never
  //  overlap, even if multiple callers invoke write() at the same time.
  // ════════════════════════════════════════

  function write(bytes) {
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    // Chain this write onto the queue. Whether the previous write succeeded
    // or failed, we still attempt this one — but we propagate this write's
    // own success/failure to its caller via the returned promise.
    const result = _writeQueue.then(() => _doWrite(payload));

    // Keep the queue alive for the next caller regardless of outcome,
    // so one failed write doesn't permanently jam the queue.
    _writeQueue = result.catch(() => {});

    return result;
  }

  async function _doWrite(payload) {
    if (!_port || !_port.writable) {
      throw new Error('Port not open. Call connect() first.');
    }

    const writer = _port.writable.getWriter();
    try {
      await writer.write(payload);
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

    // Let any in-flight writes settle before closing the port.
    try { await _writeQueue; } catch (e) {}

    const portToClose = _port;
    _port = null;
    _onDataCallback = null;
    _writeQueue = Promise.resolve();

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
      _onDataCallback = null;
      _writeQueue = Promise.resolve();

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

    const candidate = ports[0];

    try {
      await candidate.open({ baudRate });
      _port = candidate;
      _writeQueue = Promise.resolve();
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
