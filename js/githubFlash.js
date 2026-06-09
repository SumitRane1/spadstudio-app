// ═══ GITHUB FLASH — Real GitHub API integration ═══
// Flow: generate keymap → push to repo branch →
//       wait for Actions build → Worker downloads+unzips → returns raw .uf2 → flash

const GitHubFlash = (() => {

  let _config = {
    workerUrl:  SPAD_CONFIG.workerUrl,
    owner:      SPAD_CONFIG.owner,
    repo:       SPAD_CONFIG.repo,
    branch:     'main',
    keymapPath: 'config/boards/shields/macropad/macropad.keymap',
  };

  let _job = {
    branchName: null,
    runId:      null,
    status:     'idle',
    uf2Buffer:  null,
    error:      null,
  };

  let _progressCallback = null;
  let _pollTimer = null;

  function configure(cfg) { _config = { ..._config, ...cfg }; }
  function getConfig()    { return { ..._config }; }
  function isConfigured() { return !!(_config.workerUrl && _config.owner && _config.repo); }

  async function buildAndFlash(onProgress) {
    _progressCallback = onProgress || (() => {});
    _resetJob();

    try {
      if (!isConfigured()) throw new Error('GitHub not configured.');

      const state = State.get();
      const validation = KeymapGenerator.validate(state);
      if (!validation.valid) throw new Error('Config errors:\n' + validation.errors.join('\n'));
      validation.warnings.forEach(w => console.warn('[GitHubFlash]', w));

      _progress(5,  'Generating keymap…');
      const keymapContent = KeymapGenerator.generate(state);

      _progress(10, 'Creating build branch…');
      _job.branchName = `build/spad-${Date.now()}`;
      await _createBranch(_job.branchName);

      _progress(18, 'Pushing keymap to GitHub…');
      await _pushKeymap(_job.branchName, keymapContent);

      _progress(25, 'Waiting for build to start…');
      _job.runId = await _waitForRun(_job.branchName);

      _progress(35, 'Building firmware (3–5 min)…');
      await _pollUntilDone(_job.runId);

      _progress(88, 'Downloading firmware…');
      _job.uf2Buffer = await _downloadArtifact(_job.runId);

      _progress(95, 'Cleaning up…');
      await _deleteBranch(_job.branchName).catch(() => {});

      _job.status = 'done';
      _progress(100, '✅ Firmware ready!');
      return _job.uf2Buffer;

    } catch (err) {
      _job.status = 'failed';
      _job.error  = err.message;
      _clearPollTimer();
      if (_job.branchName) _deleteBranch(_job.branchName).catch(() => {});
      throw err;
    }
  }

  async function flashBase(onProgress) {
    const cb = onProgress || (() => {});
    cb(10, 'Loading base firmware…');
    const response = await fetch('./assets/prebuilt/base.uf2');
    if (!response.ok) throw new Error('base.uf2 not found in assets/prebuilt/');
    cb(50, 'Base firmware loaded…');
    const buffer = await response.arrayBuffer();
    cb(100, '✅ Base firmware ready!');
    return buffer;
  }

  async function writeToDevice(uf2Buffer) {
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

  function cancel() {
    _clearPollTimer();
    if (_job.branchName) _deleteBranch(_job.branchName).catch(() => {});
    _resetJob();
  }

  function getJob() { return { ..._job }; }

  // ════════════════════════════════════════
  //  GITHUB API HELPERS
  // ════════════════════════════════════════

  function _headers() {
    return {
      'Accept':               'application/vnd.github+json',
      'Content-Type':         'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  function _apiUrl(path) {
    return `${_config.workerUrl}/repos/${_config.owner}/${_config.repo}${path}`;
  }

  async function _apiGet(path) {
    const res = await fetch(_apiUrl(path), { headers: _headers() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`GitHub API ${path}: ${res.status} ${body.message || res.statusText}`);
    }
    return res.json();
  }

  async function _apiPost(path, body) {
    const res = await fetch(_apiUrl(path), {
      method: 'POST', headers: _headers(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub API POST ${path}: ${res.status} ${err.message || res.statusText}`);
    }
    return res.json();
  }

  async function _apiPut(path, body) {
    const res = await fetch(_apiUrl(path), {
      method: 'PUT', headers: _headers(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub API PUT ${path}: ${res.status} ${err.message || res.statusText}`);
    }
    return res.json();
  }

  async function _apiDelete(path) {
    const res = await fetch(_apiUrl(path), { method: 'DELETE', headers: _headers() });
    return res.ok;
  }

  async function _getBaseSHA() {
    const data = await _apiGet(`/git/ref/heads/${_config.branch}`);
    return data.object.sha;
  }

  async function _createBranch(branchName) {
    const sha = await _getBaseSHA();
    await _apiPost('/git/refs', { ref: `refs/heads/${branchName}`, sha });
  }

  async function _getFileSHA(branchName) {
    try {
      const data = await _apiGet(`/contents/${_config.keymapPath}?ref=${branchName}`);
      return data.sha;
    } catch (e) { return null; }
  }

  async function _pushKeymap(branchName, content) {
    const fileSHA = await _getFileSHA(branchName);
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const body = {
      message: `sPadStudio build ${new Date().toISOString()}`,
      content: encoded,
      branch:  branchName,
    };
    if (fileSHA) body.sha = fileSHA;
    await _apiPut(`/contents/${_config.keymapPath}`, body);
  }

  async function _waitForRun(branchName, timeoutMs = 90000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await _sleep(4000);
      const data = await _apiGet(
        `/actions/runs?branch=${encodeURIComponent(branchName)}&per_page=5`
      );
      if (data.workflow_runs && data.workflow_runs.length > 0) {
        const run = data.workflow_runs[0];
        console.log('[GitHubFlash] Run found:', run.id, run.status);
        return run.id;
      }
    }
    throw new Error('Build did not start within 60 seconds. Check GitHub Actions.');
  }

  async function _pollUntilDone(runId, timeoutMs = 600000) {
    const start = Date.now();
    const POLL_INTERVAL = 12000;
    const buildMessages = [
      'Initializing ZMK build environment…',
      'Installing Zephyr SDK…',
      'Running west update…',
      'Compiling firmware (this takes a few minutes)…',
      'Linking…',
      'Build almost done…',
    ];
    let msgIndex = 0;

    while (Date.now() - start < timeoutMs) {
      await _sleep(POLL_INTERVAL);
      const run = await _apiGet(`/actions/runs/${runId}`);
      const elapsed = Date.now() - start;
      const pct = Math.min(35 + Math.floor((elapsed / timeoutMs) * 50), 85);
      const msg = buildMessages[Math.min(msgIndex++, buildMessages.length - 1)];
      _progress(pct, msg);
      console.log(`[GitHubFlash] Run ${runId}: ${run.status} / ${run.conclusion}`);
      if (run.status === 'completed') {
        if (run.conclusion === 'success') return true;
        throw new Error(`Build failed (${run.conclusion}). Check Actions tab in your GitHub repo.`);
      }
    }
    throw new Error('Build timed out after 10 minutes.');
  }

  // ── Worker downloads ZIP, unzips it, returns raw .uf2 bytes ──
  async function _downloadArtifact(runId) {
    const data = await _apiGet(`/actions/runs/${runId}/artifacts`);
    if (!data.artifacts || data.artifacts.length === 0) {
      throw new Error('No artifacts found. Build may have failed.');
    }

    const artifact = data.artifacts.find(a =>
      a.name === 'firmware' || a.name.includes('zmk') || a.name.includes('firmware')
    ) || data.artifacts[0];

    console.log('[GitHubFlash] Artifact found:', artifact.name, artifact.id);

    // Worker handles download + unzip — browser receives raw .uf2
    const uf2Res = await fetch(
      `${_config.workerUrl}/repos/${_config.owner}/${_config.repo}/actions/artifacts/${artifact.id}/zip`,
      { headers: _headers() }
    );

    if (!uf2Res.ok) {
      const err = await uf2Res.json().catch(() => ({}));
      throw new Error(`Firmware download failed: ${uf2Res.status} ${err.error || ''}`);
    }

    const uf2Buffer = await uf2Res.arrayBuffer();
    console.log('[GitHubFlash] UF2 size:', uf2Buffer.byteLength, 'bytes');

    if (uf2Buffer.byteLength < 512) {
      throw new Error('UF2 too small — Worker extraction may have failed.');
    }

    return uf2Buffer;
  }

  async function _deleteBranch(branchName) {
    return _apiDelete(`/git/refs/heads/${branchName}`);
  }

  async function verifyToken() {
    try {
      const res = await fetch(`${_config.workerUrl}/user`, { headers: _headers() });
      if (!res.ok) throw new Error('Worker not reachable');
      const user = await res.json();
      await _apiGet('');
      return { valid: true, username: user.login, avatar: user.avatar_url };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  function _progress(pct, message) {
    _job.status = pct < 100 ? 'building' : 'done';
    console.log(`[GitHubFlash] ${pct}% — ${message}`);
    if (_progressCallback) _progressCallback(pct, message);
  }

  function _sleep(ms) {
    return new Promise(resolve => { _pollTimer = setTimeout(resolve, ms); });
  }

  function _clearPollTimer() {
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  }

  function _resetJob() {
    _clearPollTimer();
    _job = { branchName: null, runId: null, status: 'idle', uf2Buffer: null, error: null };
  }

  return {
    configure,
    getConfig,
    isConfigured,
    buildAndFlash,
    flashBase,
    writeToDevice,
    verifyToken,
    cancel,
    getJob,
  };

})();