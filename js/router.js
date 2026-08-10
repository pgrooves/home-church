/* ==========================================================================
   Home Church, router
   In memory route state plus history.pushState, so the iOS back swipe and the
   browser back button both behave. No hash routing.

   pushState is best effort. Opened straight from the file system the history
   API can refuse the call, so the in memory route stays the source of truth
   and navigation keeps working either way.
   ========================================================================== */

(function (HC) {
  'use strict';

  var TABS = ['home', 'listen', 'guide', 'connect', 'give'];

  // Old route names kept alive so a link or a restored history entry from
  // before a rename still lands somewhere real.
  var ALIASES = { watch: 'listen' };

  var routes = {};        // name -> render(route) returning an element
  var current = null;
  var mountEl = null;
  var scrollEl = null;
  var scrollMemory = {};
  var started = false;

  function key(route) {
    return route.name + (route.id ? ':' + route.id : '');
  }

  function toQuery(route) {
    var parts = ['v=' + encodeURIComponent(route.name)];
    if (route.id) parts.push('id=' + encodeURIComponent(route.id));
    if (route.index != null) parts.push('i=' + encodeURIComponent(route.index));
    return '?' + parts.join('&');
  }

  function fromLocation() {
    var params = new URLSearchParams(window.location.search);
    var name = params.get('v');
    if (name && ALIASES[name]) name = ALIASES[name];
    if (!name || !routes[name]) return null;
    var route = { name: name };
    var id = params.get('id');
    var index = params.get('i');
    if (id) route.id = id;
    if (index != null) route.index = parseInt(index, 10) || 0;
    return route;
  }

  function pushHistory(route, replace) {
    try {
      var url = toQuery(route);
      if (replace) {
        window.history.replaceState(route, '', url);
      } else {
        window.history.pushState(route, '', url);
      }
    } catch (err) {
      // file:// origins can refuse this. In memory routing carries on.
    }
  }

  function render(route) {
    // A history entry restored from an older build can name a route that has
    // since been renamed. Translate before we decide it does not exist.
    if (ALIASES[route.name]) route = Object.assign({}, route, { name: ALIASES[route.name] });

    var view = routes[route.name];
    if (!view) {
      route = { name: 'home' };
      view = routes.home;
    }

    // Remember where the outgoing view was sitting before we replace it.
    if (current && scrollEl) {
      scrollMemory[key(current)] = scrollEl.scrollTop;
    }

    current = route;

    var el = view(route);
    mountEl.innerHTML = '';
    mountEl.appendChild(el);
    el.classList.add('hc-view-enter');

    HC.emitViewChange(route);

    // Restore the previous position on a return visit, otherwise start at top.
    var remembered = scrollMemory[key(route)];
    if (scrollEl) {
      scrollEl.scrollTop = (route.restore && remembered) ? remembered : 0;
    }
  }

  function go(route, opts) {
    opts = opts || {};
    if (typeof route === 'string') route = { name: route };

    // Tapping the tab you are already on returns you to the top of it.
    if (current && key(current) === key(route) && !opts.force) {
      if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    pushHistory(route, opts.replace === true);
    render(route);
  }

  function back() {
    // Prefer real history so the platform gesture and the button agree.
    if (window.history.length > 1) {
      window.history.back();
    } else {
      go({ name: 'home' }, { replace: true });
    }
  }

  function start(config) {
    if (started) return;
    started = true;

    routes = config.routes;
    mountEl = config.mount;
    scrollEl = config.scroll;

    window.addEventListener('popstate', function (evt) {
      var route = evt.state && evt.state.name ? evt.state : (fromLocation() || { name: 'home' });
      route.restore = true;
      render(route);
    });

    var initial = fromLocation() || { name: 'home' };
    pushHistory(initial, true);
    render(initial);
  }

  HC.router = {
    TABS: TABS,
    start: start,
    go: go,
    back: back,
    current: function () { return current; },
    isTab: function (name) { return TABS.indexOf(name) !== -1; }
  };

})(window.HC = window.HC || {});
