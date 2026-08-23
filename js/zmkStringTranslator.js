// ═══ ZMK STRING TRANSLATOR — bridges editor.js's ZMK strings to Studio RPC bindings ═══
//
// ═══ FIX (2026-08-24) ═══
// Added missing consumer codes (C_SLEEP, C_FF, C_RW, C_EJECT) that appear in
// Keycodes.js / the real .keymap but were absent from the translation table,
// silently causing translate() to return null and forcing an unnecessary
// full-rebuild fallback for any layer using them (e.g. the System layer's
// &kp C_SLEEP binding). Also added a `reason` field to translateLayer()'s
// unsupported list so callers (flash.js) can log exactly which key/code
// caused a fallback instead of guessing.


const ZmkStringTranslator = (() => {

  const MOD_WRAPPER_MAP = {
    LC: 'ctrl', LS: 'shift', LA: 'alt', LG: 'gui',
    RC: 'rctrl', RS: 'rshift', RA: 'ralt', RG: 'rgui',
  };

  const ZMK_TO_KEYBOARD_LABEL = {
    Z: 'Z', Y: 'Y', X: 'X', C: 'C', V: 'V', S: 'S', A: 'A', F: 'F', P: 'P',
    N: 'N', O: 'O', W: 'W', B: 'B', I: 'I', G: 'G', E: 'E', R: 'R', D: 'D',
    L: 'L', M: 'M', H: 'H', T: 'T', K: 'K', J: 'J', U: 'U', Q: 'Q',
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
    F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
    EQUAL: 'EQUAL', MINUS: 'MINUS', LBKT: 'LBKT', RBKT: 'RBKT', FSLH: 'FSLH', GRAVE: 'GRAVE',
    PG_UP: 'PG_UP', PG_DN: 'PG_DN', HOME: 'HOME', END: 'END',
    UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT',
    TAB: 'TAB', BSPC: 'BACKSPACE', DEL: 'DEL', RET: 'ENTER', ESC: 'ESC', SPACE: 'SPACE',
  };

  // ★ FIX: added C_SLEEP, C_FF, C_RW, C_EJECT — present in Keycodes.js and
  // the real .keymap's System layer but missing here, which was the actual
  // cause of the unwanted full-rebuild fallback.
  const ZMK_TO_CONSUMER_LABEL = {
    C_PP: 'C_PLAY_PAUSE', C_NEXT: 'C_NEXT', C_PREV: 'C_PREV',
    C_VOL_UP: 'C_VOL_UP', C_VOL_DN: 'C_VOL_DOWN', C_MUTE: 'C_MUTE',
    C_BRI_UP: 'C_BRI_UP', C_BRI_DN: 'C_BRI_DOWN',
    C_STOP: 'C_STOP', C_AL_CALC: 'C_AL_CALC',
    C_SLEEP: 'C_SLEEP', C_FF: 'C_FAST_FORWARD', C_RW: 'C_REWIND', C_EJECT: 'C_EJECT',
  };


  // ════════════════════════════════════════
  //  MAIN ENTRY POINT
  // ════════════════════════════════════════

  // Returns a BehaviorBinding, OR { unsupported: true, code: zmkCode } if it
  // can't be represented live — callers use this to log/report exactly
  // which code triggered a fallback, instead of a silent null.
  function translate(zmkCode, liveLayers) {
    if (!zmkCode) return KeycodeTranslator.buildTransparentBinding();

    const trimmed = zmkCode.trim();

    if (trimmed === 'TRANS') return KeycodeTranslator.buildTransparentBinding();
    if (trimmed === 'NONE')  return KeycodeTranslator.buildNoneBinding();

    const layerMatch = trimmed.match(/^(TOG|TO|MO)\s+(\d+)$/);
    if (layerMatch) {
      const [, kind, layerNumStr] = layerMatch;
      const layerIndex = parseInt(layerNumStr, 10);
      const layerId = _resolveLayerIdByIndex(layerIndex, liveLayers);
      if (layerId === null) return null;

      if (kind === 'TOG') return KeycodeTranslator.buildToggleLayerBinding(layerId);
      if (kind === 'MO')  return KeycodeTranslator.buildMomentaryLayerBinding(layerId);
      if (kind === 'TO')  {
        const behavior = StudioRpc.findBehaviorByName('To Layer');
        if (!behavior) return null;
        return { behavior_id: behavior.id, param1: layerId, param2: 0 };
      }
    }

    const { baseCode, modifiers } = _unwrapModifiers(trimmed);

    if (ZMK_TO_KEYBOARD_LABEL[baseCode]) {
      return KeycodeTranslator.buildKeyPressBinding(ZMK_TO_KEYBOARD_LABEL[baseCode], modifiers);
    }

    if (ZMK_TO_CONSUMER_LABEL[baseCode]) {
      if (modifiers.length > 0) {
        console.warn('[ZmkStringTranslator] Modifiers on a consumer key are not supported:', trimmed);
      }
      return KeycodeTranslator.buildKeyPressBinding(ZMK_TO_CONSUMER_LABEL[baseCode], [], true);
    }

    console.warn('[ZmkStringTranslator] Could not translate (custom/unsupported code):', trimmed);
    return null;
  }

  function _unwrapModifiers(code) {
    const modifiers = [];
    let current = code;

    while (true) {
      const match = current.match(/^([A-Z]{2})\((.+)\)$/);
      if (!match) break;
      const [, wrapper, inner] = match;
      if (!MOD_WRAPPER_MAP[wrapper]) break;
      modifiers.push(MOD_WRAPPER_MAP[wrapper]);
      current = inner;
    }

    return { baseCode: current, modifiers };
  }

  function _resolveLayerIdByIndex(layerIndex, liveLayers) {
    if (!liveLayers || !liveLayers[layerIndex]) return null;
    return liveLayers[layerIndex].id;
  }


  // ════════════════════════════════════════
  //  BATCH TRANSLATE — a whole layer's keys[] array at once
  // ════════════════════════════════════════

  // ★ FIX: `unsupported` now contains { index, code } objects (not just
  // indexes), so callers can log/display exactly which key + ZMK code
  // triggered the fallback instead of guessing.
  function translateLayer(zmkKeysArray, liveLayers) {
    const bindings = [];
    const unsupported = [];

    zmkKeysArray.forEach((zmkCode, i) => {
      const binding = translate(zmkCode, liveLayers);
      if (binding === null) {
        unsupported.push({ index: i, code: zmkCode });
        bindings.push(KeycodeTranslator.buildTransparentBinding());
      } else {
        bindings.push(binding);
      }
    });

    return { bindings, unsupported };
  }


  return {
    translate,
    translateLayer,
  };

})();
