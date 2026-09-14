'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const providers = { chatgpt: { name: 'ChatGPT', index: '01', endpoint: '/api/usage' }, claude: { name: 'Claude', index: '02', endpoint: '/api/claude-usage' } };
  const readSetting = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const saveSetting = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  let selected = location.hash === '#claude' ? 'claude' : 'chatgpt';
  let live = readSetting('hud-live') === 'true';
  let screenOn = true, timer = null, controller = null, generation = 0, failures = 0;
  const cache = {};
  const catOverlay = $('cat-overlay');
  const catStill = $('cat-still'), catMotion = $('cat-motion');
  const catAssets = {
    sit: '/cat-sit.png?v=20260913-cat2',
    lie: '/cat-lie.png?v=20260913-cat2',
    rest: '/cat-rest.webp?v=20260913-cat3',
    walk: '/cat-walk.webp?v=20260913-cat3',
    'walk-sit': '/cat-walk-sit.webp?v=20260913-cat3'
  };
  let catTimer = null, catToken = 0;
  let catRunning = false, lastScene = null, catX = 0, facing = 'right', catPose = 'sit';
  const sceneBlobs = {};
  const stillImages = {};
  let motionUrl = null;
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  const active = () => !document.hidden && screenOn;
  const randomBetween = (low, high) => low + Math.floor(Math.random() * (high - low + 1));
  const restDuration = initial => (initial ? randomBetween(20, 80) : Math.random() < .28 ? randomBetween(240, 300) : randomBetween(45, 180)) * 1000;
  function queueCat(next, delay) { clearTimeout(catTimer); catTimer = setTimeout(next, delay); }
  function drawStill(pose, image) {
    const height = Math.min(innerHeight * .4725, 405);
    const drawnHeight = height * (pose === 'sit' ? .752 : .644);
    const drawnWidth = drawnHeight * image.naturalWidth / image.naturalHeight;
    const availableWidth = catOverlay.parentElement.clientWidth;
    const visibleLeft = Math.max(0, catX);
    const visibleRight = Math.min(availableWidth, catX + drawnWidth);
    const visibleWidth = Math.max(1, visibleRight - visibleLeft);
    const density = Math.min(devicePixelRatio || 1, 2.5);
    catStill.style.left = `${visibleLeft}px`;
    catStill.style.width = `${visibleWidth}px`;
    catStill.width = Math.round(visibleWidth * density);
    catStill.height = Math.round(drawnHeight * density);
    const context = catStill.getContext('2d');
    context.scale(density, density);
    if (facing === 'left') {
      context.translate(catX + drawnWidth - visibleLeft, 0);
      context.scale(-1, 1);
      context.drawImage(image, 0, height * .0185, drawnWidth, drawnHeight);
    } else context.drawImage(image, catX - visibleLeft, height * .0185, drawnWidth, drawnHeight);
    catStill.dataset.catX = String(catX);
    catPose = pose;
  }
  function showStill(pose = 'sit', initial = false, ticket = catToken) {
    if (ticket !== catToken || !catRunning || !active()) return;
    const source = catAssets[pose];
    const ready = () => {
      if (ticket !== catToken || !catRunning || !active()) return;
      drawStill(pose, stillImage);
      catOverlay.dataset.pose = pose;
      catOverlay.dataset.phase = 'still';
      // Keep the final motion frame visible until the still has faded in.
      setTimeout(() => {
        if (ticket !== catToken || catOverlay.dataset.phase !== 'still') return;
        catMotion.style.visibility = 'hidden';
        catMotion.removeAttribute('src');
        if (motionUrl) URL.revokeObjectURL(motionUrl);
        motionUrl = null;
        catMotion.remove();
      }, 500);
      queueCat(nextEvent, restDuration(initial));
    };
    if (!stillImages[source]) { stillImages[source] = new Image(); stillImages[source].src = source; }
    const stillImage = stillImages[source];
    if (stillImage.complete && stillImage.naturalWidth) ready();
    else {
      stillImage.addEventListener('load', ready, { once: true });
      stillImage.addEventListener('error', () => { if (ticket === catToken) queueCat(nextEvent, 60000); }, { once: true });
    }
  }
  function playCat(scene) {
    if (!catRunning || !active()) return;
    clearTimeout(catTimer);
    if (!catMotion.isConnected) catOverlay.append(catMotion);
    const ticket = ++catToken, walking = scene !== 'rest';
    const height = catMotion.getBoundingClientRect().height;
    const unit = height / 270;
    // The source footage moves about 119 pixels, so it needs no extra
    // element translation: the visible distance stays tied to the paws.
    const direction = walking
      ? catX > catOverlay.parentElement.clientWidth * .38 ? 'left' : catX < -catOverlay.parentElement.clientWidth * .12 ? 'right' : Math.random() < .5 ? 'right' : 'left'
      : facing;
    const startEdge = walking ? (direction === 'right' ? 0 : 272) : direction === 'right' ? 112 : 47;
    const endEdge = walking ? (direction === 'right' ? 118 : 153) : direction === 'right' ? 69 : 52;
    const baseX = catX - startEdge * unit;
    const finish = () => {
      if (ticket !== catToken) return;
      catX = baseX + endEdge * unit;
      facing = direction;
      showStill(walking ? 'sit' : 'lie', false, ticket);
    };
    catMotion.style.left = `${baseX}px`;
    catMotion.style.visibility = 'hidden';
    catMotion.style.transform = direction === 'left' ? 'scaleX(-1)' : 'none';
    catMotion.onerror = () => { if (ticket === catToken) showStill('sit', false, ticket); };
    catMotion.onload = () => {
      if (ticket !== catToken || !catRunning || !active()) return;
      catMotion.style.visibility = 'visible';
      catOverlay.dataset.phase = 'motion';
      queueCat(finish, 10000);
    };
    if (!sceneBlobs[scene]) sceneBlobs[scene] = fetch(catAssets[scene], { credentials: 'same-origin' }).then(response => {
      if (!response.ok) throw new Error('Cat animation unavailable');
      return response.blob();
    }).catch(error => { delete sceneBlobs[scene]; throw error; });
    sceneBlobs[scene].then(blob => {
      if (ticket !== catToken || !catRunning || !active()) return;
      motionUrl = URL.createObjectURL(blob);
      catMotion.src = motionUrl;
    }).catch(() => { if (ticket === catToken) showStill('sit', false, ticket); });
  }
  function nextEvent() {
    if (!catRunning || !active()) return;
    const choices = ['rest', 'walk', 'walk-sit'].filter(scene => scene !== lastScene);
    const scene = choices[randomBetween(0, choices.length - 1)];
    lastScene = scene;
    playCat(scene);
  }
  function startCat() {
    if (catRunning || !active()) return;
    catRunning = true;
    catMotion.remove();
    catX = Math.round(Math.random() * Math.max(0, catOverlay.parentElement.clientWidth - 216 * Math.min(innerHeight * .4725, 405) / 270));
    facing = 'right';
    showStill('sit', true);
  }
  function stopCat() {
    catRunning = false; ++catToken;
    clearTimeout(catTimer); catTimer = null;
    catMotion.style.visibility = 'hidden';
    catMotion.removeAttribute('src');
    if (motionUrl) URL.revokeObjectURL(motionUrl);
    motionUrl = null;
    catMotion.remove();
    catStill.getContext('2d').clearRect(0, 0, catStill.width, catStill.height);
    catOverlay.dataset.phase = 'off';
  }
  function resetTime(value) {
    if (value === null || value === undefined || value === '') return '—';
    const timestamp = typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) * 1000 : Date.parse(value);
    if (!Number.isFinite(timestamp)) return '—';
    const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60000));
    if (!minutes) return 'Due now';
    const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
    return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }
  function renderMetric(prefix, utilization, reset) {
    const valid = typeof utilization === 'number' && Number.isFinite(utilization) && utilization >= 0 && utilization <= 1;
    const used = valid ? Math.round(utilization * 100) : null;
    $(prefix + '-number').textContent = valid ? used : '—';
    $(prefix + '-fill').style.width = valid ? `${used}%` : '0%';
    const scale = $(prefix + '-scale');
    if (valid) scale.setAttribute('aria-valuenow', used); else scale.removeAttribute('aria-valuenow');
    scale.setAttribute('aria-valuetext', valid ? `${used}% used` : 'Usage unavailable');
    scale.closest('.metric').dataset.high = valid && used >= 90;
    $(prefix + '-state').textContent = valid ? (used >= 100 ? 'Limit reached' : used >= 90 ? 'Approaching limit' : `${100 - used}% available`) : 'Not reported';
    $(prefix + '-reset').textContent = valid ? resetTime(reset) : '—';
  }
  function render(data) { renderMetric('session', data?.sessionUtilization, data?.sessionReset); renderMetric('weekly', data?.weeklyUtilization, data?.weeklyReset); }
  function connection(text, state) { $('connection').textContent = text; $('connection').dataset.state = state; }
  function stop() { clearTimeout(timer); timer = null; generation++; if (controller) controller.abort(); controller = null; }
  async function poll() {
    if (!active()) return;
    const current = selected, ticket = generation, request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 12000);
    try {
      const response = await fetch(providers[current].endpoint, { cache: 'no-store', credentials: 'same-origin', signal: request.signal });
      const json = response.headers.get('content-type')?.includes('application/json');
      if (response.redirected || response.status === 401 || response.status === 403 || (response.ok && !json)) throw new Error('auth');
      if (!response.ok || !json) throw new Error('unavailable');
      const data = await response.json();
      if (!data || data.error || typeof data !== 'object') throw new Error('unavailable');
      if (ticket !== generation || current !== selected || !active()) return;
      cache[current] = { data, at: Date.now() }; failures = 0;
      render(data); $('hud').classList.remove('stale'); $('sign-in').hidden = true;
      const hasData = ['sessionUtilization', 'weeklyUtilization'].some(key => typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0 && data[key] <= 1);
      connection(hasData ? 'Connected' : 'No usage data', hasData ? 'ok' : 'error');
      $('updated').textContent = hasData ? `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Provider did not report usage';
    } catch (error) {
      if (ticket !== generation || !active()) return;
      failures++; $('hud').classList.add('stale');
      connection(error.message === 'auth' ? 'Sign-in needed' : 'Connection interrupted', 'error');
      $('sign-in').hidden = error.message !== 'auth';
      const last = cache[current];
      $('updated').textContent = last ? `Last known usage · ${new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Usage unavailable · retrying';
    } finally {
      clearTimeout(timeout);
      if (controller === request) controller = null;
      if (ticket === generation && active()) timer = setTimeout(poll, failures ? Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4)) : live ? 1000 : 15000);
    }
  }
  function resume() { stop(); if (active()) { startCat(); poll(); } }
  function choose(provider) {
    if (!providers[provider]) return;
    stop(); selected = provider; failures = 0;
    document.body.dataset.provider = provider;
    $('provider-name').replaceChildren(document.createTextNode(providers[provider].name));
    const index = document.createElement('span'); index.className = 'provider-index'; index.setAttribute('aria-hidden', 'true'); index.textContent = ` / ${providers[provider].index}`; $('provider-name').append(index);
    document.querySelectorAll('[data-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.select === provider)));
    history.replaceState(null, '', location.pathname + '#' + provider);
    $('sign-in').href = location.pathname + '#' + provider;
    const previous = cache[provider]; render(previous?.data);
    $('hud').classList.toggle('stale', Boolean(previous)); $('sign-in').hidden = true;
    $('updated').textContent = previous ? 'Last known usage · refreshing…' : 'Fetching your usage…';
    connection(active() ? 'Connecting' : 'Paused', '');
    if (active()) poll();
  }
  function modeLabel() { $('mode-label').textContent = live ? 'Live · 1s' : 'Eco · 15s'; $('mode').setAttribute('aria-pressed', String(live)); }
  $('mode').onclick = () => { live = !live; saveSetting('hud-live', String(live)); modeLabel(); resume(); };
  function setDim(dim) { document.body.classList.toggle('dim', dim); $('dim').setAttribute('aria-pressed', String(dim)); saveSetting('hud-dim', String(dim)); }
  $('dim').onclick = () => setDim(!document.body.classList.contains('dim'));
  document.querySelectorAll('[data-select]').forEach(button => button.onclick = () => { if (selected !== button.dataset.select) choose(button.dataset.select); });
  window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (next !== selected && providers[next]) choose(next); });
  window.addEventListener('resize', () => {
    if (catRunning && catOverlay.dataset.phase === 'still') {
      const image = stillImages[catAssets[catPose]];
      if (image?.naturalWidth) drawStill(catPose, image);
    }
  });
  document.addEventListener('visibilitychange', () => { if (active()) resume(); else { stop(); stopCat(); connection('Paused', ''); } });
  window.addEventListener('pagehide', () => { stop(); stopCat(); });
  window.addEventListener('pageshow', event => { if (event.persisted) resume(); });
  // Fully Kiosk can report display power changes that do not hide its WebView.
  window.hudScreenOn = () => { screenOn = true; resume(); };
  window.hudScreenOff = () => { screenOn = false; stop(); stopCat(); connection('Paused', ''); };
  try { if (window.fully?.bind) { window.fully.bind('screenOn', 'hudScreenOn()'); window.fully.bind('screenOff', 'hudScreenOff()'); } } catch {}
  $('date').textContent = new Date().toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
  setDim(readSetting('hud-dim') === 'true'); modeLabel(); choose(selected); startCat();
})();
