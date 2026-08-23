// ═══ KEYCODE TRANSLATOR — friendly names ⇄ ZMK HID usage codes ═══
//
// IMPORTANT: This is a DIFFERENT numbering system than your old keycodes.js!
// Old system: ZMK string macros like "LCZ" (used in .keymap devicetree source,
//             compiled ahead of time by GitHub Actions).
// New system: numeric HID usage IDs + modifier bitmask, sent live at runtime
//             as BehaviorBinding.param1 over the Studio RPC connection.
//
// Reference (verified against ZMK firmware source):
//   Keyboard/Keypad usage page = 0x07   (dt-bindings/zmk/hid_usage_pages.h)
//   Consumer usage page        = 0x0C
//   ZMK_HID_USAGE(page, id)    = (page << 16) | id
//   Modifier bits (dt-bindings/zmk/modifiers.h):
//     MOD_LCTL = 0x01   MOD_LSFT = 0x02   MOD_LALT = 0x04   MOD_LGUI = 0x08
//     MOD_RCTL = 0x10   MOD_RSFT = 0x20   MOD_RALT = 0x40   MOD_RGUI = 0x80
//   Explicit modifiers are packed into the TOP byte (bits 24-31) alongside
//   the page/id in the lower 24 bits: encoded = (mods << 24) | (page << 16) | id
//
// NOTE: This bit-packing scheme should be verified against a real device's
// GetBehaviorDetails() response the first time you test — if a bound key
// comes back showing the wrong modifier combo, the shift amount here is
// the first thing to check.


const KeycodeTranslator = (() => {

  const PAGE_KEYBOARD = 0x07;
  const PAGE_CONSUMER = 0x0C;

  const MOD = {
    LCTL: 0x01, LSFT: 0x02, LALT: 0x04, LGUI: 0x08,
    RCTL: 0x10, RSFT: 0x20, RALT: 0x40, RGUI: 0x80,
  };

  const MOD_SHIFT = 24; // modifiers packed into bits 24-31


  // ════════════════════════════════════════
  //  KEYBOARD USAGE TABLE (page 0x07) — friendly label -> usage ID
  // ════════════════════════════════════════

  const KEYBOARD_USAGE = {
    // Letters
    A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08, F: 0x09, G: 0x0A, H: 0x0B,
    I: 0x0C, J: 0x0D, K: 0x0E, L: 0x0F, M: 0x10, N: 0x11, O: 0x12, P: 0x13,
    Q: 0x14, R: 0x15, S: 0x16, T: 0x17, U: 0x18, V: 0x19, W: 0x1A, X: 0x1B,
    Y: 0x1C, Z: 0x1D,

    // Numbers (top row)
    N1: 0x1E, N2: 0x1F, N3: 0x20, N4: 0x21, N5: 0x22,
    N6: 0x23, N7: 0x24, N8: 0x25, N9: 0x26, N0: 0x27,

    // Whitespace / editing
    ENTER: 0x28, ESC: 0x29, BACKSPACE: 0x2A, TAB: 0x2B, SPACE: 0x2C,

    // Punctuation
    MINUS: 0x2D, EQUAL: 0x2E, LBKT: 0x2F, RBKT: 0x30, BACKSLASH: 0x31,
    SEMI: 0x33, SQT: 0x34, GRAVE: 0x35, COMMA: 0x36, DOT: 0x37, FSLH: 0x38,
    CAPS: 0x39,

    // Function row
    F1: 0x3A, F2: 0x3B, F3: 0x3C, F4: 0x3D, F5: 0x3E, F6: 0x3F,
    F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,

    // Navigation cluster
    PSCRN: 0x46, SLCK: 0x47, PAUSE_BREAK: 0x48,
    INS: 0x49, HOME: 0x4A, PG_UP: 0x4B, DEL: 0x4C, END: 0x4D, PG_DN: 0x4E,
    RIGHT: 0x4F, LEFT: 0x50, DOWN: 0x51, UP: 0x52,

    // Keypad
    KP_NLCK: 0x53, KP_DIVIDE: 0x54, KP_MULTIPLY: 0x55, KP_MINUS: 0x56,
    KP_PLUS: 0x57, KP_ENTER: 0x58,
    KP_N1: 0x59, KP_N2: 0x5A, KP_N3: 0x5B, KP_N4: 0x5C, KP_N5: 0x5D,
    KP_N6: 0x5E, KP_N7: 0x5F, KP_N8: 0x60, KP_N9: 0x61, KP_N0: 0x62,
    KP_DOT: 0x63,

    // Modifiers (as standalone keycodes, e.g. for a dedicated Ctrl key)
    LCTRL: 0xE0, LSHFT: 0xE1, LALT: 0xE2, LGUI: 0xE3,
    RCTRL: 0xE4, RSHFT: 0xE5, RALT: 0xE6, RGUI: 0xE7,
  };

  const KEYBOARD_USAGE_REVERSE = _invert(KEYBOARD_USAGE);


  // ════════════════════════════════════════
  //  CONSUMER USAGE TABLE (page 0x0C) — media/system keys
  // ════════════════════════════════════════

  const CONSUMER_USAGE = {
    C_VOL_UP: 0xE9, C_VOL_DOWN: 0xEA, C_MUTE: 0xE2,
    C_PLAY_PAUSE: 0xCD, C_NEXT: 0xB5, C_PREV: 0xB6,
    C_STOP: 0xB7, C_EJECT: 0xB8,
    C_BRI_UP: 0x6F, C_BRI_DOWN: 0x70,
    C_AL_EMAIL: 0x18A, C_AL_CALC: 0x192, C_AL_BROWSER: 0x196,
  };

  const CONSUMER_USAGE_REVERSE = _invert(CONSUMER_USAGE);


  // ════════════════════════════════════════
  //  FRIENDLY DISPLAY NAMES — for UI labels
  // ════════════════════════════════════════

  const FRIENDLY_NAMES = {
    ENTER: 'Enter', ESC: 'Escape', BACKSPACE: 'Backspace', TAB: 'Tab', SPACE: 'Space',
    MINUS: '-', EQUAL: '=', LBKT: '[', RBKT: ']', BACKSLASH: '\\',
    SEMI: ';', SQT: "'", GRAVE: '`', COMMA: ',', DOT: '.', FSLH: '/',
    CAPS: 'Caps Lock',
    PSCRN: 'Print Screen', SLCK: 'Scroll Lock', PAUSE_BREAK: 'Pause',
    INS: 'Insert', HOME: 'Home', PG_UP: 'Page Up', DEL: 'Delete', END: 'End', PG_DN: 'Page Down',
    RIGHT: '→', LEFT: '←', DOWN: '↓', UP: '↑',
    LCTRL: 'Left Ctrl', RCTRL: 'Right Ctrl', LSHFT: 'Left Shift', RSHFT: 'Right Shift',
    LALT: 'Left Alt', RALT: 'Right Alt', LGUI: 'Left Win/Cmd', RGUI: 'Right Win/Cmd',
    C_VOL_UP: 'Volume Up', C_VOL_DOWN: 'Volume Down', C_MUTE: 'Mute',
    C_PLAY_PAUSE: 'Play/Pause', C_NEXT: 'Next Track', C_PREV: 'Previous Track',
    C_STOP: 'Stop', C_EJECT: 'Eject',
    C_BRI_UP: 'Brightness Up', C_BRI_DOWN: 'Brightness Down',
    C_AL_EMAIL: 'Open Email', C_AL_CALC: 'Open Calculator', C_AL_BROWSER: 'Open Browser',
  };

  function friendlyName(label) {
    return FRIENDLY_NAMES[label] || label;
  }

  function _invert(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[v] = k;
    return out;
  }


  // ════════════════════════════════════════
  //  ENCODE — friendly label + modifiers -> numeric param1 for BehaviorBinding
  // ════════════════════════════════════════

  // modifierKeys: array of any of 'ctrl','shift','alt','gui' (assumes LEFT side by default)
  // Example: encodeKeyboardKey('Z', ['ctrl'])  → encodes Ctrl+Z
  function encodeKeyboardKey(label, modifierKeys = []) {
    const usageId = KEYBOARD_USAGE[label];
    if (usageId === undefined) throw new Error(`Unknown keyboard keycode: ${label}`);

    let modBits = 0;
    modifierKeys.forEach(m => {
      switch (m) {
        case 'ctrl':  modBits |= MOD.LCTL; break;
        case 'shift': modBits |= MOD.LSFT; break;
        case 'alt':   modBits |= MOD.LALT; break;
        case 'gui':   modBits |= MOD.LGUI; break;
        case 'rctrl':  modBits |= MOD.RCTL; break;
        case 'rshift': modBits |= MOD.RSFT; break;
        case 'ralt':   modBits |= MOD.RALT; break;
        case 'rgui':   modBits |= MOD.RGUI; break;
        default: console.warn('[KeycodeTranslator] Unknown modifier:', m);
      }
    });

    return (modBits << MOD_SHIFT) | (PAGE_KEYBOARD << 16) | usageId;
  }

  function encodeConsumerKey(label) {
    const usageId = CONSUMER_USAGE[label];
    if (usageId === undefined) throw new Error(`Unknown consumer keycode: ${label}`);
    return (PAGE_CONSUMER << 16) | usageId;
  }


  // ════════════════════════════════════════
  //  DECODE — numeric param1 -> { label, modifiers[], friendlyLabel }
  // ════════════════════════════════════════

  function decodeHidUsage(encoded) {
    const modBits = (encoded >>> MOD_SHIFT) & 0xFF;
    const page    = (encoded >>> 16) & 0xFF;
    const usageId = encoded & 0xFFFF;

    const modifiers = [];
    if (modBits & MOD.LCTL) modifiers.push('Ctrl');
    if (modBits & MOD.LSFT) modifiers.push('Shift');
    if (modBits & MOD.LALT) modifiers.push('Alt');
    if (modBits & MOD.LGUI) modifiers.push('Win/Cmd');
    if (modBits & MOD.RCTL) modifiers.push('R.Ctrl');
    if (modBits & MOD.RSFT) modifiers.push('R.Shift');
    if (modBits & MOD.RALT) modifiers.push('R.Alt');
    if (modBits & MOD.RGUI) modifiers.push('R.Win/Cmd');

    let label, friendly;
    if (page === PAGE_KEYBOARD) {
      label = KEYBOARD_USAGE_REVERSE[usageId] || `KB_0x${usageId.toString(16)}`;
      friendly = friendlyName(label);
    } else if (page === PAGE_CONSUMER) {
      label = CONSUMER_USAGE_REVERSE[usageId] || `C_0x${usageId.toString(16)}`;
      friendly = friendlyName(label);
    } else {
      label = `PAGE${page}_0x${usageId.toString(16)}`;
      friendly = label;
    }

    const displayLabel = modifiers.length > 0
      ? `${modifiers.join('+')}+${friendly}`
      : friendly;

    return { label, page, usageId, modifiers, friendlyLabel: friendly, displayLabel };
  }


  // ════════════════════════════════════════
  //  BUILD A BehaviorBinding FOR "Key Press" (&kp) BEHAVIOR
  // ════════════════════════════════════════

  // Looks up the "Key Press" behavior_id from StudioRpc's cache, and returns
  // a ready-to-send BehaviorBinding { behavior_id, param1, param2 }.
  function buildKeyPressBinding(label, modifierKeys = [], isConsumer = false) {
    const behavior = StudioRpc.findBehaviorByName('Key Press');
    if (!behavior) {
      throw new Error('"Key Press" behavior not found — call StudioRpc.loadAllBehaviors() first.');
    }

    const param1 = isConsumer
      ? encodeConsumerKey(label)
      : encodeKeyboardKey(label, modifierKeys);

    return { behavior_id: behavior.id, param1, param2: 0 };
  }

  // Build a Momentary Layer (&mo) binding — param1 is the layer_id
  function buildMomentaryLayerBinding(layerId) {
    const behavior = StudioRpc.findBehaviorByName('Momentary Layer');
    if (!behavior) throw new Error('"Momentary Layer" behavior not found in cache.');
    return { behavior_id: behavior.id, param1: layerId, param2: 0 };
  }

  // Build a Toggle Layer (&tog) binding — param1 is the layer_id
  function buildToggleLayerBinding(layerId) {
    const behavior = StudioRpc.findBehaviorByName('Toggle Layer');
    if (!behavior) throw new Error('"Toggle Layer" behavior not found in cache.');
    return { behavior_id: behavior.id, param1: layerId, param2: 0 };
  }

  // Build a Transparent (&trans) binding — no params
  function buildTransparentBinding() {
    const behavior = StudioRpc.findBehaviorByName('Transparent');
    if (!behavior) throw new Error('"Transparent" behavior not found in cache.');
    return { behavior_id: behavior.id, param1: 0, param2: 0 };
  }

  // Build a None/disabled (&none) binding — no params
  function buildNoneBinding() {
    const behavior = StudioRpc.findBehaviorByName('None');
    if (!behavior) throw new Error('"None" behavior not found in cache.');
    return { behavior_id: behavior.id, param1: 0, param2: 0 };
  }


  // ════════════════════════════════════════
  //  DESCRIBE A BOUND KEY — for rendering the key grid from device state
  // ════════════════════════════════════════

  // binding: { behavior_id, param1, param2 } as read from device
  // Returns a human string like "Ctrl+Z", "Layer 1", "Volume Up", "—" (trans)
  function describeBinding(binding) {
    if (!binding) return '—';

    const behavior = StudioRpc.getBehaviorFromCache(binding.behavior_id);
    if (!behavior) return `Unknown (id ${binding.behavior_id})`;

    switch (behavior.display_name) {
      case 'Key Press': {
        const decoded = decodeHidUsage(binding.param1);
        return decoded.displayLabel;
      }
      case 'Momentary Layer':
        return `Layer ${binding.param1} (hold)`;
      case 'Toggle Layer':
        return `Layer ${binding.param1} (toggle)`;
      case 'Transparent':
        return '— (transparent)';
      case 'None':
        return '(none)';
      default:
        return behavior.display_name;
    }
  }


  // ════════════════════════════════════════
  //  UI HELPERS — lists for building the keycode picker dropdown
  // ════════════════════════════════════════

  function listKeyboardKeyOptions() {
    return Object.keys(KEYBOARD_USAGE).map(label => ({
      value: label,
      label: friendlyName(label),
    }));
  }

  function listConsumerKeyOptions() {
    return Object.keys(CONSUMER_USAGE).map(label => ({
      value: label,
      label: friendlyName(label),
    }));
  }


  return {
    // Raw tables (exposed for advanced use / debugging)
    KEYBOARD_USAGE,
    CONSUMER_USAGE,
    MOD,

    // Encode / decode
    encodeKeyboardKey,
    encodeConsumerKey,
    decodeHidUsage,

    // High-level binding builders (used by editMacros.js)
    buildKeyPressBinding,
    buildMomentaryLayerBinding,
    buildToggleLayerBinding,
    buildTransparentBinding,
    buildNoneBinding,
    describeBinding,

    // UI helpers
    friendlyName,
    listKeyboardKeyOptions,
    listConsumerKeyOptions,
  };

})();
