// ═══ ROUTER — Section navigation ═══

const Router = (() => {

  const steps = ['profiles', 'editor', 'review', 'flash', 'live-edit'];
  let _current  = 'profiles';
  let _previous = 'profiles';  // for Device page back button

  // Steps that don't require a profile to be selected first
  // (Live Edit talks directly to the device over USB — independent of
  // the offline profile/compile config).
  const STEPS_WITHOUT_PROFILE_REQUIREMENT = ['profiles', 'live-edit'];

  function goTo(sectionId) {
    const isStep = steps.includes(sectionId);

    // Hide all step sections
    steps.forEach(id => {
      const el = document.getElementById('section-' + id);
      if (el) el.classList.remove('active');
    });

    // Hide device page
    const devicePage = document.getElementById('section-device');
    if (devicePage) devicePage.classList.remove('active');

    if (isStep) {
      // Show step section
      const target = document.getElementById('section-' + sectionId);
      if (target) target.classList.add('active');

      // Update step nav
      _updateStepNav(sectionId);

      // Deactivate device button
      document.getElementById('btn-device')?.classList.remove('active');

      // Trigger renders
      if (sectionId === 'editor')    { Editor.render(); Encoder.render(); Layers.render(); }
      if (sectionId === 'review')      Review.render();
      if (sectionId === 'flash')       Flash.render();
      if (sectionId === 'live-edit')   EditMacros.render();

      _previous = _current;
      _current  = sectionId;

    } else if (sectionId === 'device') {
      // Show device page
      if (devicePage) devicePage.classList.add('active');
      document.getElementById('btn-device')?.classList.add('active');
      _updateStepNav(null);
      Device.render();
      _previous = _current;
      _current  = 'device';
    }
  }

  function back() {
    const dest = _previous !== 'device' ? _previous : 'profiles';
    goTo(dest);
  }

  function getCurrent()  { return _current; }
  function getPrevious() { return _previous; }

  function _updateStepNav(activeStep) {
    steps.forEach((id, i) => {
      const btn = document.querySelector(`.step-btn[data-step="${id}"]`);
      if (!btn) return;
      btn.classList.remove('active', 'done');
      const numEl = btn.querySelector('.step-num');

      if (id === activeStep) {
        btn.classList.add('active');
        if (numEl) numEl.textContent = i + 1;
      } else if (activeStep && steps.indexOf(activeStep) > i) {
        btn.classList.add('done');
        if (numEl) numEl.textContent = '✓';
      } else {
        if (numEl) numEl.textContent = i + 1;
      }
    });
  }

  function init() {
    // Step nav buttons
    document.querySelectorAll('.step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = btn.dataset.step;
        if (!STEPS_WITHOUT_PROFILE_REQUIREMENT.includes(step) && !State.get().profileId) {
          App.showToast('Please select a profile first', 'warning');
          return;
        }
        goTo(step);
      });
    });

    // Device button in header
    document.getElementById('btn-device')?.addEventListener('click', () => {
      if (_current === 'device') {
        // Toggle back
        back();
      } else {
        goTo('device');
      }
    });
  }

  return { init, goTo, back, getCurrent, getPrevious };
})();
