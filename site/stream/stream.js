/**
 * Compatibility shim — Go Live / relay / WHIP live in /stream/js/live.js.
 */
(function () {
  if (window.MakaLive || window.initLive) return;
  if (document.querySelector('script[src*="js/live.js"]')) return;
  var s = document.createElement('script');
  s.type = 'module';
  s.src = '/stream/js/live.js';
  document.head.appendChild(s);
})();
