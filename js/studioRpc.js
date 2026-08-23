// ═══ STUDIO RPC — ZMK Studio protobuf RPC message layer ═══
// Sits on top of WebSerial (webserial.js).
//
// ═══ FIX HISTORY ═══
// Fix 1 (keepCase): protobufjs camelCases .proto field names by default —
//   loading with { keepCase: true } preserves snake_case, matching this file.
// Fix 2 (serialized writes): webserial.js now queues all write() calls so
//   they never collide on the WritableStream lock.
// Fix 3 (sequential RPC pacing): loadAllBehaviors() sends requests one at a
//   time instead of Promise.all(), respecting the firmware's small RPC buffers.
// Fix 4 (idempotent connect): connect() always ensures init() (proto load)
//   has run and the read loop is listening, while only opening the
//   WebSerial picker if a port isn't already open.
// Fix 5 (THIS FILE — dead read loop after hardware disconnect): _isListening
//   was only ever reset to false inside StudioRpc.disconnect() (the MANUAL
//   disconnect path). When the device was physically unplugged, WebSerial's
//   own hardware-disconnect handler tore down the port/reader, but nothing
//   told studioRpc.js. _isListening stayed true from the dead connection, so
//   the next connect() skipped re-arming WebSerial.startReading() on the
//   NEW port — writes succeeded, but responses were never read, so every
//   request after a reconnect timed out. Fixed by registering
//   WebSerial.onDisconnect() to reset _isListening (and reject pending
//   requests) the moment a hardware disconnect happens, so the next
//   connect() correctly re-arms the read loop on the new port.


const StudioRpc = (() => {

  const SOF = 0xAB;
  const ESC = 0xAC;
  const EOF = 0xAD;

  let _protoRoot   = null;
  let _RequestMsg  = null;
  let _ResponseMsg = null;

  let _rxBuffer   = [];
  let _inFrame    = false;
  let _escapeNext = false;

  let _nextRequestId   = 1;
  let _pendingRequests = new Map();
  let _notificationHandlers = [];

  let _behaviorCache = new Map();
  let _isListening   = false; // guards against double read-loop registration
  let _disconnectHandlerRegistered = false; // guards against double onDisconnect registration

  const REQUEST_TIMEOUT_MS = 8000;


  // ════════════════════════════════════════
  //  INIT — loads the .proto schema. Safe to call multiple times.
  // ════════════════════════════════════════

  async function init() {
    if (_protoRoot) return; // already loaded — no-op

    if (typeof protobuf === 'undefined') {
      throw new Error(
        'protobufjs not found. Add this script tag before studioRpc.js:\n' +
        '<script src="https://cdn.jsdelivr.net/npm/protobufjs@7/dist/protobuf.min.js"></script>'
      );
    }

    try {
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
  //  CONNECT — IDEMPOTENT. Safe to call every time before an RPC operation,
  //  whether or not WebSerial already has a port open from a silent
  //  reconnect, a previous StudioRpc.connect() call, or a fresh session.
  // ════════════════════════════════════════

  async function connect() {
    // 0. Register our hardware-disconnect listener exactly once, so that any
    //    future physical unplug correctly resets our internal read-loop
    //    state — regardless of how many times connect()/disconnect() run.
    if (!_disconnectHandlerRegistered) {
      WebSerial.onDisconnect(_onHardwareDisconnect);
      _disconnectHandlerRegistered = true;
    }

    // 1. Always ensure the proto schema is loaded (no-ops if already done).
    await init();

    // 2. Only open the device picker if no port is open yet. If
    //    WebSerial.reconnectSilently() already opened one (e.g. on page
    //    load), this is skipped — no redundant/duplicate picker popup.
    if (!WebSerial.isConnected()) {
      await WebSerial.connect();
    }

    // 3. Only start the read loop once per LIVE connection. _isListening is
    //    reset to false by _onHardwareDisconnect() whenever the device is
    //    physically unplugged, so this correctly re-arms on the new port
    //    after any reconnect instead of assuming the old dead loop is fine.
    if (!_isListening) {
      WebSerial.startReading(_onSerialBytes);
      _isListening = true;
    }

    console.log('[StudioRpc] Ready — proto loaded, port open, listening for frames');
  }

  async function disconnect() {
    _rejectAllPending(new Error('Disconnected'));
    await WebSerial.disconnect();
    _behaviorCache.clear();
    _isListening = false;
  }

  // ★ FIX: fires when WebSerial detects a PHYSICAL unplug (not a manual
  // disconnect() call). Resets the read-loop flag so the next connect()
  // re-arms WebSerial.startReading() on the freshly reconnected port,
  // instead of silently skipping it and leaving every future request to
  // time out with no one reading the responses.
  function _onHardwareDisconnect() {
    console.warn('[StudioRpc] Hardware disconnect detected — resetting RPC state for next reconnect');
    _isListening = false;
    _rejectAllPending(new Error('Device disconnected'));
    // Deliberately NOT clearing _protoRoot/_RequestMsg/_ResponseMsg — the
    // proto schema doesn't need reloading, only the transport-level state.
  }


  // ════════════════════════════════════════
  //  OUTGOING — build + frame + send a Request, return a Promise of Response
  // ════════════════════════════════════════

  function sendRequest(subsystem, payload) {
    if (!_protoRoot) {
      throw new Error('StudioRpc not initialized — call StudioRpc.connect() first.');
    }
    if (!WebSerial.isConnected()) {
      throw new Error('Device not connected — call StudioRpc.connect() first.');
    }

    const requestId = _nextRequestId++;

    const requestObj = {
      request_id: requestId,
      [subsystem]: payload,
    };

    const errMsg = _RequestMsg.verify(requestObj);
    if (errMsg) throw new Error('Invalid RPC request shape: ' + errMsg);

    const message = _RequestMsg.create(requestObj);
    const encoded = _RequestMsg.encode(message).finish();

    console.log('[StudioRpc] Sending', subsystem, payload, '→', encoded.length, 'bytes encoded (id', requestId + ')');

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
  //  FRAMING
  // ════════════════════════════════════════

  function _frame(payloadBytes) {
    const out = [SOF];
    for (let i = 0; i < payloadBytes.length; i++) {
      const b = payloadBytes[i];
      if (b === SOF || b === ESC || b === EOF) out.push(ESC);
      out.push(b);
    }
    out.push(EOF);
    return new Uint8Array(out);
  }


  // ════════════════════════════════════════
  //  DEFRAMING
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
        continue;
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
        _rxBuffer = [];
        continue;
      }

      _rxBuffer.push(b);
    }
  }


  // ════════════════════════════════════════
  //  HANDLE DECODED FRAME
  // ════════════════════════════════════════

  function _handleCompleteFrame(bytes) {
    let decoded;
    try {
      decoded = _ResponseMsg.decode(bytes);
    } catch (e) {
      console.warn('[StudioRpc] Failed to decode frame:', e.message, bytes);
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
  //  KEYMAP METHODS
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
  //  BEHAVIOR METHODS
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

  async function loadAllBehaviors(onProgress) {
    const ids = await listAllBehaviorIds();
    _behaviorCache.clear();

    for (let i = 0; i < ids.length; i++) {
      const details = await getBehaviorDetails(ids[i]);
      _behaviorCache.set(details.id, details);
      if (onProgress) onProgress(i + 1, ids.length, details.display_name);
    }

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
