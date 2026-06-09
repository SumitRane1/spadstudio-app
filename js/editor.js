// ═══ EDITOR — Key grid + inspector ═══

const Editor = (() => {

  let _selectedKey = null;   // { layerIndex, keyIndex } or 'fn'
  let _pendingZmk  = null;   // picked zmk code in modal

  // ── Render grid ──
  function render() {
    _renderGrid();
    _renderFnPanel();
    _clearInspector();
  }

  function _renderGrid() {
    const container = document.getElementById('pad-grid');
    if (!container) return;

    const { layers, activeLayerIndex } = State.get();
    const layer = layers[activeLayerIndex];
    if (!layer) return;

    container.innerHTML = layer.keys.map((zmk, i) => {
      const kc = Keycodes.getByZmk(zmk);
      return `
        <button class="key-btn" data-key-index="${i}"
                aria-label="Key ${i+1}: ${kc.display}">
          <span class="key-index">${i + 1}</span>
          <span class="key-label">${kc.display}</span>
          <span class="key-sub">${zmk === 'TRANS' || zmk === 'NONE' ? '' : kc.cat}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.keyIndex);
        _selectKey(idx);
      });
    });
  }

  function _renderFnPanel() {
    const container = document.getElementById('fn-panel');
    if (!container) return;

    const { layers, activeLayerIndex } = State.get();
    const layer = layers[activeLayerIndex];
    if (!layer) return;

    const kc = Keycodes.getByZmk(layer.fnAction);

    container.innerHTML = `
      <div class="field-group">
        <div class="field-label">FN Action</div>
        <select class="select-field" id="fn-action-select">
          ${Keycodes.getByCategory('Layer').map(k =>
            `<option value="${k.zmk}" ${k.zmk === layer.fnAction ? 'selected' : ''}>${k.display}</option>`
          ).join('')}
        </select>
      </div>
      <div style="font-size: var(--text-xs); color: var(--color-text-faint); margin-top: var(--space-2);">
        Current: <span style="color: var(--color-accent); font-family: var(--font-mono);">${kc.display}</span>
      </div>
    `;

    container.querySelector('#fn-action-select').addEventListener('change', e => {
      State.setFnAction(State.get().activeLayerIndex, e.target.value);
      _renderFnPanel();
      App.showToast('FN action updated', 'success');
    });
  }

  // ── Key selection ──
  function _selectKey(keyIndex) {
    _selectedKey = { layerIndex: State.get().activeLayerIndex, keyIndex };

    // Highlight selected key
    document.querySelectorAll('.key-btn').forEach((b, i) => {
      b.classList.toggle('selected', i === keyIndex);
    });

    _showInspector(keyIndex);
  }

  // ── Inspector ──
  function _showInspector(keyIndex) {
    const empty   = document.getElementById('inspector-empty');
    const content = document.getElementById('inspector-content');
    if (!empty || !content) return;

    const { layers, activeLayerIndex } = State.get();
    const zmk = layers[activeLayerIndex].keys[keyIndex];
    const kc  = Keycodes.getByZmk(zmk);

    empty.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = `
      <div class="inspector-title">
        Key ${keyIndex + 1}
        <span style="font-size:var(--text-xs);color:var(--color-text-faint);font-weight:400;">
          (Layer: ${layers[activeLayerIndex].name})
        </span>
      </div>

      <div class="inspector-current">
        <div class="inspector-key-preview">${kc.display}</div>
        <div class="inspector-key-info">
          <div class="inspector-key-code">${kc.zmk}</div>
          <div class="inspector-key-name">${kc.label} · ${kc.cat}</div>
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-change-key">
        Change Binding
      </button>

      <button class="btn btn-ghost btn-full btn-sm" id="btn-clear-key">
        Set Transparent (▽)
      </button>
    `;

    content.querySelector('#btn-change-key').addEventListener('click', () => {
      _openModal(keyIndex);
    });

    content.querySelector('#btn-clear-key').addEventListener('click', () => {
      State.setKey(State.get().activeLayerIndex, keyIndex, 'TRANS');
      _renderGrid();
      _showInspector(keyIndex);
      App.showToast('Key cleared', 'success');
    });
  }

  function _clearInspector() {
    _selectedKey = null;
    const empty   = document.getElementById('inspector-empty');
    const content = document.getElementById('inspector-content');
    if (empty)   empty.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    document.querySelectorAll('.key-btn').forEach(b => b.classList.remove('selected'));
  }

  // ── Key picker modal ──
  function _openModal(keyIndex) {
    const overlay = document.getElementById('modal-overlay');
    const search  = document.getElementById('keycode-search');
    if (!overlay) return;

    const currentZmk = State.get().layers[State.get().activeLayerIndex].keys[keyIndex];
    _pendingZmk = currentZmk;

    overlay.classList.remove('hidden');
    _renderModalCategories('All');
    _renderModalKeys(Keycodes.getAll(), currentZmk);
    _updateModalPreview(currentZmk);

    if (search) { search.value = ''; search.focus(); }

    // Search
    search && search.addEventListener('input', _onModalSearch);

    // Confirm
    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (_pendingZmk) {
          State.setKey(State.get().activeLayerIndex, keyIndex, _pendingZmk);
          _renderGrid();
          _showInspector(keyIndex);
          App.showToast('Key binding updated', 'success');
        }
        _closeModal();
      };
    }
  }

  function _closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const search  = document.getElementById('keycode-search');
    if (overlay) overlay.classList.add('hidden');
    if (search) search.removeEventListener('input', _onModalSearch);
  }

  function _onModalSearch(e) {
    const results = Keycodes.search(e.target.value);
    _renderModalCategories('All');
    _renderModalKeys(results, _pendingZmk);
  }

  function _renderModalCategories(activecat) {
    const container = document.getElementById('modal-categories');
    if (!container) return;
    container.innerHTML = Keycodes.categories.map(cat =>
      `<button class="cat-btn ${cat === activecat ? 'active' : ''}"
               data-cat="${cat}">${cat}</button>`
    ).join('');
    container.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        document.getElementById('keycode-search').value = '';
        _renderModalCategories(cat);
        _renderModalKeys(Keycodes.getByCategory(cat), _pendingZmk);
      });
    });
  }

  function _renderModalKeys(keys, selectedZmk) {
    const container = document.getElementById('modal-keylist');
    if (!container) return;
    if (keys.length === 0) {
      container.innerHTML = `<div style="padding:var(--space-6);text-align:center;color:var(--color-text-faint);font-size:var(--text-sm);grid-column:1/-1;">No keys found</div>`;
      return;
    }
    container.innerHTML = keys.map(k =>
      `<button class="keylist-item ${k.zmk === selectedZmk ? 'selected' : ''}"
               data-zmk="${k.zmk}"
               title="${k.zmk}">${k.display}</button>`
    ).join('');
    container.querySelectorAll('.keylist-item').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.keylist-item').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _pendingZmk = btn.dataset.zmk;
        _updateModalPreview(_pendingZmk);
      });
    });
  }

  function _updateModalPreview(zmk) {
    const preview = document.getElementById('selected-preview');
    if (!preview) return;
    const kc = Keycodes.getByZmk(zmk);
    preview.textContent = zmk ? `${kc.display}  ·  ${kc.zmk}` : 'No binding selected';
  }

  // ── Init ──
  function init() {
    // Modal close buttons
    document.getElementById('modal-close')?.addEventListener('click', _closeModal);
    document.getElementById('modal-cancel')?.addEventListener('click', _closeModal);
    document.getElementById('modal-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) _closeModal();
    });

    // FN key visual
    document.getElementById('fn-key-btn')?.addEventListener('click', () => {
      App.showToast('FN action is set in the sidebar panel', 'info');
    });

    // Encoder visual click
    document.getElementById('encoder-visual')?.addEventListener('click', () => {
      App.showToast('Encoder settings are in the sidebar panel', 'info');
    });
  }

  return { render, init };
})();