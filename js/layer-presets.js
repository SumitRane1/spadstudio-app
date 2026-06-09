// ═══ LAYER PRESETS — Software-specific key templates ═══

const LayerPresets = (() => {

  const categories = ['Design', 'CAD/3D', 'Dev', 'Office', 'System'];

  const presets = [

    // ══════════════ DESIGN ══════════════

    {
      id: 'figma',
      name: 'Figma',
      icon: '🎨',
      category: 'Design',
      desc: 'Undo, copy, paste, group, component, frames, zoom fit',
      keys: [
        'LC(Z)',       // Undo
        'LC(C)',       // Copy
        'LC(V)',       // Paste
        'LC(G)',       // Group
        'LC(LS(G))',   // Ungroup
        'LA(LC(K))',   // Create Component
        'LC(LS(H))',   // Flip Horizontal
        'LC(EQUAL)',   // Zoom In
        'LC(MINUS)',   // Zoom Out
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'photoshop',
      name: 'Photoshop',
      icon: '🖼',
      category: 'Design',
      desc: 'Undo, save, flatten, merge, zoom, crop, deselect',
      keys: [
        'LC(Z)',       // Undo
        'LC(S)',       // Save
        'LC(LS(S))',   // Save As
        'LC(E)',       // Merge Visible
        'LC(LS(E))',   // Flatten Image
        'LC(D)',       // Deselect
        'LC(LS(C))',   // Copy Merged
        'LC(EQUAL)',   // Zoom In
        'LC(MINUS)',   // Zoom Out
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'illustrator',
      name: 'Illustrator',
      icon: '✏️',
      category: 'Design',
      desc: 'Undo, group, arrange, pathfinder, zoom, outline view',
      keys: [
        'LC(Z)',       // Undo
        'LC(G)',       // Group
        'LC(LS(G))',   // Ungroup
        'LC(S)',       // Save
        'LC(C)',       // Copy
        'LC(V)',       // Paste in Place
        'LC(LS(RBKT))',// Bring to Front
        'LC(EQUAL)',   // Zoom In
        'LC(MINUS)',   // Zoom Out
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'premiere',
      name: 'Premiere Pro',
      icon: '🎬',
      category: 'Design',
      desc: 'Playback, cut, trim, in/out points, export, undo',
      keys: [
        'SPACE',       // Play/Pause
        'LC(Z)',       // Undo
        'LC(K)',       // Stop
        'LC(M)',       // Add Marker
        'I',           // Set In Point
        'O',           // Set Out Point
        'LC(C)',       // Cut (Razor)
        'LC(S)',       // Save
        'LC(LS(M))',   // Export Media
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'aftereffects',
      name: 'After Effects',
      icon: '✨',
      category: 'Design',
      desc: 'Play, undo, keyframe, RAM preview, composition, render',
      keys: [
        'SPACE',       // Play/Pause
        'LC(Z)',       // Undo
        'LC(S)',       // Save
        'LC(M)',       // Add Marker
        'U',           // Show Keyframes
        'F9',          // Easy Ease Keyframe
        'LC(LS(H))',   // Hide/Show all props
        'LC(N)',       // Set Work Area End
        'LC(LS(X))',   // Render Queue
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'davinci',
      name: 'DaVinci Resolve',
      icon: '🎥',
      category: 'Design',
      desc: 'Play, cut, trim, color, undo, export, markers',
      keys: [
        'SPACE',       // Play/Pause
        'LC(Z)',       // Undo
        'LC(S)',       // Save
        'LC(B)',       // Razor / Blade
        'M',           // Add Marker
        'I',           // Set In Point
        'O',           // Set Out Point
        'LC(E)',       // Export
        'LC(LS(S))',   // Save As
      ],
      fnAction: 'TO 0',
    },

    // ══════════════ CAD / 3D ══════════════

    {
      id: 'fusion360',
      name: 'Fusion 360',
      icon: '⚙️',
      category: 'CAD/3D',
      desc: 'Undo, save, extrude, sketch, inspect, export, section',
      keys: [
        'LC(Z)',       // Undo
        'LC(S)',       // Save
        'LC(C)',       // Copy
        'E',           // Extrude
        'S',           // Open Sketch Palette
        'F7',          // Inspect
        'LC(LS(S))',   // Screenshot
        'LC(D)',       // Change Dimension
        'F6',          // Fit to Screen
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'solidworks',
      name: 'SolidWorks',
      icon: '🔩',
      category: 'CAD/3D',
      desc: 'Undo, save, rebuild, sketch, extrude, view, zoom fit',
      keys: [
        'LC(Z)',       // Undo
        'LC(S)',       // Save
        'LC(B)',       // Rebuild
        'S',           // Sketch
        'E',           // Extrude (SmartMates)
        'SPACE',       // View Selector
        'F',           // Zoom to Fit
        'LC(LS(Z))',   // Redo
        'LC(C)',       // Copy
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'freecad',
      name: 'FreeCAD',
      icon: '🔓',
      category: 'CAD/3D',
      desc: 'Undo, save, fit all, sketch, pad, mirror, clone',
      keys: [
        'LC(Z)',       // Undo
        'LC(S)',       // Save
        'V',           // View menu
        'LC(EQUAL)',   // Zoom In
        'LC(MINUS)',   // Zoom Out
        'LC(C)',       // Copy
        'LC(V)',       // Paste
        'LC(LS(S))',   // Save As
        'LC(A)',       // Select All
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'blender',
      name: 'Blender',
      icon: '🐉',
      category: 'CAD/3D',
      desc: 'Undo, grab, rotate, scale, extrude, render, loop cut',
      keys: [
        'LC(Z)',       // Undo
        'G',           // Grab/Move
        'R',           // Rotate
        'S',           // Scale
        'E',           // Extrude
        'LC(R)',       // Loop Cut
        'F12',         // Render
        'LC(S)',       // Save
        'TAB',         // Toggle Edit Mode
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'kicad',
      name: 'KiCad',
      icon: '🔌',
      category: 'CAD/3D',
      desc: 'Undo, save, add wire, route, zoom, edit footprint, DRC',
      keys: [
        'LC(Z)',       // Undo
        'LC(S)',       // Save
        'W',           // Add Wire
        'X',           // Route Track
        'LC(EQUAL)',   // Zoom In
        'LC(MINUS)',   // Zoom Out
        'E',           // Edit Properties
        'F',           // Flip
        'LC(LS(D))',   // Run DRC
      ],
      fnAction: 'TO 0',
    },

    // ══════════════ DEV ══════════════

    {
      id: 'vscode',
      name: 'VS Code',
      icon: '💻',
      category: 'Dev',
      desc: 'Undo, comment, format, run, terminal, debug, multi-cursor',
      keys: [
        'LC(Z)',        // Undo
        'LC(FSLH)',     // Toggle Comment
        'LA(LS(F))',    // Format Document
        'F5',           // Run / Debug
        'LC(GRAVE)',    // Toggle Terminal
        'LC(LS(P))',    // Command Palette
        'LC(B)',        // Toggle Sidebar
        'LC(C)',        // Copy
        'LC(S)',        // Save
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'arduino',
      name: 'Arduino IDE',
      icon: '🤖',
      category: 'Dev',
      desc: 'Verify, upload, serial monitor, comment, save, format',
      keys: [
        'LC(U)',        // Upload
        'LC(R)',        // Verify / Compile
        'LC(LS(M))',    // Open Serial Monitor
        'LC(Z)',        // Undo
        'LC(S)',        // Save
        'LC(FSLH)',     // Comment/Uncomment
        'LC(T)',        // Auto Format
        'LC(LS(L))',    // Serial Plotter
        'LC(GRAVE)',    // Terminal
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'devtools',
      name: 'Chrome DevTools',
      icon: '🌐',
      category: 'Dev',
      desc: 'Open DevTools, console, inspect, reload, network, sources',
      keys: [
        'F12',          // Toggle DevTools
        'LC(LS(I))',    // Inspect Element
        'LC(LS(J))',    // Console
        'LC(LS(C))',    // Pick Element
        'LC(R)',        // Hard Reload
        'LC(LS(R))',    // Hard Reload + Clear Cache
        'LC(L)',        // Address Bar
        'LC(U)',        // View Source
        'F5',           // Refresh
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'terminal',
      name: 'Terminal',
      icon: '⬛',
      category: 'Dev',
      desc: 'Copy, paste, clear, interrupt, new tab, find, scroll',
      keys: [
        'LC(C)',        // Copy / Interrupt
        'LC(V)',        // Paste
        'LC(L)',        // Clear screen
        'LC(Z)',        // Suspend process
        'LC(T)',        // New Tab (Windows Terminal)
        'LC(W)',        // Close Tab
        'LC(F)',        // Find
        'PG_UP',        // Scroll up
        'PG_DN',        // Scroll down
      ],
      fnAction: 'TO 0',
    },

    // ══════════════ OFFICE ══════════════

    {
      id: 'word',
      name: 'Word',
      icon: '📝',
      category: 'Office',
      desc: 'Undo, bold, italic, save, print, find, heading styles',
      keys: [
        'LC(Z)',        // Undo
        'LC(B)',        // Bold
        'LC(I)',        // Italic
        'LC(U)',        // Underline
        'LC(S)',        // Save
        'LC(P)',        // Print
        'LC(F)',        // Find
        'LC(H)',        // Replace
        'LC(A)',        // Select All
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'excel',
      name: 'Excel',
      icon: '📊',
      category: 'Office',
      desc: 'Undo, sum, filter, freeze, new row, format, find',
      keys: [
        'LC(Z)',        // Undo
        'LA(EQUAL)',    // Auto Sum
        'LC(LS(L))',    // Toggle Filter
        'LC(T)',        // Create Table
        'LC(S)',        // Save
        'LC(F)',        // Find
        'LC(H)',        // Replace
        'LC(EQUAL)',    // Insert Row/Col
        'LC(MINUS)',    // Delete Row/Col
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'powerpoint',
      name: 'PowerPoint',
      icon: '📽',
      category: 'Office',
      desc: 'Undo, duplicate, slideshow, align, group, save, export',
      keys: [
        'LC(Z)',        // Undo
        'LC(D)',        // Duplicate Slide
        'F5',           // Start Slideshow
        'LC(G)',        // Group
        'LC(LS(G))',    // Ungroup
        'LC(S)',        // Save
        'LC(C)',        // Copy
        'LC(V)',        // Paste
        'LA(F4)',       // Close
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'googledocs',
      name: 'Google Docs',
      icon: '📄',
      category: 'Office',
      desc: 'Undo, bold, comment, heading, find, word count, share',
      keys: [
        'LC(Z)',        // Undo
        'LC(B)',        // Bold
        'LC(I)',        // Italic
        'LC(LA(M))',    // Add Comment
        'LC(F)',        // Find
        'LC(H)',        // Find and Replace
        'LC(S)',        // Save (manual)
        'LC(A)',        // Select All
        'LC(LS(C))',    // Word Count
      ],
      fnAction: 'TO 0',
    },

    // ══════════════ SYSTEM ══════════════

    {
      id: 'windows',
      name: 'Windows',
      icon: '🪟',
      category: 'System',
      desc: 'Screenshot, lock, task view, desktop, run, explorer',
      keys: [
        'LG(LS(S))',    // Screenshot (Snip)
        'LG(L)',        // Lock Screen
        'LG(TAB)',      // Task View
        'LG(D)',        // Show Desktop
        'LG(E)',        // File Explorer
        'LG(R)',        // Run Dialog
        'LC(LS(ESC))',  // Task Manager
        'LA(F4)',       // Close Window
        'LG(V)',        // Clipboard History
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'media',
      name: 'Media Controls',
      icon: '🎵',
      category: 'System',
      desc: 'Play, skip, volume, mute, brightness, screenshot',
      keys: [
        'C_PP',         // Play/Pause
        'C_PREV',       // Previous Track
        'C_NEXT',       // Next Track
        'C_VOL_UP',     // Volume Up
        'C_VOL_DN',     // Volume Down
        'C_MUTE',       // Mute
        'C_BRI_UP',     // Brightness Up
        'C_BRI_DN',     // Brightness Down
        'LG(LS(S))',    // Screenshot
      ],
      fnAction: 'TO 0',
    },

    {
      id: 'browser',
      name: 'Browser',
      icon: '🌍',
      category: 'System',
      desc: 'New tab, close, reload, address bar, back, forward, bookmark',
      keys: [
        'LC(T)',        // New Tab
        'LC(W)',        // Close Tab
        'LC(R)',        // Reload
        'LC(L)',        // Address Bar
        'LA(LEFT)',     // Back
        'LA(RIGHT)',    // Forward
        'LC(D)',        // Bookmark
        'LC(LS(TAB))',  // Prev Tab
        'LC(TAB)',      // Next Tab
      ],
      fnAction: 'TO 0',
    },

  ];

  function getAll() { return presets; }
  function getCategories() { return categories; }
  function getById(id) { return presets.find(p => p.id === id) || null; }
  function getByCategory(cat) { return presets.filter(p => p.category === cat); }

  return { getAll, getCategories, getById, getByCategory };
})();