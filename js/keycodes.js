// ═══ KEYCODES — ZMK keycode list with categories ═══

const Keycodes = (() => {

  const list = [
    // ── Editing ──
    { label: 'Undo',       zmk: 'LC(Z)',      display: 'Ctrl+Z',   cat: 'Editing' },
    { label: 'Redo',       zmk: 'LC(Y)',      display: 'Ctrl+Y',   cat: 'Editing' },
    { label: 'Cut',        zmk: 'LC(X)',      display: 'Ctrl+X',   cat: 'Editing' },
    { label: 'Copy',       zmk: 'LC(C)',      display: 'Ctrl+C',   cat: 'Editing' },
    { label: 'Paste',      zmk: 'LC(V)',      display: 'Ctrl+V',   cat: 'Editing' },
    { label: 'Save',       zmk: 'LC(S)',      display: 'Ctrl+S',   cat: 'Editing' },
    { label: 'Select All', zmk: 'LC(A)',      display: 'Ctrl+A',   cat: 'Editing' },
    { label: 'Find',       zmk: 'LC(F)',      display: 'Ctrl+F',   cat: 'Editing' },
    { label: 'Print',      zmk: 'LC(P)',      display: 'Ctrl+P',   cat: 'Editing' },
    { label: 'New',        zmk: 'LC(N)',      display: 'Ctrl+N',   cat: 'Editing' },
    { label: 'Open',       zmk: 'LC(O)',      display: 'Ctrl+O',   cat: 'Editing' },
    { label: 'Close',      zmk: 'LC(W)',      display: 'Ctrl+W',   cat: 'Editing' },
    { label: 'Bold',       zmk: 'LC(B)',      display: 'Ctrl+B',   cat: 'Editing' },
    { label: 'Italic',     zmk: 'LC(I)',      display: 'Ctrl+I',   cat: 'Editing' },
    { label: 'Zoom In',    zmk: 'LC(EQUAL)',  display: 'Ctrl++',   cat: 'Editing' },
    { label: 'Zoom Out',   zmk: 'LC(MINUS)',  display: 'Ctrl+-',   cat: 'Editing' },

    // ── Media ──
    { label: 'Play/Pause', zmk: 'C_PP',       display: 'Play/Pause', cat: 'Media' },
    { label: 'Next Track', zmk: 'C_NEXT',     display: 'Next',       cat: 'Media' },
    { label: 'Prev Track', zmk: 'C_PREV',     display: 'Prev',       cat: 'Media' },
    { label: 'Vol Up',     zmk: 'C_VOL_UP',   display: 'Vol +',      cat: 'Media' },
    { label: 'Vol Down',   zmk: 'C_VOL_DN',   display: 'Vol -',      cat: 'Media' },
    { label: 'Mute',       zmk: 'C_MUTE',     display: 'Mute',       cat: 'Media' },
    { label: 'Bri Up',     zmk: 'C_BRI_UP',   display: 'Bri +',      cat: 'Media' },
    { label: 'Bri Down',   zmk: 'C_BRI_DN',   display: 'Bri -',      cat: 'Media' },
    { label: 'Stop',       zmk: 'C_STOP',     display: 'Stop',       cat: 'Media' },
    { label: 'Fast Fwd',   zmk: 'C_FF',       display: 'FF',         cat: 'Media' },
    { label: 'Rewind',     zmk: 'C_RW',       display: 'RW',         cat: 'Media' },

    // ── Navigation ──
    { label: 'Page Up',    zmk: 'PG_UP',      display: 'PgUp',    cat: 'Navigation' },
    { label: 'Page Down',  zmk: 'PG_DN',      display: 'PgDn',    cat: 'Navigation' },
    { label: 'Home',       zmk: 'HOME',       display: 'Home',    cat: 'Navigation' },
    { label: 'End',        zmk: 'END',        display: 'End',     cat: 'Navigation' },
    { label: 'Arrow Up',   zmk: 'UP',         display: '↑',       cat: 'Navigation' },
    { label: 'Arrow Down', zmk: 'DOWN',       display: '↓',       cat: 'Navigation' },
    { label: 'Arrow Left', zmk: 'LEFT',       display: '←',       cat: 'Navigation' },
    { label: 'Arrow Right',zmk: 'RIGHT',      display: '→',       cat: 'Navigation' },
    { label: 'Tab',        zmk: 'TAB',        display: 'Tab',     cat: 'Navigation' },
    { label: 'Backspace',  zmk: 'BSPC',       display: 'Bksp',    cat: 'Navigation' },
    { label: 'Delete',     zmk: 'DEL',        display: 'Del',     cat: 'Navigation' },
    { label: 'Enter',      zmk: 'RET',        display: 'Enter',   cat: 'Navigation' },
    { label: 'Escape',     zmk: 'ESC',        display: 'Esc',     cat: 'Navigation' },
    { label: 'Space',      zmk: 'SPACE',      display: 'Space',   cat: 'Navigation' },

    // ── Windows/System ──
    { label: 'Close App',  zmk: 'LA(F4)',     display: 'Alt+F4',      cat: 'System' },
    { label: 'Screenshot', zmk: 'LG(LS(S))',  display: 'Win+Shift+S', cat: 'System' },
    { label: 'Lock Screen',zmk: 'LG(L)',      display: 'Win+L',       cat: 'System' },
    { label: 'Task View',  zmk: 'LG(TAB)',    display: 'Win+Tab',     cat: 'System' },
    { label: 'Desktop',    zmk: 'LG(D)',      display: 'Win+D',       cat: 'System' },
    { label: 'Run',        zmk: 'LG(R)',      display: 'Win+R',       cat: 'System' },
    { label: 'Explorer',   zmk: 'LG(E)',      display: 'Win+E',       cat: 'System' },
    { label: 'Task Mgr',   zmk: 'LC(LS(ESC))',display: 'Ctrl+Shift+Esc', cat: 'System' },
    { label: 'Sleep',      zmk: 'C_SLEEP',    display: 'Sleep',       cat: 'System' },
    { label: 'Calc',       zmk: 'C_AL_CALC',  display: 'Calculator',  cat: 'System' },

    // ── Function Keys ──
    { label: 'F1',  zmk: 'F1',  display: 'F1',  cat: 'Function' },
    { label: 'F2',  zmk: 'F2',  display: 'F2',  cat: 'Function' },
    { label: 'F3',  zmk: 'F3',  display: 'F3',  cat: 'Function' },
    { label: 'F4',  zmk: 'F4',  display: 'F4',  cat: 'Function' },
    { label: 'F5',  zmk: 'F5',  display: 'F5',  cat: 'Function' },
    { label: 'F6',  zmk: 'F6',  display: 'F6',  cat: 'Function' },
    { label: 'F7',  zmk: 'F7',  display: 'F7',  cat: 'Function' },
    { label: 'F8',  zmk: 'F8',  display: 'F8',  cat: 'Function' },
    { label: 'F9',  zmk: 'F9',  display: 'F9',  cat: 'Function' },
    { label: 'F10', zmk: 'F10', display: 'F10', cat: 'Function' },
    { label: 'F11', zmk: 'F11', display: 'F11', cat: 'Function' },
    { label: 'F12', zmk: 'F12', display: 'F12', cat: 'Function' },

    // ── Design (Adobe / Figma) ──
    { label: 'Deselect',   zmk: 'ESC',        display: 'Esc',      cat: 'Design' },
    { label: 'Zoom Fit',   zmk: 'LC(LS(H))',  display: 'Ctrl+Sh+H',cat: 'Design' },
    { label: 'Group',      zmk: 'LC(G)',      display: 'Ctrl+G',   cat: 'Design' },
    { label: 'Ungroup',    zmk: 'LC(LS(G))',  display: 'Ctrl+Sh+G',cat: 'Design' },
    { label: 'Bring Fwd',  zmk: 'LC(RET)',    display: 'Ctrl+]',   cat: 'Design' },
    { label: 'Send Back',  zmk: 'LC(LBKT)',   display: 'Ctrl+[',   cat: 'Design' },

    // ── Dev Tools ──
    { label: 'Dev Tools',  zmk: 'F12',        display: 'F12',         cat: 'Dev' },
    { label: 'Run Code',   zmk: 'F5',         display: 'F5',          cat: 'Dev' },
    { label: 'Debug',      zmk: 'LC(LS(I))',  display: 'Ctrl+Sh+I',   cat: 'Dev' },
    { label: 'Comment',    zmk: 'LC(FSLH)',   display: 'Ctrl+/',      cat: 'Dev' },
    { label: 'Format',     zmk: 'LA(LS(F))',  display: 'Alt+Sh+F',    cat: 'Dev' },
    { label: 'Terminal',   zmk: 'LC(GRAVE)',  display: 'Ctrl+`',      cat: 'Dev' },
    { label: 'Multi Cursor',zmk: 'LA(LC(DOWN))',display:'Alt+Ctrl+↓', cat: 'Dev' },

    // ── Layer / Special ──
    { label: 'Transparent',zmk: 'TRANS',      display: '▽ Trans',  cat: 'Layer' },
    { label: 'None',       zmk: 'NONE',       display: '✕ None',   cat: 'Layer' },
    { label: 'To Layer 0', zmk: 'TO 0',       display: 'TO 0',     cat: 'Layer' },
    { label: 'To Layer 1', zmk: 'TO 1',       display: 'TO 1',     cat: 'Layer' },
    { label: 'To Layer 2', zmk: 'TO 2',       display: 'TO 2',     cat: 'Layer' },
    { label: 'Toggle L1',  zmk: 'TOG 1',      display: 'TOG 1',    cat: 'Layer' },
    { label: 'Toggle L2',  zmk: 'TOG 2',      display: 'TOG 2',    cat: 'Layer' },
    { label: 'Next Mode',  zmk: 'NEXT_MODE',  display: 'Next Mode',cat: 'Layer' },
  ];

  const categories = ['All', ...new Set(list.map(k => k.cat))];

  function getAll() { return list; }

  function getByCategory(cat) {
    if (cat === 'All') return list;
    return list.filter(k => k.cat === cat);
  }

  function search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return list;
    return list.filter(k =>
      k.label.toLowerCase().includes(q) ||
      k.zmk.toLowerCase().includes(q) ||
      k.display.toLowerCase().includes(q)
    );
  }

  function getByZmk(zmk) {
    return list.find(k => k.zmk === zmk) || { label: zmk, zmk, display: zmk, cat: 'Custom' };
  }

  function getDisplayLabel(zmk) {
    const found = getByZmk(zmk);
    return found ? found.display : zmk;
  }

  return { list, categories, getAll, getByCategory, search, getByZmk, getDisplayLabel };
})();