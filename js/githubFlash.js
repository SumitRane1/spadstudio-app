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

    // Validate base.uf2 magic bytes before returning
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x0A324655 || view.getUint32(4, true) !== 0x9E5D5157) {
      throw new Error('base.uf2 is not a valid UF2 file — file may be corrupt.');
    }

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


  // FIX: Always fetch SHA from main (stable), not the newly created build branch.
  // Querying the fresh branch immediately after creation returns a stale/mismatched
  // SHA due to GitHub's internal propagation delay → causes 409 Conflict on PUT.
  async function _getFileSHA(branchName) {
    try {
      const data = await _apiGet(`/contents/${_config.keymapPath}?ref=${_config.branch}`);
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
    throw new Error('Build did not start within 90 seconds. Check GitHub Actions.');
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


  // ── Download ZIP → extract .uf2 via Central Directory → decompress → validate ──
  async function _downloadArtifact(runId) {
    const data = await _apiGet(`/actions/runs/${runId}/artifacts`);
    if (!data.artifacts || data.artifacts.length === 0) {
      throw new Error('No artifacts found. Build may have failed.');
    }

    console.log('[GitHubFlash] All artifacts:', data.artifacts.map(a => `${a.name}(${a.id})`).join(', '));

    // Prefer firmware-stored (uncompressed repack) → fallback to firmware
    const artifact =
      data.artifacts.find(a => a.name === 'firmware-stored') ||
      data.artifacts.find(a => a.name === 'firmware')        ||
      data.artifacts[0];

    console.log('[GitHubFlash] Using artifact:', artifact.name, artifact.id);

    const uf2Res = await fetch(
      `${_config.workerUrl}/repos/${_config.owner}/${_config.repo}/actions/artifacts/${artifact.id}/zip`,
      { headers: _headers() }
    );

    if (!uf2Res.ok) {
      const err = await uf2Res.json().catch(() => ({}));
      throw new Error(`Firmware download failed: ${uf2Res.status} ${err.error || ''}`);
    }

    const zipBytes = new Uint8Array(await uf2Res.arrayBuffer());
    console.log('[GitHubFlash] ZIP downloaded, size:', zipBytes.length, 'bytes');

    // Extract .uf2 using Central Directory (reliable — handles streamed ZIPs with compSize=0 in local headers)
    const uf2Bytes = await _extractUf2FromZip(zipBytes);
    console.log('[GitHubFlash] UF2 extracted, size:', uf2Bytes.length, 'bytes');

    if (uf2Bytes.length < 512) {
      throw new Error('UF2 too small — extraction failed.');
    }

    // Validate UF2 magic bytes: "UF2\n" (0x0A324655) + 0x9E5D5157
    const dv = new DataView(uf2Bytes.buffer);
    if (dv.getUint32(0, true) !== 0x0A324655 || dv.getUint32(4, true) !== 0x9E5D5157) {
      throw new Error('Invalid UF2 magic bytes — extracted file is not valid firmware.');
    }

    console.log('[GitHubFlash] UF2 magic valid ✓');
    return uf2Bytes.buffer; // ArrayBuffer for writeToDevice
  }


  // ── ZIP extractor using Central Directory ──
  // Parses from the END of the ZIP (Central Directory) for reliable compSize/offset values.
  // GitHub Actions ZIPs use streaming mode where local file headers have compSize=0,
  // making forward-walking parsers fail. The Central Directory always has correct values.
  async function _extractUf2FromZip(zipBytes) {
    const view = new DataView(zipBytes.buffer);
    const len  = zipBytes.length;

    // ── Step 1: Find End of Central Directory (EOCD) record ──
    // Signature: PK\x05\x06 = 0x06054b50, scan backwards from end of file
    let eocdOffset = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65558); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) throw new Error('ZIP: End of Central Directory record not found.');

    const cdCount  = view.getUint16(eocdOffset + 8,  true); // total entries
    const cdOffset = view.getUint32(eocdOffset + 16, true); // offset of central directory
    console.log(`[GitHubFlash] ZIP EOCD found at ${eocdOffset} | entries: ${cdCount} | CD offset: ${cdOffset}`);

    // ── Step 2: Walk Central Directory entries ──
    let cdPos = cdOffset;
    for (let i = 0; i < cdCount; i++) {
      if (view.getUint32(cdPos, true) !== 0x02014b50) {
        throw new Error(`ZIP: Expected Central Directory signature at offset ${cdPos}, got 0x${view.getUint32(cdPos, true).toString(16)}`);
      }

      const compression  = view.getUint16(cdPos + 10, true); // 0=stored, 8=deflate
      const compSize     = view.getUint32(cdPos + 20, true); // compressed size (always correct here)
      const uncompSize   = view.getUint32(cdPos + 24, true); // uncompressed size
      const fileNameLen  = view.getUint16(cdPos + 28, true);
      const extraLen     = view.getUint16(cdPos + 30, true);
      const commentLen   = view.getUint16(cdPos + 32, true);
      const localOffset  = view.getUint32(cdPos + 42, true); // offset of local file header

      const fileName = new TextDecoder().decode(
        zipBytes.slice(cdPos + 46, cdPos + 46 + fileNameLen)
      );
      console.log(`[GitHubFlash] Entry ${i}: "${fileName}" | method:${compression} | comp:${compSize} | uncomp:${uncompSize} | localOffset:${localOffset}`);

      if (fileName.endsWith('.uf2')) {
        // ── Step 3: Use local file header only for dataStart offset ──
        // (local header has correct fileNameLen/extraLen even if compSize=0 there)
        if (view.getUint32(localOffset, true) !== 0x04034b50) {
          throw new Error(`ZIP: Invalid local file header signature at offset ${localOffset}`);
        }
        const localFileNameLen = view.getUint16(localOffset + 26, true);
        const localExtraLen    = view.getUint16(localOffset + 28, true);
        const dataStart        = localOffset + 30 + localFileNameLen + localExtraLen;

        console.log(`[GitHubFlash] UF2 data at offset ${dataStart}, reading ${compSize} bytes`);

        // Use compSize from Central Directory (reliable), not local header
        const compData = zipBytes.slice(dataStart, dataStart + compSize);

        if (compression === 0) {
          // Stored — no compression, raw bytes
          console.log('[GitHubFlash] UF2 stored uncompressed, size:', compData.length);
          return compData;
        }

        if (compression === 8) {
          // Deflate — decompress with browser's built-in DecompressionStream
          console.log('[GitHubFlash] UF2 Deflate-compressed, decompressing…');
          const ds     = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();

          writer.write(compData);
          writer.close();

          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }

          const totalLen = chunks.reduce((n, c) => n + c.length, 0);
          const result   = new Uint8Array(totalLen);
          let pos = 0;
          for (const chunk of chunks) { result.set(chunk, pos); pos += chunk.length; }

          console.log('[GitHubFlash] Decompressed UF2 size:', result.length, 'bytes');
          return result;
        }

        throw new Error(`ZIP: Unsupported compression method ${compression} — expected 0 (stored) or 8 (deflate).`);
      }

      // Advance to next Central Directory entry
      cdPos += 46 + fileNameLen + extraLen + commentLen;
    }

    throw new Error('No .uf2 file found inside the ZIP artifact. Check the GitHub Actions build output.');
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