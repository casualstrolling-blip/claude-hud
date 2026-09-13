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
    rest: '/cat-rest.mp4?v=20260913-cat2',
    walk: '/cat-walk.mp4?v=20260913-cat2',
    'walk-sit': '/cat-walk-sit.mp4?v=20260913-cat2'
  };
  let catTimer = null, catToken = 0;
  let catRunning = false, lastScene = null, lastSide = 'left';
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  const active = () => !document.hidden && screenOn;
  const randomBetween = (low, high) => low + Math.floor(Math.random() * (high - low + 1));
  const restDuration = initial => (initial ? randomBetween(20, 80) : Math.random() < .28 ? randomBetween(240, 300) : randomBetween(45, 180)) * 1000;
  function queueCat(next, delay) { clearTimeout(catTimer); catTimer = setTimeout(next, delay); }
  function restCat(side, pose = 'sit', initial = false) {
    if (!catRunning || !active()) return;
    clearTimeout(catTimer);
    const ticket = ++catToken, source = catAssets[pose];
    lastSide = side;
    catOverlay.classList.add('changing');
    const ready = () => {
      if (ticket !== catToken || !catRunning || !active()) return;
      catMotion.pause(); catMotion.removeAttribute('src'); catMotion.load();
      catOverlay.dataset.phase = pose;
      catOverlay.dataset.side = side;
      requestAnimationFrame(() => { if (ticket === catToken) catOverlay.classList.remove('changing'); });
      queueCat(nextEvent, restDuration(initial));
    };
    if (catStill.getAttribute('src') === source && catStill.complete && catStill.naturalWidth) setTimeout(ready, 160);
    else {
      catStill.onload = () => setTimeout(ready, 160);
      catStill.onerror = () => { if (ticket === catToken) { catOverlay.dataset.phase = 'off'; queueCat(nextEvent, 60000); } };
      catStill.src = source;
    }
  }
  function playCat(scene, side) {
    if (!catRunning || !active()) return;
    const ticket = ++catToken, pose = scene === 'rest' ? 'lie' : 'sit';
    const phase = scene === 'rest' ? 'rest-motion' : 'walk';
    catOverlay.classList.add('changing');
    catMotion.pause();
    catMotion.oncanplay = () => {
      if (ticket !== catToken || !catRunning || !active()) return;
      catMotion.oncanplay = null;
      catOverlay.dataset.phase = phase;
      catOverlay.dataset.side = side;
      requestAnimationFrame(() => { if (ticket === catToken) catOverlay.classList.remove('changing'); });
      catMotion.play().catch(() => { if (ticket === catToken) restCat(side, 'sit'); });
      queueCat(() => restCat(side, pose), 15000);
    };
    catMotion.onended = () => { if (ticket === catToken) restCat(side, pose); };
    catMotion.onerror = () => { if (ticket === catToken) restCat(side, 'sit'); };
    catMotion.src = catAssets[scene];
    catMotion.load();
  }
  function nextEvent() {
    if (!catRunning || !active()) return;
    const choices = ['rest', 'walk', 'walk-sit'].filter(scene => scene !== lastScene);
    const scene = choices[randomBetween(0, choices.length - 1)];
    lastScene = scene;
    const side = Math.random() < .6 ? (lastSide === 'left' ? 'right' : 'left') : lastSide;
    playCat(scene, side);
  }
  function startCat() {
    if (catRunning || !active()) return;
    catRunning = true;
    restCat(Math.random() < .5 ? 'left' : 'right', 'sit', true);
  }
  function stopCat() {
    catRunning = false; ++catToken;
    clearTimeout(catTimer); catTimer = null;
    catMotion.pause(); catMotion.removeAttribute('src'); catMotion.load();
    catStill.removeAttribute('src');
    catOverlay.dataset.phase = 'off';
    catOverlay.classList.remove('changing');
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
