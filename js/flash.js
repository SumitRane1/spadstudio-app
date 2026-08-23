// ═══ FLASH — Step 4: "Send to Device" (auto live-push or compile fallback) ═══
//
// Same 4-step flow as before (Profile → Editor → Review → Flash).
// Step 4 auto-decides per the original decideAction logic:
//   - Small edits (keys within existing layer/key capacity)  -> instant
//     live push over ZMK Studio RPC. No compile, no reflash, NO bootloader
//     mode — the device stays in its normal running state the whole time.
//   - Structural changes (more layers than firmware pre-allocated, or a
//     code that can't be represented live) -> falls back to the full
//     GitHub Actions compile + WebUSB flash path (which DOES require
//     double-tap reset into bootloader mode — that instruction lives only
//     in the "First-time setup" section below, where it belongs).
//
// IMPORTANT DISTINCTION:
//   Bootloader mode (double-tap reset) = for writing raw .uf2 firmware files.
//   Studio RPC connection             = talks to firmware that's ALREADY
//                                        running normally. No reset needed.
//
// Depends on (load order): githubFlash.js, webusb.js, webserial.js,
// studioRpc.js, keycodeTranslator.js, zmkStringTranslator.js, then flash.js.


const Flash = (() => {

  let _isBusy       = false;
  let _uf2Buffer     = null;   // compiled firmware, for the fallback compile path
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

        <!-- ── Status Banner ── -->
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

        <!-- ── SEND TO DEVICE (primary action) ── -->
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

        <!-- ── First-time setup (rare — only for brand new/unflashed boards) ── -->
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

        <!-- ── Export ── -->
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
  //  SEND TO DEVICE — the auto-deciding primary action
  // ════════════════════════════════════════

  async function _onSendToDevice() {
    if (_isBusy) return;
    _isBusy = true;

    const btn       = document.getElementById('btn-send-to-device');
    const cancelBtn = document.getElementById('btn-cancel-send');
    if (btn) btn.disabled = true;
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    try {
      // ── Step 1: connect — device must be in its NORMAL running state,
      // NOT bootloader mode. The Studio RPC server runs permanently
      // alongside regular keyboard function once built with
      // CONFIG_ZMK_STUDIO=y, so no reset is required here. ──
      if (!WebSerial.isConnected()) {
        _setProgress(5, 'Connecting to device…');
        await StudioRpc.connect();
      }
      _liveConnected = true;

      _setProgress(15, 'Loading device capabilities…');
      await StudioRpc.loadAllBehaviors();
      const liveKeymap = await StudioRpc.getKeymap();

      // ── Step 2: decide — live push vs full compile fallback ──
      _setProgress(25, 'Checking what changed…');
      const decision = _decideAction(State.get(), liveKeymap);

      if (decision.action === 'FLASH_REQUIRED') {
        App.showToast(`Structural change detected (${decision.reason}) — running full rebuild…`, 'warning');
        await _runFullCompileFallback();
        return;
      }

      // ── Step 3: live push every layer's keys ──
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

  // Mirrors the decideAction logic from the original handoff doc:
  // structural changes (more layers than firmware can hold, or a keycode
  // that can't be represented live) require the full compile fallback.
  function _decideAction(state, liveKeymap) {
    if (state.layers.length > liveKeymap.available_layers) {
      return { action: 'FLASH_REQUIRED', reason: 'more layers than firmware supports' };
    }

    for (const layer of state.layers) {
      const { unsupported } = ZmkStringTranslator.translateLayer(layer.keys, liveKeymap.layers);
      if (unsupported.length > 0) {
        return { action: 'FLASH_REQUIRED', reason: 'unsupported key binding — needs recompile' };
      }
      if (ZmkStringTranslator.translate(layer.fnAction, liveKeymap.layers) === null) {
        return { action: 'FLASH_REQUIRED', reason: 'unsupported FN binding' };
      }
      if (layer.encoderPush && ZmkStringTranslator.translate(layer.encoderPush, liveKeymap.layers) === null) {
        return { action: 'FLASH_REQUIRED', reason: 'unsupported encoder-push binding' };
      }
    }

    return { action: 'SAVE_ONLY' };
  }

  // Pushes every layer's keys + FN + encoder-push over RPC.
  // Adds missing layers live first if State has more layers than the device
  // currently has (but still within available_layers capacity — confirmed
  // safe by _decideAction before this is ever called).
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

      // Matrix keys (positions 0-8)
      const { bindings } = ZmkStringTranslator.translateLayer(stateLayer.keys, liveKeymap.layers);
      for (let ki = 0; ki < bindings.length; ki++) {
        await StudioRpc.setKeyBinding(liveLayer.id, ki, bindings[ki]);
      }

      // FN key (position 9)
      const fnBinding = ZmkStringTranslator.translate(stateLayer.fnAction, liveKeymap.layers);
      if (fnBinding) await StudioRpc.setKeyBinding(liveLayer.id, 9, fnBinding);

      // Encoder push (position 10)
      if (stateLayer.encoderPush) {
        const encBinding = ZmkStringTranslator.translate(stateLayer.encoderPush, liveKeymap.layers);
        if (encBinding) await StudioRpc.setKeyBinding(liveLayer.id, 10, encBinding);
      }
    }
  }


  // ════════════════════════════════════════
  //  FALLBACK — full GitHub Actions compile + WebUSB flash
  //  (this IS where bootloader mode is genuinely required — the .uf2 file
  //  can only be written while the device is in its bootloader drive mode)
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
  //  FIRST-TIME SETUP — install base Studio-enabled firmware (advanced/rare)
  //  Genuinely requires bootloader mode — writing a raw .uf2 file only works
  //  while the device is in its bootloader drive, not while running normally.
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

    // Silent reconnect on page load, so returning users don't need to
    // re-grant USB permission every time they open the Flash step.
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
