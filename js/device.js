// ═══ DEVICE — My Device full page ═══

const Device = (() => {

  // Which layer row is expanded to show mini pad
  let _expandedLayer = 0;

  function render() {
    const container = document.getElementById('device-content');
    if (!container) return;

    const state    = State.get();
    const { layers, encoder, profileId } = state;
    const profile  = profileId ? Profiles.getById(profileId) : null;

    container.innerHTML = `
      <div class="device-page">

        <!-- Page header -->
        <div class="device-page-header">
          <button class="btn btn-ghost btn-sm" id="btn-back-device">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <div class="device-title-group">
            <h1 class="device-page-title">My Device</h1>
            <span class="device-model">nice!nano v2 · 3×3 Macropad</span>
          </div>
          <div class="device-status-badge" id="device-status-badge">
            <span class="status-dot disconnected"></span>
            <span>Not Connected</span>
          </div>
        </div>

        <!-- Grid -->
        <div class="device-grid">

          <!-- CONNECTION CARD -->
          <div class="device-card" id="device-conn-card">
            <div class="device-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
              Connection
            </div>

            <div class="device-info-rows">
              <div class="device-info-row">
                <span class="device-info-label">Status</span>
                <span class="device-info-value" id="conn-status">
                  <span class="status-dot disconnected"></span> Not connected
                </span>
              </div>
              <div class="device-info-row">
                <span class="device-info-label">Firmware</span>
                <span class="device-info-value dim">— (connect to read)</span>
              </div>
              <div class="device-info-row">
                <span class="device-info-label">Profile</span>
                <span class="device-info-value">
                  ${profile
                    ? `${profile.icon} ${profile.name}`
                    : '<span class="dim">None loaded</span>'}
                </span>
              </div>
              <div class="device-info-row">
                <span class="device-info-label">Layers</span>
                <span class="device-info-value">${layers.length} layer${layers.length > 1 ? 's' : ''}</span>
              </div>
              <div class="device-info-row">
                <span class="device-info-label">Build mode</span>
                <span class="device-info-value">
                  ${state.buildMode === 'instant'
                    ? '<span style="color:var(--color-success)">⚡ Instant</span>'
                    : '<span style="color:var(--color-warning)">🔨 Compile</span>'}
                </span>
              </div>
            </div>

            <div class="device-conn-actions">
              <button class="btn btn-primary btn-full" id="btn-connect-device">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Connect Device
              </button>
              <p class="device-conn-note">
                Double-tap reset on your macropad,<br>
                then click Connect. Chrome / Edge only.
              </p>
            </div>
          </div>

          <!-- LAYERS CARD -->
          <div class="device-card device-card-layers">
            <div class="device-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              Layers on Device
            </div>

            <div class="device-layer-list" id="device-layer-list">
              ${_renderLayerList(layers)}
            </div>
          </div>

          <!-- ENCODER CARD -->
          <div class="device-card">
            <div class="device-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Encoder Modes
              <span style="font-size:var(--text-xs);color:var(--color-text-faint);
                           font-weight:400;margin-left:auto;">
                Push button cycles modes
              </span>
            </div>

            ${_renderEncoderCard(encoder)}
          </div>

          <!-- QUICK ACTIONS CARD -->
          <div class="device-card">
            <div class="device-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Quick Actions
            </div>

            <div class="device-quick-actions">
              <button class="btn btn-ghost btn-full device-action-btn"
                      id="btn-device-edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Open Editor
              </button>

              <button class="btn btn-ghost btn-full device-action-btn"
                      id="btn-device-flash">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Go to Flash
              </button>

              <button class="btn btn-ghost btn-full device-action-btn"
                      id="btn-device-export">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export Config JSON
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    _bindEvents();
  }

  // ── Layer list with expandable mini pad ──
  function _renderLayerList(layers) {
    return layers.map((layer, i) => `
      <div class="device-layer-row ${i === _expandedLayer ? 'expanded' : ''}"
           data-layer-idx="${i}">

        <div class="device-layer-row-header">
          <div class="device-layer-index">${i}</div>
          <div class="device-layer-name">${layer.name}</div>
          <div class="device-layer-meta">${layer.keys.filter(k => k !== 'TRANS' && k !== 'NONE').length} keys set</div>
          <div class="device-layer-toggle">
            ${i === _expandedLayer ? '▲' : '▼'}
          </div>
        </div>

        ${i === _expandedLayer ? `
          <div class="device-mini-pad-wrap">
            <div class="device-mini-pad">
              ${layer.keys.map((k, ki) => `
                <div class="device-mini-key ${k === 'TRANS' || k === 'NONE' ? 'empty' : ''}">
                  <span class="device-mini-key-num">${ki + 1}</span>
                  <span class="device-mini-key-label">
                    ${Keycodes.getDisplayLabel(k)}
                  </span>
                </div>
              `).join('')}
            </div>
            <div class="device-mini-extras">
              <div class="device-mini-fn">
                <span class="device-mini-fn-label">FN</span>
                <span class="device-mini-fn-action">
                  ${Keycodes.getDisplayLabel(layer.fnAction)}
                </span>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  // ── Encoder card content ──
  function _renderEncoderCard(encoder) {
    const modes = [
      { id: 'scroll',     label: 'Scroll',     icon: '↕', color: 'var(--color-primary)' },
      { id: 'volume',     label: 'Volume',     icon: '🔊', color: 'var(--color-accent)' },
      { id: 'brightness', label: 'Brightness', icon: '☀',  color: 'var(--color-warning)' },
    ];

    return `
      <div class="device-encoder-modes">
        ${modes.map(m => {
          const b = encoder[m.id];
          return `
            <div class="device-encoder-row">
              <div class="device-encoder-mode-tag" style="color:${m.color};">
                <span>${m.icon}</span>
                <span>${m.label}</span>
              </div>
              <div class="device-encoder-binding">
                <span class="enc-dir">↻</span>
                <span class="enc-val">${Keycodes.getDisplayLabel(b.cw)}</span>
              </div>
              <div class="device-encoder-binding">
                <span class="enc-dir">↺</span>
                <span class="enc-val">${Keycodes.getDisplayLabel(b.ccw)}</span>
              </div>
            </div>
          `;
        }).join('')}
        <div style="margin-top:var(--space-3);padding:var(--space-2) var(--space-3);
                    background:var(--color-surface-2);border-radius:var(--radius-md);
                    font-size:var(--text-xs);color:var(--color-text-faint);
                    display:flex;align-items:center;gap:var(--space-2);">
          <span style="color:var(--color-primary);">●</span>
          Push button cycles: Scroll → Volume → Brightness → Scroll
        </div>
      </div>
    `;
  }

  // ── Events ──
  function _bindEvents() {
    // Back button
    document.getElementById('btn-back-device')?.addEventListener('click', () => {
      Router.back();
    });

    // Layer row expand/collapse
    document.querySelectorAll('.device-layer-row').forEach(row => {
      row.querySelector('.device-layer-row-header')?.addEventListener('click', () => {
        const idx = parseInt(row.dataset.layerIdx);
        _expandedLayer = (_expandedLayer === idx) ? -1 : idx;
        // Re-render just the layer list
        const list = document.getElementById('device-layer-list');
        if (list) list.innerHTML = _renderLayerList(State.get().layers);
        _bindLayerRowEvents();
      });
    });

    // Connect device (mock for now)
    document.getElementById('btn-connect-device')?.addEventListener('click', () => {
      App.showToast('Browser USB — coming in next phase', 'warning');
    });

    // Quick actions
    document.getElementById('btn-device-edit')?.addEventListener('click', () => {
      if (!State.get().profileId) {
        App.showToast('Select a profile first', 'warning');
        Router.goTo('profiles');
      } else {
        Router.goTo('editor');
      }
    });

    document.getElementById('btn-device-flash')?.addEventListener('click', () => {
      if (!State.get().profileId) {
        App.showToast('Select a profile first', 'warning');
        Router.goTo('profiles');
      } else {
        Router.goTo('flash');
      }
    });

    document.getElementById('btn-device-export')?.addEventListener('click', () => {
      const json = State.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'spad-config.json';
      a.click();
      URL.revokeObjectURL(url);
      App.showToast('Config exported', 'success');
    });
  }

  function _bindLayerRowEvents() {
    document.querySelectorAll('.device-layer-row').forEach(row => {
      row.querySelector('.device-layer-row-header')?.addEventListener('click', () => {
        const idx = parseInt(row.dataset.layerIdx);
        _expandedLayer = (_expandedLayer === idx) ? -1 : idx;
        const list = document.getElementById('device-layer-list');
        if (list) list.innerHTML = _renderLayerList(State.get().layers);
        _bindLayerRowEvents();
      });
    });
  }

  return { render };
})();