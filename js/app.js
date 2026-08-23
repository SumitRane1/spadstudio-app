// ═══ APP — Entry point ═══

const App = (() => {

  // ── Theme ──
  let _theme = (() => {
    const stored = localStorage.getItem('spad_theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  })();

  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    _updateThemeIcon(theme);
    try { localStorage.setItem('spad_theme', theme); } catch(e) {}
  }

  function _updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    btn.innerHTML = theme === 'dark'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
           <circle cx="12" cy="12" r="5"/>
           <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
         </svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
           <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
         </svg>`;
  }

  // ── Init ──
  function init() {
    // Apply saved/system theme immediately
    _applyTheme(_theme);

    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      _theme = _theme === 'dark' ? 'light' : 'dark';
      _applyTheme(_theme);
    });

    // Save button — persist config to localStorage
    document.getElementById('btn-save')?.addEventListener('click', () => {
      try {
        localStorage.setItem('spad_config', State.exportJSON());
        showToast('Configuration saved', 'success');
      } catch (e) {
        showToast('Save failed — storage unavailable', 'error');
      }
    });

    // Export button (header)
    document.getElementById('btn-export')?.addEventListener('click', () => {
      _downloadJSON(State.exportJSON(), 'spad-config.json');
      showToast('Config exported', 'success');
    });

    // Restore saved config if present
    _restoreConfig();

    // Init all modules
    Flash.init();       // restore GitHub config before router
    EditMacros.init();  // live ZMK Studio RPC editor — also attempts silent reconnect
    Router.init();
    Layers.init();
    Editor.init();

    // Render profile picker on start
    Profiles.render('profile-grid');

    // Navigate to last section or profiles
    const lastSection = (() => {
      try { return sessionStorage.getItem('spad_section') || 'profiles'; } catch(e) { return 'profiles'; }
    })();
    Router.goTo(lastSection === 'device' ? 'profiles' : lastSection);

    // Subscribe to state to track dirty status in the save button
    State.subscribe(state => {
      const btn = document.getElementById('btn-save');
      if (btn) {
        btn.style.color = state.isDirty
          ? 'var(--color-warning)'
          : '';
      }
    });

    console.log('%c sPadStudio loaded ✓', 'color:#38bdf8;font-weight:bold;font-size:14px;');
  }

  // ── Restore saved config from localStorage ──
  function _restoreConfig() {
    try {
      const saved = localStorage.getItem('spad_config');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!parsed || !parsed.layers) return;

      // Restore into State only if a valid profileId is present
      if (parsed.profileId) {
        State.set({
          profileId:        parsed.profileId,
          layers:           parsed.layers,
          encoder:          parsed.encoder || State.get().encoder,
          activeLayerIndex: 0,
          buildMode:        parsed.buildMode || 'instant',
          isDirty:          false,
        });
      }
    } catch (e) {
      console.warn('[App] Could not restore config:', e);
    }
  }

  // ── Toast ──
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '✅',
      error:   '❌',
      warning: '⚠️',
      info:    'ℹ️',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <span aria-hidden="true">${icons[type] || ''}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateX(0)';
    });

    // Animate out + remove
    setTimeout(() => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateX(16px)';
      toast.style.transition = 'opacity 200ms ease, transform 200ms ease';
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  // ── Utility: download JSON string as file ──
  function _downloadJSON(jsonStr, filename) {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Start when DOM ready ──
  document.addEventListener('DOMContentLoaded', init);

  return { init, showToast };

})();
