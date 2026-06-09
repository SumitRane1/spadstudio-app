// ═══ FLASH — GitHub API + File System Access API ═══

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
              ? 'Only key bindings changed. Flashes the pre-built base firmware directly to your NICENANO drive. Takes about 3 seconds.'
              : 'You changed encoder or layer structure — a full compile is required. Use Full Compile below.'}
          </div>
          ${isInstant ? `
            <div class="flash-instructions">
              <span>1.</span> Double-tap reset on your macropad<br>
              <span>2.</span> NICENANO drive appears on your PC<br>
              <span>3.</span> Click Flash — Chrome / Edge only
            </div>
            <div class="progress-wrap hidden" id="instant-progress">
              <div class="progress-bar-wrap">
                <div class="progress-bar-fill" id="instant-bar"></div>
              </div>
              <div class="progress-step-label" id="instant-step">Preparing…</div>
            </div>
            <button class="btn btn-success btn-lg btn-full" id="btn-instant-flash">
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
            Once compiled, click <strong>Flash Device</strong> to write firmware.
          </div>

          <div class="progress-wrap hidden" id="compile-progress">
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" id="compile-bar"></div>
            </div>
            <div class="progress-step-label" id="compile-step">Waiting…</div>
          </div>

          <!-- TWO BUTTONS: Compile + Flash -->
          <div class="flash-btn-row">
            <button class="btn btn-primary btn-lg" id="btn-compile" style="flex:1;">
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
            Step 2: Double-tap reset on device → click <strong>Flash Device</strong>.
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

    // ── Flash device (called AFTER compile, directly on button click = user gesture) ──
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

      _setProgress('instant', 70, 'Opening device picker…');
      await _writeToDevice(uf2Buffer);

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

    const compileBtn    = document.getElementById('btn-compile');
    const flashBtn      = document.getElementById('btn-flash-device');
    const cancelBtn     = document.getElementById('btn-cancel-compile');

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

      _setProgress('compile', 100, '✅ Firmware ready! Now click Flash Device.');
      App.showToast('Compiled! Click ⚡ Flash Device to write firmware.', 'success');

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
  //  FLASH DEVICE (separate button — direct user gesture)
  // ════════════════════════════════════════

  async function _onFlashDevice() {
    if (!_uf2Buffer) {
      App.showToast('No compiled firmware — click Compile first.', 'error');
      return;
    }

    const flashBtn = document.getElementById('btn-flash-device');
    if (flashBtn) flashBtn.disabled = true;

    try {
      // showDirectoryPicker called DIRECTLY in click handler = user gesture ✅
      await _writeToDevice(_uf2Buffer);

      _setProgress('compile', 100, '✅ Firmware flashed!');
      App.showToast('Firmware flashed! ✅', 'success');

      // Mark state clean
      State.set({ buildMode: 'instant', isDirty: false });
      _uf2Buffer = null;

    } catch (err) {
      App.showToast(err.message, 'error');
      if (flashBtn) flashBtn.disabled = false; // re-enable so user can retry
    }
  }

  // ════════════════════════════════════════
  //  WRITE TO DEVICE (folder picker — called only from click handlers)
  // ════════════════════════════════════════

  async function _writeToDevice(uf2Buffer) {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API not supported. Use Chrome or Edge.');
    }

    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'desktop' });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Cancelled by user.');
      throw new Error('Could not open drive picker: ' + e.message);
    }

    const name = dirHandle.name.toUpperCase();
    if (!name.includes('NICENANO') && !name.includes('NRF52BOOT') && !name.includes('BOOT')) {
      const confirmed = confirm(
        `Selected drive "${dirHandle.name}" does not look like a NICENANO bootloader drive.\n\nContinue anyway?`
      );
      if (!confirmed) throw new Error('Flash cancelled — wrong drive selected.');
    }

    const fileHandle = await dirHandle.getFileHandle('zmk.uf2', { create: true });
    const writable   = await fileHandle.createWritable();
    await writable.write(uf2Buffer);
    await writable.close();
    return true;
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
    if (bar)   bar.style.width   = Math.max(0, pct) + '%';
    if (label) label.textContent = message;

    if (pct === 0 && message.startsWith('❌')) {
      if (bar) bar.style.background = 'var(--color-error)';
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