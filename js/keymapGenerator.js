// ═══ KEYMAP GENERATOR ═══
// Converts app State → valid ZMK .keymap source string.
//
// ═══ FIX (2026-08-24) — MAX_CONTENT_LAYERS was 6, should be 4 ═══
// This constant represents how many layers the USER manages directly in
// state.layers (Media, System, Illustrator, Premiere Pro — 4 total). The
// encoder-mode overlays (Volume, Brightness) are NOT content layers — they
// are auto-generated below from state.encoder and appended AFTER content
// layers, bringing the real total ZMK layer count to 6.
//
// Having MAX_CONTENT_LAYERS = 6 let the UI's addLayer() (state.js) create up
// to 6 "content" layers, which made contentLayerCount wrong (6 instead of
// 4), shifting FN transition macro indices and overlay layer indices, and
// causing wrong bindings to land on the encoder push (e.g. an unrelated
// Ctrl+Z firing instead of a mode-cycle macro). state.js's addLayer() now
// also reads this constant directly to enforce the same cap at the source.
//
// Architecture:
// - Content layers (max 4) are cycled by FN using &tog transition macros.
// - Encoder modes are independent overlays after content layers.
// - Scroll is the baseline mode; volume and brightness get overlay layers.
// - FN transition macros never use &to, so they do NOT disable encoder overlays.

const KeymapGenerator = (() => {

  const MAX_CONTENT_LAYERS = 4; // ★ FIX: was 6 — see header comment
  const KEYS_PER_LAYER = 9;

  // ── ZMK behavior prefix resolver ──
  function _resolveBinding(code) {
    if (!code || code === 'TRANS' || code === 'trans') return '&trans';
    if (code === 'NONE' || code === 'none') return '&none';

    const value = String(code).trim();
    const lower = value.toLowerCase();

    if (lower.startsWith('tog ')) return `&tog ${value.split(/\s+/)[1]}`;
    if (lower.startsWith('to ')) return `&to ${value.split(/\s+/)[1]}`;
    if (lower.startsWith('mo ')) return `&mo ${value.split(/\s+/)[1]}`;
    if (lower.startsWith('lt ')) return `&lt ${value.slice(3)}`;
    if (lower.startsWith('mt ')) return `&mt ${value.slice(3)}`;
    if (lower.startsWith('macro_')) return `&${value}`;

    return `&kp ${value}`;
  }

  function _normalizeKeys(keys = []) {
    const result = [...keys].slice(0, KEYS_PER_LAYER);
    while (result.length < KEYS_PER_LAYER) result.push('TRANS');
    return result;
  }

  function _formatBindingsBlock(bindings, indent) {
    const lines = [];
    for (let i = 0; i < bindings.length; i += 3) {
      const row = bindings.slice(i, i + 3)
        .map(binding => binding.padEnd(22))
        .join(' ');
      lines.push(`${indent}${row.trimEnd()}`);
    }
    return lines.join('\n');
  }

  function _layerLabel(name, index) {
    return (name || `layer_${index}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[0-9]/, '_$&');
  }

  function _getEncoderModes(encoder = {}) {
    const order = ['scroll', 'volume', 'brightness'];

    return order
      .filter(mode => encoder[mode] && encoder[mode].cw && encoder[mode].ccw)
      .map(mode => ({
        name: mode,
        cw: encoder[mode].cw,
        ccw: encoder[mode].ccw,
      }));
  }

  // ── Generate FN macros ──
  // IMPORTANT: We intentionally use &tog, not &to.
  // &to disables every active layer except the default layer, which would
  // reset a currently active encoder overlay (volume/brightness).
  function _generateFnMacros(contentLayerCount) {
    if (contentLayerCount <= 1) return { block: '', bindings: [] };

    const macros = [];
    const bindings = [];

    for (let current = 0; current < contentLayerCount; current++) {
      const next = (current + 1) % contentLayerCount;
      const id = `layer_${current}_to_layer_${next}`;

      macros.push(`
        ${id}: ${id} {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&tog ${current}>, <&tog ${next}>;
        };`);

      bindings[current] = `&${id}`;
    }

    return {
      block: macros.join('\n'),
      bindings,
    };
  }

  // ── Generate encoder mode transition macros ──
  // modes[0] is baseline scroll. It needs no overlay layer.
  // modes[1+] are overlay layers appended after content layers.
  function _generateEncoderMacros(modes, contentLayerCount) {
    if (modes.length <= 2) return { block: '', bindings: [] };

    const macros = [];
    const bindings = [];

    for (let modeIndex = 1; modeIndex < modes.length - 1; modeIndex++) {
      const currentOverlay = contentLayerCount + (modeIndex - 1);
      const nextOverlay = contentLayerCount + modeIndex;
      const id = `mode_${modes[modeIndex].name}_to_${modes[modeIndex + 1].name}`;

      macros.push(`
        ${id}: ${id} {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&tog ${currentOverlay}>, <&tog ${nextOverlay}>;
        };`);

      bindings[modeIndex] = `&${id}`;
    }

    return {
      block: macros.join('\n'),
      bindings,
    };
  }

  // Placeholder macro definitions for app-level macro_* key references.
  function _generateUserMacros(layers) {
    const found = new Map();

    layers.forEach(layer => {
      (layer.keys || []).forEach(key => {
        if (typeof key === 'string' && key.startsWith('macro_') && !found.has(key)) {
          found.set(key, key.replace('macro_', ''));
        }
      });
    });

    return [...found.entries()].map(([id, label]) => `
        ${id}: ${id} {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&kp TRANS>; /* TODO: set macro steps */
            label = "${label.toUpperCase()}";
        };`).join('\n');
  }

  function _buildMacrosBlock(contentLayerCount, modes, layers) {
    const fn = _generateFnMacros(contentLayerCount);
    const encoder = _generateEncoderMacros(modes, contentLayerCount);
    const user = _generateUserMacros(layers);

    const definitions = [fn.block, encoder.block, user].filter(Boolean).join('\n');

    return {
      block: definitions ? `
    macros {
${definitions}
    };
` : '',
      fnBindings: fn.bindings,
      encoderTransitionBindings: encoder.bindings,
    };
  }

  function _encoderPushForContent(modes, contentLayerCount) {
    // Baseline scroll -> activate first overlay (normally volume).
    return modes.length > 1 ? `&tog ${contentLayerCount}` : '&trans';
  }

  function _encoderPushForOverlay(modeIndex, modes, contentLayerCount, transitionBindings) {
    const currentOverlay = contentLayerCount + (modeIndex - 1);
    const lastModeIndex = modes.length - 1;

    // Final overlay -> turn itself off -> return to baseline scroll.
    if (modeIndex === lastModeIndex) return `&tog ${currentOverlay}`;

    // Intermediate overlay -> macro toggles this one off and next one on.
    return transitionBindings[modeIndex] || `&tog ${currentOverlay}`;
  }

  function generate(state) {
    const layers = Array.isArray(state.layers) ? state.layers : [];
    const encoder = state.encoder || {};
    const contentLayers = layers.slice(0, MAX_CONTENT_LAYERS);
    const contentLayerCount = contentLayers.length;
    const modes = _getEncoderModes(encoder);

    const {
      block: macrosBlock,
      fnBindings,
      encoderTransitionBindings,
    } = _buildMacrosBlock(contentLayerCount, modes, contentLayers);

    const baselineMode = modes[0] || { name: 'scroll', cw: 'PG_UP', ccw: 'PG_DN' };

    const contentBlocks = contentLayers.map((layer, index) => {
      const label = _layerLabel(layer.name, index);
      const keyBindings = _normalizeKeys(layer.keys).map(_resolveBinding);
      const fnBinding = fnBindings[index] || _resolveBinding(layer.fnAction || 'TRANS');
      const encoderPushBinding = _encoderPushForContent(modes, contentLayerCount);
      const formattedBindings = _formatBindingsBlock(
        [...keyBindings, fnBinding, encoderPushBinding],
        '                '
      );

      return `        ${label}: layer_${index} {
            label = "${(layer.name || label).toUpperCase()}";
            bindings = <
${formattedBindings}
            >;
            sensor-bindings = <&inc_dec_kp ${baselineMode.ccw} ${baselineMode.cw}>;
        };`;
    });

    const overlayBlocks = [];

    for (let modeIndex = 1; modeIndex < modes.length; modeIndex++) {
      const mode = modes[modeIndex];
      const overlayIndex = contentLayerCount + (modeIndex - 1);
      const encoderPushBinding = _encoderPushForOverlay(
        modeIndex,
        modes,
        contentLayerCount,
        encoderTransitionBindings
      );
      const formattedBindings = _formatBindingsBlock(
        [
          ...new Array(KEYS_PER_LAYER).fill('&trans'),
          '&trans',
          encoderPushBinding,
        ],
        '                '
      );

      overlayBlocks.push(`        mode_${mode.name}: layer_${overlayIndex} {
            label = "MODE_${mode.name.toUpperCase()}";
            bindings = <
${formattedBindings}
            >;
            sensor-bindings = <&inc_dec_kp ${mode.ccw} ${mode.cw}>;
        };`);
    }

    const allBlocks = [...contentBlocks, ...overlayBlocks];
    const totalLayers = contentLayerCount + Math.max(0, modes.length - 1);

    return `/*
 * ZMK Keymap — Auto-generated by sPadStudio
 * Device         : nice!nano v2 · 3×3 Macropad
 * Content Layers : ${contentLayerCount} (cycled by FN)
 * Encoder Modes  : ${modes.map(mode => mode.name).join(' / ') || 'none'} (cycled by encoder push)
 * Total ZMK Layers: ${totalLayers}
 * Generated: ${new Date().toISOString()}
 *
 * FN transitions use &tog macros rather than &to, preserving encoder overlays.
 */

#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/outputs.h>
/ {
${macrosBlock}
    keymap {
        compatible = "zmk,keymap";

${allBlocks.join('\n\n')}

    };
};`.trim();
  }

  function validate(state) {
    const errors = [];
    const warnings = [];
    const layers = Array.isArray(state.layers) ? state.layers : [];

    if (layers.length === 0) {
      errors.push('No layers defined.');
    }

    if (layers.length > MAX_CONTENT_LAYERS) {
      warnings.push(`${layers.length} content layers defined — only the first ${MAX_CONTENT_LAYERS} will be compiled. Volume/Brightness modes are configured separately in the Encoder panel, not as extra layers.`);
    }

    layers.slice(0, MAX_CONTENT_LAYERS).forEach((layer, index) => {
      if (!layer.name || !layer.name.trim()) {
        warnings.push(`Layer ${index} has no name — "layer_${index}" will be used.`);
      }
      if (!Array.isArray(layer.keys) || layer.keys.length === 0) {
        errors.push(`Layer ${index} ("${layer.name || `layer_${index}`}") has no keys.`);
      }
      if (Array.isArray(layer.keys) && layer.keys.length > KEYS_PER_LAYER) {
        warnings.push(`Layer ${index} has ${layer.keys.length} keys — only the first ${KEYS_PER_LAYER} will be used.`);
      }
    });

    if (!state.encoder) {
      errors.push('Encoder config missing.');
    } else if (_getEncoderModes(state.encoder).length === 0) {
      errors.push('Encoder needs at least one complete mode with both CW and CCW bindings.');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  function preview(state) {
    const result = validate(state);
    if (!result.valid) {
      return `/* Validation errors:\n${result.errors.map(error => ` * ERROR: ${error}`).join('\n')}\n */`;
    }
    return generate(state);
  }

  return {
    generate,
    validate,
    preview,
    MAX_CONTENT_LAYERS,
    KEYS_PER_LAYER,
  };
})();
