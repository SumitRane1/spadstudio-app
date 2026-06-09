// ═══ WEBUSB FLASH — Direct UF2 flashing over WebUSB ═══
// Supports: nice!nano (Adafruit nRF52840 UF2 bootloader)
// Flow: request device → open → send UF2 blocks (64 bytes each) → device reboots


const WebUSBFlash = (() => {

  // ── Adafruit nRF52840 UF2 bootloader IDs ──
  const ADAFRUIT_VID  = 0x239A;
  const NRF52_PIDS    = [0x0029, 0x002A, 0x0022]; // nice!nano v1, v2, generic nRF52840

  // UF2 block size is always 512 bytes
  const UF2_BLOCK_SIZE = 512;

  // Adafruit UF2 bootloader uses a single USB endpoint for flashing
  const FLASH_ENDPOINT = 0x01; // OUT endpoint

  let _device = null;


  // ════════════════════════════════════════
  //  PUBLIC: REQUEST + CONNECT DEVICE
  // ════════════════════════════════════════

  async function connect() {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB not supported. Use Chrome or Edge.');
    }

    // Show browser device picker — must be called from a user gesture
    _device = await navigator.usb.requestDevice({
      filters: [
        { vendorId: ADAFRUIT_VID },                     // any Adafruit device
        { vendorId: 0x2341 },                           // Arduino (some nice!nano clones)
        { vendorId: 0x1915 },                           // Nordic Semiconductor
      ]
    });

    console.log('[WebUSB] Device selected:', _device.productName, `(${_device.vendorId.toString(16)}:${_device.productId.toString(16)})`);
    return _device.productName || 'USB Device';
  }


  // ════════════════════════════════════════
  //  PUBLIC: FLASH UF2 BUFFER TO DEVICE
  // ════════════════════════════════════════

  async function flash(uf2Buffer, onProgress) {
    const cb = onProgress || (() => {});

    if (!('usb' in navigator)) {
      throw new Error('WebUSB not supported. Use Chrome or Edge.');
    }

    // ── Step 1: Get device (request picker if not already connected) ──
    if (!_device) {
      cb(5, 'Select your nice!nano from the popup…');
      await connect();
    }

    cb(10, 'Connecting to device…');

    // ── Step 2: Open device ──
    await _device.open();

    // Select configuration #1
    if (_device.configuration === null) {
      await _device.selectConfiguration(1);
    }

    // Claim interface 0 (UF2 bootloader DFU interface)
    await _device.claimInterface(0);

    cb(15, 'Connected! Writing firmware…');

    // ── Step 3: Parse + send UF2 blocks ──
    const bytes      = new Uint8Array(uf2Buffer);
    const totalBlocks = Math.floor(bytes.length / UF2_BLOCK_SIZE);

    if (totalBlocks === 0) {
      throw new Error('UF2 buffer is empty or invalid.');
    }

    console.log(`[WebUSB] Flashing ${totalBlocks} UF2 blocks (${bytes.length} bytes)…`);

    for (let i = 0; i < totalBlocks; i++) {
      const block = bytes.slice(i * UF2_BLOCK_SIZE, (i + 1) * UF2_BLOCK_SIZE);

      // Validate UF2 block magic bytes
      const blockView = new DataView(block.buffer, block.byteOffset);
      if (blockView.getUint32(0, true) !== 0x0A324655 || blockView.getUint32(4, true) !== 0x9E5D5157) {
        throw new Error(`Invalid UF2 block at index ${i} — firmware may be corrupt.`);
      }

      // Send block to device
      const result = await _device.transferOut(FLASH_ENDPOINT, block);
      if (result.status !== 'ok') {
        throw new Error(`USB transfer failed at block ${i}: ${result.status}`);
      }

      // Report progress (15% → 98%)
      const pct = 15 + Math.floor((i / totalBlocks) * 83);
      if (i % 10 === 0 || i === totalBlocks - 1) {
        cb(pct, `Writing… ${i + 1}/${totalBlocks} blocks`);
      }
    }

    cb(99, 'Finalizing…');

    // ── Step 4: Release + close ──
    try {
      await _device.releaseInterface(0);
      await _device.close();
    } catch (e) {
      // Device may have already rebooted — this is expected
      console.log('[WebUSB] Device closed (may have rebooted):', e.message);
    }

    _device = null;
    cb(100, '✅ Flash complete! Device is rebooting…');
    console.log('[WebUSB] Flash complete ✓');
  }


  // ════════════════════════════════════════
  //  PUBLIC: CHECK SUPPORT
  // ════════════════════════════════════════

  function isSupported() {
    return 'usb' in navigator;
  }


  // ════════════════════════════════════════
  //  PUBLIC: DISCONNECT
  // ════════════════════════════════════════

  async function disconnect() {
    if (_device) {
      try {
        await _device.releaseInterface(0).catch(() => {});
        await _device.close().catch(() => {});
      } catch (e) { /* ignore */ }
      _device = null;
    }
  }


  return { connect, flash, isSupported, disconnect };

})();