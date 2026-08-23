// ═══ STUDIO RPC — ZMK Studio protobuf RPC message layer ═══
// Sits on top of WebSerial (webserial.js). Handles:
//   1. Message FRAMING (SoF/Esc/EoF byte escaping) — per official ZMK spec
//   2. Protobuf ENCODE/DECODE of Request/Response messages
//   3. A request/response promise-matching layer keyed by request_id
//
// Reference: https://zmk.dev/docs/development/studio-rpc-protocol
// Proto schema source: https://github.com/zmkfirmware/zmk-studio-messages
//
// IMPORTANT — SETUP STEP REQUIRED:
// This module uses protobufjs to encode/decode messages against ZMK's
// actual .proto schema. You must copy the .proto files from the
// zmk-studio-messages repo into ./assets/proto/ before this will work:
//   assets/proto/studio.proto
//   assets/proto/meta.proto
//   assets/proto/core.proto
//   assets/proto/behaviors.proto
//   assets/proto/keymap.proto
// (Download once from https://github.com/zmkfirmware/zmk-studio-messages —
//  they rarely change, so this is a one-time copy, not a per-build step.)


const StudioRpc = (() => {

  // ── Framing bytes (per ZMK Studio RPC protocol spec) ──
  const SOF = 0xAB; // Start of Frame
  const ESC = 0xAC; // Escape byte
  const EOF = 0xAD; // End of Frame

  let _protoRoot   = null;   // protobufjs Root, loaded once
  let _RequestMsg  = null;
  let _ResponseMsg = null;

  let _rxBuffer       = [];  // bytes accumulated for the current in-progress frame
  let _inFrame         = false;
  let _escapeNext       = false;

  let _nextRequestId   = 1;
  let _pendingRequests = new Map(); // request_id -> { resolve, reject, timeout }
  let _notificationHandlers = [];   // callbacks for unsolicited device notifications

  const REQUEST_TIMEOUT_MS = 8000;


  // ════════════════════════════════════════
  //  INIT — load .proto schema via protobufjs (CDN)
  // ════════════════════════════════════════

  async function init() {
    if (_protoRoot) return; // already loaded

    if (typeof protobuf === 'undefined') {
      throw new Error(
        'protobufjs not found. Add this script tag before studioRpc.js:\n' +
        '<script src="https://cdn.jsdelivr.net/npm/protobufjs@7/dist/protobuf.min.js"></script>'
      );
    }

    try {
      _protoRoot = await protobuf.load('./assets/proto/studio.proto');
    } catch (e) {
      throw new Error(
        'Could not load ZMK Studio .proto schema from ./assets/proto/studio.proto. ' +
        'Copy the .proto files from https://github.com/zmkfirmware/zmk-studio-messages ' +
        'into assets/proto/ first. Original error: ' + e.message
      );
    }

    _RequestMsg  = _protoRoot.lookupType('zmk.studio.Request');
    _ResponseMsg = _protoRoot.lookupType('zmk.studio.Response');

    console.log('[StudioRpc] Proto schema loaded ✓');
  }


  // ════════════════════════════════════════
  //  CONNECT — wires WebSerial's byte stream into the frame decoder
  // ════════════════════════════════════════

  async function connect() {
    await init();
    await WebSerial.connect();
    WebSerial.startReading(_onSerialBytes);
    console.log('[StudioRpc] Connected and listening for frames');
  }

  async function disconnect() {
    _rejectAllPending(new Error('Disconnected'));
    await WebSerial.disconnect();
  }


  // ════════════════════════════════════════
  //  OUTGOING — build + frame + send a Request, return a Promise of Response
  // ════════════════════════════════════════

  // subsystem: 'core' | 'behaviors' | 'keymap'
  // payload: plain object matching that subsystem's Request message shape
  function sendRequest(subsystem, payload) {
    if (!_protoRoot) throw new Error('StudioRpc not initialized — call connect() first.');

    const requestId = _nextRequestId++;

    const requestObj = {
      request_id: requestId,
      [subsystem]: payload,
    };

    const errMsg = _RequestMsg.verify(requestObj);
    if (errMsg) throw new Error('Invalid RPC request shape: ' + errMsg);

    const message   = _RequestMsg.create(requestObj);
    const encoded   = _RequestMsg.encode(message).finish(); // Uint8Array
    const framed    = _frame(encoded);

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        _pendingRequests.delete(requestId);
        reject(new Error(`RPC request ${requestId} (${subsystem}) timed out`));
      }, REQUEST_TIMEOUT_MS);

      _pendingRequests.set(requestId, { resolve, reject, timeout });
    });

    WebSerial.write(framed).catch(err => {
      const pending = _pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        _pendingRequests.delete(requestId);
        pending.reject(err);
      }
    });

    return promise;
  }


  // ════════════════════════════════════════
  //  FRAMING — escape payload and wrap with SoF/EoF
  // ════════════════════════════════════════

  function _frame(payloadBytes) {
    const out = [SOF];
    for (let i = 0; i < payloadBytes.length; i++) {
      const b = payloadBytes[i];
      if (b === SOF || b === ESC || b === EOF) {
        out.push(ESC);
      }
      out.push(b);
    }
    out.push(EOF);
    return new Uint8Array(out);
  }


  // ════════════════════════════════════════
  //  DEFRAMING — incoming byte stream state machine
  // ════════════════════════════════════════

  function _onSerialBytes(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];

      if (!_inFrame) {
        if (b === SOF) {
          _inFrame = true;
          _rxBuffer = [];
          _escapeNext = false;
        }
        continue; // ignore stray bytes outside a frame
      }

      if (_escapeNext) {
        _rxBuffer.push(b);
        _escapeNext = false;
        continue;
      }

      if (b === ESC) {
        _escapeNext = true;
        continue;
      }

      if (b === EOF) {
        _inFrame = false;
        _handleCompleteFrame(new Uint8Array(_rxBuffer));
        _rxBuffer = [];
        continue;
      }

      // A raw SoF appearing mid-frame (unescaped) means we lost sync —
      // restart framing from here defensively.
      if (b === SOF) {
        _rxBuffer = [];
        continue;
      }

      _rxBuffer.push(b);
    }
  }


  // ════════════════════════════════════════
  //  HANDLE DECODED FRAME — decode protobuf, route to pending promise or notification
  // ════════════════════════════════════════

  function _handleCompleteFrame(bytes) {
    let decoded;
    try {
      decoded = _ResponseMsg.decode(bytes);
    } catch (e) {
      console.warn('[StudioRpc] Failed to decode frame:', e.message);
      return;
    }

    if (decoded.request_response) {
      const rr = decoded.request_response;
      const pending = _pendingRequests.get(rr.request_id);
      if (pending) {
        clearTimeout(pending.timeout);
        _pendingRequests.delete(rr.request_id);
        pending.resolve(rr);
      } else {
        console.warn('[StudioRpc] Response for unknown request_id', rr.request_id);
      }
      return;
    }

    if (decoded.notification) {
      _notificationHandlers.forEach(cb => {
        try { cb(decoded.notification); } catch (e) { console.error(e); }
      });
    }
  }

  function onNotification(callback) {
    _notificationHandlers.push(callback);
  }

  function _rejectAllPending(err) {
    for (const [id, pending] of _pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(err);
    }
    _pendingRequests.clear();
  }


  // ════════════════════════════════════════
  //  HIGH-LEVEL CONVENIENCE METHODS (built on sendRequest)
  // ════════════════════════════════════════

  // Read the device's physical layout (key positions/shape)
  function getPhysicalLayout() {
    return sendRequest('core', { get_layouts: {} });
  }

  // Read the current keymap (all layers + bindings)
  function getKeymap() {
    return sendRequest('keymap', { get_keymap: {} });
  }

  // Read the list of available behaviors (kp, mo, lt, etc.) the firmware supports
  function getBehaviors() {
    return sendRequest('behaviors', { list_all_behaviors: {} });
  }

  // Write a single key binding: layerId + keyPosition + behavior binding
  function setKeyBinding(layerId, keyPositionIndex, bindingObj) {
    return sendRequest('keymap', {
      set_layer_binding: {
        layer_id: layerId,
        key_position: keyPositionIndex,
        binding: bindingObj,
      },
    });
  }

  // Save all pending changes to the device's flash settings partition
  function saveChanges() {
    return sendRequest('core', { save_changes: {} });
  }


  return {
    init,
    connect,
    disconnect,
    sendRequest,
    onNotification,
    getPhysicalLayout,
    getKeymap,
    getBehaviors,
    setKeyBinding,
    saveChanges,
  };

})();
