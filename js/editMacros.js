// ═══ EDIT MACROS — Live ZMK Studio key grid + inspector ═══
// Mirrors editor.js / layers.js UI patterns exactly, but data comes from
// StudioRpc (live device) instead of State.js (offline compile config).
//
// IMPORTANT CAVEATS (confirmed against a real .keymap + physical layout):
//  1. Custom zero-param macros (e.g. FN round-robin behaviors like
//     `media_to_system`) show up as their own behavior_id — NOT as
//     Key Press/Layer/Transparent. The picker's "Macros" tab surfaces
//     these so users never accidentally overwrite FN-cycle logic.
//  2. Encoder ROTATION (sensor-bindings in the .keymap) is NOT exposed by
//     zmk.keymap.Layer (only `bindings` for matrix+FN+encoder-PUSH exist).
//     This is communicated via a banner — encoder CW/CCW still requires
//     the old GitHub Actions recompile + reflash path.
//
// Requires in index.html: see markup comment block (unchanged from before).
// Script load order: webserial.js -> studioRpc.js -> keycodeTranslator.js
// -> editMacros.js (after editor.js, since it borrows the modal DOM).


const EditMacros = (() => {

  let _liveKeymap        = null;
  let _physicalLayout    = null;
  let _activeLayerIndex  = 0;
  let _selectedKeyPos    = null;
  let _pendingBinding    = null;
  let _pickerCategory    = 'Keyboard';
  let _isConnected       = false;
  let _isBusy            = false;


  // ════════════════════════════════════════
  //  CONNECT
  // ════════════════════════════════════════

  async function connect() {
    if (_isBusy) return;
    _isBusy = true;
    _renderConnectBar('connecting', 'Opening device picker…');

    try {
      await StudioRpc.connect();
      _renderConnectBar('connecting', 'Loading behaviors…');
      await StudioRpc.loadAllBehaviors();

      _renderConnectBar('connecting', 'Reading physical layout…');
      _physicalLayout = await StudioRpc.getPhysicalLayouts();

      _renderConnectBar('connecting', 'Reading current keymap…');
      _liveKeymap = await StudioRpc.getKeymap();

      _isConnected = true;
      _activeLayerIndex = 0;

      StudioRpc.onNotification(_onDeviceNotification);

      _renderConnectBar('connected', `Connected · ${_liveKeymap.layers.length} layers`);
      render();
      _renderEncoderCaveatBanner();
      App.showToast('Connected! Live editing enabled.', 'success');

    } catch (err) {
      _isConnected = false;
      _renderConnectBar('error', err.message);
      App.showToast(err.message, 'error');
    } finally {
      _isBusy = false;
    }
  }

  async function disconnect() {
    await StudioRpc.disconnect();
    _isConnected = false;
    _liveKeymap = null;
    _physicalLayout = null;
    _renderConnectBar('idle', 'Not connected');
    render();
  }

  function _onDeviceNotification(notification) {
    if (notification.keymap?.unsaved_changes_status_changed !== undefined) {
      const badge = document.getElementById('live-unsaved-badge');
      if (badge) badge.classList.toggle('hidden', false);
    }
  }


  // ════════════════════════════════════════
  //  CONNECT BAR
  // ════════════════════════════════════════

  function _renderConnectBar(status, message) {
    const bar = document.getElementById('live-connect-bar');
    if (!bar) return;

    const statusColors = {
      idle: 'muted', connecting: 'warning', connected: 'success', error: 'error',
    };

    bar.innerHTML = `
      <div class="flash-connect-banner ${status === 'connected' ? 'connected' : ''}">
        <span class="connected-dot" style="background: var(--color-${statusColors[status]}, var(--color-text-faint));"></span>
        <span>${message}</span>
        <span id="live-unsaved-badge" class="badge badge-warning hidden" style="margin-left:var(--space-2);">Unsaved</span>
        <div style="margin-left:auto; display:flex; gap:var(--space-2);">
          ${status !== 'connected' ? `
            <button class="btn btn-primary btn-sm" id="live-btn-connect" ${_isBusy ? 'disabled' : ''}>
              🔌 Connect Device
            </button>
          ` : `
            <button class="btn btn-success btn-sm" id="live-btn-save">💾 Save Changes</button>
            <button class="btn btn-ghost btn-sm" id="live-btn-disconnect">Disconnect</button>
          `}
        </div>
      </div>
      <div id="live-encoder-caveat"></div>
    `;

    bar.querySelector('#live-btn-connect')?.addEventListener('click', connect);
    bar.querySelector('#live-btn-disconnect')?.addEventListener('click', disconnect);
    bar.querySelector('#live-btn-save')?.addEventListener('click', _onSaveChanges);
  }

  // Communicates the encoder-rotation limitation clearly, once connected.
  function _renderEncoderCaveatBanner() {
    const el = document.getElementById('live-encoder-caveat');
    if (!el) return;
    el.innerHTML = `
      <div class="flash-mode-card" style="margin-top:var(--space-3); border-color: var(--color-warning);">
        <div class="flash-mode-title" style="font-size:var(--text-sm);">ℹ️ Encoder rotation isn't live-editable</div>
        <div class="flash-mode-desc" style="font-size:var(--text-xs);">
          You can edit the 9 matrix keys, the FN key, and the encoder push button here.
          Changing what the encoder does when you <strong>rotate</strong> it still requires
          a full compile via the Flash tab — ZMK Studio doesn't expose sensor bindings yet.
        </div>
      </div>
    `;
  }

  async function _onSaveChanges() {
    const btn = document.getElementById('live-btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      const result = await StudioRpc.saveChanges();
      if (result.ok) {
        App.showToast('Saved to device! No reflash needed. ✅', 'success');
        const badge = document.getElementById('live-unsaved-badge');
        if (badge) badge.classList.add('hidden');
      } else {
        throw new Error('Save failed: ' + JSON.stringify(result.err));
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes'; }
    }
  }


  // ════════════════════════════════════════
  //  RENDER — grid + layer tabs
  // ════════════════════════════════════════

  function render() {
    if (!_isConnected) {
      _clearGrid();
      return;
    }
    _renderLayerTabs();
    _renderGrid();
    _clearInspector();
  }

  function _renderLayerTabs() {
    const container = document.getElementById('live-layer-tabs');
    if (!container || !_liveKeymap) return;

    container.innerHTML = _liveKeymap.layers.map((layer, i) => `
      <div class="layer-tab ${i === _activeLayerIndex ? 'active' : ''}" data-layer-index="${i}">
        <span>${layer.name}</span>
        ${_liveKeymap.layers.length > 1
          ? `<button class="layer-tab-del" data-del-index="${i}" title="Remove layer">✕</button>`
          : ''}
      </div>
    `).join('');

    container.querySelectorAll('.layer-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        if (e.target.classList.contains('layer-tab-del')) return;
        _activeLayerIndex = parseInt(tab.dataset.layerIndex);
        render();
      });
    });

    container.querySelectorAll('.layer-tab-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.delIndex);
        const name = _liveKeymap.layers[idx].name;
        if (!confirm(`Remove layer "${name}" from device?`)) return;

        try {
          const result = await StudioRpc.removeLayer(idx);
          if (result.ok) {
            _liveKeymap = await StudioRpc.getKeymap();
            _activeLayerIndex = Math.min(_activeLayerIndex, _liveKeymap.layers.length - 1);
            render();
            App.showToast('Layer removed', 'success');
          } else {
            throw new Error('Remove failed: ' + JSON.stringify(result.err));
          }
        } catch (err) {
          App.showToast(err.message, 'error');
        }
      });
    });

    const addBtn = document.getElementById('live-btn-add-layer');
    if (addBtn) {
      const atMax = _liveKeymap.layers.length >= _liveKeymap.available_layers;
      addBtn.disabled = atMax;
      addBtn.title = atMax ? 'No more layer slots pre-allocated on this firmware' : 'Add layer';
    }
  }

  function _renderGrid() {
    const container = document.getElementById('live-pad-grid');
    if (!container || !_liveKeymap) return;

    const layer = _liveKeymap.layers[_activeLayerIndex];

    container.innerHTML = layer.bindings.map((binding, i) => {
      const label = KeycodeTranslator.describeBinding(binding);
      const isFnOrEncoder = i === 9 || i === 10; // per confirmed 11-position physical layout
      return `
        <button class="key-btn ${isFnOrEncoder ? 'key-btn-special' : ''}" data-key-index="${i}"
                aria-label="Key ${i + 1}: ${label}">
          <span class="key-index">${i === 9 ? 'FN' : i === 10 ? 'ENC' : i + 1}</span>
          <span class="key-label">${label}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', () => _selectKey(parseInt(btn.dataset.keyIndex)));
    });
  }

  function _clearGrid() {
    const grid = document.getElementById('live-pad-grid');
    const tabs = document.getElementById('live-layer-tabs');
    if (grid) grid.innerHTML = '';
    if (tabs) tabs.innerHTML = '';
  }


  // ════════════════════════════════════════
  //  KEY SELECTION + INSPECTOR
  // ════════════════════════════════════════

  function _selectKey(keyIndex) {
    _selectedKeyPos = keyIndex;
    document.querySelectorAll('#live-pad-grid .key-btn').forEach((b, i) => {
      b.classList.toggle('selected', i === keyIndex);
    });
    _showInspector(keyIndex);
  }

  function _showInspector(keyIndex) {
    const empty   = document.getElementById('live-inspector-empty');
    const content = document.getElementById('live-inspector-content');
    if (!empty || !content) return;

    const layer   = _liveKeymap.layers[_activeLayerIndex];
    const binding = layer.bindings[keyIndex];
    const label   = KeycodeTranslator.describeBinding(binding);
    const isCustom = label.startsWith('⚙');

    empty.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = `
      <div class="inspector-title">
        ${keyIndex === 9 ? 'FN Key' : keyIndex === 10 ? 'Encoder Push' : `Key ${keyIndex + 1}`}
        <span style="font-size:var(--text-xs);color:var(--color-text-faint);font-weight:400;">
          (Layer: ${layer.name})
        </span>
      </div>
      <div class="inspector-current">
        <div class="inspector-key-preview">${label}</div>
      </div>
      ${isCustom ? `
        <div style="font-size:var(--text-xs); color: var(--color-warning); margin-bottom: var(--space-3);">
          ⚠️ This is a custom macro (likely FN-cycle logic). Changing it may
          break layer switching — proceed only if you know what it does.
        </div>
      ` : ''}
      <button class="btn btn-primary btn-full" id="live-btn-change-key">Change Binding</button>
      <button class="btn btn-ghost btn-full btn-sm" id="live-btn-clear-key">Set Transparent</button>
    `;

    content.querySelector('#live-btn-change-key').addEventListener('click', () => _openModal(keyIndex));

    content.querySelector('#live-btn-clear-key').addEventListener('click', async () => {
      const binding = KeycodeTranslator.buildTransparentBinding();
      await _applyBinding(keyIndex, binding);
    });
  }

  function _clearInspector() {
    _selectedKeyPos = null;
    document.getElementById('live-inspector-empty')?.classList.remove('hidden');
    document.getElementById('live-inspector-content')?.classList.add('hidden');
    document.querySelectorAll('#live-pad-grid .key-btn').forEach(b => b.classList.remove('selected'));
  }


  // ════════════════════════════════════════
  //  APPLY A BINDING
  // ════════════════════════════════════════

  async function _applyBinding(keyIndex, binding) {
    const layer = _liveKeymap.layers[_activeLayerIndex];

    try {
      const result = await StudioRpc.setKeyBinding(layer.id, keyIndex, binding);
      if (result !== 0) {
        throw new Error('Device rejected binding (code ' + result + ')');
      }

      layer.bindings[keyIndex] = binding;
      _renderGrid();
      _showInspector(keyIndex);

      const badge = document.getElementById('live-unsaved-badge');
      if (badge) badge.classList.remove('hidden');

      App.showToast('Key updated — click Save Changes to persist', 'success');
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }


  // ════════════════════════════════════════
  //  MODAL — now with a "Macros" category for custom FN-cycle behaviors
  // ════════════════════════════════════════

  function _openModal(keyIndex) {
    const overlay = document.getElementById('modal-overlay');
    const search  = document.getElementById('keycode-search');
    if (!overlay) return;

    _pendingBinding = null;
    _pickerCategory = 'Keyboard';

    overlay.classList.remove('hidden');
    _renderModalCategories();
    _renderModalOptions();
    _updateModalPreview();

    if (search) { search.value = ''; search.oninput = _onModalSearch; search.focus(); }

    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        if (_pendingBinding) {
          await _applyBinding(keyIndex, _pendingBinding);
        }
        _closeModal();
      };
    }

    const closeBtn  = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('modal-cancel');
    if (closeBtn)  closeBtn.onclick  = _closeModal;
    if (cancelBtn) cancelBtn.onclick = _closeModal;
  }

  function _closeModal() {
    document.getElementById('modal-overlay')?.classList.add('hidden');
  }

  // Added 'Macros' — surfaces custom FN-cycle / mode-cycle behaviors so
  // users can restore them if needed, instead of only generic key/layer options.
  const PICKER_CATEGORIES = ['Keyboard', 'Media', 'Layers', 'Macros', 'Special'];

  function _renderModalCategories() {
    const container = document.getElementById('modal-categories');
    if (!container) return;
    container.innerHTML = PICKER_CATEGORIES.map(cat =>
      `<button class="cat-btn ${cat === _pickerCategory ? 'active' : ''}" data-cat="${cat}">${cat}</button>`
    ).join('');
    container.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _pickerCategory = btn.dataset.cat;
        document.getElementById('keycode-search').value = '';
        _renderModalCategories();
        _renderModalOptions();
      });
    });
  }

  function _renderModalOptions(filterQuery = '') {
    const container = document.getElementById('modal-keylist');
    if (!container) return;

    let options = [];

    if (_pickerCategory === 'Keyboard') {
      options = KeycodeTranslator.listKeyboardKeyOptions().map(opt => ({
        display: opt.label,
        onSelect: () => KeycodeTranslator.buildKeyPressBinding(opt.value, []),
      }));
    } else if (_pickerCategory === 'Media') {
      options = KeycodeTranslator.listConsumerKeyOptions().map(opt => ({
        display: opt.label,
        onSelect: () => KeycodeTranslator.buildKeyPressBinding(opt.value, [], true),
      }));
    } else if (_pickerCategory === 'Layers') {
      options = _liveKeymap.layers.map(layer => ({
        display: `Momentary: ${layer.name}`,
        onSelect: () => KeycodeTranslator.buildMomentaryLayerBinding(layer.id),
      })).concat(_liveKeymap.layers.map(layer => ({
        display: `Toggle: ${layer.name}`,
        onSelect: () => KeycodeTranslator.buildToggleLayerBinding(layer.id),
      })));
    } else if (_pickerCategory === 'Macros') {
      options = KeycodeTranslator.listMacroOptions().map(opt => ({
        display: `⚙ ${opt.label}`,
        onSelect: () => KeycodeTranslator.buildCustomBehaviorBinding(opt.value),
      }));
      if (options.length === 0) {
        container.innerHTML = `<div style="padding:var(--space-6);text-align:center;color:var(--color-text-faint);grid-column:1/-1;">No custom macros found on this firmware</div>`;
        return;
      }
    } else if (_pickerCategory === 'Special') {
      options = [
        { display: '▽ Transparent', onSelect: () => KeycodeTranslator.buildTransparentBinding() },
        { display: '✕ None',        onSelect: () => KeycodeTranslator.buildNoneBinding() },
      ];
    }

    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      options = options.filter(o => o.display.toLowerCase().includes(q));
    }

    if (options.length === 0) {
      container.innerHTML = `<div style="padding:var(--space-6);text-align:center;color:var(--color-text-faint);grid-column:1/-1;">No matches</div>`;
      return;
    }

    container.innerHTML = options.map((o, i) =>
      `<button class="keylist-item" data-opt-index="${i}">${o.display}</button>`
    ).join('');

    container.querySelectorAll('.keylist-item').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.keylist-item').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        try {
          _pendingBinding = options[i].onSelect();
          _updateModalPreview(options[i].display);
        } catch (err) {
          App.showToast(err.message, 'error');
        }
      });
    });
  }

  function _onModalSearch(e) {
    _renderModalOptions(e.target.value);
  }

  function _updateModalPreview(label) {
    const preview = document.getElementById('selected-preview');
    if (preview) preview.textContent = label || 'No binding selected';
  }


  // ════════════════════════════════════════
  //  ADD LAYER
  // ════════════════════════════════════════

  async function _onAddLayer() {
    try {
      const result = await StudioRpc.addLayer();
      if (result.ok) {
        _liveKeymap = await StudioRpc.getKeymap();
        _activeLayerIndex = _liveKeymap.layers.length - 1;
        render();
        App.showToast(`Layer "${result.ok.layer.name}" added`, 'success');
      } else {
        throw new Error('Add layer failed: ' + JSON.stringify(result.err));
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }


  // ════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════

  function init() {
    _renderConnectBar('idle', 'Not connected — click Connect Device to start live editing');
    document.getElementById('live-btn-add-layer')?.addEventListener('click', _onAddLayer);

    StudioRpc.onNotification?.(_onDeviceNotification);

    if (WebSerial.isSupported()) {
      WebSerial.reconnectSilently().then(async ok => {
        if (ok) await connect();
      });
    }
  }

  return { init, render, connect, disconnect };

})();
