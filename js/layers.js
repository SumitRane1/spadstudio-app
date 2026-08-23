// ═══ LAYERS — Layer tabs + Add Layer Modal ═══
//
// ═══ FIX (2026-08-24) ═══
// 1. This file referenced `KeymapGenerator.MAX_LAYERS`, which doesn't exist
//    — the real constant is `KeymapGenerator.MAX_CONTENT_LAYERS`. Reading an
//    undefined property meant `layers.length >= undefined` was ALWAYS false,
//    so the "+ Add Layer" button was NEVER actually disabled at 4 layers,
//    despite this file's own comments saying it should be. Fixed all 3
//    references (render()'s atMax check, the badge, and the init() double-check).
// 2. _confirmAdd()'s PRESET branch pushed directly into state.layers via
//    State.set(), completely bypassing State.addLayer()'s own cap check.
//    That meant even with the naming bug fixed, adding a layer via a
//    software preset (not "Blank Layer") could still exceed 4. Added the
//    same cap check directly before the preset push.


const Layers = (() => {

  let _activeCategory = 'Design';
  let _selectedPreset = null;
  let _mode = 'preset';

  // ── Render sidebar layer tabs ──
  function render() {
    const container = document.getElementById('layer-tabs');
    if (!container) return;

    const { layers, activeLayerIndex } = State.get();
    // ★ FIX: MAX_LAYERS -> MAX_CONTENT_LAYERS
    const atMax = layers.length >= KeymapGenerator.MAX_CONTENT_LAYERS;

    container.innerHTML = layers.map((layer, i) => `
      <div class="layer-tab ${i === activeLayerIndex ? 'active' : ''}"
           data-layer-index="${i}">
        <span>${layer.name}</span>
        ${layers.length > 1
          ? `<button class="layer-tab-del" data-del-index="${i}" title="Delete layer">✕</button>`
          : ''}
      </div>
    `).join('');

    container.querySelectorAll('.layer-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('layer-tab-del')) return;
        const idx = parseInt(tab.dataset.layerIndex);
        State.set({ activeLayerIndex: idx });
        render();
        Editor.render();
        Encoder.render();
      });
    });

    container.querySelectorAll('.layer-tab-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.delIndex);
        const name = State.get().layers[idx].name;
        if (confirm(`Delete layer "${name}"?`)) {
          State.deleteLayer(idx);
          render();
          Editor.render();
          Encoder.render();
          App.showToast('Layer deleted', 'success');
        }
      });
    });

    // ── Hard limit: disable + Add Layer button at 4 layers ──
    const addBtn = document.getElementById('btn-add-layer');
    if (addBtn) {
      addBtn.disabled          = atMax;
      // ★ FIX: MAX_LAYERS -> MAX_CONTENT_LAYERS
      addBtn.title             = atMax
        ? `Maximum ${KeymapGenerator.MAX_CONTENT_LAYERS} layers reached`
        : 'Add layer';
      addBtn.style.opacity     = atMax ? '0.4' : '1';
      addBtn.style.cursor      = atMax ? 'not-allowed' : 'pointer';
      addBtn.style.pointerEvents = atMax ? 'none' : 'auto';
    }

    // ── Layer count badge ──
    const badge = document.getElementById('layer-count-badge');
    if (badge) {
      // ★ FIX: MAX_LAYERS -> MAX_CONTENT_LAYERS
      badge.textContent = `${layers.length} / ${KeymapGenerator.MAX_CONTENT_LAYERS}`;
      badge.style.color = atMax
        ? 'var(--color-warning)'
        : 'var(--color-text-faint)';
    }
  }

  // ── Init: bind Add Layer button ──
  function init() {
    document.getElementById('btn-add-layer')?.addEventListener('click', () => {
      const { layers } = State.get();
      // ★ FIX: MAX_LAYERS -> MAX_CONTENT_LAYERS
      if (layers.length >= KeymapGenerator.MAX_CONTENT_LAYERS) {
        App.showToast(`Maximum ${KeymapGenerator.MAX_CONTENT_LAYERS} layers reached`, 'warning');
        return;
      }
      openModal();
    });
  }

  // ── Open the Add Layer modal ──
  function openModal() {
    _selectedPreset = null;
    _mode = 'preset';
    _activeCategory = 'Design';

    let modal = document.getElementById('modal-add-layer');
    if (!modal) {
      const div = document.createElement('div');
      div.id = 'modal-add-layer-overlay';
      div.className = 'modal-overlay';
      div.innerHTML = `
        <div class="modal" id="modal-add-layer" style="max-width:620px;" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h2 class="modal-title">Add Layer</h2>
            <button class="icon-btn" id="add-layer-close" aria-label="Close">✕</button>
          </div>

          <!-- Mode tabs -->
          <div class="add-layer-mode-tabs">
            <button class="add-layer-mode-btn active" data-mode="preset">🗂 Software Preset</button>
            <button class="add-layer-mode-btn" data-mode="blank">⚙️ Blank Layer</button>
          </div>

          <!-- Body -->
          <div id="add-layer-body" class="add-layer-body"></div>

          <!-- Footer -->
          <div class="modal-footer" id="add-layer-footer">
            <span class="selected-preview" id="add-layer-preview">No preset selected</span>
            <button class="btn btn-primary" id="add-layer-confirm" disabled>Add Layer</button>
            <button class="btn btn-ghost" id="add-layer-cancel">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(div);
      modal = document.getElementById('modal-add-layer');
    }

    document.getElementById('modal-add-layer-overlay').classList.remove('hidden');
    _renderModalBody();
    _bindModalEvents();
  }

  function _closeModal() {
    const overlay = document.getElementById('modal-add-layer-overlay');
    if (overlay) overlay.classList.add('hidden');
    _selectedPreset = null;
  }

  // ── Render modal body based on mode ──
  function _renderModalBody() {
    const body = document.getElementById('add-layer-body');
    if (!body) return;

    if (_mode === 'blank') {
      body.innerHTML = `
        <div class="add-layer-blank">
          <div class="field-group">
            <label class="field-label" for="blank-layer-name">Layer Name</label>
            <input type="text" id="blank-layer-name" class="modal-text-input"
                   placeholder="e.g. My Layer" maxlength="24" autocomplete="off" />
          </div>
          <p style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-2);">
            All 9 keys will be set to Transparent. You can edit bindings after adding.
          </p>
        </div>
      `;
      const confirmBtn = document.getElementById('add-layer-confirm');
      if (confirmBtn) confirmBtn.disabled = false;
      const preview = document.getElementById('add-layer-preview');
      if (preview) preview.textContent = 'Blank layer — customize after adding';

      document.getElementById('blank-layer-name')?.addEventListener('input', e => {
        const preview = document.getElementById('add-layer-preview');
        if (preview) preview.textContent = e.target.value || 'Enter a name above';
      });

    } else {
      body.innerHTML = `
        <div class="add-layer-preset-layout">
          <!-- Category sidebar -->
          <div class="preset-cat-sidebar" id="preset-cat-sidebar">
            ${LayerPresets.getCategories().map(cat => `
              <button class="preset-cat-btn ${cat === _activeCategory ? 'active' : ''}"
                      data-cat="${cat}">${cat}</button>
            `).join('')}
          </div>

          <!-- Preset grid -->
          <div class="preset-grid-area">
            <div class="preset-cards" id="preset-cards">
              ${_renderPresetCards()}
            </div>

            <!-- Preview panel -->
            <div class="preset-preview-panel ${_selectedPreset ? '' : 'hidden'}"
                 id="preset-preview-panel">
              ${_selectedPreset ? _renderPresetPreview(_selectedPreset) : ''}
            </div>
          </div>
        </div>
      `;

      _bindPresetCardEvents();
      _bindCategoryEvents();
    }
  }

  function _renderPresetCards() {
    const list = LayerPresets.getByCategory(_activeCategory);
    return list.map(p => `
      <div class="preset-card ${_selectedPreset?.id === p.id ? 'selected' : ''}"
           data-preset-id="${p.id}">
        <span class="preset-card-icon">${p.icon}</span>
        <span class="preset-card-name">${p.name}</span>
      </div>
    `).join('');
  }

  function _renderPresetPreview(preset) {
    return `
      <div class="preview-header">
        <span style="font-size:1.4rem;">${preset.icon}</span>
        <div>
          <div style="font-weight:600;font-size:var(--text-sm);color:var(--color-text);">
            ${preset.name}
          </div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${preset.desc}</div>
        </div>
      </div>
      <div class="preview-key-grid">
        ${preset.keys.map((k, i) => `
          <div class="preview-key">
            <span class="preview-key-num">${i + 1}</span>
            <span class="preview-key-label">${Keycodes.getDisplayLabel(k)}</span>
          </div>
        `).join('')}
      </div>
      <div style="font-size:var(--text-xs);color:var(--color-text-faint);margin-top:var(--space-2);">
        You can edit any key binding after adding this layer.
      </div>
    `;
  }

  function _bindCategoryEvents() {
    document.querySelectorAll('.preset-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeCategory = btn.dataset.cat;
        _selectedPreset = null;
        document.querySelectorAll('.preset-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cards = document.getElementById('preset-cards');
        if (cards) cards.innerHTML = _renderPresetCards();
        const panel = document.getElementById('preset-preview-panel');
        if (panel) panel.classList.add('hidden');
        const confirmBtn = document.getElementById('add-layer-confirm');
        if (confirmBtn) confirmBtn.disabled = true;
        const preview = document.getElementById('add-layer-preview');
        if (preview) preview.textContent = 'No preset selected';
        _bindPresetCardEvents();
      });
    });
  }

  function _bindPresetCardEvents() {
    document.querySelectorAll('.preset-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.presetId;
        _selectedPreset = LayerPresets.getById(id);
        if (!_selectedPreset) return;

        document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        const panel = document.getElementById('preset-preview-panel');
        if (panel) {
          panel.innerHTML = _renderPresetPreview(_selectedPreset);
          panel.classList.remove('hidden');
        }

        const confirmBtn = document.getElementById('add-layer-confirm');
        if (confirmBtn) confirmBtn.disabled = false;
        const preview = document.getElementById('add-layer-preview');
        if (preview) preview.textContent = `${_selectedPreset.icon} ${_selectedPreset.name}`;
      });
    });
  }

  function _bindModalEvents() {
    document.getElementById('add-layer-close')?.addEventListener('click', _closeModal);
    document.getElementById('add-layer-cancel')?.addEventListener('click', _closeModal);
    document.getElementById('modal-add-layer-overlay')?.addEventListener('click', e => {
      if (e.target.id === 'modal-add-layer-overlay') _closeModal();
    });

    document.querySelectorAll('.add-layer-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _mode = btn.dataset.mode;
        _selectedPreset = null;
        document.querySelectorAll('.add-layer-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const confirmBtn = document.getElementById('add-layer-confirm');
        if (confirmBtn) confirmBtn.disabled = _mode === 'preset';
        const preview = document.getElementById('add-layer-preview');
        if (preview) preview.textContent = _mode === 'preset' ? 'No preset selected' : 'Blank layer';
        _renderModalBody();
      });
    });

    document.getElementById('add-layer-confirm')?.addEventListener('click', _confirmAdd);
  }

  function _confirmAdd() {
    // Double-check limit at confirm time
    // ★ FIX: MAX_LAYERS -> MAX_CONTENT_LAYERS
    const { layers } = State.get();
    if (layers.length >= KeymapGenerator.MAX_CONTENT_LAYERS) {
      App.showToast(`Maximum ${KeymapGenerator.MAX_CONTENT_LAYERS} layers reached`, 'warning');
      _closeModal();
      return;
    }

    if (_mode === 'blank') {
      const nameInput = document.getElementById('blank-layer-name');
      const name = nameInput?.value.trim() || `Layer ${layers.length + 1}`;
      const result = State.addLayer(name);
      if (result && result.ok === false) {
        App.showToast(result.error, 'warning');
        _closeModal();
        return;
      }
      const newIdx = State.get().layers.length - 1;
      State.set({ activeLayerIndex: newIdx });
      render();
      Editor.render();
      Encoder.render();
      App.showToast(`Layer "${name}" added — full compile required`, 'warning');

    } else if (_selectedPreset) {
      // ★ FIX: this branch bypassed State.addLayer()'s cap by writing
      // directly via State.set(). Re-checked the cap explicitly here too,
      // since the guard above already covers it — kept for defense-in-depth
      // in case this branch is ever refactored to run independently.
      if (State.get().layers.length >= KeymapGenerator.MAX_CONTENT_LAYERS) {
        App.showToast(`Maximum ${KeymapGenerator.MAX_CONTENT_LAYERS} layers reached`, 'warning');
        _closeModal();
        return;
      }

      const p = _selectedPreset;
      const layersCopy = JSON.parse(JSON.stringify(State.get().layers));
      layersCopy.push({
        id: p.id + '_' + Date.now(),
        name: p.name,
        keys: [...p.keys],
        fnAction: p.fnAction,
        encoderPush: p.encoderPush || 'TRANS',
      });
      State.set({ layers: layersCopy, buildMode: 'custom' });
      const newIdx = layersCopy.length - 1;
      State.set({ activeLayerIndex: newIdx });
      render();
      Editor.render();
      Encoder.render();
      App.showToast(`${p.icon} ${p.name} layer added`, 'success');
    }

    _closeModal();
  }

  return { render, init, openModal };
})();
