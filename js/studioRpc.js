// ═══ STUDIO RPC — ZMK Studio protobuf RPC message layer ═══
// Sits on top of WebSerial (webserial.js). Handles:
//   1. Message FRAMING (SoF/Esc/EoF byte escaping) — verified against the
//      official spec: https://zmk.dev/docs/development/studio-rpc-protocol
//   2. Protobuf ENCODE/DECODE of Request/Response messages
//   3. A request/response promise-matching layer keyed by request_id
//   4. Behavior discovery + caching (behaviors.proto)
//
// ═══ ROOT CAUSE FIX (2026-08-24) ═══
// Root cause of the "RPC request timed out" bug: protobufjs converts .proto
// field names to camelCase by default (request_id -> requestId,
// list_all_behaviors -> listAllBehaviors). Our code builds request objects
// using the ORIGINAL snake_case names from the .proto files, so
// Message.create() was silently dropping every field it didn't recognize —
// we were sending nearly-empty messages the firmware correctly ignored.
// Fix: load the proto root with { keepCase: true } so field names stay
// exactly as declared in the .proto files, matching this file's code.
//
// Corrected against the ACTUAL proto schema in this project:
//   assets/proto/studio.proto     — Request/Response/Notification envelope
//   assets/proto/meta.proto
//   assets/proto/core.proto
//   assets/proto/behaviors.proto  — ListAllBehaviors, GetBehaviorDetails
//   assets/proto/keymap.proto     — Keymap, Layer, BehaviorBinding, PhysicalLayout


const StudioRpc = (() => {

  // ── Framing bytes (verified against official ZMK Studio RPC protocol spec) ──
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

  // behavior_id -> { id, display_name, metadata } — populated by getBehaviors()
  let _behaviorCache = new Map();

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
      // ★ THE FIX ★ — { keepCase: true } preserves snake_case field names
      // (request_id, list_all_behaviors, etc.) instead of protobufjs
      // silently camelCasing them and dropping our fields on .create().
      const root = new protobuf.Root();
      _protoRoot = await root.load('./assets/proto/studio.proto', { keepCase: true });
    } catch (e) {
      throw new Error(
        'Could not load ZMK Studio .proto schema from ./assets/proto/studio.proto. ' +
        'Original error: ' + e.message
      );
    }

    _RequestMsg  = _protoRoot.lookupType('zmk.studio.Request');
    _ResponseMsg = _protoRoot.lookupType('zmk.studio.Response');

    console.log('[StudioRpc] Proto schema loaded ✓ (keepCase: true)');
  }


  // ════════════════════════════════════════
  //  CONNECT — wires WebSerial's byte stream into the frame decoder
  // ════════════════════════════════════════

  async function connect() {
    await init();
    await WebSerial.connect();
    WebSerial.startReading(_onSerialBytes);
    _behaviorCache.clear();
    console.log('[StudioRpc] Connected and listening for frames');
  }

  async function disconnect() {
    _rejectAllPending(new Error('Disconnected'));
    await WebSerial.disconnect();
    _behaviorCache.clear();
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

    console.log('[StudioRpc] Sending', subsystem, payload, '→', encoded.length, 'bytes encoded');

    const framed = _frame(encoded);

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

      if (b === SOF) {
        // Unescaped SoF mid-frame means we lost sync — restart defensively.
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
      console.warn('[StudioRpc] Failed to decode frame:', e.message, bytes);
      return;
    }

    console.log('[StudioRpc] Received frame:', decoded);

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
  //  KEYMAP METHODS — matched against real keymap.proto
  // ════════════════════════════════════════

  async function getKeymap() {
    const rr = await sendRequest('keymap', { get_keymap: true });
    return rr.keymap.get_keymap;
  }

  async function getPhysicalLayouts() {
    const rr = await sendRequest('keymap', { get_physical_layouts: true });
    return rr.keymap.get_physical_layouts;
  }

  async function setKeyBinding(layerId, keyPosition, behaviorBinding) {
    const rr = await sendRequest('keymap', {
      set_layer_binding: {
        layer_id: layerId,
        key_position: keyPosition,
        binding: behaviorBinding,
      },
    });
    return rr.keymap.set_layer_binding;
  }

  async function saveChanges() {
    const rr = await sendRequest('keymap', { save_changes: true });
    return rr.keymap.save_changes;
  }

  async function discardChanges() {
    const rr = await sendRequest('keymap', { discard_changes: true });
    return rr.keymap.discard_changes;
  }

  async function checkUnsavedChanges() {
    const rr = await sendRequest('keymap', { check_unsaved_changes: true });
    return rr.keymap.check_unsaved_changes;
  }

  async function addLayer() {
    const rr = await sendRequest('keymap', { add_layer: {} });
    return rr.keymap.add_layer;
  }

  async function removeLayer(layerIndex) {
    const rr = await sendRequest('keymap', { remove_layer: { layer_index: layerIndex } });
    return rr.keymap.remove_layer;
  }

  async function restoreLayer(layerId, atIndex) {
    const rr = await sendRequest('keymap', { restore_layer: { layer_id: layerId, at_index: atIndex } });
    return rr.keymap.restore_layer;
  }

  async function moveLayer(startIndex, destIndex) {
    const rr = await sendRequest('keymap', {
      move_layer: { start_index: startIndex, dest_index: destIndex },
    });
    return rr.keymap.move_layer;
  }

  async function setLayerProps(layerId, name) {
    const rr = await sendRequest('keymap', {
      set_layer_props: { layer_id: layerId, name },
    });
    return rr.keymap.set_layer_props;
  }

  async function setActivePhysicalLayout(layoutIndex) {
    const rr = await sendRequest('keymap', { set_active_physical_layout: layoutIndex });
    return rr.keymap.set_active_physical_layout;
  }


  // ════════════════════════════════════════
  //  BEHAVIOR METHODS — matched against real behaviors.proto
  // ════════════════════════════════════════

  async function listAllBehaviorIds() {
    const rr = await sendRequest('behaviors', { list_all_behaviors: true });
    return rr.behaviors.list_all_behaviors.behaviors;
  }

  async function getBehaviorDetails(behaviorId) {
    const rr = await sendRequest('behaviors', {
      get_behavior_details: { behavior_id: behaviorId },
    });
    return rr.behaviors.get_behavior_details;
  }

  async function loadAllBehaviors() {
    const ids = await listAllBehaviorIds();
    _behaviorCache.clear();

    const detailsList = await Promise.all(
      ids.map(id => getBehaviorDetails(id))
    );

    detailsList.forEach(details => {
      _behaviorCache.set(details.id, details);
    });

    console.log(`[StudioRpc] Loaded ${_behaviorCache.size} behaviors`);
    return _behaviorCache;
  }

  function getBehaviorFromCache(behaviorId) {
    return _behaviorCache.get(behaviorId) || null;
  }

  function getAllCachedBehaviors() {
    return Array.from(_behaviorCache.values());
  }

  function findBehaviorByName(displayName) {
    return getAllCachedBehaviors().find(b => b.display_name === displayName) || null;
  }

  function describeParamType(paramValueDescription) {
    if (!paramValueDescription) return null;
    if (paramValueDescription.nil !== undefined)       return { type: 'nil' };
    if (paramValueDescription.constant !== undefined)  return { type: 'constant', value: paramValueDescription.constant };
    if (paramValueDescription.range !== undefined)     return { type: 'range', min: paramValueDescription.range.min, max: paramValueDescription.range.max };
    if (paramValueDescription.hid_usage !== undefined) return { type: 'hid_usage', keyboardMax: paramValueDescription.hid_usage.keyboard_max, consumerMax: paramValueDescription.hid_usage.consumer_max };
    if (paramValueDescription.layer_id !== undefined)  return { type: 'layer_id' };
    return null;
  }


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

    listAllBehaviorIds,
    getBehaviorDetails,
    loadAllBehaviors,
    getBehaviorFromCache,
    getAllCachedBehaviors,
    findBehaviorByName,
    describeParamType,
  };

})();
