// ═══ PROFILES — Preset configurations ═══

const Profiles = (() => {

  // Shared default encoder (same for all profiles — independent of layers)
  const defaultEncoder = {
    scroll:     { cw: 'PG_DN',    ccw: 'PG_UP'    },
    volume:     { cw: 'C_VOL_UP', ccw: 'C_VOL_DN' },
    brightness: { cw: 'C_BRI_UP', ccw: 'C_BRI_DN' },
  };

  const presets = [

    // ── Creative ──
    {
      id: 'creative',
      name: 'Creative',
      icon: '🎨',
      accent: '#a78bfa',
      desc: 'Photoshop, Illustrator, Figma. Undo, copy, group, zoom, screenshot.',
      encoder: defaultEncoder,
      layers: [
        {
          id: 'main', name: 'Creative',
          keys: ['LC(Z)', 'LC(C)', 'LC(V)', 'LC(S)', 'LC(G)', 'LC(LS(G))', 'LC(MINUS)', 'LC(EQUAL)', 'LC(A)'],
          fnAction: 'TOG 1',
          encoderPush: 'LC(Z)',
        },
        {
          id: 'extra', name: 'Extra',
          keys: ['LG(LS(S))', 'LG(L)', 'LC(Z)', 'LA(F4)', 'LG(D)', 'LG(TAB)', 'C_BRI_DN', 'C_BRI_UP', 'TRANS'],
          fnAction: 'TO 0',
          encoderPush: 'TRANS',
        },
      ]
    },

    // ── Media ──
    {
      id: 'media',
      name: 'Media',
      icon: '🎵',
      accent: '#38bdf8',
      desc: 'Music, video, streaming. Playback, screenshot, system shortcuts.',
      encoder: defaultEncoder,
      layers: [
        {
          id: 'main', name: 'Media',
          keys: ['C_PP', 'C_PREV', 'C_NEXT', 'C_VOL_UP', 'C_MUTE', 'C_VOL_DN', 'C_BRI_UP', 'C_BRI_DN', 'LG(LS(S))'],
          fnAction: 'TOG 1',
          encoderPush: 'C_PP',
        },
        {
          id: 'system', name: 'System',
          keys: ['LG(L)', 'LG(D)', 'LG(TAB)', 'LA(F4)', 'LG(R)', 'LG(E)', 'LC(LS(ESC))', 'C_SLEEP', 'C_AL_CALC'],
          fnAction: 'TO 0',
          encoderPush: 'TRANS',
        },
      ]
    },

    // ── Engineer / Builder ──
    {
      id: 'engineer',
      name: 'Engineer',
      icon: '🔧',
      accent: '#4ade80',
      desc: 'Fusion 360, SolidWorks, FreeCAD, Arduino IDE. CAD, 3D view, upload, verify.',
      encoder: {
        scroll:     { cw: 'PG_DN',    ccw: 'PG_UP'    },
        volume:     { cw: 'C_VOL_UP', ccw: 'C_VOL_DN' },
        brightness: { cw: 'C_BRI_UP', ccw: 'C_BRI_DN' },
      },
      layers: [
        {
          id: 'cad', name: 'CAD',
          keys: [
            'LC(Z)',      // Undo
            'LC(Y)',      // Redo
            'LC(S)',      // Save
            'LC(C)',      // Copy
            'LC(V)',      // Paste
            'LC(D)',      // Duplicate
            'F7',         // Inspect
            'LC(LS(S))',  // Screenshot
            'LC(A)',      // Select All
          ],
          fnAction: 'TOG 1',
          encoderPush: 'LC(S)',
        },
        {
          id: 'arduino', name: 'Arduino',
          keys: [
            'LC(U)',       // Upload
            'LC(R)',       // Verify
            'LC(LS(M))',   // Serial Monitor
            'LC(Z)',       // Undo
            'LC(S)',       // Save
            'LC(FSLH)',    // Comment
            'F5',          // Run
            'LC(LS(I))',   // Format
            'LC(GRAVE)',   // Terminal
          ],
          fnAction: 'TO 0',
          encoderPush: 'LC(U)',
        },
      ]
    },

    // ── Developer ──
    {
      id: 'dev',
      name: 'Developer',
      icon: '⌨️',
      accent: '#38bdf8',
      desc: 'VS Code, browser DevTools, terminal. Run, debug, format, comment, zoom.',
      encoder: defaultEncoder,
      layers: [
        {
          id: 'code', name: 'Code',
          keys: ['LC(Z)', 'LC(FSLH)', 'LA(LS(F))', 'F5', 'F12', 'LC(GRAVE)', 'LC(C)', 'LC(V)', 'LC(S)'],
          fnAction: 'TOG 1',
          encoderPush: 'F5',
        },
        {
          id: 'browser', name: 'Browser',
          keys: ['LC(LS(I))', 'LC(LS(J))', 'LC(LS(C))', 'LC(R)', 'LC(L)', 'LC(T)', 'LC(W)', 'LC(TAB)', 'LC(LS(TAB))'],
          fnAction: 'TO 0',
          encoderPush: 'LC(R)',
        },
      ]
    },

    // ── Custom ──
    {
      id: 'custom',
      name: 'Custom',
      icon: '⚙️',
      accent: '#fbbf24',
      desc: 'Start blank. All 9 keys empty — set every binding yourself.',
      encoder: defaultEncoder,
      layers: [
        {
          id: 'layer0', name: 'Layer 1',
          keys: ['TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS', 'TRANS'],
          fnAction: 'TOG 1',
          encoderPush: 'TRANS',
        }
      ]
    }

  ];

  function getAll() { return presets; }
  function getById(id) { return presets.find(p => p.id === id) || null; }

  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = presets.map(p => `
      <div class="profile-card" data-profile-id="${p.id}"
           style="--card-accent: ${p.accent}">
        <div class="profile-icon">${p.icon}</div>
        <div class="profile-name">${p.name}</div>
        <div class="profile-desc">${p.desc}</div>
        <div class="profile-keys">
          ${p.layers[0].keys.slice(0, 5).map(k =>
            `<span class="profile-key-chip">${Keycodes.getDisplayLabel(k)}</span>`
          ).join('')}
          ${p.layers[0].keys.length > 5
            ? `<span class="profile-key-chip">+${p.layers[0].keys.length - 5} more</span>` : ''}
        </div>
        <div style="margin-top:var(--space-3);font-size:var(--text-xs);color:var(--color-text-faint);">
          ${p.layers.length} layer${p.layers.length > 1 ? 's' : ''}
          &nbsp;·&nbsp;
          3 encoder modes
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.profileId;
        const profile = getById(id);
        if (!profile) return;

        container.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        State.loadProfile(id, profile);
        App.showToast(`Profile "${profile.name}" loaded`, 'success');
        setTimeout(() => Router.goTo('editor'), 400);
      });
    });

    const currentId = State.get().profileId;
    if (currentId) {
      const active = container.querySelector(`[data-profile-id="${currentId}"]`);
      if (active) active.classList.add('selected');
    }
  }

  return { getAll, getById, render };
})();