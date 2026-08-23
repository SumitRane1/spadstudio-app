// ═══ STUDIO RPC — ZMK Studio protobuf RPC message layer ═══
// Sits on top of WebSerial (webserial.js). Handles:
//   1. Message FRAMING (SoF/Esc/EoF byte escaping) — per official ZMK spec
//   2. Protobuf ENCODE/DECODE of Request/Response messages
//   3. A request/response promise-matching layer keyed by request_id
//
// Corrected against the ACTUAL proto schema in this project:
//   assets/proto/studio.proto   — Request/Response/Notification envelope
//   assets/proto/meta.proto
//   assets/proto/core.proto
//   assets/proto/behaviors.proto
//   assets/proto/keymap.proto   — Keymap, Layer, BehaviorBinding, PhysicalLayout
//
// Reference: https://zmk.dev/docs/development/studio-rpc-protocol


const StudioRpc = (() => {

  // ── Framing bytes (per ZMK Studio RPC protocol spec) ──
  const SOF = 0xAB; // Start of Frame
  const ESC = 0xAC; // Escape byte
  const EOF = 0xAD; // End of Frame

  let _protoRoot   = null;   // protobufjs Root, loaded once
  let _RequestMsg  = null;
  let _ResponseMsg = null;

  let _rxBuffer         = [];  // bytes accumulated for the current in-progress frame
  let _inFrame           = false;
  let _escapeNext        = false;

  let _nextRequestId    = 1;
  let _pendingRequests  = new Map(); // request_id -> { resolve, reject, timeout }
  let _notificationHandlers = [];    // callbacks for unsolicited device notifications

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
        'Original error: ' + e.message
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
  // (must match the `oneof request_type` field name exactly, e.g. { get_keymap: true })
  function sendRequest(subsystem, payload) {
    if (!_protoRoot) throw new Error('StudioRpc not initialized — call connect() first.');

    const requestId = _nextRequestId++;

    const requestObj = {
      request_id: requestId,
      [subsystem]: payload,
    };

    const errMsg = _RequestMsg.verify(requestObj);
    if (errMsg) throw new Error('Invalid RPC request shape: ' + errMsg);

    const message = _RequestMsg.create(requestObj);
    const encoded = _RequestMsg.encode(message).finish(); // Uint8Array
    const framed  = _frame(encoded);

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

    // Response.type is `oneof { request_response, notification }`
    if (decoded.request_response) {
      const rr = decoded.request_response;
      const pending = _pendingRequests.get(rr.request_id);
      if (pending) {
        clearTimeout(pending.timeout);
        _pendingRequests.delete(rr.request_id);
        pending.resolve(rr); // rr.keymap / rr.core / rr.behaviors / rr.meta
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
  //  HIGH-LEVEL CONVENIENCE METHODS
  //  — corrected against the real keymap.proto Request/Response oneofs
  // ════════════════════════════════════════

  // zmk.keymap.Request.get_keymap is `bool` → send `true`
  // Response: rr.keymap.get_keymap → Keymap { layers[], available_layers, max_layer_name_length }
  async function getKeymap() {
    const rr = await sendRequest('keymap', { get_keymap: true });
    return rr.keymap.get_keymap;
  }

  // zmk.keymap.Request.get_physical_layouts is `bool` → send `true`
  // Response: rr.keymap.get_physical_layouts → PhysicalLayouts { active_layout_index, layouts[] }
  async function getPhysicalLayouts() {
    const rr = await sendRequest('keymap', { get_physical_layouts: true });
    return rr.keymap.get_physical_layouts;
  }

  // Write a single key binding.
  // binding must match BehaviorBinding { behavior_id (sint32), param1, param2 }
  // behavior_id is a NUMERIC id from getBehaviors() — not a string like "LCZ".
  // Response: rr.keymap.set_layer_binding → SetLayerBindingResponse enum
  async function setKeyBinding(layerId, keyPosition, behaviorBinding) {
    const rr = await sendRequest('keymap', {
      set_layer_binding: {
        layer_id: layerId,
        key_position: keyPosition,
        binding: behaviorBinding, // { behavior_id, param1, param2 }
      },
    });
    return rr.keymap.set_layer_binding; // enum: 0 = OK
  }

  // zmk.keymap.Request.save_changes is `bool` → send `true`
  // Response: rr.keymap.save_changes → SaveChangesResponse { ok } or { err: SaveChangesErrorCode }
  async function saveChanges() {
    const rr = await sendRequest('keymap', { save_changes: true });
    return rr.keymap.save_changes;
  }

  // zmk.keymap.Request.discard_changes is `bool` → send `true`
  async function discardChanges() {
    const rr = await sendRequest('keymap', { discard_changes: true });
    return rr.keymap.discard_changes;
  }

  // zmk.keymap.Request.check_unsaved_changes is `bool` → send `true`
  async function checkUnsavedChanges() {
    const rr = await sendRequest('keymap', { check_unsaved_changes: true });
    return rr.keymap.check_unsaved_changes;
  }

  // AddLayerRequest is an empty message → send `{}`
  // Response: rr.keymap.add_layer → AddLayerResponse { ok: { index, layer } } or { err }
  async function addLayer() {
    const rr = await sendRequest('keymap', { add_layer: {} });
    return rr.keymap.add_layer;
  }

  // RemoveLayerRequest { layer_index }
  async function removeLayer(layerIndex) {
    const rr = await sendRequest('keymap', { remove_layer: { layer_index: layerIndex } });
    return rr.keymap.remove_layer;
  }

  // RestoreLayerRequest { layer_id, at_index }
  async function restoreLayer(layerId, atIndex) {
    const rr = await sendRequest('keymap', { restore_layer: { layer_id: layerId, at_index: atIndex } });
    return rr.keymap.restore_layer;
  }

  // MoveLayerRequest { start_index, dest_index }
  async function moveLayer(startIndex, destIndex) {
    const rr = await sendRequest('keymap', {
      move_layer: { start_index: startIndex, dest_index: destIndex },
    });
    return rr.keymap.move_layer;
  }

  // SetLayerPropsRequest { layer_id, name }
  async function setLayerProps(layerId, name) {
    const rr = await sendRequest('keymap', {
      set_layer_props: { layer_id: layerId, name },
    });
    return rr.keymap.set_layer_props;
  }

  // zmk.keymap.Request.set_active_physical_layout is `uint32` (layout index)
  async function setActivePhysicalLayout(layoutIndex) {
    const rr = await sendRequest('keymap', { set_active_physical_layout: layoutIndex });
    return rr.keymap.set_active_physical_layout; // { ok: Keymap } or { err }
  }

  // NOTE: behaviors.proto wasn't pasted yet — once you share it, I'll add
  // getBehaviors() / getBehaviorDetails() here with the exact request/response
  // field names (needed to build the friendly-name → behavior_id lookup table
  // for the keycode picker UI in editMacros.js).


  return {
    init,
    connect,
    disconnect,
    sendRequest,
    onNotification,
    getKeymap,
    getPhysicalLayouts,
    setKeyBinding,
    saveChanges,
    discardChanges,
    checkUnsavedChanges,
    addLayer,
    removeLayer,
    restoreLayer,
    moveLayer,
    setLayerProps,
    setActivePhysicalLayout,
  };

})();
