/*
 * pointer-effects.js
 * -------------------
 * Lightweight click + press-and-drag pointer effects, plus custom-cursor state
 * toggling, for the homepage.
 *
 * - Click on a non-interactive area  -> ripple + sparkle-dot burst + 1-3 music symbols.
 * - Press and drag                   -> a smooth, distance-throttled trail of dots,
 *                                        with music symbols mixed in occasionally.
 * - Release / leave / cancel         -> trail stops immediately.
 * - Pointer pressed                  -> <html> gets `.pfx-pressing` so CSS can show
 *                                        the "pressed paw" cursor.
 *
 * Everything is drawn into a single fixed, pointer-events:none overlay layer so it
 * never blocks links, buttons, scrolling, text selection or any interaction. Each
 * element is a DOM node animated purely with CSS and removed on `animationend`, so
 * nothing accumulates in the DOM over time.
 *
 * ---- How to tune (all knobs live in CONFIG below) ----
 *   colors            : palette for dots / ripples / symbols (matches the site teal).
 *   musicSymbols      : glyphs mixed into the effects. Repeat a glyph to make it
 *                       more likely; remove one to drop it.
 *   clickParticles    : number of sparkle dots per click.
 *   clickSymbolsMin/Max: min/max music symbols per click (kept small to avoid clutter).
 *   trailSymbolChance : probability (0-1) a trail step also emits a music symbol.
 *   clickSpread       : how far the click dots fly (px).
 *   symbolMinSize/MaxSize : music-symbol font-size range (px).
 *   particleDuration / rippleDuration / symbolDuration : element lifetimes (ms;
 *                       keep in sync with the CSS --pfx-*-dur variables).
 *   trailSpacing      : min pointer travel (px) between trail emissions.
 *                       Smaller = denser trail; larger = sparser.
 *   maxParticles      : hard cap on simultaneously-alive effect elements.
 *
 * ---- Cursor tuning ----
 *   Images, size and hotspot live in assets/css/style.css (Custom Cursor section)
 *   and the SVGs in assets/img/cursors/. See that section's comments.
 */
(function () {
  'use strict';

  var CONFIG = {
    // Colors sampled from the site's existing teal / navy palette.
    colors: ['#2a7a7a', '#1e5e5e', '#3a9d9d', '#7fc3c3', '#1a1a2e'],
    // Music glyphs. Common note glyphs are listed more than once so the rarely
    // supported treble clef (𝄞) shows up less often; adjust to taste.
    musicSymbols: ['♪', '♫', '♬', '♩', '♪', '♫', '𝄞'],
    clickParticles: 10,
    clickSymbolsMin: 1,
    clickSymbolsMax: 3,
    trailSymbolChance: 0.18,
    clickSpread: 46,          // px
    symbolMinSize: 14,        // px
    symbolMaxSize: 26,        // px
    rippleDuration: 620,      // ms  (keep in sync with CSS var --pfx-ripple-dur)
    particleDuration: 700,    // ms  (keep in sync with CSS var --pfx-particle-dur)
    symbolDuration: 1150,     // ms  (keep in sync with CSS var --pfx-symbol-dur)
    trailSpacing: 14,         // px between trail emissions
    clickMoveThreshold: 8,    // px of movement below which a press counts as a "click"
    maxParticles: 240         // safety cap to avoid runaway CPU/DOM growth
  };

  // Respect users who prefer reduced motion.
  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Do not fire effects when the pointer starts on an interactive element.
  var INTERACTIVE_SELECTOR =
    'a, button, input, textarea, select, label, summary, [role="button"], [contenteditable=""], [contenteditable="true"]';

  var docEl = document.documentElement;
  var layer = null;
  var liveParticles = 0;

  // Active-drag state.
  var activePointerId = null;
  var isPressed = false;
  var lastTrailX = 0;
  var lastTrailY = 0;
  var pressStartX = 0;
  var pressStartY = 0;
  var startedOnInteractive = false;

  function getLayer() {
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'pointer-fx-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    return layer;
  }

  function randInt(min, max) {
    return min + ((Math.random() * (max - min + 1)) | 0);
  }

  function randomColor() {
    return CONFIG.colors[(Math.random() * CONFIG.colors.length) | 0];
  }

  function randomSymbol() {
    return CONFIG.musicSymbols[(Math.random() * CONFIG.musicSymbols.length) | 0];
  }

  function isInteractive(target) {
    return !!(target && target.closest && target.closest(INTERACTIVE_SELECTOR));
  }

  // Attach the shared cleanup handler and mount the node.
  function mount(node) {
    node.addEventListener('animationend', function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      liveParticles--;
    });
    getLayer().appendChild(node);
  }

  // Spawn one sparkle dot that flies to (dx, dy) then fades out.
  function spawnParticle(x, y, dx, dy) {
    if (liveParticles >= CONFIG.maxParticles) return;
    liveParticles++;

    var p = document.createElement('span');
    p.className = 'pfx-particle';
    var size = 5 + Math.random() * 5; // 5-10px
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = randomColor();
    p.style.setProperty('--pfx-dx', dx.toFixed(1) + 'px');
    p.style.setProperty('--pfx-dy', dy.toFixed(1) + 'px');
    mount(p);
  }

  // Spawn one music symbol that drifts, rotates, scales and fades.
  function spawnSymbol(x, y, dx, dy) {
    if (liveParticles >= CONFIG.maxParticles) return;
    liveParticles++;

    var s = document.createElement('span');
    s.className = 'pfx-symbol';
    s.textContent = randomSymbol();
    var size = CONFIG.symbolMinSize + Math.random() * (CONFIG.symbolMaxSize - CONFIG.symbolMinSize);
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.fontSize = size.toFixed(0) + 'px';
    s.style.color = randomColor();
    s.style.opacity = (0.7 + Math.random() * 0.3).toFixed(2);
    s.style.setProperty('--pfx-dx', dx.toFixed(1) + 'px');
    s.style.setProperty('--pfx-dy', dy.toFixed(1) + 'px');
    s.style.setProperty('--pfx-rot', ((Math.random() * 2 - 1) * 40).toFixed(0) + 'deg');
    mount(s);
  }

  // Expanding ring at the click point.
  function spawnRipple(x, y) {
    if (liveParticles >= CONFIG.maxParticles) return;
    liveParticles++;

    var r = document.createElement('span');
    r.className = 'pfx-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    r.style.borderColor = randomColor();
    mount(r);
  }

  // Full click effect: ripple + radial dot burst + a few music symbols.
  function clickBurst(x, y) {
    spawnRipple(x, y);

    if (reduceMotionQuery.matches) return; // ripple only when motion is reduced

    var n = CONFIG.clickParticles;
    for (var i = 0; i < n; i++) {
      var angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      var dist = CONFIG.clickSpread * (0.5 + Math.random() * 0.5);
      spawnParticle(x, y, Math.cos(angle) * dist, Math.sin(angle) * dist);
    }

    var symbols = randInt(CONFIG.clickSymbolsMin, CONFIG.clickSymbolsMax);
    for (var j = 0; j < symbols; j++) {
      var sdx = (Math.random() - 0.5) * 60;
      var sdy = -40 - Math.random() * 45; // float upward
      spawnSymbol(x, y, sdx, sdy);
    }
  }

  // A small scatter of dots along the drag path, with an occasional symbol.
  function trailBurst(x, y) {
    spawnParticle(x, y, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18 - 6);
    if (Math.random() < CONFIG.trailSymbolChance) {
      spawnSymbol(x, y, (Math.random() - 0.5) * 30, -30 - Math.random() * 30);
    }
  }

  function stopDrag() {
    isPressed = false;
    activePointerId = null;
    startedOnInteractive = false;
    docEl.classList.remove('pfx-pressing');
  }

  function onPointerDown(e) {
    // Only primary presses (left mouse button, single touch, pen tip).
    if (e.button !== undefined && e.button !== 0) return;
    if (activePointerId !== null) return;

    activePointerId = e.pointerId;
    isPressed = true;
    pressStartX = lastTrailX = e.clientX;
    pressStartY = lastTrailY = e.clientY;
    startedOnInteractive = isInteractive(e.target);
    docEl.classList.add('pfx-pressing'); // drives the "pressed paw" cursor (desktop only, via CSS)
  }

  function onPointerMove(e) {
    if (!isPressed || e.pointerId !== activePointerId) return;
    if (startedOnInteractive) return;               // don't trail off buttons/links
    if (reduceMotionQuery.matches) return;          // no trail when motion is reduced

    var dx = e.clientX - lastTrailX;
    var dy = e.clientY - lastTrailY;
    // Emit based on distance travelled, not on every event -> even spacing + less work.
    if (dx * dx + dy * dy < CONFIG.trailSpacing * CONFIG.trailSpacing) return;

    lastTrailX = e.clientX;
    lastTrailY = e.clientY;
    trailBurst(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (e.pointerId !== activePointerId) return;

    var movedX = e.clientX - pressStartX;
    var movedY = e.clientY - pressStartY;
    var moved = Math.sqrt(movedX * movedX + movedY * movedY);

    // A press that barely moved and did not start on an interactive element
    // counts as a "click" and gets the burst effect.
    if (!startedOnInteractive && moved <= CONFIG.clickMoveThreshold) {
      clickBurst(e.clientX, e.clientY);
    }
    stopDrag();
  }

  function onPointerCancel(e) {
    if (e.pointerId === activePointerId) stopDrag();
  }

  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerCancel, { passive: true });
  // Pointer leaving the window or the tab losing focus stops the trail.
  window.addEventListener('pointerout', function (e) {
    if (e.pointerId === activePointerId && !e.relatedTarget) stopDrag();
  }, { passive: true });
  window.addEventListener('blur', stopDrag);
})();
