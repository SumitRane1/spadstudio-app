// ═══ STATE — Single source of truth ═══

const State = (() => {

  const defaultConfig = {
    profileId: null,
    device: 'nice_nano_macropad_v1',
    activeLayerIndex: 0,

    // ── Encoder rotation is INDEPENDENT from layers ──
    // Push button cycles: scroll → volume → brightness → scroll
    encoder: {
      scroll:     { cw: 'PG_DN',     ccw: 'PG_UP'    },
      volume:     { cw: 'C_VOL_UP',  ccw: 'C_VOL_DN' },
      brightness: { cw: 'C_BRI_UP',  ccw: 'C_BRI_DN' },
    },

    layers: [
      {
        id: 'layer_0',
        name: 'Layer 1',
        keys: ['LC(Z)', 'LC(C)', 'LC(V)', 'LC(S)', 'LC(P)', 'LA(F4)', 'C_VOL_DN', 'C_VOL_UP', 'C_MUTE'],
        fnAction: 'TOG 1',
        encoderPush: 'C_MUTE',
      },
      {
        id: 'layer_1',
        name: 'Layer 2',
        keys: ['C_PP', 'C_PREV', 'C_NEXT', 'LG(LS(S))', 'LG(L)', 'LC(Z)', 'C_BRI_DN', 'C_BRI_UP', 'TRANS'],
        fnAction: 'TO 2',
        encoderPush: 'C_PP',
      },
      {
        id: 'layer_2',
        name: 'Layer 3',
        keys: ['TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS'],
        fnAction: 'TO 0',
        encoderPush: 'TRANS',
      },
    ],

    buildMode: 'custom',
    isDirty: false,
  };

  let _state = JSON.parse(JSON.stringify(defaultConfig));
  const _listeners = [];

  // ── Get full state snapshot ──
  function get() { return _state; }

  // ── Partial update + notify ──
  function set(partialUpdate) {
    _state = { ..._state, ...partialUpdate };
    _state.isDirty = true;
    _notify();
  }

  // ── Update a single key binding ──
  function setKey(layerIndex, keyIndex, zmkCode) {
    const layers = JSON.parse(JSON.stringify(_state.layers));
    layers[layerIndex].keys[keyIndex] = zmkCode;
    set({ layers });
  }

  // ── Update encoder push action for a specific layer ──
  function setEncoderPush(layerIndex, zmkCode) {
    const layers = JSON.parse(JSON.stringify(_state.layers));
    layers[layerIndex].encoderPush = zmkCode;
    set({ layers });
  }

  // ── Update encoder rotation binding ──
  // mode = 'scroll' | 'volume' | 'brightness', dir = 'cw' | 'ccw'
  function setEncoderBinding(mode, dir, zmkCode) {
    const encoder = JSON.parse(JSON.stringify(_state.encoder));
    encoder[mode][dir] = zmkCode;
    set({ encoder, buildMode: 'custom' });
  }

  // ── Update FN button action for a layer ──
  function setFnAction(layerIndex, zmkCode) {
    const layers = JSON.parse(JSON.stringify(_state.layers));
    layers[layerIndex].fnAction = zmkCode;
    set({ layers });
  }

  // ── Replace an entire layer's data ──
  function setLayer(layerIndex, layerData) {
    const layers = JSON.parse(JSON.stringify(_state.layers));
    layers[layerIndex] = { ...layers[layerIndex], ...layerData };
    set({ layers });
  }

  // ── Add a new blank layer ──
  function addLayer(name) {
    const layers = JSON.parse(JSON.stringify(_state.layers));
    layers.push({
      id: 'layer_' + Date.now(),
      name: name || 'Layer ' + (layers.length + 1),
      keys: Array(9).fill('TRANS'),
      fnAction: 'TO 0',
      encoderPush: 'TRANS',
    });
    set({ layers, buildMode: 'custom' });
  }

  // ── Delete a layer by index ──
  function deleteLayer(layerIndex) {
    if (_state.layers.length <= 1) return;
    const layers = JSON.parse(JSON.stringify(_state.layers));
    layers.splice(layerIndex, 1);
    const activeLayerIndex = Math.min(_state.activeLayerIndex, layers.length - 1);
    set({ layers, activeLayerIndex, buildMode: 'custom' });
  }

  // ── Load a full profile (resets everything) ──
  function loadProfile(profileId, profileData) {
    const fresh = JSON.parse(JSON.stringify(profileData));

    // Ensure every layer has encoderPush — migrate old profiles safely
    const layers = fresh.layers.map((layer, i) => ({
      encoderPush: 'TRANS',   // safe default if missing
      ...layer,
    }));

    _state = {
      ...defaultConfig,
      profileId,
      layers,
      encoder: fresh.encoder || JSON.parse(JSON.stringify(defaultConfig.encoder)),
      buildMode: 'custom',
      isDirty: false,
      activeLayerIndex: 0,
    };
    _notify();
  }

  // ── Reset to factory defaults ──
  function reset() {
    _state = JSON.parse(JSON.stringify(defaultConfig));
    _notify();
  }

  // ── Subscribe to state changes ──
  // Returns unsubscribe function
  function subscribe(fn) {
    _listeners.push(fn);
    return () => {
      const i = _listeners.indexOf(fn);
      if (i > -1) _listeners.splice(i, 1);
    };
  }

  function _notify() { _listeners.forEach(fn => fn(_state)); }

  // ── Export state as JSON string ──
  function exportJSON() { return JSON.stringify(_state, null, 2); }

  // ── Import state from JSON string ──
  function importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      // Validate minimum structure
      if (!parsed.layers || !Array.isArray(parsed.layers)) {
        throw new Error('Invalid config: missing layers');
      }
      // Migrate: ensure encoderPush exists on every layer
      parsed.layers = parsed.layers.map(layer => ({
        encoderPush: 'TRANS',
        ...layer,
      }));
      _state = {
        ...defaultConfig,
        ...parsed,
        isDirty: false,
      };
      _notify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return {
    get,
    set,
    setKey,
    setEncoderPush,
    setEncoderBinding,
    setFnAction,
    setLayer,
    addLayer,
    deleteLayer,
    loadProfile,
    reset,
    subscribe,
    exportJSON,
    importJSON,
  };
})();