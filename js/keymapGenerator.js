// ═══ KEYMAP GENERATOR (CORRECTED) ═══
// Converts app State → valid ZMK .keymap source string
//
// KEY FIX vs previous version:
//   - Encoder modes are now INDEPENDENT of content layers (not tied to layerIndex).
//   - Encoder push button now generates REAL bindings (tog/macro), not &trans.
//   - Content-layer cap raised and decoupled from hardware matrix rows/cols
//     (matrix-transform rows/cols is a HARDWARE concept, unrelated to how many
//     keymap layers ZMK can hold).
//
// Architecture:
//   - User-defined "content" layers (0..C-1) are cycled by the FN button only.
//   - Encoder modes (scroll/volume/brightness/...) are cycled by the encoder
//     push button only, via extra "overlay" layers appended AFTER all content
//     layers. The first mode (scroll) needs no overlay layer — it's just
//     whichever content layer's own sensor-bindings apply by default.
//   - Overlay layers have every matrix key + FN key set to &trans, so content
//     layers "show through" — only sensor-bindings differ. This guarantees
//     FN and the encoder never interfere with each other.

const KeymapGenerator = (() => {

  const MAX_CONTENT_LAYERS = 6; // arbitrary practical cap, NOT a hardware limit
  const KEYS_PER_LAYER = 9;

  // ── ZMK behavior prefix resolver ──
  function _resolveBinding(code) {
    if (!code || code === 'TRANS' || code === 'trans') return '&trans';
    if (code === 'NONE'  || code === 'none')  return '&none';

    const lower = code.toLowerCase().trim();

    if (lower.startsWith('tog '))  return `&tog ${code.split(' ')[1]}`;
    if (lower.startsWith('to '))   return `&to ${code.split(' ')[1]}`;
    if (lower.startsWith('mo '))   return `&mo ${code.split(' ')[1]}`;
    if (lower.startsWith('lt '))   return `&lt ${code.slice(3)}`;
    if (lower.startsWith('mt '))   return `&mt ${code.slice(3)}`;

    if (lower.startsWith('macro_')) return `&${code}`;

    return `&kp ${code}`;
  }

  function _normalizeKeys(keys) {
    const result = [...keys].slice(0, KEYS_PER_LAYER);
    while (result.length < KEYS_PER_LAYER) result.push('TRANS');
    return result;
  }

  function _formatBindingsBlock(bindings, indent) {
    const lines = [];
    for (let i = 0; i < bindings.length; i += 3) {
      const row = bindings.slice(i, i + 3)
        .map(b => b.padEnd(22))
        .join(' ');
      lines.push(`${indent}${row.trimEnd()}`);
    }
    return lines.join('\n');
  }

  function _layerLabel(name, index) {
    const safe = (name || `layer_${index}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[0-9]/, '_$&');
    return safe;
  }

  // ── Build the list of encoder modes from state.encoder ──
  // First mode = baseline (no overlay layer needed).
  // Every mode after the first gets one dedicated overlay layer.
  function _getEncoderModes(encoder) {
    const order = ['scroll', 'volume', 'brightness'];
    return order
      .filter(m => encoder[m] && encoder[m].cw && encoder[m].ccw)
      .map(m => ({ name: m, cw: encoder[m].cw, ccw: encoder[m].ccw }));
  }

  // ── Generate macro blocks for multi-step encoder transitions ──
  // Any transition that must turn OFF the current overlay AND turn ON the
  // next one in a single button press requires a macro (single tog isn't
  // enough for 3+ modes).
  function _generateEncoderMacros(modes, contentLayerCount) {
    if (modes.length <= 1) return { block: '', macroNames: [] };

    const overlayStart = contentLayerCount; // first overlay layer index
    const macroNames = [];
    const blocks = [];

    // modes[0] = scroll (baseline, index -1 conceptually = "no overlay")
    // modes[1] = first overlay  → layer index overlayStart
    // modes[2] = second overlay → layer index overlayStart + 1
    // ...
    for (let i = 1; i < modes.length; i++) {
      const isLast = i === modes.length - 1;
      const currentOverlayIdx = overlayStart + (i - 1);

      if (isLast) continue; // last mode just needs a plain &tog off, no macro

      const nextOverlayIdx = overlayStart + i;
      const macroId = `mode_${modes[i].name}_to_${modes[i + 1].name}`;
      macroNames.push({ afterMode: i, id: macroId });

      blocks.push(`
    ${macroId}: ${macroId} {
        compatible = "zmk,behavior-macro";
        #binding-cells = <0>;
        bindings = <&tog ${currentOverlayIdx}>, <&tog ${nextOverlayIdx}>;
    };`);
    }

    const block = blocks.length
      ? `
    macros {
${blocks.join('\n')}
    };
`
      : '';

    return { block, macroNames };
  }

  // ── User macro_ bindings inside the 9 regular keys (unchanged behavior) ──
  function _generateUserMacros(layers) {
    const macros = [];
    layers.forEach(layer => {
      layer.keys.forEach(key => {
        if (key && key.startsWith('macro_')) {
          if (!macros.find(m => m.id === key)) {
            macros.push({ id: key, label: key.replace('macro_', '') });
          }
        }
      });
    });
    if (macros.length === 0) return '';

    const blocks = macros.map(m => `
    ${m.id}: ${m.id} {
        compatible = "zmk,behavior-macro";
        #binding-cells = <0>;
        bindings = <&kp TRANS>; /* TODO: set macro steps */
        label = "${m.label.toUpperCase()}";
    };`).join('\n');

    return `
    macros {
${blocks}
    };
`;
  }

  // ── Determine push-button (encoder SW) binding for a CONTENT layer ──
  function _pushBindingForContentLayer(modes, contentLayerCount) {
    if (modes.length <= 1) return '&trans'; // only scroll mode exists, nothing to cycle
    return `&tog ${contentLayerCount}`; // enter first overlay (mode index 1)
  }

  // ── Determine push-button binding for an OVERLAY layer ──
  function _pushBindingForOverlayLayer(modeIndex, modes, contentLayerCount, macroNames) {
    const overlayIdx = contentLayerCount + (modeIndex - 1);
    const isLast = modeIndex === modes.length - 1;

    if (isLast) {
      return `&tog ${overlayIdx}`; // turn off, falls back to baseline scroll
    }

    const macro = macroNames.find(m => m.afterMode === modeIndex);
    return macro ? `&${macro.id}` : `&tog ${overlayIdx}`;
  }

  // ── FN binding: round-robin through CONTENT layers only ──
  function _fnBindingForContentLayer(index, contentLayerCount) {
    if (contentLayerCount <= 1) return '&trans';
    const next = (index + 1) % contentLayerCount;
    return `&to ${next}`;
  }

  // ══════════════════════════════════════════
  //  MAIN: generate(.keymap string)
  // ══════════════════════════════════════════
  function generate(state) {
    const { layers, encoder } = state;

    const contentLayers = layers.slice(0, MAX_CONTENT_LAYERS);
    const contentLayerCount = contentLayers.length;

    const modes = _getEncoderModes(encoder);
    const { block: encoderMacroBlock, macroNames } =
      _generateEncoderMacros(modes, contentLayerCount);
    const userMacroBlock = _generateUserMacros(contentLayers);

    // ── Build CONTENT layer blocks ──
    const contentBlocks = contentLayers.map((layer, i) => {
      const keys     = _normalizeKeys(layer.keys);
      const bindings = keys.map(_resolveBinding);

      const fnBinding    = _fnBindingForContentLayer(i, contentLayerCount);
      const encSwBinding  = _pushBindingForContentLayer(modes, contentLayerCount);

      const allBindings = [...bindings, fnBinding, encSwBinding];

      const label = _layerLabel(layer.name, i);
      const bindingsFormatted = _formatBindingsBlock(allBindings, '                ');

      // Baseline (scroll) sensor-binding — every content layer gets it,
      // since scroll is the default mode with no overlay.
      const scrollMode = modes[0] || { cw: 'PG_UP', ccw: 'PG_DN' };
      const sensorBinding = `<&inc_dec_kp ${scrollMode.ccw} ${scrollMode.cw}>`;

      return `        ${label}: layer_${i} {
            label = "${(layer.name || label).toUpperCase()}";
            bindings = <
${bindingsFormatted}
            >;
            sensor-bindings = ${sensorBinding};
        };`;
    });

    // ── Build OVERLAY layer blocks (modes[1..]) ──
    const overlayBlocks = [];
    for (let m = 1; m < modes.length; m++) {
      const overlayIdx = contentLayerCount + (m - 1);
      const mode = modes[m];

      const transBindings = new Array(KEYS_PER_LAYER).fill('&trans');
      const fnBinding = '&trans'; // FN never affected by encoder mode
      const encSwBinding = _pushBindingForOverlayLayer(
        m, modes, contentLayerCount, macroNames
      );

      const allBindings = [...transBindings, fnBinding, encSwBinding];
      const bindingsFormatted = _formatBindingsBlock(allBindings, '                ');
      const sensorBinding = `<&inc_dec_kp ${mode.ccw} ${mode.cw}>`;
      const label = `mode_${mode.name}`;

      overlayBlocks.push(`        ${label}: layer_${overlayIdx} {
            label = "MODE_${mode.name.toUpperCase()}";
            bindings = <
${bindingsFormatted}
            >;
            sensor-bindings = ${sensorBinding};
        };`);
    }

    const allLayerBlocks = [...contentBlocks, ...overlayBlocks];
    const totalLayers = contentLayerCount + Math.max(0, modes.length - 1);

    const keymapContent = `/*
 * ZMK Keymap — Auto-generated by sPadStudio
 * Device       : nice!nano v2 · 3×3 Macropad
 * Content Layers : ${contentLayerCount} (cycled by FN button)
 * Encoder Modes   : ${modes.map(m => m.name).join(' / ')} (cycled by encoder push, independent of FN)
 * Total ZMK Layers: ${totalLayers}
 * Generated: ${new Date().toISOString()}
 *
 * DO NOT EDIT MANUALLY — regenerate via sPadStudio
 */

#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/outputs.h>
/ {
${encoderMacroBlock}${userMacroBlock}
    keymap {
        compatible = "zmk,keymap";

${allLayerBlocks.join('\n\n')}

    };
};
`;

    return keymapContent.trim();
  }

  // ── Validate state before generating ──
  function validate(state) {
    const errors   = [];
    const warnings = [];

    if (!state.layers || state.layers.length === 0) {
      errors.push('No layers defined.');
    }

    if (state.layers.length > MAX_CONTENT_LAYERS) {
      warnings.push(`${state.layers.length} content layers defined — only first ${MAX_CONTENT_LAYERS} will be compiled.`);
    }

    state.layers.forEach((layer, i) => {
      if (!layer.name || layer.name.trim() === '') {
        warnings.push(`Layer ${i} has no name — will use "layer_${i}".`);
      }
      if (!layer.keys || layer.keys.length === 0) {
        errors.push(`Layer ${i} ("${layer.name}") has no keys.`);
      }
      if (layer.keys && layer.keys.length > KEYS_PER_LAYER) {
        warnings.push(`Layer ${i} ("${layer.name}") has ${layer.keys.length} keys — only first ${KEYS_PER_LAYER} will be used.`);
      }
    });

    if (!state.encoder) {
      errors.push('Encoder config missing.');
    } else {
      const modes = _getEncoderModes(state.encoder);
      if (modes.length === 0) {
        errors.push('Encoder must have at least one valid mode (scroll/volume/brightness) with CW and CCW bindings.');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  function preview(state) {
    const result = validate(state);
    if (!result.valid) {
      return `/* Validation errors:\n${result.errors.map(e => ' * ERROR: ' + e).join('\n')}\n */`;
    }
    return generate(state);
  }

  return { generate, validate, preview, MAX_CONTENT_LAYERS, KEYS_PER_LAYER };
})();
