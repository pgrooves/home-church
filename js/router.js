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

  /* The five with a tile of their own in the bar. There is a sixth tile and it
     is not in here on purpose: ••• is not a destination, it lifts the overflow
     sheet. See TAB_META in js/app.js. */
  var TABS = ['home', 'listen', 'guide', 'group', 'connect'];

  /* The modules behind •••, in the order the sheet lists them. Handed over by
     js/app.js from the one list that also draws the sheet, so the order you
     swipe through and the order you read can never disagree.

     NOT SET ONCE ANY MORE. It was, until Admin joined the row: that tile is
     there for admins and not for anybody else, so the row is as long as the
     phone holding it says and js/app.js hands this over again whenever the
     signed-in person changes.

     WHY THEY ARE HERE AT ALL. They used to be pushed views, and a pushed view
     is a dead end: Connect was the last thing a sideways drag could reach and
     the drag simply stopped there. They are stops now. Nothing else about them
     changed, and the bar still only has six tiles, which is the whole reason
     the sheet exists. */
  var modules = [];

  /* Everywhere a sideways drag can land, in the order it lands. The five, then
     the modules. */
  function stops() {
    return TABS.concat(modules);
  }

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

  function render(route, opts) {
    opts = opts || {};

    // A history entry restored from an older build can name a route that has
    // since been renamed. Translate before we decide it does not exist.
    if (ALIASES[route.name]) route = Object.assign({}, route, { name: ALIASES[route.name] });

    var view = routes[route.name];
    if (!view) {
      route = { name: 'home' };
      view = routes.home;
      opts = Object.assign({}, opts, { adopt: null });
    }

    // Remember where the outgoing view was sitting before we replace it.
    if (current && scrollEl) {
      scrollMemory[key(current)] = scrollEl.scrollTop;
    }

    current = route;

    /* Edit mode keeps a registry of the editable sentences on the glass, and
       it is rebuilt by the draw that is about to happen rather than added to
       forever. Announced from here because this is the one place every screen
       goes through, and skipped for an adopted view, which was already
       rendered and already registered what it drew. */
    if (HC.edit && !opts.adopt) HC.edit.beginRender();

    // opts.adopt is a screen somebody else already built, handed over rather
    // than rendered again. The swipe gesture drags the next tab in as a real
    // screen, and mounting that same element is what makes the last frame of
    // the drag and the first frame of the new view the same pixels.
    var el = opts.adopt || view(route);
    mountEl.innerHTML = '';
    mountEl.appendChild(el);
    // A view that arrived by being dragged in has already made its entrance.
    if (opts.animate !== false) el.classList.add('hc-view-enter');

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
    render(route, opts);
  }

  /* A screen built outside the mount, for whoever needs one before it is the
     current view. Nothing here becomes current and no history is written, so
     the caller owns what it gets back. See js/swipe.js. */
  function renderRoute(route) {
    if (typeof route === 'string') route = { name: route };
    if (ALIASES[route.name]) route = Object.assign({}, route, { name: ALIASES[route.name] });
    var view = routes[route.name];
    return view ? view(route) : null;
  }

  /* Change the address of the view that is already on screen, without
     rebuilding it. Not navigation: nothing is rendered, nothing scrolls, and
     the history entry is replaced rather than pushed.

     One caller, and the reason is worth keeping. A new journal entry has no
     id until the first keystroke creates one, and the screen is already
     correct at that moment: the only thing that is wrong is the address. A
     real go() with replace:true would rebuild the screen and pull the
     textarea out from under the thumb that is typing into it, losing focus
     and the caret mid-word. */
  function replaceCurrent(route) {
    if (typeof route === 'string') route = { name: route };
    if (!current) return;
    current = route;
    pushHistory(route, true);
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
    renderRoute: renderRoute,
    replaceCurrent: replaceCurrent,
    back: back,
    current: function () { return current; },

    setModules: function (names) { modules = names.slice(); },
    stops: stops,
    isModule: function (name) { return modules.indexOf(name) !== -1; },

    /* A top level destination: one of the five, or one of the modules behind
       •••. Not "is it in the tab bar", which is why it is not called that.
       What it decides is everything a stop has and a pushed view does not: no
       back arrow, the logo in the header, and a sideways drag that works. */
    isTop: function (name) { return stops().indexOf(name) !== -1; },

    /* The same question asked of a whole route rather than a name, which for
       one route is a different question.

       Admin is a stop and its four sections are pushed views of it. They share
       a route name, because sharing it is what makes the back gesture walk out
       of a section into the menu and then out of the menu, so the name alone
       cannot tell them apart and the id can: `admin` is a place you swipe to,
       `admin` with a section on it is somewhere you went from there and needs
       the arrow back. Every other stop is a stop however it is addressed.

       Anything deciding chrome or gestures for the view on screen wants this
       one. isTop above stays what it says on the tin, a question about a name,
       and is what the sheet and the tab bar ask when all they have is one. */
    isStop: function (route) {
      if (!route) return false;
      if (route.name === 'admin' && route.id) return false;
      return stops().indexOf(route.name) !== -1;
    }
  };

})(window.HC = window.HC || {});
