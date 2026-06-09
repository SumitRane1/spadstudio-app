// ═══ REVIEW — Config summary + keymap preview ═══

const Review = (() => {

  const ENCODER_MODES = [
    { id: 'scroll',     label: 'Scroll',     icon: '↕' },
    { id: 'volume',     label: 'Volume',     icon: '🔊' },
    { id: 'brightness', label: 'Brightness', icon: '☀' },
  ];

  function _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function render() {
    const container = document.getElementById('review-content');
    if (!container) return;

    const state = State.get();
    const { layers, encoder, buildMode } = state;

    // Run validation + generate keymap preview
    const validation  = KeymapGenerator.validate(state);
    const keymapStr   = KeymapGenerator.preview(state);

    container.innerHTML = `
      <div class="review-grid">

        <!-- Validation banner -->
        <div class="review-card review-validation-card" style="grid-column: 1 / -1;">
          ${validation.errors.map(e => `
            <div class="review-msg error">
              <span>✕</span> ${e}
            </div>
          `).join('')}
          ${validation.warnings.map(w => `
            <div class="review-msg warning">
              <span>⚠</span> ${w}
            </div>
          `).join('')}
          ${validation.valid && validation.warnings.length === 0 ? `
            <div class="review-msg success">
              <span>✓</span> Config valid — ready to flash
            </div>
          ` : ''}
        </div>

        <!-- Build mode badge -->
        <div class="review-card" style="grid-column: 1 / -1;">
          <div class="review-card-title">Flash Mode</div>
          ${buildMode === 'instant'
            ? `<span class="build-mode-badge instant">⚡ Instant Flash — key-only changes, ~2 seconds</span>`
            : `<span class="build-mode-badge custom">🔨 Full Compile — encoder/layer changes, 3–5 minutes</span>`
          }
          <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-3);">
            ${buildMode === 'instant'
              ? 'Only key bindings changed. Firmware can be patched in the browser.'
              : 'Encoder behavior or layer structure changed. Full firmware rebuild required via GitHub Actions.'
            }
          </p>
        </div>

        <!-- Encoder summary -->
        <div class="review-card">
          <div class="review-card-title">
            <span style="display:inline-flex;align-items:center;justify-content:center;
                         width:20px;height:20px;border-radius:50%;
                         background:var(--color-primary-highlight);
                         color:var(--color-primary);font-size:var(--text-xs);">◎</span>
            Encoder — Independent
          </div>
          <div style="font-size:var(--text-xs);color:var(--color-text-faint);
                      margin-bottom:var(--space-3);padding:var(--space-2) var(--space-3);
                      background:var(--color-surface-2);border-radius:var(--radius-md);">
            Push button cycles: Scroll → Volume → Brightness → Scroll
          </div>
          ${ENCODER_MODES.map(m => {
            const b = encoder[m.id];
            return `
              <div style="display:flex;align-items:center;gap:var(--space-3);
                          padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider);
                          font-size:var(--text-xs);">
                <span style="font-size:0.9rem;width:20px;text-align:center;">${m.icon}</span>
                <span style="color:var(--color-text-muted);min-width:60px;">${m.label}</span>
                <span style="color:var(--color-text-faint);">↻</span>
                <span style="font-family:var(--font-mono);color:var(--color-text);">
                  ${Keycodes.getDisplayLabel(b.cw)}
                </span>
                <span style="color:var(--color-text-faint);">↺</span>
                <span style="font-family:var(--font-mono);color:var(--color-text);">
                  ${Keycodes.getDisplayLabel(b.ccw)}
                </span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Layers -->
        ${layers.map((layer, i) => `
          <div class="review-card">
            <div class="review-card-title">
              <span style="display:inline-flex;align-items:center;justify-content:center;
                           width:20px;height:20px;border-radius:50%;
                           background:var(--color-accent-highlight);
                           color:var(--color-accent);font-size:var(--text-xs);font-weight:700;">${i}</span>
              ${layer.name}
              ${i >= KeymapGenerator.MAX_LAYERS
                ? `<span style="font-size:var(--text-xs);color:var(--color-error);
                               margin-left:auto;">⚠ exceeds 4-layer limit — will be skipped</span>`
                : ''}
            </div>
            <div class="review-key-grid">
              ${layer.keys.map(k =>
                `<div class="review-key ${k === 'TRANS' || k === 'NONE' ? 'empty' : ''}">
                  ${Keycodes.getDisplayLabel(k)}
                </div>`
              ).join('')}
            </div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);
                        border-top:1px solid var(--color-divider);
                        padding-top:var(--space-2);margin-top:var(--space-2);">
              FN → <span style="color:var(--color-accent);font-family:var(--font-mono);">
                ${Keycodes.getDisplayLabel(layer.fnAction)}
              </span>
            </div>
          </div>
        `).join('')}

        <!-- Keymap preview -->
        <div class="review-card review-keymap-card" style="grid-column: 1 / -1;">
          <div class="review-card-title" style="justify-content:space-between;">
            <span style="display:flex;align-items:center;gap:var(--space-2);">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              macropad.keymap
            </span>
            <span style="display:flex;gap:var(--space-2);">
              <button class="btn btn-ghost btn-sm" id="btn-copy-keymap">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </button>
              <button class="btn btn-ghost btn-sm" id="btn-download-keymap">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </button>
            </span>
          </div>
          <pre class="review-keymap-pre"><code>${_escapeHtml(keymapStr)}</code></pre>
        </div>

      </div>

      <!-- Footer action -->
      <div style="display:flex;justify-content:center;
                  padding:0 var(--space-8) var(--space-8);">
        <button class="btn btn-primary btn-lg" id="btn-go-flash"
                ${!validation.valid ? 'disabled title="Fix errors before flashing"' : ''}>
          Continue to Flash →
        </button>
      </div>
    `;

    // ── Events ──

    document.getElementById('btn-go-flash')?.addEventListener('click', () => {
      if (!validation.valid) {
        App.showToast('Fix config errors before flashing', 'error');
        return;
      }
      Router.goTo('flash');
    });

    document.getElementById('btn-copy-keymap')?.addEventListener('click', () => {
      navigator.clipboard.writeText(keymapStr).then(() => {
        App.showToast('Keymap copied to clipboard', 'success');
      }).catch(() => {
        App.showToast('Copy failed — try downloading instead', 'error');
      });
    });

    document.getElementById('btn-download-keymap')?.addEventListener('click', () => {
      const blob = new Blob([keymapStr], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'macropad.keymap';
      a.click();
      URL.revokeObjectURL(url);
      App.showToast('macropad.keymap downloaded', 'success');
    });
  }

  return { render };
})();