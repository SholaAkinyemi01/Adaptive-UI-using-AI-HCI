// Adaptive UI Demo script
(function() {
  const LS_KEYS = {
    CONSENT: 'adaptive_ui_consent',
    USER_MODEL: 'adaptive_ui_user_model',
    BANDIT: 'adaptive_ui_bandit_state'
  };

  const defaultModel = {
    fontSize: 'base',
    contrast: 'light',
    density: 'cozy',
    assistance: 'off',        // 'off' | 'on'
    layoutVariant: 'A',       // chosen by bandit
    hesitations: 0,           // heuristic signal
    lastUpdated: new Date().toISOString()
  };

  // Simple epsilon-greedy bandit for two arms A vs B
  const bandit = {
    epsilon: 0.2,
    arms: ['A', 'B'],
    state: { // rewards are clicks on primary CTAs
      counts: { A: 0, B: 0 },
      rewards: { A: 0, B: 0 }
    },
    selectArm() {
      // explore
      if (Math.random() < this.epsilon) {
        return this.arms[Math.floor(Math.random() * this.arms.length)];
      }
      // exploit: pick arm with higher average reward
      const avg = arm => (this.state.counts[arm] ? (this.state.rewards[arm] / this.state.counts[arm]) : 0);
      return avg('A') >= avg('B') ? 'A' : 'B';
    },
    update(arm, reward) {
      this.state.counts[arm] += 1;
      this.state.rewards[arm] += reward;
      saveBandit(this.state);
    }
  };

  // ---------- Persistence helpers ----------
  function loadConsent() {
    return localStorage.getItem(LS_KEYS.CONSENT);
  }
  function saveConsent(val) {
    localStorage.setItem(LS_KEYS.CONSENT, val);
  }
  function loadModel() {
    const raw = localStorage.getItem(LS_KEYS.USER_MODEL);
    return raw ? JSON.parse(raw) : { ...defaultModel };
  }
  function saveModel(model) {
    model.lastUpdated = new Date().toISOString();
    localStorage.setItem(LS_KEYS.USER_MODEL, JSON.stringify(model));
  }
  function loadBandit() {
    const raw = localStorage.getItem(LS_KEYS.BANDIT);
    return raw ? JSON.parse(raw) : { counts: {A:0,B:0}, rewards: {A:0,B:0} };
  }
  function saveBandit(state) {
    localStorage.setItem(LS_KEYS.BANDIT, JSON.stringify(state));
  }

  // ---------- UI bindings ----------
  const el = (id) => document.getElementById(id);

  const fontSizeSel = el('fontSize');
  const contrastSel = el('contrast');
  const densitySel = el('density');
  const savePrefsBtn = el('savePrefs');
  const resetBtn = el('resetAll');
  const layoutA = el('layoutA');
  const layoutB = el('layoutB');
  const layoutBadge = el('layoutBadge');
  const helpToggle = el('helpToggle');
  const helpPanel = el('helpPanel');
  const explanations = el('explanations');
  const consentBanner = el('consentBanner');
  const consentAllow = el('consentAllow');
  const consentDeny = el('consentDeny');

  // Load persisted state
  bandit.state = loadBandit();
  let model = loadModel();

  // Consent banner
  if (!loadConsent()) {
    consentBanner.classList.remove('hidden');
  }
  consentAllow?.addEventListener('click', () => { saveConsent('allow'); consentBanner.classList.add('hidden'); pushExplanation('Consent granted: personalization enabled.'); });
  consentDeny?.addEventListener('click', () => { saveConsent('deny'); consentBanner.classList.add('hidden'); pushExplanation('Consent denied: only session defaults applied.'); });

  // Initialize controls from model
  fontSizeSel.value = model.fontSize;
  contrastSel.value = model.contrast;
  densitySel.value = model.density;

  // Apply visual prefs
  function applyPrefs() {
    document.documentElement.classList.remove('text-base', 'text-lg', 'text-xl');
    document.documentElement.classList.add(`text-${model.fontSize}`);

    // Contrast
    document.documentElement.classList.remove('dark');
    document.body.style.filter = '';
    if (model.contrast === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('bg-gray-900','text-gray-100');
    } else {
      document.body.classList.remove('bg-gray-900','text-gray-100');
      if (model.contrast === 'high') {
        document.body.style.filter = 'contrast(1.2)';
      }
    }

    // Density via base line-height and spacing
    const densities = {
      compact: { ls: 'leading-tight', pad: 'p-2' },
      cozy: { ls: 'leading-normal', pad: 'p-4' },
      comfortable: { ls: 'leading-relaxed', pad: 'p-6' }
    };
    // (Simple demo: we just update the body dataset and cards read it via JS if needed)
    document.body.dataset.density = model.density;
  }

  // Layout selection via bandit
  function chooseLayout() {
    const chosen = bandit.selectArm();
    model.layoutVariant = chosen;
    if (chosen === 'A') {
      layoutA.classList.remove('hidden');
      layoutB.classList.add('hidden');
    } else {
      layoutB.classList.remove('hidden');
      layoutA.classList.add('hidden');
    }
    layoutBadge.textContent = `Layout ${chosen} (ε-greedy)`;
    pushExplanation(`Chose layout ${chosen} based on previous click success.`);
  }

  // Save button
  savePrefsBtn.addEventListener('click', () => {
    model.fontSize = fontSizeSel.value;
    model.contrast = contrastSel.value;
    model.density = densitySel.value;
    saveModel(model);
    applyPrefs();
    pushExplanation('Applied your preferences (font, contrast, density).');
  });

  // Reset
  resetBtn.addEventListener('click', () => {
    localStorage.removeItem(LS_KEYS.USER_MODEL);
    localStorage.removeItem(LS_KEYS.BANDIT);
    localStorage.removeItem(LS_KEYS.CONSENT);
    bandit.state = { counts: {A:0,B:0}, rewards: {A:0,B:0} };
    model = { ...defaultModel };
    fontSizeSel.value = model.fontSize;
    contrastSel.value = model.contrast;
    densitySel.value = model.density;
    applyPrefs();
    chooseLayout();
    pushExplanation('All data cleared. Using defaults.');
    consentBanner.classList.remove('hidden');
  });

  // Help panel
  helpToggle.addEventListener('click', () => {
    helpPanel.classList.toggle('hidden');
    model.assistance = helpPanel.classList.contains('hidden') ? 'off' : 'on';
    saveModel(model);
    pushExplanation(`Guided mode ${model.assistance === 'on' ? 'enabled' : 'disabled'}.`);
  });

  // Hesitation heuristic: if user hovers labels for long
  let hoverTimer = null;
  document.body.addEventListener('mouseover', (e) => {
    if (e.target.tagName === 'LABEL' || e.target.closest('label')) {
      hoverTimer = setTimeout(() => {
        model.hesitations += 1;
        if (model.hesitations >= 2 && model.assistance === 'off') {
          helpPanel.classList.remove('hidden');
          model.assistance = 'on';
          pushExplanation('We detected possible hesitation—enabled Guided Mode.');
        }
        saveModel(model);
      }, 1200);
    }
  });
  document.body.addEventListener('mouseout', (e) => {
    if (hoverTimer) clearTimeout(hoverTimer);
  });

  // Reward events: primary CTA clicks
  function registerCta(container) {
    container.querySelectorAll('.primaryCta').forEach(btn => {
      btn.addEventListener('click', () => {
        // reward = 1 for success
        bandit.update(model.layoutVariant, 1);
        pushExplanation(`Recorded a successful click for layout ${model.layoutVariant}.`);
      });
    });
  }
  registerCta(layoutA);
  registerCta(layoutB);

  function pushExplanation(msg) {
    const p = document.createElement('p');
    const ts = new Date().toLocaleTimeString();
    p.textContent = `[${ts}] ${msg}`;
    explanations.prepend(p);
  }

  // Initial render
  applyPrefs();
  chooseLayout();
})();
