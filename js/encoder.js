// ═══ ENCODER — Independent 3-mode panel ═══
// Encoder push button cycles: Scroll → Volume → Brightness → Scroll
// This is INDEPENDENT of which layer is active

const Encoder = (() => {

  const MODES = [
    {
      id: 'scroll',
      label: 'Scroll',
      icon: '↕',
      color: 'var(--color-primary)',
      highlight: 'var(--color-primary-highlight)',
      desc: 'Encoder rotates to scroll pages'
    },
    {
      id: 'volume',
      label: 'Volume',
      icon: '🔊',
      color: 'var(--color-accent)',
      highlight: 'var(--color-accent-highlight)',
      desc: 'Encoder rotates to control volume'
    },
    {
      id: 'brightness',
      label: 'Brightness',
      icon: '☀',
      color: 'var(--color-warning)',
      highlight: 'var(--color-warning-highlight)',
      desc: 'Encoder rotates to control brightness'
    },
  ];

  // Which mode is visually previewed in the sidebar (not runtime — just for editing)
  let _editingMode = 'scroll';

  function render() {
    const container = document.getElementById('encoder-panel');
    if (!container) return;

    const { encoder } = State.get();

    container.innerHTML = `
      <!-- Mode selector tabs -->
      <div class="enc-mode-tabs" id="enc-mode-tabs">
        ${MODES.map(m => `
          <button class="enc-mode-tab ${_editingMode === m.id ? 'active' : ''}"
                  data-mode="${m.id}"
                  style="--mode-color:${m.color};--mode-highlight:${m.highlight};"
                  title="${m.desc}">
            <span class="enc-mode-icon">${m.icon}</span>
            <span class="enc-mode-name">${m.label}</span>
          </button>
        `).join('')}
      </div>

      <!-- Push button info -->
      <div class="enc-push-info">
        <span class="enc-push-icon">●</span>
        <span>Push = cycle to next mode</span>
      </div>

      <!-- Bindings for selected mode -->
      <div class="enc-bindings" id="enc-bindings">
        ${_renderBindings(encoder)}
      </div>
    `;

    // Mode tab click
    container.querySelectorAll('.enc-mode-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _editingMode = btn.dataset.mode;
        render();
        _syncEncoderVisual();
      });
    });

    // CW / CCW selects
    container.querySelector('#enc-cw')?.addEventListener('change', e => {
      State.setEncoderBinding(_editingMode, 'cw', e.target.value);
      App.showToast(`${_modeLabel()} CW updated — full compile required`, 'warning');
    });
    container.querySelector('#enc-ccw')?.addEventListener('change', e => {
      State.setEncoderBinding(_editingMode, 'ccw', e.target.value);
      App.showToast(`${_modeLabel()} CCW updated — full compile required`, 'warning');
    });

    _syncEncoderVisual();
  }

  function _renderBindings(encoder) {
    const mode = MODES.find(m => m.id === _editingMode);
    const bindings = encoder[_editingMode];

    return `
      <div class="enc-mode-header"
           style="color:${mode.color};background:${mode.highlight};">
        <span style="font-size:1.1rem;">${mode.icon}</span>
        <span>${mode.label} Mode</span>
        <span class="enc-mode-desc">${mode.desc}</span>
      </div>

      <div class="field-group">
        <div class="encoder-field">
          <span class="encoder-arrow" style="color:${mode.color};">↻</span>
          <span class="field-label">Clockwise</span>
        </div>
        <select class="select-field" id="enc-cw">
          ${_buildOptions(bindings.cw)}
        </select>
      </div>

      <div class="field-group">
        <div class="encoder-field">
          <span class="encoder-arrow" style="color:${mode.color};">↺</span>
          <span class="field-label">Counter-Clockwise</span>
        </div>
        <select class="select-field" id="enc-ccw">
          ${_buildOptions(bindings.ccw)}
        </select>
      </div>
    `;
  }

  function _buildOptions(selectedZmk) {
    // Relevant keycodes for encoder (navigation + media)
    const relevant = Keycodes.getAll().filter(k =>
      ['Navigation', 'Media', 'Layer'].includes(k.cat)
    );
    return relevant.map(k =>
      `<option value="${k.zmk}" ${k.zmk === selectedZmk ? 'selected' : ''}>${k.display}</option>`
    ).join('');
  }

  function _modeLabel() {
    return MODES.find(m => m.id === _editingMode)?.label || _editingMode;
  }

  function _syncEncoderVisual() {
    // Update the visual encoder ring in the center pad
    const label = document.getElementById('encoder-mode-label');
    if (label) label.textContent = _modeLabel().toUpperCase();

    // Update encoder ring color hint
    const ring = document.querySelector('.encoder-ring');
    const mode = MODES.find(m => m.id === _editingMode);
    if (ring && mode) {
      ring.style.borderColor = mode.color;
      ring.style.boxShadow = `0 0 0 4px color-mix(in oklch, ${mode.color} 15%, transparent)`;
    }
    const modeColorLabel = document.getElementById('encoder-mode-label');
    if (modeColorLabel && mode) modeColorLabel.style.color = mode.color;
  }

  function getCurrentEditingMode() { return _editingMode; }

  return { render, getCurrentEditingMode };
})();