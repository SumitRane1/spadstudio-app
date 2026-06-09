// ═══ FLASH — GitHub API + WebUSB ═══

const Flash = (() => {

  let _isBusy    = false;
  let _uf2Buffer = null; // compiled firmware stored in memory

  // ════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════

  function render() {
    const container = document.getElementById('flash-content');
    if (!container) return;

    const { buildMode } = State.get();
    const isInstant     = buildMode === 'instant';
    const webusbOk      = WebUSBFlash.isSupported();

    container.innerHTML = `
      <div class="flash-panel">

        <!-- ── Status Banner ── -->
        <div class="flash-connect-banner connected">
          <div class="connected-banner">
            <span class="connected-dot"></span>
            <span>
              Ready — <strong>${SPAD_CONFIG.owner}/${SPAD_CONFIG.repo}</strong>
            </span>
            <span class="badge badge-success" style="margin-left:auto;">⚡ sPadStudio Build</span>
          </div>
        </div>

        ${!webusbOk ? `
        <div class="flash-mode-card" style="border-color:var(--color-warning);">
          <div class="flash-mode-title">⚠️ Browser not supported</div>
          <div class="flash-mode-desc">
            WebUSB requires <strong>Chrome or Edge</strong>. Firefox and Safari are not supported.
            Please switch browsers to flash firmware.
          </div>
        </div>
        ` : ''}

        <!-- ── Instant Flash ── -->
        <div class="flash-mode-card ${isInstant ? 'available' : 'unavailable'}" id="card-instant">
          <div class="flash-mode-title">
            ⚡ Instant Flash
            ${isInstant
              ? `<span class="badge badge-success">Available</span>`
              : `<span class="badge badge-muted">Not available</span>`}
          </div>
          <div class="flash-mode-desc">
            ${isInstant
              ? 'Only key bindings changed. Flashes the pre-built base firmware directly. Takes about 3 seconds.'
              : 'You changed encoder or layer structure — a full compile is required. Use Full Compile below.'}
          </div>
          ${isInstant ? `
            <div class="flash-instructions">
              <span>1.</span> Double-tap reset on your macropad<br>
              <span>2.</span> Wait for bootloader mode (LED pulses)<br>
              <span>3.</span> Click Flash — Chrome / Edge only
            </div>
            <div class="progress-wrap hidden" id="instant-progress">
              <div class="progress-bar-wrap">
                <div class="progress-bar-fill" id="instant-bar"></div>
              </div>
              <div class="progress-step-label" id="instant-step">Preparing…</div>
            </div>
            <button class="btn btn-success btn-lg btn-full" id="btn-instant-flash" ${!webusbOk ? 'disabled' : ''}>
              ⚡ Flash to Device
            </button>
          ` : ''}
        </div>

        <!-- ── Full Compile ── -->
        <div class="flash-mode-card ${!isInstant ? 'available' : ''}" id="card-compile">
          <div class="flash-mode-title">
            🔨 Full Compile
            <span class="badge badge-warning">3–5 min</span>
          </div>
          <div class="flash-mode-desc">
            Pushes your keymap to GitHub and triggers a ZMK Actions build.
            Once compiled, click <strong>Flash Device</strong> to write firmware via WebUSB.
          </div>

          <div class="progress-wrap hidden" id="compile-progress">
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" id="compile-bar"></div>
            </div>
            <div class="progress-step-label" id="compile-step">Waiting…</div>
          </div>

          <div class="flash-btn-row">
            <button class="btn btn-primary btn-lg" id="btn-compile" style="flex:1;" ${!webusbOk ? 'disabled' : ''}>
              🔨 Compile
            </button>
            <button class="btn btn-success btn-lg" id="btn-flash-device" style="flex:1;" disabled>
              ⚡ Flash Device
            </button>
            <button class="btn btn-ghost btn-lg hidden" id="btn-cancel-compile" title="Cancel build">
              ✕ Cancel
            </button>
          </div>
          <p class="flash-hint">
            Step 1: Click <strong>Compile</strong> to build firmware (3–5 min).<br>
            Step 2: Double-tap reset on device → click <strong>Flash Device</strong> → select nice!nano from popup.
          </p>
        </div>

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

    // ── Instant flash ──
    document.getElementById('btn-instant-flash')?.addEventListener('click', _onInstantFlash);

    // ── Compile only ──
    document.getElementById('btn-compile')?.addEventListener('click', _onCompile);

    // ── Flash device — direct click = fresh user gesture for WebUSB picker ──
    document.getElementById('btn-flash-device')?.addEventListener('click', _onFlashDevice);

    // ── Cancel compile ──
    document.getElementById('btn-cancel-compile')?.addEventListener('click', () => {
      GitHubFlash.cancel();
      _isBusy    = false;
      _uf2Buffer = null;
      App.showToast('Build cancelled', 'warning');
      render();
    });

    // ── Export JSON ──
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      _downloadText(State.exportJSON(), 'spad-config.json', 'application/json');
      App.showToast('Config exported', 'success');
    });

    // ── Export .keymap ──
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
  //  INSTANT FLASH
  // ════════════════════════════════════════

  async function _onInstantFlash() {
    if (_isBusy) return;
    _isBusy = true;

    const btn = document.getElementById('btn-instant-flash');
    if (btn) btn.disabled = true;

    try {
      _setProgress('instant', 10, 'Loading base firmware…');
      const uf2Buffer = await GitHubFlash.flashBase(
        (pct, msg) => _setProgress('instant', pct, msg)
      );

      // WebUSB flash — called directly in click handler ✅
      _setProgress('instant', 55, 'Select your nice!nano from the popup…');
      await WebUSBFlash.flash(uf2Buffer,
        (pct, msg) => _setProgress('instant', 55 + Math.floor(pct * 0.45), msg)
      );

      _setProgress('instant', 100, '✅ Flash complete!');
      App.showToast('Firmware flashed! ✅', 'success');

    } catch (err) {
      _setProgress('instant', 0, `❌ ${err.message}`);
      App.showToast(err.message, 'error');
    } finally {
      _isBusy = false;
      if (btn) btn.disabled = false;
    }
  }

  // ════════════════════════════════════════
  //  COMPILE (build only — no flash)
  // ════════════════════════════════════════

  async function _onCompile() {
    if (_isBusy) return;
    _isBusy    = true;
    _uf2Buffer = null;

    const compileBtn = document.getElementById('btn-compile');
    const flashBtn   = document.getElementById('btn-flash-device');
    const cancelBtn  = document.getElementById('btn-cancel-compile');

    if (compileBtn) compileBtn.disabled = true;
    if (flashBtn)   flashBtn.disabled   = true;
    if (cancelBtn)  cancelBtn.classList.remove('hidden');

    try {
      const validation = KeymapGenerator.validate(State.get());
      if (!validation.valid) throw new Error(validation.errors[0]);
      validation.warnings.forEach(w => App.showToast(w, 'warning'));

      // Build + download UF2 — store in memory
      _uf2Buffer = await GitHubFlash.buildAndFlash(
        (pct, msg) => _setProgress('compile', pct, msg)
      );

      _setProgress('compile', 100, '✅ Firmware ready! Double-tap reset → click Flash Device.');
      App.showToast('Compiled! Double-tap reset then click ⚡ Flash Device.', 'success');

      // Enable flash button
      if (flashBtn) flashBtn.disabled = false;

    } catch (err) {
      _uf2Buffer = null;
      _setProgress('compile', 0, `❌ ${err.message}`);
      App.showToast(err.message, 'error');
      if (flashBtn) flashBtn.disabled = true;
    } finally {
      _isBusy = false;
      if (compileBtn) compileBtn.disabled = false;
      if (cancelBtn)  cancelBtn.classList.add('hidden');
    }
  }

  // ════════════════════════════════════════
  //  FLASH DEVICE (WebUSB — direct click = fresh user gesture ✅)
  // ════════════════════════════════════════

  async function _onFlashDevice() {
    if (!_uf2Buffer) {
      App.showToast('No compiled firmware — click Compile first.', 'error');
      return;
    }

    const flashBtn = document.getElementById('btn-flash-device');
    if (flashBtn) flashBtn.disabled = true;

    try {
      // WebUSBFlash.flash() calls navigator.usb.requestDevice() internally
      // This is a direct click handler so user gesture is active ✅
      await WebUSBFlash.flash(_uf2Buffer,
        (pct, msg) => _setProgress('compile', pct, msg)
      );

      _setProgress('compile', 100, '✅ Firmware flashed! Device rebooting…');
      App.showToast('Firmware flashed! ✅', 'success');

      // Mark state clean
      State.set({ buildMode: 'instant', isDirty: false });
      _uf2Buffer = null;

    } catch (err) {
      _setProgress('compile', 0, `❌ ${err.message}`);
      App.showToast(err.message, 'error');
      if (flashBtn) flashBtn.disabled = false; // re-enable for retry
    }
  }

  // ════════════════════════════════════════
  //  PROGRESS HELPER
  // ════════════════════════════════════════

  function _setProgress(type, pct, message) {
    const wrap  = document.getElementById(`${type}-progress`);
    const bar   = document.getElementById(`${type}-bar`);
    const label = document.getElementById(`${type}-step`);

    if (!wrap) return;
    wrap.classList.remove('hidden');
    if (bar)   bar.style.width      = Math.max(0, Math.min(100, pct)) + '%';
    if (label) label.textContent    = message;

    if (pct === 0 && message.startsWith('❌')) {
      if (bar) bar.style.background = 'var(--color-error)';
    } else {
      if (bar) bar.style.background = '';
    }
  }

  // ════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════

  function init() {
    console.log('[Flash] Ready —', SPAD_CONFIG.owner + '/' + SPAD_CONFIG.repo);
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