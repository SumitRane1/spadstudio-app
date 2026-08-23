// ═══ FLASH — Step 4: "Send to Device" (auto live-push or compile fallback) ═══
//
// ═══ FIX HISTORY ═══
// Fix (2026-08-24, translator gaps): added C_SLEEP etc. to keycodeTranslator.js
//   / zmkStringTranslator.js, and console.table() logging of exactly which
//   layer/key/code triggers a fallback.
//
// Fix (2026-08-24, THIS FILE — capacity check was comparing the wrong thing):
//   liveKeymap.available_layers is the REMAINING layer capacity (how many
//   MORE layers can still be added), not the total number of layer slots.
//   The old check `state.layers.length > liveKeymap.available_layers`
//   compared your desired layer count directly against leftover capacity,
//   which is wrong — a device that already has 4 pre-allocated layers in
//   use correctly reports available_layers = 0, and ANY keymap using all 4
//   existing layers would fail that check even though nothing new is being
//   added. Fixed to compare against TOTAL capacity (existing + available).
//   This was the actual cause of every "Send to Device" click going to the
//   3-5 min GitHub Actions rebuild, regardless of what was edited.


const Flash = (() => {

  let _isBusy       = false;
  let _uf2Buffer     = null;
  let _liveConnected = false;


  // ════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════

  function render() {
    const container = document.getElementById('flash-content');
    if (!container) return;

    const webusbOk = WebUSBFlash.isSupported();
    const serialOk = WebSerial.isSupported();
    _liveConnected = WebSerial.isConnected();

    container.innerHTML = `
      <div class="flash-panel">

        <div class="flash-connect-banner ${_liveConnected ? 'connected' : ''}">
          <div class="connected-banner">
            <span class="connected-dot"></span>
            <span>
              ${_liveConnected
                ? 'Device connected — changes send instantly'
                : `Ready — <strong>${SPAD_CONFIG.owner}/${SPAD_CONFIG.repo}</strong>`}
            </span>
            <span class="badge badge-success" style="margin-left:auto;">⚡ sPadStudio</span>
          </div>
        </div>

        ${!serialOk ? `
        <div class="flash-mode-card" style="border-color:var(--color-warning);">
          <div class="flash-mode-title">⚠️ Browser not supported</div>
          <div class="flash-mode-desc">
            Sending changes to your device requires <strong>Chrome or Edge</strong>.
          </div>
        </div>
        ` : ''}

        <div class="flash-mode-card available">
          <div class="flash-mode-title">
            📤 Send to Device
            <span class="badge badge-success">Instant, usually</span>
          </div>
          <div class="flash-mode-desc">
            Sends your current configuration straight to the macropad.
            Most edits apply in under a second. If you've added more layers
            than your firmware supports, this will automatically fall back
            to a full rebuild — no extra steps needed on your end.
          </div>

          <div class="flash-instructions">
            <span>1.</span> Plug in your macropad normally — no reset needed<br>
            <span>2.</span> Click Send to Device<br>
            <span>3.</span> Select your macropad from the browser popup (first time only)
          </div>

          <div class="progress-wrap hidden" id="send-progress">
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" id="send-bar"></div>
            </div>
            <div class="progress-step-label" id="send-step">Waiting…</div>
          </div>

          <div class="flash-btn-row">
            <button class="btn btn-primary btn-lg btn-full" id="btn-send-to-device" ${!serialOk ? 'disabled' : ''}>
              📤 Send to Device
            </button>
            <button class="btn btn-ghost btn-lg hidden" id="btn-cancel-send" title="Cancel">
              ✕ Cancel
            </button>
          </div>
        </div>

        <details class="flash-mode-card">
          <summary style="cursor:pointer; font-weight:600;">
            🔧 First-time device setup (advanced)
          </summary>
          <div class="flash-mode-desc" style="margin-top:var(--space-3);">
            Only needed once, when setting up a brand-new macropad that doesn't
            yet have Studio-enabled firmware installed. This is the ONLY step
            that requires bootloader mode. After this, always use
            <strong>Send to Device</strong> above — you'll never need to
            double-tap reset again.
          </div>

          <div class="flash-instructions">
            <span>1.</span> Double-tap reset on your macropad (enters bootloader mode)<br>
            <span>2.</span> NICENANO drive appears on your PC<br>
            <span>3.</span> Click Install Base Firmware — Chrome / Edge only
          </div>

          <div class="progress-wrap hidden" id="instant-progress">
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" id="instant-bar"></div>
            </div>
            <div class="progress-step-label" id="instant-step">Preparing…</div>
          </div>

          <button class="btn btn-ghost btn-lg btn-full" id="btn-instant-flash" ${!webusbOk ? 'disabled' : ''}>
            ⚡ Install Base Firmware
          </button>
        </details>

        <div class="flash-mode-card">
          <div class="flash-mode-title">📄 Export Config</div>
          <div class="flash-mode-desc">
            Download your full configuration as JSON or raw keymap file.
          </div>
          <div class="flash-btn-row">
            <button class="btn btn-ghost btn-full" id="btn-export-json">
              ↓ Download config.json
            </button>
            <button class="btn btn-ghost btn-full" id="btn-export-keymap">
              ↓ Download .keymap
            </button>
          </div>
        </div>

      </div>
    `;

    _bindEvents();
  }


  // ════════════════════════════════════════
  //  EVENTS
  // ════════════════════════════════════════

  function _bindEvents() {
    document.getElementById('btn-send-to-device')?.addEventListener('click', _onSendToDevice);
    document.getElementById('btn-instant-flash')?.addEventListener('click', _onInstantFlash);

    document.getElementById('btn-cancel-send')?.addEventListener('click', () => {
      GitHubFlash.cancel();
      _isBusy = false;
      App.showToast('Cancelled', 'warning');
      render();
    });

    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      _downloadText(State.exportJSON(), 'spad-config.json', 'application/json');
      App.showToast('Config exported', 'success');
    });

    document.getElementById('btn-export-keymap')?.addEventListener('click', () => {
      const validation = KeymapGenerator.validate(State.get());
      if (!validation.valid) {
        App.showToast('Config has errors — fix before exporting', 'error');
        return;
      }
      const content = KeymapGenerator.generate(State.get());
      _downloadText(content, 'macropad.keymap', 'text/plain');
      App.showToast('.keymap exported', 'success');
    });
  }


  // ════════════════════════════════════════
  //  SEND TO DEVICE
  // ════════════════════════════════════════

  async function _onSendToDevice() {
    if (_isBusy) return;
    _isBusy = true;

    const btn       = document.getElementById('btn-send-to-device');
    const cancelBtn = document.getElementById('btn-cancel-send');
    if (btn) btn.disabled = true;
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    try {
      _setProgress(5, 'Connecting to device…');
      await StudioRpc.connect();
      _liveConnected = true;

      _setProgress(15, 'Loading device capabilities…');
      await StudioRpc.loadAllBehaviors((done, total) => {
        _setProgress(15 + Math.floor((done / total) * 10), `Loading behaviors… ${done}/${total}`);
      });
      const liveKeymap = await StudioRpc.getKeymap();

      _setProgress(25, 'Checking what changed…');
      const decision = _decideAction(State.get(), liveKeymap);

      if (decision.action === 'FLASH_REQUIRED') {
        App.showToast(`Structural change detected (${decision.reason}) — running full rebuild…`, 'warning');
        await _runFullCompileFallback();
        return;
      }

      await _pushAllLayersLive(liveKeymap);

      _setProgress(90, 'Saving to device flash…');
      const saveResult = await StudioRpc.saveChanges();
      if (!saveResult.ok) {
        throw new Error('Device rejected save: ' + JSON.stringify(saveResult.err));
      }

      _setProgress(100, '✅ Sent! Changes are live — no reflash needed.');
      App.showToast('Sent to device! ✅', 'success');
      State.set({ isDirty: false });

    } catch (err) {
      _setProgress(0, `❌ ${err.message}`);
      App.showToast(err.message, 'error');
    } finally {
      _isBusy = false;
      if (btn) btn.disabled = false;
      if (cancelBtn) cancelBtn.classList.add('hidden');
    }
  }

  // ★ FIX (2026-08-24): compare against TOTAL layer capacity
  // (liveKeymap.layers.length + liveKeymap.available_layers), not just
  // available_layers alone. available_layers is REMAINING capacity to add
  // new layers — it is legitimately 0 once all pre-allocated slots are in
  // use, which is the normal, expected state for a fully set-up device.
  // Comparing state.layers.length directly against that remaining-capacity
  // number was always failing for any keymap using all existing layers,
  // forcing an unnecessary full rebuild on every single edit.
  function _decideAction(state, liveKeymap) {
    const totalCapacity = liveKeymap.layers.length + liveKeymap.available_layers;

    if (state.layers.length > totalCapacity) {
      console.warn(
        '[Flash] FLASH_REQUIRED: layer count', state.layers.length,
        '> total capacity', totalCapacity,
        `(${liveKeymap.layers.length} existing + ${liveKeymap.available_layers} available)`
      );
      return { action: 'FLASH_REQUIRED', reason: 'more layers than firmware supports' };
    }

    const problems = [];

    state.layers.forEach(layer => {
      const { unsupported } = ZmkStringTranslator.translateLayer(layer.keys, liveKeymap.layers);
      unsupported.forEach(u => {
        problems.push({ layer: layer.name, position: `key ${u.index + 1}`, code: u.code });
      });

      if (ZmkStringTranslator.translate(layer.fnAction, liveKeymap.layers) === null) {
        problems.push({ layer: layer.name, position: 'FN key', code: layer.fnAction });
      }
      if (layer.encoderPush && ZmkStringTranslator.translate(layer.encoderPush, liveKeymap.layers) === null) {
        problems.push({ layer: layer.name, position: 'encoder push', code: layer.encoderPush });
      }
    });

    if (problems.length > 0) {
      console.warn('[Flash] FLASH_REQUIRED — untranslatable codes found:');
      console.table(problems);
      return {
        action: 'FLASH_REQUIRED',
        reason: `unsupported code "${problems[0].code}" on ${problems[0].layer} (${problems[0].position})`,
      };
    }

    return { action: 'SAVE_ONLY' };
  }

  async function _pushAllLayersLive(liveKeymap) {
    const stateLayers = State.get().layers;

    while (liveKeymap.layers.length < stateLayers.length) {
      const result = await StudioRpc.addLayer();
      if (!result.ok) throw new Error('Could not add layer on device: ' + JSON.stringify(result.err));
      liveKeymap.layers.push(result.ok.layer);
    }

    const totalSteps = stateLayers.length;
    for (let li = 0; li < stateLayers.length; li++) {
      const stateLayer = stateLayers[li];
      const liveLayer  = liveKeymap.layers[li];

      _setProgress(30 + Math.floor((li / totalSteps) * 55), `Sending layer "${stateLayer.name}"…`);

      if (liveLayer.name !== stateLayer.name) {
        await StudioRpc.setLayerProps(liveLayer.id, stateLayer.name);
      }

      const { bindings } = ZmkStringTranslator.translateLayer(stateLayer.keys, liveKeymap.layers);
      for (let ki = 0; ki < bindings.length; ki++) {
        await StudioRpc.setKeyBinding(liveLayer.id, ki, bindings[ki]);
      }

      const fnBinding = ZmkStringTranslator.translate(stateLayer.fnAction, liveKeymap.layers);
      if (fnBinding) await StudioRpc.setKeyBinding(liveLayer.id, 9, fnBinding);

      if (stateLayer.encoderPush) {
        const encBinding = ZmkStringTranslator.translate(stateLayer.encoderPush, liveKeymap.layers);
        if (encBinding) await StudioRpc.setKeyBinding(liveLayer.id, 10, encBinding);
      }
    }
  }


  // ════════════════════════════════════════
  //  FALLBACK — full GitHub Actions compile + WebUSB flash
  // ════════════════════════════════════════

  async function _runFullCompileFallback() {
    _setProgress(30, 'Building firmware (this can take 3-5 min)…');

    const validation = KeymapGenerator.validate(State.get());
    if (!validation.valid) throw new Error(validation.errors[0]);
    validation.warnings.forEach(w => App.showToast(w, 'warning'));

    _uf2Buffer = await GitHubFlash.buildAndFlash((pct, msg) => {
      _setProgress(30 + Math.floor(pct * 0.5), msg);
    });

    _setProgress(85, 'Double-tap reset on your macropad now, then flashing…');
    App.showToast('Structural change — double-tap reset on your macropad now', 'warning');

    await WebUSBFlash.flash(_uf2Buffer, (pct, msg) => {
      _setProgress(85 + Math.floor(pct * 0.15), msg);
    });

    _setProgress(100, '✅ Rebuilt and flashed! Studio connection re-established automatically.');
    App.showToast('Full rebuild complete — device updated! ✅', 'success');
    State.set({ isDirty: false });
    _uf2Buffer = null;
  }


  // ════════════════════════════════════════
  //  FIRST-TIME SETUP
  // ════════════════════════════════════════

  async function _onInstantFlash() {
    if (_isBusy) return;
    _isBusy = true;

    const btn = document.getElementById('btn-instant-flash');
    if (btn) btn.disabled = true;

    try {
      _setInstantProgress(10, 'Loading base firmware…');
      const uf2Buffer = await GitHubFlash.flashBase((pct, msg) => _setInstantProgress(pct, msg));

      _setInstantProgress(55, 'Select your nice!nano from the popup…');
      await WebUSBFlash.flash(uf2Buffer, (pct, msg) =>
        _setInstantProgress(55 + Math.floor(pct * 0.45), msg)
      );

      _setInstantProgress(100, '✅ Base firmware installed! Use Send to Device from now on.');
      App.showToast('Base firmware installed! ✅', 'success');

    } catch (err) {
      _setInstantProgress(0, `❌ ${err.message}`);
      App.showToast(err.message, 'error');
    } finally {
      _isBusy = false;
      if (btn) btn.disabled = false;
    }
  }


  // ════════════════════════════════════════
  //  PROGRESS HELPERS
  // ════════════════════════════════════════

  function _setProgress(pct, message) {
    const wrap  = document.getElementById('send-progress');
    const bar   = document.getElementById('send-bar');
    const label = document.getElementById('send-step');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    if (bar)   bar.style.width   = Math.max(0, Math.min(100, pct)) + '%';
    if (label) label.textContent = message;
    if (bar) bar.style.background = (pct === 0 && message.startsWith('❌')) ? 'var(--color-error)' : '';
  }

  function _setInstantProgress(pct, message) {
    const wrap  = document.getElementById('instant-progress');
    const bar   = document.getElementById('instant-bar');
    const label = document.getElementById('instant-step');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    if (bar)   bar.style.width   = Math.max(0, Math.min(100, pct)) + '%';
    if (label) label.textContent = message;
    if (bar) bar.style.background = (pct === 0 && message.startsWith('❌')) ? 'var(--color-error)' : '';
  }


  // ════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════

  function init() {
    console.log('[Flash] Ready —', SPAD_CONFIG.owner + '/' + SPAD_CONFIG.repo);

    if (WebSerial.isSupported()) {
      WebSerial.reconnectSilently().then(ok => {
        if (ok) _liveConnected = true;
      });
    }
  }


  // ════════════════════════════════════════
  //  UTILS
  // ════════════════════════════════════════

  function _downloadText(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { render, init };

})();
