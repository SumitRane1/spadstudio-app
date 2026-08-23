// ═══ EDIT MACROS — Live ZMK Studio key grid + inspector ═══
// Mirrors editor.js / layers.js UI patterns exactly, but data comes from
// StudioRpc (live device) instead of State.js (offline compile config).
//
// Requires in index.html (new section, namespaced IDs so old Editor.js
// and this module never collide):
//
//   <section class="app-section" id="section-live-edit">
//     <div class="live-connect-bar" id="live-connect-bar"></div>
//     <div class="editor-layout">
//       <aside class="editor-sidebar">
//         <div class="sidebar-block">
//           <div class="sidebar-label">LAYERS</div>
//           <div class="layer-tabs" id="live-layer-tabs"></div>
//           <button class="btn btn-ghost btn-sm btn-full" id="live-btn-add-layer">+ Add Layer</button>
//         </div>
//       </aside>
//       <div class="editor-center">
//         <div class="pad-wrapper">
//           <div class="pad-label">NICENANO MACROPAD — LIVE</div>
//           <div class="pad-grid" id="live-pad-grid"></div>
//         </div>
//       </div>
//       <aside class="editor-inspector">
//         <div class="inspector-empty" id="live-inspector-empty">
//           <p>Click any key to edit its binding</p>
//         </div>
//         <div class="inspector-content hidden" id="live-inspector-content"></div>
//       </aside>
//     </div>
//   </section>
//
//   <!-- Reuses the SAME #modal-overlay/#modal-keylist/#modal-categories
//        markup as the old key picker — just repopulated with live data
//        when this module opens it (see _openModal below). -->
//
// Script load order: webserial.js -> studioRpc.js -> keycodeTranslator.js
// -> editMacros.js (after editor.js, since it borrows the modal DOM).


const EditMacros = (() => {

  let _liveKeymap        = null;  // { layers: [{id, name, bindings[]}], available_layers, max_layer_name_length }
  let _physicalLayout    = null;  // { active_layout_index, layouts: [{ name, keys: [...] }] }
  let _activeLayerIndex  = 0;
  let _selectedKeyPos    = null;  // index into bindings[] for the currently selected key
  let _pendingBinding    = null;  // binding object staged in the modal before confirm
  let _pickerCategory    = 'Keyboard';
  let _isConnected       = false;
  let _isBusy            = false;


  // ════════════════════════════════════════
  //  CONNECT — user gesture entry point
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
    // zmk.keymap.Notification { unsaved_changes_status_changed }
    if (notification.keymap?.unsaved_changes_status_changed !== undefined) {
      const badge = document.getElementById('live-unsaved-badge');
      if (badge) badge.classList.toggle('hidden', false);
    }
  }


  // ════════════════════════════════════════
  //  CONNECT BAR (mirrors flash.js banner style)
  // ════════════════════════════════════════

  function _renderConnectBar(status, message) {
    const bar = document.getElementById('live-connect-bar');
    if (!bar) return;

    const statusColors = {
      idle:        'muted',
      connecting:  'warning',
      connected:   'success',
      error:       'error',
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
    `;

    bar.querySelector('#live-btn-connect')?.addEventListener('click', connect);
    bar.querySelector('#live-btn-disconnect')?.addEventListener('click', disconnect);
    bar.querySelector('#live-btn-save')?.addEventListener('click', _onSaveChanges);
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
  //  RENDER — grid + layer tabs (mirrors editor.js/layers.js structure)
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
            _liveKeymap = await StudioRpc.getKeymap(); // refresh from device
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
      return `
        <button class="key-btn" data-key-index="${i}" aria-label="Key ${i + 1}: ${label}">
          <span class="key-index">${i + 1}</span>
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
  //  KEY SELECTION + INSPECTOR (mirrors editor.js)
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

    empty.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = `
      <div class="inspector-title">
        Key ${keyIndex + 1}
        <span style="font-size:var(--text-xs);color:var(--color-text-faint);font-weight:400;">
          (Layer: ${layer.name})
        </span>
      </div>
      <div class="inspector-current">
        <div class="inspector-key-preview">${label}</div>
      </div>
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
  //  APPLY A BINDING — send to device via RPC, refresh grid
  // ════════════════════════════════════════

  async function _applyBinding(keyIndex, binding) {
    const layer = _liveKeymap.layers[_activeLayerIndex];

    try {
      const result = await StudioRpc.setKeyBinding(layer.id, keyIndex, binding);
      if (result !== 0) { // 0 = SET_LAYER_BINDING_RESP_OK
        throw new Error('Device rejected binding (code ' + result + ')');
      }

      // Optimistically update local cache, avoid a full re-fetch round trip
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
  //  MODAL — reuses #modal-overlay from editor.js, repopulated with live data
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

  const PICKER_CATEGORIES = ['Keyboard', 'Media', 'Layers', 'Special'];

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
      options = _liveKeymap.layers.map((layer, idx) => ({
        display: `Momentary: ${layer.name}`,
        onSelect: () => KeycodeTranslator.buildMomentaryLayerBinding(layer.id),
      })).concat(_liveKeymap.layers.map(layer => ({
        display: `Toggle: ${layer.name}`,
        onSelect: () => KeycodeTranslator.buildToggleLayerBinding(layer.id),
      })));
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
  //  ADD LAYER (simple — full preset picker can be layered on later)
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
