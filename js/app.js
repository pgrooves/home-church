/* ==========================================================================
   Home Church, app
   Boot, route table, and one delegated listener per event type. Screens render
   HTML strings, this file turns taps into state changes and navigation.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* Six tiles, five of them tabs.

     The bar has been at six since the Group tab landed, and the comment that
     used to sit here said six was already past the four to five the design
     system asks for: on a 375pt phone each tile is 56.2pt, which keeps every
     tap target legal and leaves Connect, the widest label at 48.5pt, with
     under 4pt of air on each side. Measured rather than guessed, in
     demo-group-room.

     A seventh tile would be 48.2pt and Connect would stop fitting. So rather
     than buy one more feature and have the same argument again at eight, the
     sixth tile stopped being a tab: ••• pushes the More list, and everything
     that is not one of the five lives there. The geometry above is the
     shipped geometry, unchanged, and it never has to be renegotiated again.

     `tab: false` is what keeps ••• out of the sideways swipe and out of
     HC.router.TABS. Promoting a module into the five later is a line in this
     array and a line out of MODULES below. */
  var TAB_META = [
    { name: 'home',    label: 'Home',    icon: 'home' },
    { name: 'listen',  label: 'Listen',  icon: 'listen' },
    { name: 'guide',   label: 'Guide',   icon: 'guide' },
    { name: 'group',   label: 'Group',   icon: 'group' },
    { name: 'connect', label: 'Connect', icon: 'connect' },
    { name: 'more',    label: 'More',    icon: 'more', tab: false }
  ];

  /* What is behind •••. One array, and it feeds three things that used to be
     able to drift apart: the sheet's grid, the order a sideways drag runs
     them in, and the list on the More screen. Adding a module is a row here
     and a route in the table at the bottom of this file.

     They are stops, not pushed views. Swiping left off Connect brings the
     first one in exactly the way Connect arrives from Group, which is the
     whole reason the ••• tile stopped pushing a screen. */
  var MODULES = [
    {
      route: 'practices',
      icon: 'practiceSabbath',
      title: 'Practices',
      sub: 'Nine practices of Jesus, a few sessions each.'
    },
    {
      route: 'journal',
      icon: 'journal',
      title: 'Journal',
      sub: 'Everything you have written down, from a guide or on your own.'
    },
    {
      route: 'give',
      icon: 'give',
      title: 'Give',
      sub: 'Through Overflow, in your own browser.'
    }
  ];

  // The More screen still exists at ?v=more so an old link or a restored
  // history entry lands somewhere real. Nothing in the app opens it any more.
  HC.modules = MODULES;

  /* Routes that light the ••• tile. A module is somewhere you are, not a menu
     you got lost in, so the raised tile stays under the sixth tile the whole
     time you are in one rather than fading out the way it does for a pushed
     view like Your account. journal-entry is in here because it is opened
     from a module and belongs to it. */
  /* `practice` is in here for the same reason journal-entry is: it is opened
     from a module and belongs to it, so the ••• tile stays lit while you are
     reading one rather than going dark the moment you tap into a practice. */
  /* `admin` is in here for admins and harmless for everybody else, who can no
     more reach that route than they can reach the tile. Its four sections
     share the route name, so the tile stays lit down inside Manage users the
     way it stays lit inside a practice. */
  var MODULE_ROUTES = ['more', 'practices', 'practice', 'journal', 'journal-entry', 'give', 'admin'];

  var TITLES = {
    home: 'Home',
    listen: 'Listen',
    guide: 'Guides',
    group: 'Group',
    connect: 'Connect',
    more: 'More',
    practices: 'Practices',
    // Replaced with the practice's own name once its file has loaded, see
    // emitViewChange below. This is what the bar carries until then.
    practice: 'Practice',
    give: 'Give',
    journal: 'Journal',
    'journal-entry': 'Your entry',
    // The menu carries this the way any stop does, once the screen scrolls.
    // A section is a pushed view and carries it from the moment it opens,
    // beside the arrow back to the menu, where until now it carried nothing.
    admin: 'Admin',
    profile: 'Your account',
    leader: 'Leader mode',
    'guide-reader': 'Guide',
    present: 'Presenting',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    data: 'Your data'
  };

  function isModule(name) {
    return MODULE_ROUTES.indexOf(name) !== -1;
  }

  var mount, scroller, topbar, tabbar, totop, backdisc, pinbar;
  var sheet, sheetGrid, sheetScrim, sheetGrab;

  /* ------------------------------------------------------------- the shell */

  function renderShell() {
    var app = document.getElementById('app');

    app.innerHTML = '' +
      '<header class="hc-topbar" id="hc-topbar" data-scrolled="false">' +
        '<button type="button" class="hc-topbar__back" data-action="back" aria-label="Back" hidden>' +
          c.icon('chevronLeft') +
        '</button>' +
        '<span class="hc-topbar__center">' +
          '<img class="hc-topbar__logo hc-topbar__logo--light" src="assets/img/logo-lockup-ink.png" alt="Home Church">' +
          '<img class="hc-topbar__logo hc-topbar__logo--dark" src="assets/img/logo-lockup.png" alt="Home Church">' +
          '<span class="hc-topbar__title" id="hc-topbar-title"></span>' +
        '</span>' +
        '<button type="button" class="hc-avatar" data-action="go-profile" aria-label="Your account">' +
          '<span class="hc-avatar__disc" id="hc-avatar-disc" aria-hidden="true"></span>' +
        '</button>' +
      '</header>' +

      /* The pinned announcement, when the church has pinned one.

         SHELL CHROME, and that is the whole feature. Home already draws every
         announcement as a card, and a church that pins one is saying this
         should not wait for somebody to open Home and scroll: it rides the
         top of Listen, of the Journal, of a guide being read on a Sunday
         morning. So it belongs to the app the way the tab bar does, and no
         screen has to remember it or can disagree about where it sits.

         Empty until paintPinBar() fills it, which is on the same three beats
         everything else here repaints on: boot, a view change, and content
         landing from Supabase.

         Two buttons side by side rather than one with the other inside it.
         The strip is a tap that goes somewhere and an x that puts it away,
         and a button inside a button is invalid HTML that browsers resolve
         however they like, which is the same reason the social row on Home
         sits outside the media block rather than in it. */
      '<div class="hc-pinbar" id="hc-pinbar" data-show="false" hidden></div>' +

      // Sits directly under the header, below the pinned strip when there is
      // one, and stays out of the way until the Listen archive starts. See
      // js/date-rail.js.
      '<nav class="hc-date-rail" id="hc-date-rail" data-show="false" ' +
          'aria-label="Jump to a month" hidden>' +
        '<div class="hc-date-rail__track"></div>' +
      '</nav>' +

      '<main class="hc-scroll" id="hc-scroll">' +
        '<div id="hc-view"></div>' +
      '</main>' +

      /* The right edge, in place of the scrollbar this design does not draw.
         Four pieces, all shell chrome for the same reason the date rail is:
         a screen earns one by having headings, and never has to ask for it.

         The notches stay on the glass; the written headings, the card and the
         veil only exist while a thumb is down. The gesture is read off
         .hc-scroll rather than off a strip of its own, which is what leaves
         the right edge available to the tab swipe as well. See
         js/index-rail.js. */
      '<div class="hc-index__veil" id="hc-index-veil" aria-hidden="true"></div>' +
      '<nav class="hc-index" id="hc-index" data-state="off" ' +
          'aria-label="Jump to a section" hidden>' +
        '<div class="hc-index__track"></div>' +
      '</nav>' +
      '<div class="hc-index__card" id="hc-index-card" aria-hidden="true"></div>' +
      '<div class="hc-index__titles" id="hc-index-titles" aria-hidden="true"></div>' +
      '<p class="hc-visually-hidden" id="hc-index-live" role="status" aria-live="polite"></p>' +

      // Shell chrome rather than something each screen adds, so no screen has
      // to remember it and none of them can disagree about where they sit.
      // The way back on the left, the way up on the right.
      '<button type="button" class="hc-disc hc-disc--back" id="hc-back" data-action="back" ' +
          'data-show="false" aria-label="Back" aria-hidden="true" tabindex="-1">' +
        '<svg class="hc-disc__icon" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M19 12H5"/><path d="m11.5 5.5-6.5 6.5 6.5 6.5"/>' +
        '</svg>' +
      '</button>' +

      '<button type="button" class="hc-disc hc-disc--top" id="hc-totop" data-action="to-top" ' +
          'data-show="false" aria-label="Back to top" aria-hidden="true" tabindex="-1">' +
        '<svg class="hc-disc__icon" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M12 19V5"/><path d="m5.5 11.5 6.5-6.5 6.5 6.5"/>' +
        '</svg>' +
      '</button>' +

      /* The overflow sheet, and the paper behind it. Both live in the shell
         rather than in a screen, for the same reason the tab bar does: they
         belong to the app, not to whatever is currently on. See the block
         further down for what opens and closes them.

         The scrim stops at the tab bar rather than covering it, so the bar
         stays lit and usable with the sheet up: ••• closes what it opened,
         and any other tab takes you there and puts the sheet away on the way
         past. A bar that goes dead under a menu is a bar you have to dismiss
         before you can use, which is one tap more than this needs. */
      '<button type="button" class="hc-oversheet__scrim" id="hc-oversheet-scrim" ' +
          'aria-label="Close More" aria-hidden="true" tabindex="-1"></button>' +

      '<nav class="hc-oversheet" id="hc-oversheet" aria-label="More" aria-hidden="true">' +
        '<button type="button" class="hc-oversheet__grab" id="hc-oversheet-grab" ' +
            'aria-label="Close More" tabindex="-1">' +
          '<span class="hc-oversheet__handle"></span>' +
        '</button>' +
        '<div class="hc-oversheet__grid" id="hc-oversheet-grid"></div>' +
      '</nav>' +

      '<nav class="hc-tabbar" id="hc-tabbar" aria-label="Sections">' +
        TAB_META.map(function (t) {
          // ••• is drawn solid, see the note on `more` in js/components.js.
          var cls = 'hc-tab__icon' + (t.name === 'more' ? ' hc-icon--solid' : '');
          return '<button type="button" class="hc-tab" data-action="tab" data-tab="' + t.name + '">' +
            c.icon(t.icon, cls) +
            '<span class="hc-tab__label">' + t.label + '</span>' +
          '</button>';
        }).join('') +
      '</nav>' +

      '<div class="hc-toast" id="hc-toast" role="status" aria-live="polite" data-visible="false"></div>';

    mount = document.getElementById('hc-view');
    scroller = document.getElementById('hc-scroll');
    topbar = document.getElementById('hc-topbar');
    tabbar = document.getElementById('hc-tabbar');
    totop = document.getElementById('hc-totop');
    backdisc = document.getElementById('hc-back');
    pinbar = document.getElementById('hc-pinbar');
    sheet = document.getElementById('hc-oversheet');
    sheetGrid = document.getElementById('hc-oversheet-grid');
    sheetScrim = document.getElementById('hc-oversheet-scrim');
    sheetGrab = document.getElementById('hc-oversheet-grab');

    // The sliding tile behind the active tab is a pseudo element sized by
    // this count, so the CSS never has to know how many tabs there are.
    tabbar.style.setProperty('--hc-tab-count', TAB_META.length);
  }

  function initials() {
    var p = HC.store.getProfile();
    var first = (p.firstName || '').trim();
    var last = (p.lastName || '').trim();
    if (!first && !last) return '';
    return ((first ? first[0] : '') + (last ? last[0] : '')).toUpperCase();
  }

  function paintAvatar() {
    var disc = document.getElementById('hc-avatar-disc');
    if (!disc) return;
    var text = initials();
    if (text) {
      disc.textContent = text;
      disc.innerHTML = c.esc(text);
    } else {
      disc.innerHTML = c.icon('home', 'hc-avatar__icon');
    }
  }

  /* ------------------------------------------------------- the pinned strip

     The announcement an admin pinned, across the top of every tab, tappable,
     with an x on the right.

     WHY IT IS HERE AND NOT ON HOME. There is already a pinned line on Home,
     drawn from home_banner_on and home_banner_message, and it stays: a
     sentence with no announcement behind it is the right shape for "the
     building is closed on Sunday", and it is not dismissible because being
     done with that is not a thing a person gets to be. This is the other
     kind. It has an announcement behind it by construction, which is what
     makes it tappable, and because it can be tapped it has to be reachable
     from wherever the tap happens, which means the shell.

     WHAT IT COSTS, said plainly because it is the reason the switch that
     draws it is off by default and the reason the x exists: this is the only
     thing in the app that follows somebody between tabs. The x is the way
     out, it is remembered on the phone rather than for the session, and it is
     keyed on the announcement id, so a second pinned announcement next month
     is a new strip rather than one that stays down forever. See
     dismissPin() in js/store.js.

     HEIGHT IS PUBLISHED RATHER THAN ASSUMED. Every screen clears the fixed
     header with one padding-top calc, and the date rail and the index rail
     hang off the same number. Rather than a second constant that has to be
     kept in step with a title that wraps to two lines on a small phone, the
     measured height goes onto #app as --hc-pin-h and the CSS adds it in. Zero
     when there is no strip, which is what makes every one of those rules
     unchanged on the ordinary week when nobody has pinned anything.
     ------------------------------------------------------------------------ */

  /* What is on the strip right now, or null. Three ways to be null and they
     are all ordinary: nothing is pinned, the pinned announcement's window has
     closed, or this phone has already put it away.

     The dismissed ones are filtered out rather than only checked at the top
     of the list, which decides the rare case where two announcements are
     pinned at once. Tapping the x on the first says something about that
     announcement and nothing about the second, and the second was pinned too:
     letting a dismissal of one suppress the other would mean the second strip
     appeared weeks later, when the first retired, which is worse than it
     appearing now. The admin form warns before there are ever two. */
  function pinnedNow() {
    return HC.data.pinnedAnnouncements().filter(function (a) {
      return !HC.store.isPinDismissed(a.id);
    })[0] || null;
  }

  function pinBarMarkup(a) {
    return '' +
      '<button type="button" class="hc-pinbar__open" data-action="open-pinned" ' +
          'data-id="' + c.esc(a.id) + '">' +
        c.icon('pin', 'hc-pinbar__pin') +
        // The label is what a screen reader announces along with the title,
        // so the strip says what kind of thing it is rather than reading as a
        // stray line of text with a button around it.
        '<span class="hc-visually-hidden">Pinned announcement, </span>' +
        '<span class="hc-pinbar__title">' + c.esc(a.title) + '</span>' +
        c.icon('chevronRight', 'hc-pinbar__chev') +
      '</button>' +
      '<button type="button" class="hc-pinbar__dismiss" data-action="dismiss-pinned" ' +
          'data-id="' + c.esc(a.id) + '" aria-label="Dismiss this banner">' +
        c.icon('close') +
      '</button>';
  }

  function paintPinBar() {
    if (!pinbar) return;

    var app = document.getElementById('app');
    var route = HC.router.current ? HC.router.current() : null;
    // Presentation mode takes the whole screen and nothing competes with it,
    // the same rule the top bar and the tab bar follow above.
    var a = (route && route.name === 'present') ? null : pinnedNow();

    if (!a) {
      pinbar.hidden = true;
      pinbar.setAttribute('data-show', 'false');
      pinbar.removeAttribute('data-id');
      pinbar.removeAttribute('data-key');
      pinbar.innerHTML = '';
      app.style.setProperty('--hc-pin-h', '0px');
      return;
    }

    /* Rebuilt only when it is actually a different strip, because this runs on
       every navigation and a repaint would throw the DOM away under a thumb
       on its way to the x.

       Keyed on the title as well as the id, and the title is the reason: an
       admin fixing a typo in a pinned announcement keeps the same permanent
       id, so an id-only check would leave the misspelling on screen for the
       rest of the session. The id still has to be in the key, because two
       announcements can share a title. */
    var key = a.id + '\n' + a.title;
    if (pinbar.getAttribute('data-key') !== key || !pinbar.firstChild) {
      pinbar.innerHTML = pinBarMarkup(a);
      pinbar.setAttribute('data-id', a.id);
      pinbar.setAttribute('data-key', key);
    }

    pinbar.hidden = false;
    pinbar.setAttribute('data-show', 'true');
    // Measured after it is on the glass, because a long title wraps and the
    // screens below have to clear whatever it actually came out at.
    app.style.setProperty('--hc-pin-h', pinbar.offsetHeight + 'px');
  }

  /* Tapping the strip. It goes to the announcement's own card on Home and
     leaves the strip up, because the strip is the church's and the x is the
     only thing that takes it down.

     THE UNDISMISS IS NOT A LOOPHOLE. Somebody may have put this card away on
     Home last week, before it was pinned; navigating to a card that has been
     filtered out would land on Home with nothing to see and read as a broken
     tap. Putting it back is the honest reading of "take me to this", and it
     is one card, named by the tap that just happened, rather than a blanket
     reset of everything this phone has dismissed.

     force:true because Home may already be the current view, where go()
     would otherwise take a repeat tap as "back to the top" and never rebuild
     the list the un-dismissed card has to reappear in. */
  function openPinned(id) {
    HC.store.undismiss(id);
    HC.router.go({ name: 'home' }, { force: true });
    scrollToAnnouncement(id);
  }

  /* Down to the card, and a moment of gold around it so a person knows which
     of three cards the strip meant.

     Two frames of waiting, not one: the first is the router mounting the new
     Home, the second is the layout it causes. Measured off the scroller
     rather than scrollIntoView(), which scrolls the nearest scrollable
     ancestor by its own rules and would put the card under the fixed header
     and the strip that is still on top of it. */
  function scrollToAnnouncement(id) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        var card = mount.querySelector('[data-banner="' + id + '"]');
        if (!card || !scroller) return;

        var chrome = topbar.offsetHeight + (pinbar && !pinbar.hidden ? pinbar.offsetHeight : 0);
        var top = scroller.scrollTop + card.getBoundingClientRect().top - chrome - 12;

        scroller.scrollTo({
          top: top < 0 ? 0 : top,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth'
        });

        card.setAttribute('data-flash', 'true');
        window.setTimeout(function () {
          card.removeAttribute('data-flash');
        }, 1800);
      });
    });
  }

  /* ---------------------------------------------------- view change plumbing */

  HC.emitViewChange = function (route) {
    var app = document.getElementById('app');
    app.setAttribute('data-view', route.name);

    // Anything floating over a screen belongs to that screen. Leaving takes
    // the selection bar and any open sheet with it. See js/highlight.js.
    HC.store.emit('view', route);


    // Presentation mode takes the whole screen. Nothing else competes with it.
    var chromeless = route.name === 'present';
    topbar.hidden = chromeless;
    tabbar.hidden = chromeless;

    // The rail belongs to one screen, so every other view puts it away. This
    // runs against the view that was just mounted, before the scroll position
    // is restored, and the scroll handler picks it up from there.
    HC.dateRail.build(chromeless ? null : route);

    // Same rule, same moment: the rail is rebuilt against the view that was
    // just mounted, and a screen with fewer than two headings gets none.
    HC.indexRail.build(chromeless ? null : route);

    /* A room is only live while you are looking at it. Leaving the tab stops
       the poll, so sitting on Home is not quietly re-reading a room every
       eight seconds, and arriving pulls once straight away rather than
       showing a stale room until the next tick. */
    if (HC.rooms) {
      if (route.name === 'group') {
        HC.rooms.startPolling();
        HC.rooms.refresh();
      } else {
        HC.rooms.stopPolling();
      }
    }

    var title = document.getElementById('hc-topbar-title');
    var back = topbar.querySelector('.hc-topbar__back');
    var isTop = HC.router.isStop(route);
    var module = isModule(route.name);

    /* A stop is a stop, whether it has a tile of its own or lives behind •••.
       Journal and Give get the logo and no back arrow for the same reason
       Connect does: you did not get sent there, you went there, and a drag
       takes you straight back out. Only a genuinely pushed view, an entry, a
       guide, Your account, an Admin section, carries the arrow and the title.

       Asked of the route rather than of its name, which matters for exactly
       one route: the Admin menu is a stop and its four sections are pushed
       views wearing the same name. See HC.router.isStop. */
    back.hidden = isTop;

    /* Every pushed view but one takes its title from the table above. A
       practice page is the exception: nine pages share one route, so "Practice"
       in the bar over a page headed Sabbath is a small thing that reads as a
       mistake. The practice's own name goes up as soon as its file is in hand,
       and the generic title stands in for the half second before that. */
    var named = TITLES[route.name] || '';
    if (route.name === 'practice' && HC.practices) {
      var here = HC.practices.get(route.id);
      if (here && here.title) named = here.title;
    }
    title.textContent = named;

    // The logo only ever appears on a stop, sliding to center once scrolled.
    // A pushed view has no room for it, back arrow and title fill that slot.
    topbar.setAttribute('data-is-tab', isTop ? 'true' : 'false');

    // The bar starts bare on a stop, and carries the title straight away on a
    // pushed view where the back arrow needs company.
    topbar.setAttribute('data-scrolled', isTop ? 'false' : 'true');

    var buttons = tabbar.querySelectorAll('.hc-tab');
    TAB_META.forEach(function (t, i) {
      // ••• answers for every module, so sitting in the Journal lights the
      // tile the Journal lives behind. Which module it is, the sheet says.
      var here = t.name === 'more' ? module : t.name === route.name;
      if (here) {
        buttons[i].setAttribute('aria-current', 'page');
        // The tile travels to the tab rather than appearing under it.
        tabbar.style.setProperty('--hc-tab-index', i);
      } else {
        buttons[i].removeAttribute('aria-current');
      }
    });

    // A pushed view that is not a module has no current tab, so the tile fades
    // out and holds its place. Coming back, it is already where it should be.
    tabbar.style.setProperty('--hc-tab-tile', (isTop || module) ? '1' : '0');

    // The new view starts at the top, or is about to be scrolled to wherever
    // it was left. Either way the discs belong to this view and not the last
    // one, and the scroll handler picks them up from here.
    paintDiscs();

    paintAvatar();

    /* The strip carries across, which is the point of it, so this is not
       drawing it again from nothing: paintPinBar() rebuilds the markup only
       when it is a different announcement. What it does do on every view
       change is take the strip off a presentation and put it back after, and
       re-publish its height for the screen that has just been mounted. */
    paintPinBar();
  };

  function prefersReducedMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ------------------------------------------------------ the overflow sheet

     What ••• does now. It used to push the More list and you had to come back
     from it; it lifts a panel out of the tab bar instead, and the modules
     behind it are stops on the sideways swipe rather than a dead end.

     WHAT IT IS MADE OF. The plinth again: the same skin, hairline, sheen and
     26px corner as the bar, exactly the bar's width, inset the same 12px from
     both edges, sitting one 8px gap above it. Not a card in the app's paper,
     because that would put two different objects at the bottom of the screen
     and only one of them would look like the navigation.

     THREE STATES, and the middle one is the reason this file has any timers
     in it at all:

       open   somebody tapped •••. Scrim behind it, focus in it, Esc closes.
       peek   a sideways drag landed on a module. The bar cannot say which one,
              because the tile parks on ••• for all of them, so the sheet shows
              itself for a second with that module raised and then fades. No
              scrim, nothing dimmed: it is a label, not a menu, and it must not
              interrupt the screen it is announcing.
       closed parked below the edge, far enough that its shadow clears too.

     The peek leaves on a fade rather than the slide it arrived on, because
     sliding back down reads as a sheet being dismissed and nobody opened it.
     ---------------------------------------------------------------------- */

  /* Long enough to read one word, short enough to be gone before the thumb
     wants the screen back. */
  var PEEK_MS = 1000;
  var PEEK_FADE_MS = 320;

  var sheetState = 'closed';
  var peekTimer = null;

  function sheetIsOpen() { return sheetState === 'open'; }
  function sheetIsPeeking() { return sheetState === 'peek' || sheetState === 'fade'; }

  function setSheetState(next) {
    sheetState = next;
    sheet.setAttribute('data-state', next);
    document.getElementById('app').setAttribute('data-oversheet', next);
  }

  /* A button nobody can see should not be a button anybody can reach, same
     rule as the discs. A peek is not reachable either: it is decoration on a
     navigation the screen has already announced by its own name, and a second
     voice saying Journal is noise.

     The scrim is never hidden outright, only made unreachable: it has a fade
     to finish and `hidden` would cut it off mid transition. Nothing can reach
     it meanwhile, because the CSS takes its pointer events away with its
     opacity. */
  function sheetReachable(on) {
    sheet.setAttribute('aria-hidden', on ? 'false' : 'true');
    sheetGrab.tabIndex = on ? 0 : -1;
    sheetScrim.setAttribute('aria-hidden', on ? 'false' : 'true');
    sheetScrim.tabIndex = on ? 0 : -1;
    var mods = sheetGrid.querySelectorAll('.hc-oversheet__mod');
    for (var i = 0; i < mods.length; i++) mods[i].tabIndex = on ? 0 : -1;
  }

  /* What is behind ••• on this phone: every module, and then Admin for the few
     people the church made an admin.

     ADMIN IS A STOP LIKE THE REST OF THEM. It is the last one, past Give, and
     it is reached the way Give is: a drag left off Give brings it in, a drag
     right takes you back to Give, and the ••• tile stays lit the whole time.
     It was a tile you could only tap for exactly one build, which is how long
     it took to notice that a stop you cannot swipe to is not really in the
     row, it is just drawn beside the things that are.

     ITS SECTIONS ARE NOT STOPS. The menu is the place; Manage users and the
     other three are pushed views of it, told apart by the id on the route.
     See HC.router.isStop.

     ONE LIST, TWO CONSUMERS. This draws the sheet and it also feeds
     HC.router.setModules through syncModules below, so the order the sheet
     lists and the order a drag runs are the same order by construction rather
     than by two people remembering to edit both.

     Recomputed rather than built once at boot, so signing in, signing out, or
     a promotion arriving on the next session refresh changes both the sheet
     and the row. Whether the tile is there at all is presentation and nothing
     more, the same as the Admin row in js/screens/profile.js: every button
     behind it is checked live by the database, so a member who forged the tile
     would find a screen where nothing works. See the header of js/admin.js. */
  function sheetTiles() {
    var tiles = MODULES.map(function (m) {
      return { route: m.route, icon: m.icon, title: m.title, action: 'go-module', id: m.route };
    });

    if (HC.admin && HC.admin.isAdmin()) {
      // No id: go-admin reads data-id as the section to open, and this tile
      // opens the menu of all four.
      tiles.push({ route: 'admin', icon: 'shield', title: 'Admin', action: 'go-admin', id: '' });
    }

    return tiles;
  }

  /* Hand the row to the router, which owns where a drag can land. Called at
     boot and again whenever who is signed in changes, because the last stop
     belongs to the person rather than to the build. */
  function syncModules() {
    HC.router.setModules(sheetTiles().map(function (t) { return t.route; }));
  }

  function paintSheet() {
    var route = HC.router.current();
    var here = route ? route.name : '';
    var tiles = sheetTiles();

    sheetGrid.style.setProperty('--hc-mod-count', Math.min(tiles.length, 4));
    sheetGrid.innerHTML = tiles.map(function (m) {
      return '<button type="button" class="hc-oversheet__mod" ' +
          'data-action="' + c.esc(m.action) + '"' +
          (m.id ? ' data-id="' + c.esc(m.id) + '"' : '') +
          (m.route === here ? ' aria-current="page"' : '') + '>' +
        c.icon(m.icon, 'hc-oversheet__icon') +
        '<span class="hc-oversheet__label">' + c.esc(m.title) + '</span>' +
      '</button>';
    }).join('');
  }

  function cancelPeek() {
    if (peekTimer) { window.clearTimeout(peekTimer); peekTimer = null; }
  }

  /* Parking it again must not be animated, or the invisible panel travels
     back down through the screen while its opacity is coming up. */
  function parkSheet() {
    sheet.setAttribute('data-reset', 'true');
    setSheetState('closed');
    void sheet.offsetHeight;
    sheet.removeAttribute('data-reset');
  }

  function openSheet() {
    cancelPeek();
    paintSheet();
    setSheetState('open');
    sheetReachable(true);
    sheet.style.transform = '';
    sheetScrim.style.opacity = '';
    HC.native.tap('Light');
    var first = sheetGrid.querySelector('.hc-oversheet__mod');
    if (first) first.focus({ preventScroll: true });
  }

  function closeSheet() {
    var hadFocus = sheet.contains(document.activeElement) ||
                   sheetScrim === document.activeElement;
    cancelPeek();
    setSheetState('closed');
    sheetReachable(false);
    sheet.style.transform = '';
    sheetScrim.style.opacity = '';

    // Focus goes back where it came from rather than to the top of the
    // document, which is where a keyboard ends up when the thing it was in
    // stops being reachable.
    if (hadFocus) {
      var tile = tabbar.querySelector('[data-tab="more"]');
      if (tile) tile.focus({ preventScroll: true });
    }
  }

  function endPeek() {
    if (!sheetIsPeeking()) return;
    cancelPeek();
    parkSheet();
  }

  function peekSheet() {
    cancelPeek();
    paintSheet();
    sheetReachable(false);
    setSheetState('peek');
    peekTimer = window.setTimeout(function () {
      if (sheetState !== 'peek') return;
      setSheetState('fade');
      peekTimer = window.setTimeout(function () {
        if (sheetState === 'fade') parkSheet();
        peekTimer = null;
      }, prefersReducedMotion() ? 0 : PEEK_FADE_MS);
    }, PEEK_MS);
  }

  /* Dragged down by the handle. The panel follows the finger and the scrim
     fades with it, so the two move as one thing; past a third of the panel,
     or on a flick, letting go finishes it, and anything less springs back. */
  var SHEET_FLICK = 0.5;

  /* A flick has to have gone somewhere first, same guard as FLICK_MIN in
     js/swipe.js and for the same reason: velocity is measured between two
     adjacent points, so a thumb that twitches a few pixels quickly reads as
     fast without having travelled at all. Without this a nudge on the handle
     dismisses the sheet. */
  var SHEET_FLICK_MIN = 24;

  var sd = null;

  function wireSheet() {
    setSheetState('closed');

    sheetGrab.addEventListener('touchstart', function (evt) {
      if (!sheetIsOpen() || evt.touches.length !== 1) return;
      var t = evt.touches[0];
      sd = { y: t.clientY, dy: 0, last: t.clientY, at: Date.now(), v: 0 };
      sheet.setAttribute('data-dragging', 'true');
    }, { passive: true });

    // Not passive: a drag on the handle is not a scroll of anything.
    sheetGrab.addEventListener('touchmove', function (evt) {
      if (!sd || evt.touches.length !== 1) return;
      var t = evt.touches[0];
      var dy = Math.max(0, t.clientY - sd.y);
      var now = Date.now();
      if (now > sd.at) {
        sd.v = (t.clientY - sd.last) / (now - sd.at);
        sd.at = now;
        sd.last = t.clientY;
      }
      sd.dy = dy;
      sheet.style.transform = 'translateY(' + dy + 'px)';
      var h = sheet.offsetHeight || 1;
      sheetScrim.style.opacity = String(Math.max(0, 1 - dy / h));
      if (evt.cancelable) evt.preventDefault();
    }, { passive: false });

    function endDrag() {
      if (!sd) return;
      sheet.removeAttribute('data-dragging');
      var h = sheet.offsetHeight || 1;
      var gone = sd.dy > h / 3 ||
                 (sd.v > SHEET_FLICK && sd.dy > SHEET_FLICK_MIN);
      // A finger that dragged is not also a tap on the handle.
      var dragged = sd.dy > 4;
      sd = null;
      if (gone) {
        closeSheet();
      } else {
        sheet.style.transform = '';
        sheetScrim.style.opacity = '';
      }
      return dragged;
    }

    sheetGrab.addEventListener('touchend', endDrag);
    sheetGrab.addEventListener('touchcancel', endDrag);

    // Tapping the handle rather than dragging it closes it too, and so does
    // the paper behind. Both are the same intention.
    sheetGrab.addEventListener('click', function () {
      if (sheetIsOpen() && !sd) closeSheet();
    });
    sheetScrim.addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && sheetIsOpen()) closeSheet();
    });

    /* Leaving takes the sheet with it, the same way leaving a screen takes
       its selection bar and any open sheet. A peek is left alone here because
       the swipe that caused it decides its own fate below: closing it on the
       view change it was announcing would mean it never appeared at all. */
    HC.store.on('view', function (route) {
      if (sheetIsOpen()) closeSheet();
      else if (sheetIsPeeking() && !isModule(route.name)) endPeek();
    });
  }

  /* Called by js/swipe.js when a drag commits, and by nothing else, because
     only a drag can put you somewhere the tab bar cannot name. Arriving on a
     second module restarts the second rather than stacking one peek on
     another, and the raised tile moves with you. */
  HC.overflow = {
    open: function () { openSheet(); },
    close: function () { closeSheet(); },
    isOpen: sheetIsOpen,
    arrived: function (name) {
      if (HC.router.isModule(name)) peekSheet();
      else endPeek();
    }
  };

  /* About a card and a half of travel.

     This started at a screenful, 600, which was wrong for a reason worth
     leaving here: Home at phone size is roughly 1.3 screens tall, so its whole
     scroll range is around 300px and a 600px trigger meant the button never
     appeared on the tab the app opens to. The number has to be smaller than
     the shortest scrolling screen's range, not a fraction of the viewport.

     240 is still far enough that a nudge of the thumb does not summon it. */
  var TOTOP_AT = 240;

  /* Up and down for both discs in one place, so they can never disagree about
     which of them is on screen or how a hidden one behaves. Out of the reading
     order and out of the tab order while a disc is down: a button nobody can
     see should not be a button anybody can reach. */
  function setDisc(el, up) {
    if (!el) return;
    el.setAttribute('data-show', up ? 'true' : 'false');
    el.setAttribute('aria-hidden', up ? 'false' : 'true');
    el.tabIndex = up ? 0 : -1;
  }

  function paintDiscs() {
    var route = HC.router.current();

    // Presentation mode takes the whole screen and the rest of the chrome is
    // already gone, so these go with it rather than floating over a guide.
    var chromeless = !route || route.name === 'present';

    setDisc(totop, !chromeless && scroller.scrollTop > TOTOP_AT);

    /* The way back is not a scroll state. A pushed view is somewhere you were
       sent, and the way out of it has to be there the moment you arrive and
       stay there the whole time, at the top of a sermon guide as much as
       eleven questions down a group room. A tab is not pushed and has nowhere
       to go back to, so it does not get one. */
    setDisc(backdisc, !chromeless && !HC.router.isStop(route));
  }

  function watchScroll() {
    var ticking = false;
    scroller.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        // The rail rides the same frame as the header rather than adding a
        // second listener to the same scroller. So do the discs.
        HC.dateRail.update();
        HC.indexRail.update();
        paintDiscs();
        var route = HC.router.current();
        if (!route || !HC.router.isStop(route)) return;
        topbar.setAttribute('data-scrolled', scroller.scrollTop > 24 ? 'true' : 'false');
      });
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- sharing
     Moved into js/native.js, which prefers the real system share sheet and
     falls back through the web Share API and the clipboard. */

  function share(text, title) {
    HC.native.shareText(text, title);
  }

  /* ------------------------------------------------------------- guide bits */

  function guideIdFrom(el) {
    var scope = el.closest('[data-guide]');
    return scope ? scope.getAttribute('data-guide') : null;
  }

  function repaintCoverage(guideId) {
    var box = document.querySelector('[data-coverage]');
    if (!box) return;
    var guide = HC.data.getGuide(guideId);
    if (!guide) return;
    var total = 0;
    guide.groupSections.forEach(function (s) { total += s.questions.length; });
    var covered = HC.store.checkedCount(guideId);
    box.innerHTML =
      '<p class="hc-caption">' + c.esc(HC.screens.guideHelpers.coverageText(covered, total)) + '</p>' +
      (covered ? '<button type="button" class="hc-btn hc-btn--tertiary" data-action="clear-checks">Start over</button>' : '');
  }

  /* ---------------------------------------------------------------- actions */

  var actions = {
    /* Five of the six tiles go somewhere. The sixth lifts the sheet, and
       tapping it again puts it back down, because a tile that only opens is
       a tile you have to dismiss some other way. */
    tab: function (el) {
      var name = el.getAttribute('data-tab');
      if (name === 'more') {
        if (HC.overflow.isOpen()) HC.overflow.close();
        else HC.overflow.open();
        return;
      }
      HC.router.go({ name: name });
    },

    // Both ways back, the arrow in the header and the disc by the thumb.
    back: function () {
      HC.native.tap('Light');
      HC.router.back();
    },

    'to-top': function () {
      HC.native.tap('Light');
      scroller.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },

    'go-profile': function () {
      HC.router.go({ name: 'profile' });
    },

    'go-guide': function () {
      HC.router.go({ name: 'guide' });
    },

    'go-leader': function () {
      HC.router.go({ name: 'leader' });
    },

    /* ----------------------------------------------------------- the Admin
       screen

       Drawn only for an admin and refused by the database for everybody else,
       so nothing here re-checks the role: a member who reaches these handlers
       gets a 403 and a toast, which is the honest outcome. See the header of
       js/admin.js.
       ------------------------------------------------------------------- */

    'go-admin': function (el) {
      var id = el.getAttribute('data-id');
      // Arriving at the menu clears whatever was half written, so opening a
      // different section does not inherit the last one's fields.
      if (!id) adminHelpers().resetDrafts();
      HC.router.go({ name: 'admin', id: id || null });
    },

    'admin-announcement-new': function () {
      adminHelpers().startDraft(null);
      repaintAdmin();
    },

    'admin-announcement-edit': function (el) {
      var row = announcementById(el.getAttribute('data-id'));
      if (!row) return;
      adminHelpers().startDraft(row);
      repaintAdmin();
    },

    'admin-announcement-cancel': function () {
      adminHelpers().clearDraft();
      repaintAdmin();
    },

    // The two switches on the form. Both live in the draft, neither is saved
    // until the button is pressed.
    'admin-draft-toggle': function (el) {
      var d = adminHelpers().getDraft();
      if (!d) return;
      var which = el.getAttribute('data-id');
      d[which] = !d[which];
      HC.native.tap('Light');
      repaintAdmin();
    },

    'admin-image-clear': function () {
      var d = adminHelpers().getDraft();
      if (!d) return;
      /* The object stays in the bucket. Deleting it here would orphan the
         picture of any other announcement pointing at the same URL, which is
         what happens the moment somebody reuses one, and a few unreferenced
         images in a 5MB-per-file bucket is a much cheaper problem than a card
         with a broken image on Home. */
      d.imageUrl = '';
      repaintAdmin();
    },

    /* Save, and then maybe notify. Two calls in that order and never one,
       because they fail differently: an announcement that saved but did not
       notify is fine and can be notified again from the list, and a
       notification about an announcement that did not save is a lie on every
       lock screen in the church. The second failure therefore never rolls
       back the first, it just says so. */
    'admin-announcement-save': function () {
      var h = adminHelpers();
      var d = h.getDraft();
      if (!d) return;

      if (!String(d.title || '').trim()) {
        HC.components.toast('An announcement needs a title.');
        return;
      }
      if (d.notify && !d.published) {
        HC.components.toast('A draft cannot be announced. Publish it first.');
        return;
      }

      adminRun('save', HC.admin.saveAnnouncement(d).then(function (saved) {
        var wanted = d.notify;
        h.clearDraft();
        if (!wanted || !saved || !saved.id) {
          HC.components.toast('Posted.');
          return;
        }
        return HC.admin.notifyAnnouncement(saved.id).then(function () {
          HC.components.toast('Posted, and everybody has been told.');
        }).catch(function (err) {
          HC.components.toast('Posted. The notification did not send: ' +
            (err.message || 'try Notify from the list.'));
        });
      }));
    },

    /* Notify on its own, from the list. This is the second chance after a
       failed send, and the way to announce something that was written as a
       draft days ago. */
    'admin-announcement-notify': function (el) {
      var id = el.getAttribute('data-id');
      var row = announcementById(id);
      if (!row) return;

      if (!window.confirm('Send a notification about “' + row.title + '” to everybody? ' +
                          'This cannot be undone.')) return;

      adminRun('notify:' + id, HC.admin.notifyAnnouncement(id).then(function () {
        HC.components.toast('Everybody has been told.');
      }));
    },

    'admin-announcement-delete': function (el) {
      var id = el.getAttribute('data-id');
      var row = announcementById(id);
      if (!row) return;

      if (!window.confirm('Delete “' + row.title + '”? It comes off Home for everybody, ' +
                          'and there is no undo.')) return;

      adminRun('delete:' + id, HC.admin.deleteAnnouncement(id).then(function () {
        HC.components.toast('Deleted.');
      }));
    },

    /* ------------------------------------------------------------- users */

    'admin-role': function (el) {
      var id = el.getAttribute('data-id');
      var person = HC.admin.users().filter(function (u) { return u.id === id; })[0];
      if (!person) return;

      var makingAdmin = person.role !== 'admin';
      var name = [person.first_name, person.last_name].filter(Boolean).join(' ') ||
        person.email || 'this person';

      /* Promotion is confirmed as well as demotion, which is not the usual
         rule. It is not destructive, but it hands somebody the ability to
         write to Home and to change everybody else's role, and that is worth
         one deliberate tap. */
      var question = makingAdmin
        ? 'Make ' + name + ' an admin? They will be able to post announcements, ' +
          'edit content, and change what everybody else can do.'
        : 'Make ' + name + ' a member? They lose access to this screen.';

      if (!window.confirm(question)) return;

      adminRun('role:' + id,
        HC.admin.setRole(id, makingAdmin ? 'admin' : 'member').then(function () {
          HC.components.toast(makingAdmin ? 'Now an admin.' : 'Now a member.');
        }));
    },

    'admin-user-remove': function (el) {
      var id = el.getAttribute('data-id');
      var person = HC.admin.users().filter(function (u) { return u.id === id; })[0];
      if (!person) return;

      var name = [person.first_name, person.last_name].filter(Boolean).join(' ') ||
        person.email || 'this person';

      /* The worst button on the screen, so the confirmation says what it
         actually does rather than "are you sure". A member who hosted a group
         room takes that evening's writing down with them, including other
         people's, which is the cascade documented in the delete-account
         function and in the privacy policy. */
      if (!window.confirm('Remove ' + name + ' from the app?\n\n' +
            'Their account, their profile, and anything they wrote in a group room ' +
            'are deleted. If they hosted a room, that room goes too, including what ' +
            'other people wrote in it. There is no undo.')) return;

      adminRun('remove:' + id, HC.admin.removeUser(id).then(function () {
        HC.components.toast('Removed.');
      }));
    },

    /* ----------------------------------------------------------- content */

    'admin-page-new': function () {
      adminHelpers().startPageDraft(null);
      repaintAdmin();
    },

    'admin-page-edit': function (el) {
      var row = pageById(el.getAttribute('data-id'));
      if (!row) return;
      adminHelpers().startPageDraft(row);
      repaintAdmin();
    },

    'admin-page-cancel': function () {
      adminHelpers().clearPageDraft();
      repaintAdmin();
    },

    'admin-page-toggle': function () {
      var p = adminHelpers().getPageDraft();
      if (!p) return;
      p.published = !p.published;
      HC.native.tap('Light');
      repaintAdmin();
    },

    'admin-section-add': function () {
      var p = adminHelpers().getPageDraft();
      if (!p) return;
      p.sections.push({ heading: '', body: '' });
      repaintAdmin();
    },

    /* No confirmation. An unsaved section is not published anything, and
       Cancel is still sitting at the bottom of the form. Confirmations spent
       on reversible things are what train people to tap through the ones that
       matter. */
    'admin-section-remove': function (el) {
      var p = adminHelpers().getPageDraft();
      if (!p) return;
      p.sections.splice(parseInt(el.getAttribute('data-id'), 10), 1);
      repaintAdmin();
    },

    'admin-page-save': function () {
      var h = adminHelpers();
      var p = h.getPageDraft();
      if (!p) return;

      if (!String(p.title || '').trim()) {
        HC.components.toast('A page needs a title.');
        return;
      }

      adminRun('page', HC.admin.savePage(p).then(function () {
        h.clearPageDraft();
        HC.components.toast('Saved.');
      }));
    },

    'admin-page-delete': function (el) {
      var id = el.getAttribute('data-id');
      var row = pageById(id);
      if (!row) return;

      if (!window.confirm('Delete the page “' + row.title + '”? ' +
            'Anywhere in the app that reads it falls back to the words built into ' +
            'the app. There is no undo.')) return;

      adminRun('page-delete:' + id, HC.admin.deletePage(id).then(function () {
        HC.components.toast('Deleted.');
      }));
    },

    /* ---------------------------------------------------------- settings */

    'admin-setting-toggle': function (el) {
      var key = el.getAttribute('data-id');
      var row = HC.admin.settings().filter(function (s) { return s.key === key; })[0];
      if (!row) return;

      // Moved on screen first, saved after. A switch that waits on the
      // network to move feels broken on a bad connection, and the repaint at
      // the end of adminRun puts it back if the write is refused.
      setSwitch(el, !row.value_bool);
      HC.native.tap('Light');

      adminRun('setting:' + key, HC.admin.saveSetting(key, 'boolean', !row.value_bool));
    },

    'admin-setting-new': function () {
      adminHelpers().startNewSetting();
      repaintAdmin();
    },

    'admin-setting-cancel': function () {
      adminHelpers().clearNewSetting();
      repaintAdmin();
    },

    'admin-setting-kind': function (el) {
      var n = adminHelpers().getNewSetting();
      if (!n) return;
      n.kind = el.getAttribute('data-id');
      repaintAdmin();
    },

    'admin-setting-create': function () {
      var h = adminHelpers();
      var n = h.getNewSetting();
      if (!n) return;

      if (!String(n.label || '').trim()) {
        HC.components.toast('Give it a name first.');
        return;
      }

      adminRun('setting', HC.admin.createSetting(n).then(function () {
        h.clearNewSetting();
        HC.components.toast('Added.');
      }));
    },

    'admin-setting-delete': function (el) {
      var key = el.getAttribute('data-id');
      var row = HC.admin.settings().filter(function (s) { return s.key === key; })[0];
      if (!row) return;

      if (!window.confirm('Remove the “' + row.label + '” setting? ' +
            'Anything reading it goes back to its built-in behaviour.')) return;

      adminRun('setting-delete:' + key, HC.admin.deleteSetting(key).then(function () {
        HC.components.toast('Removed.');
      }));
    },



    // Every row on the More screen. One handler rather than one per module,
    // so adding a module is a row in js/screens/more.js and a route below.
    'go-module': function (el) {
      HC.router.go({ name: el.getAttribute('data-id') });
    },

    /* -------------------------------------------------------- the Journal

       Same shape as the Group tab's handlers: ask js/journal.js to do the
       thing, repaint, say something human. Nothing here touches storage
       directly and nothing here decides what an entry is. */

    /* ------------------------------------------------------- the Practices */

    'go-practice': function (el) {
      HC.router.go({ name: 'practice', id: el.getAttribute('data-id') });
    },

    /* Swap the poster for the real player.

       THE RULE THIS KEEPS. Video in this app plays in this app. Not a link,
       not @capacitor/browser, not a deep link that hands somebody to the
       YouTube app and loses them: an iframe, here, inside the page they were
       already reading. js/practices.js drops a video that cannot be embedded
       rather than degrading it into a link out, and this is the other half of
       that promise.

       The poster is what gets replaced rather than the whole block, so the
       running time under it survives. And the id is checked against what a
       YouTube id can actually be before it goes anywhere near a URL: it comes
       out of a generated file, which is a file in this repo, but a value that
       reaches an iframe src deserves the check whatever its provenance. */
    /* The whole series, in one player, out loud.

       This is the one place a playlist embed is built, and it is built here
       rather than accepted from a data file as a URL. "videoseries" is
       YouTube's playlist path and is also a valid eleven character id, so a
       pasted playlist URL sails past the single video guard above and renders
       an error player; keeping the two paths apart, each with its own guard,
       is what stops that. */
    'play-series': function (el) {
      var wrap = el.closest('[data-video]');
      var poster = wrap && wrap.querySelector('.hc-video__poster');
      if (!poster) return;

      var list = el.getAttribute('data-list') || '';
      if (!/^(PL|UU|OL|FL|RD)[A-Za-z0-9_-]{10,48}$/.test(list)) {
        c.toast('That series is unavailable.');
        return;
      }

      HC.native.tap('Light');

      var src = 'https://www.youtube.com/embed/videoseries?list=' + list +
        '&autoplay=1&playsinline=1&rel=0&modestbranding=1';

      poster.outerHTML = '' +
        '<div class="hc-video__frame">' +
          '<iframe class="hc-video__iframe" src="' + src + '" ' +
            'title="' + c.esc(el.getAttribute('aria-label') || 'The sessions') + '" ' +
            'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" ' +
            'allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ' +
            'loading="lazy"></iframe>' +
        '</div>';
    },

    'play-video': function (el) {
      var wrap = el.closest('[data-video]');
      var poster = wrap && wrap.querySelector('.hc-video__poster');
      if (!poster) return;

      var id = el.getAttribute('data-id') || '';
      var provider = el.getAttribute('data-provider') === 'vimeo' ? 'vimeo' : 'youtube';
      var hash = el.getAttribute('data-hash') || '';

      /* Checked here as well as in js/practices.js. Two different shapes: a
         YouTube id is eleven characters of base64url, a Vimeo id is digits.
         The literal "videoseries" is rejected by name because it is a real
         eleven character base64url string, so no pattern can tell it from an
         id: it is YouTube's playlist embed path, and pasting a playlist URL
         in here would otherwise sail through and render an error player. */
      var ok = provider === 'vimeo'
        ? /^[0-9]{6,12}$/.test(id)
        : /^[A-Za-z0-9_-]{11}$/.test(id) && id !== 'videoseries';
      if (!ok || (hash && !/^[a-f0-9]{6,20}$/i.test(hash))) {
        c.toast('That video is unavailable.');
        return;
      }

      HC.native.tap('Light');

      /* playsinline is the one parameter that is not a preference on either
         provider. Without it iOS takes the video full screen the instant it
         starts, which is the same experience as leaving the app wearing a
         different coat. */
      var src = provider === 'vimeo'
        ? 'https://player.vimeo.com/video/' + id +
            (hash ? '?h=' + hash + '&' : '?') +
            'autoplay=1&playsinline=1&title=0&byline=0&portrait=0&dnt=1'
        : 'https://www.youtube.com/embed/' + id +
            '?autoplay=1&playsinline=1&rel=0&modestbranding=1';

      poster.outerHTML = '' +
        '<div class="hc-video__frame">' +
          '<iframe class="hc-video__iframe" src="' + src + '" ' +
            'title="' + c.esc(el.getAttribute('aria-label') || 'Video') + '" ' +
            'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" ' +
            'allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ' +
            'loading="lazy"></iframe>' +
        '</div>';
    },

    'go-journal': function () {
      HC.router.go({ name: 'journal' });
    },

    /* New does not create anything. It opens the entry screen with a draft
       held in the screen's own state, and the first keystroke is what makes
       a row. See the note at the top of js/screens/journal.js. */
    'journal-new': function () {
      HC.screens.journalHelpers.startDraft();
      HC.router.go({ name: 'journal-entry', id: 'new' });
    },

    'journal-open': function (el) {
      HC.router.go({ name: 'journal-entry', id: el.getAttribute('data-id') });
    },

    /* The editor. Formatting acts on the selection, which is why every one
       of these buttons carries data-keep-focus: see the mousedown guard in
       wireEvents(). */

    'editor-format': function (el) {
      HC.editor.format(el.getAttribute('data-cmd'));
      var box = document.querySelector('.hc-rt');
      if (box) box.dispatchEvent(new Event('input', { bubbles: true }));
    },

    'scripture-open': function () {
      HC.editor.openScripture();
    },

    'scripture-close': function () {
      HC.editor.closeScripture();
    },

    'scripture-insert': function () {
      HC.editor.insertScripture();
      HC.native.tap('Light');
    },

    /* ------------------------------------------------------ highlighting */

    'hl-note': function () { HC.highlight.create(true); },
    'hl-mark': function () { HC.highlight.create(false); },
    'hl-open': function (el) { HC.highlight.open(el.getAttribute('data-id')); },
    'hl-close': function () { HC.highlight.closeNote(); },

    'hl-remove': function (el) {
      if (!window.confirm('Remove this highlight? The note goes with it.')) return;
      HC.highlight.remove(el.getAttribute('data-id'));
    },

    /* Your own copy of your own words. Same road Download guide and the night
       sheet take: a real file to the share sheet on a phone, where iOS offers
       Print, Save to Files and Mail, and the print dialog in a browser, where
       window.print() actually does something. */
    'journal-export': function () {
      var entries = HC.journal.all();
      if (!entries.length) {
        c.toast('Nothing written down yet.');
        return;
      }

      if (!HC.native.isNative()) {
        HC.print.journal(entries);
        return;
      }

      c.toast('Getting your journal ready.');
      HC.print.journalHtml(entries).then(function (html) {
        return HC.native.shareFile('my-journal.html', html, 'text/html', 'Your journal');
      }).then(function (ok) {
        if (!ok) c.toast('Could not put that together. Try again in a moment.');
      }).catch(function () {
        c.toast('Could not put that together. Try again in a moment.');
      });
    },

    'journal-filter': function (el) {
      HC.screens.journalHelpers.setFilter(el.getAttribute('data-value'));
      HC.screens.journalHelpers.repaint();
    },

    'journal-pin': function (el) {
      var on = HC.journal.togglePin(el.getAttribute('data-id'));
      HC.native.tap('Light');
      HC.router.go({ name: 'journal-entry', id: el.getAttribute('data-id') }, { force: true });
      c.toast(on ? 'Pinned to the top.' : 'Unpinned.');
    },

    /* One confirm, and it says what is actually true. Unlike erasing the
       phone, this one entry is the only thing going, and if it has synced it
       goes from the account as well. */
    'journal-delete': function (el) {
      if (!window.confirm('Delete this entry? There is no undo.')) return;
      HC.journal.remove(el.getAttribute('data-id'));
      HC.router.go({ name: 'journal' }, { force: true });
      c.toast('Deleted.');
    },

    'open-guide': function (el) {
      HC.router.go({ name: 'guide-reader', id: el.getAttribute('data-id') });
    },

    /* On a phone this is a real file handed to the share sheet, where iOS
       offers Print, Save to Files, and Mail. window.print() is a no-op inside
       WKWebView, so the old behavior was a button that did nothing at all
       once the app was packaged, and did it silently. In a browser, where
       print() works properly, it still uses the print dialog. */
    'download-guide': function (el) {
      var id = el.getAttribute('data-id');

      if (!HC.native.isNative()) {
        HC.print.guide(id);
        return;
      }

      var guide = HC.data.getGuide(id);
      var name = (HC.data.guideTitle(guide) || 'guide').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.html';

      c.toast('Getting the guide ready.');
      HC.print.standaloneHtml(id).then(function (html) {
        return HC.native.shareFile(name, html, 'text/html', HC.data.guideTitle(guide));
      }).then(function (ok) {
        if (!ok) c.toast('Could not put that together. Try again in a moment.');
      }).catch(function () {
        c.toast('Could not put that together. Try again in a moment.');
      });
    },

    /* Hands the phone an .ics and lets the person decide. The app never asks
       for calendar permission, because it never touches the calendar. */
    'add-to-calendar': function (el) {
      var id = el.getAttribute('data-id');
      var evt = (HC.data.events || []).filter(function (e) { return e.id === id; })[0];
      if (!evt) return;

      HC.native.addToCalendar({
        title: evt.title,
        description: evt.blurb,
        location: evt.location,
        start: HC.screens.connectHelpers.eventStart(evt)
      }).then(function (ok) {
        if (ok) HC.native.tap('Light');
        else c.toast('Could not open your calendar from here.');
      });
    },

    'open-url': function (el) {
      c.openExternal(el.getAttribute('data-url'));
    },

    'date-rail-jump': function (el) {
      HC.dateRail.jump(parseInt(el.getAttribute('data-index'), 10));
    },

    /* A thumb never sends this: the notches do not take pointers, the
       scroller does. This is the keyboard, and the screen reader, arriving at
       the same place by the same door. */
    'index-jump': function (el) {
      HC.indexRail.jump(parseInt(el.getAttribute('data-index'), 10));
    },

    'go-legal': function (el) {
      HC.router.go({ name: el.getAttribute('data-id') });
    },

    /* ------------------------------------------------------------- erasing
       Two taps, and the second one is the one that means it. The screen
       repaints between them rather than throwing a system dialog, so the
       consequence is on screen in the app's own voice while somebody decides.
       ---------------------------------------------------------------------- */

    // Arming is a real navigation, so the back gesture disarms it for free.
    'erase-ask': function () {
      HC.router.go({ name: 'data', id: 'confirm' });
    },

    'erase-cancel': function () {
      HC.router.back();
    },

    'erase-confirm': function () {
      var ok = HC.store.eraseEverything();
      HC.store.applyPreferences();   // theme and text size went back to default
      paintAvatar();
      HC.router.go({ name: 'home' });
      c.toast(ok
        ? 'Erased. This phone is back to a fresh start.'
        : 'Cleared what we could reach. Your browser is not letting the app store anything right now.');
    },

    /* Deleting the account is armed through the route for exactly the reason
       erasing is, so that the back gesture genuinely disarms it rather than
       leaving a primed button behind. The long version is in legal.js. */
    'account-delete-ask': function () {
      HC.router.go({ name: 'data', id: 'confirm-account' });
    },

    'account-delete-cancel': function () {
      HC.router.back();
    },

    'account-delete-confirm': function () {
      HC.auth.deleteAccount().then(function () {
        HC.router.go({ name: 'home' });
        c.toast('Your account is deleted. What is saved on this phone is still here.');
      }).catch(function (err) {
        // Back to the unarmed screen, so a failure never leaves them staring
        // at a confirmation for something that did not happen.
        HC.router.go({ name: 'data' }, { force: true });
        c.toast(err.message || 'We could not delete your account. Please email the church.');
      });
    },

    'open-scripture': function (el) {
      c.openExternal(c.bibleUrl(el.getAttribute('data-reference')));
    },

    share: function (el) {
      share(el.getAttribute('data-share-text'), el.getAttribute('data-share-title'));
    },

    'toggle-section': function (el) {
      var open = el.getAttribute('aria-expanded') === 'true';
      el.setAttribute('aria-expanded', open ? 'false' : 'true');
      var panel = document.getElementById('panel-' + el.getAttribute('data-section-id'));
      if (panel) panel.setAttribute('data-open', open ? 'false' : 'true');

      /* The room is the one screen that redraws itself under you, so the DOM
         cannot be where it remembers which question chunks are open. Nothing
         is repainted here: the fold has already happened, and this only makes
         it survive the next poll. */
      var group = HC.screens && HC.screens.groupHelpers;
      if (group && el.closest('.hc-group')) {
        group.rememberSection(el.getAttribute('data-section-id'), !open);
      }

      // The month rail reads the archive out of the page, and a closed archive
      // has no rows to read. Opening or closing it is the one section toggle
      // that changes what the rail has to say.
      if (el.closest('.hc-listen')) HC.dateRail.build(HC.router.current());
    },

    'toggle-check': function (el) {
      var guideId = guideIdFrom(el);
      if (!guideId) return;
      var on = HC.store.toggleChecked(guideId, el.getAttribute('data-check-key'));
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      repaintCoverage(guideId);
      // A leader running a room is looking at the group, not the screen. The
      // tick is how they know it registered without checking.
      if (on) HC.native.tap('Light');
    },

    'clear-checks': function (el) {
      var guideId = guideIdFrom(el);
      if (!guideId) return;
      HC.store.clearChecked(guideId);
      Array.prototype.forEach.call(
        document.querySelectorAll('[data-action="toggle-check"]'),
        function (btn) { btn.setAttribute('aria-pressed', 'false'); }
      );
      repaintCoverage(guideId);
      c.toast('Cleared. Fresh start.');
    },

    'dismiss-banner': function (el) {
      var id = el.getAttribute('data-id');
      HC.store.dismiss(id);
      var banner = document.querySelector('[data-banner="' + id + '"]');
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    },

    /* The pinned strip, both halves of it.

       Tapping it opens the announcement it names. Tapping the x puts the
       strip away on this phone, for good, and leaves the card on Home alone:
       the two are dismissed separately for the reason set out on
       dismissPin() in js/store.js. */
    'open-pinned': function (el) {
      HC.native.tap('Light');
      openPinned(el.getAttribute('data-id'));
    },

    'dismiss-pinned': function (el) {
      HC.store.dismissPin(el.getAttribute('data-id'));
      HC.native.tap('Light');
      paintPinBar();
    },

    // Archive rows open in place, so you can read the episode notes without
    // leaving for Spotify and losing your spot in the list.
    'toggle-episode': function (el) {
      var open = el.getAttribute('aria-expanded') === 'true';
      el.setAttribute('aria-expanded', open ? 'false' : 'true');
      var panel = document.getElementById(el.getAttribute('aria-controls'));
      if (panel) panel.setAttribute('data-open', open ? 'false' : 'true');
    },

    filter: function (el) {
      var name = el.getAttribute('data-filter');
      var value = el.getAttribute('data-value');
      HC.screens.connectHelpers.setFilter(name, value);
      Array.prototype.forEach.call(
        el.parentNode.querySelectorAll('[data-action="filter"]'),
        function (pill) {
          pill.setAttribute('aria-pressed', pill === el ? 'true' : 'false');
        }
      );
      HC.screens.connectHelpers.repaintGroups(mount);
    },

    /* join-group, serve, and submit-step used to live here. All three showed a
       warm toast and did nothing: no name was captured, nobody was told, and
       submit-step called form.reset() on what the person had typed. Connect
       now sends people to the systems the church actually runs, so there is
       nothing left for them to do. Do not add them back without a destination.
       ---------------------------------------------------------------------- */

    /* ---------------------------------------------------------- leader mode */

    present: function (el) {
      HC.router.go({ name: 'present', id: el.getAttribute('data-id'), index: 0 });
    },

    'present-prev': function (el) {
      var wrap = el.closest('.hc-present');
      var i = parseInt(wrap.getAttribute('data-index'), 10) || 0;
      if (i <= 0) return;
      HC.router.go({ name: 'present', id: wrap.getAttribute('data-guide'), index: i - 1 }, { force: true });
    },

    'present-next': function (el) {
      var wrap = el.closest('.hc-present');
      var i = parseInt(wrap.getAttribute('data-index'), 10) || 0;
      var guide = HC.data.getGuide(wrap.getAttribute('data-guide'));
      var total = HC.screens.guideHelpers.flatQuestions(guide).length;
      if (i >= total - 1) return;
      HC.router.go({ name: 'present', id: wrap.getAttribute('data-guide'), index: i + 1 }, { force: true });
    },

    'exit-present': function (el) {
      HC.router.go({ name: 'guide-reader', id: el.getAttribute('data-id') });
    },

    'toggle-present': function (el) {
      var id = el.getAttribute('data-id');
      var on = el.getAttribute('aria-pressed') !== 'true';
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      HC.store.updateMember(id, { present: on });
    },

    'add-member': function (el) {
      var form = el.closest('form');
      var input = form.querySelector('input[name="member"]');
      var name = (input.value || '').trim();
      if (!name) {
        c.toast('Give us a name first.');
        input.focus();
        return;
      }
      HC.store.addMember(name);
      input.value = '';
      HC.router.go({ name: 'leader' }, { force: true });
      c.toast(name + ' is on the list.');
    },

    'remove-member': function (el) {
      HC.store.removeMember(el.getAttribute('data-id'));
      HC.router.go({ name: 'leader' }, { force: true });
    },

    'add-prayer': function (el) {
      var form = el.closest('form');
      var who = form.querySelector('input[name="who"]');
      var text = form.querySelector('textarea[name="text"]');
      var body = (text.value || '').trim();
      if (!body) {
        c.toast('Write the request first.');
        text.focus();
        return;
      }
      HC.store.addPrayer((who.value || '').trim(), body);
      HC.native.tap('Light');
      who.value = '';
      text.value = '';
      HC.router.go({ name: 'leader' }, { force: true });
      c.toast('Saved. Come back to it during the week.');
    },

    'remove-prayer': function (el) {
      HC.store.removePrayer(el.getAttribute('data-id'));
      HC.router.go({ name: 'leader' }, { force: true });
    },

    /* -------------------------------------------------------------- profile */

    /* These three switches used to write a boolean into localStorage and
       nothing else, while promising a Monday morning notification the app had
       no way to send. Now the first one turned on is what asks iOS for
       permission, at the moment somebody has said they want this, rather than
       at launch before anyone knows what the app is.

       If permission is refused the switch goes back, because a switch that
       stays on while nothing arrives is the same lie in a quieter voice. */
    'toggle-notify': function (el) {
      var key = el.getAttribute('data-id');
      var profile = HC.store.getProfile();
      var next = Object.assign({}, profile.notifications);
      var turningOn = !next[key];

      next[key] = turningOn;
      HC.store.updateProfile({ notifications: next });
      setSwitch(el, turningOn);

      if (!HC.native.isNative()) return;

      var anyStillOn = Object.keys(next).some(function (k) { return next[k]; });

      if (turningOn) {
        HC.native.enableNotifications().then(function (granted) {
          if (granted) {
            HC.native.tap('Light');
            // Registration re-sends every preference, so the second switch
            // somebody turns on needs no request of its own.
            return;
          }
          next[key] = false;
          HC.store.updateProfile({ notifications: next });
          setSwitch(el, false);
          c.toast('Notifications are switched off for this app in Settings. Turn them on there and come back.');
        });
      } else if (anyStillOn) {
        // They still want something, just not this one. Update the row rather
        // than deregistering the phone, which would silence the others too.
        HC.native.syncPreferences();
      } else {
        // Last one off means stop sending to this phone entirely.
        HC.native.disableNotifications();
      }
    },

    /* The Journal lock. Turning it on asks for Face ID straight away rather
       than at the next visit: a lock nobody has seen work is a lock nobody
       trusts, and this is the one moment where failing is free. Turning it
       off does not ask, because somebody who can already see the switch has
       already got past the lock. */
    'toggle-lock': function (el) {
      var on = !HC.store.getProfile().lockJournal;

      if (!on) {
        HC.store.updateProfile({ lockJournal: false });
        HC.journal.lockAgain();
        setSwitch(el, false);
        c.toast('The Journal opens without asking now.');
        return;
      }

      HC.native.unlock('Lock your journal').then(function (ok) {
        if (!ok) {
          c.toast('Left as it was. Nothing was locked.');
          return;
        }
        HC.store.updateProfile({ lockJournal: true });
        // On, and locked, so the very next visit asks. Turning the lock on
        // and finding the Journal still open would teach somebody it does
        // not work.
        HC.journal.lockAgain();
        setSwitch(el, true);
        HC.native.tap('Light');
        c.toast('Locked. Your journal asks for you now.');
      });
    },

    'journal-unlock': function () {
      HC.journal.unlockNow().then(function (ok) {
        if (ok) HC.router.go({ name: 'journal' }, { force: true });
        else c.toast('Not unlocked. Try again whenever you like.');
      });
    },

    'toggle-theme': function (el) {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      HC.store.updateProfile({ theme: dark ? 'light' : 'dark' });
      HC.store.applyPreferences();
      setSwitch(el, !dark);
    },

    'toggle-leader': function (el) {
      var on = !HC.store.getProfile().leaderMode;
      HC.store.updateProfile({ leaderMode: on });
      setSwitch(el, on);
      HC.router.go({ name: 'profile' }, { force: true });
      c.toast(on ? 'Leader tools are on. Look for them in every guide.' : 'Leader tools are off.');
    },

    'text-size': function (el) {
      var value = parseFloat(el.getAttribute('data-value'));
      HC.store.updateProfile({ textScale: value });
      HC.store.applyPreferences();
      Array.prototype.forEach.call(
        el.parentNode.querySelectorAll('[data-action="text-size"]'),
        function (pill) { pill.setAttribute('aria-pressed', pill === el ? 'true' : 'false'); }
      );
    },

    /* -------------------------------------------------------- sign in */

    'auth-request': function (el) {
      var form = el.closest('form');
      var input = form.querySelector('input[name="identifier"]');
      var value = (input.value || '').trim();
      if (!HC.auth.classify(value)) {
        c.toast('That does not look like an email or a phone number.');
        input.focus();
        return;
      }
      el.setAttribute('disabled', 'true');
      HC.auth.requestCode(value).then(function (id) {
        HC.screens.profileHelpers.setAuthIdentifier(id.value);
        HC.screens.profileHelpers.setAuthStep('sent');
        HC.router.go({ name: 'profile' }, { force: true });
        c.toast(id.channel === 'email' ? 'Code sent. Check your email.' : 'Code sent. Check your texts.');
      }).catch(function (err) {
        el.removeAttribute('disabled');
        c.toast(err.message);
      });
    },

    'auth-verify': function (el) {
      var form = el.closest('form');
      var code = form.querySelector('input[name="code"]').value;
      var identifier = HC.screens.profileHelpers.getAuthIdentifier();
      el.setAttribute('disabled', 'true');
      HC.auth.verifyCode(identifier, code).then(function () {
        HC.screens.profileHelpers.resetAuth();
        HC.router.go({ name: 'profile' }, { force: true });
        c.toast('You are signed in.');
      }).catch(function (err) {
        el.removeAttribute('disabled');
        c.toast(err.message);
      });
    },

    'auth-restart': function () {
      HC.screens.profileHelpers.resetAuth();
      HC.router.go({ name: 'profile' }, { force: true });
    },

    'sign-out': function () {
      HC.auth.signOut().then(function () {
        HC.router.go({ name: 'profile' }, { force: true });
        c.toast('Signed out. Everything on this screen still works.');
      });
    },

    /* --------------------------------------------------------- the Group tab

       Every one of these is the same three steps: ask js/rooms.js to do the
       thing, repaint, and say something human if it failed. None of them
       touches the network directly and none of them decides what anybody is
       allowed to do, because the database already did both.

       `g` is js/screens/group.js's own state, kept there rather than in the
       DOM so that the eight second poll cannot sweep a half typed answer out
       from under somebody's thumb. */

    'room-join': function () {
      var g = HC.screens.groupHelpers;
      g.setJoinError(null);
      g.setBusy('join');
      g.repaint(true);
      HC.rooms.join(g.getCodeDraft()).then(function () {
        g.setCodeDraft('');
        g.setBusy(null);
        g.repaint(true);
        HC.native.tap('Light');
      }).catch(function (err) {
        g.setBusy(null);
        g.setJoinError(err.message);
        g.repaint(true);
      });
    },

    'room-open': function (el) {
      var g = HC.screens.groupHelpers;
      var guide = HC.data.getGuide(el.getAttribute('data-id'));
      g.setBusy('open');
      g.repaint(true);
      HC.rooms.open(guide).then(function () {
        g.setBusy(null);
        g.repaint(true);
        c.toast('Your room is open. Text the code to your group.');
      }).catch(roomFailed);
    },

    /* Swapping the guide of a room that is already open. The host swiped the
       rail to another Sunday and tapped the button on that slide.

       THE CONFIRM IS NOT DECORATION, and it only appears when it is true.
       Replacing the questions deletes the answers written under them, so
       whoever is about to do it is told how many, in the same sentence as
       what survives. With nothing written yet there is nothing to lose and
       nothing to ask about, and a leader tidying up before the group arrives
       should not have to argue with a dialog. */
    'room-switch-guide': function (el) {
      var g = HC.screens.groupHelpers;
      var guide = HC.data.getGuide(el.getAttribute('data-id'));
      if (!guide) return;

      var title = HC.data.guideTitle(guide);
      var n = HC.rooms.answerCounts().total;
      if (n && !window.confirm(
          'Run the room on “' + title + '” instead? Tonight’s questions are replaced on ' +
          'every phone, and ' + (n === 1 ? 'the one answer' : 'all ' + n + ' answers') +
          ' written under them go too. The prayer requests stay.')) return;

      g.setBusy('switch');
      g.repaint(true);
      HC.rooms.switchGuide(guide).then(function () {
        g.setBusy(null);
        g.repaint(true);
        HC.native.tap('Light');
        c.toast('The room is on “' + title + '” now.');
      }).catch(roomFailed);
    },

    'room-share-code': function () {
      var snap = HC.rooms.snapshot();
      if (!snap.room) return;
      var who = HC.store.firstName() || 'Somebody';
      HC.native.shareText(
        who + ' opened tonight\u2019s room in the Home Church app. Code ' +
        snap.room.code.slice(0, 3) + ' ' + snap.room.code.slice(3) +
        '. Open the Group tab and tap Join.', 'Tonight\u2019s room');
    },

    'room-keep': function () {
      var entry = keepTonight();
      if (!entry) {
        c.toast('You have not written anything in this room yet.');
        return;
      }
      HC.native.tap('Light');
      c.toast('Kept. It is in your Journal.');
      HC.screens.groupHelpers.repaint(true);
    },

    'room-leave': function () {
      offerToKeep(function () {
        HC.rooms.leave().then(function () { HC.screens.groupHelpers.repaint(true); });
      });
    },

    'room-close': function () {
      offerToKeep(function () {
        HC.rooms.close().then(function () {
          HC.screens.groupHelpers.repaint(true);
          c.toast('Room closed. The code stops working now.');
        }).catch(roomFailed);
      });
    },

    /* Writing. Each one checks the terms gate first, because guideline 1.2
       wants agreement before a first post. The database checks it too and
       would refuse, so this is the polite half of a rule that is enforced
       somewhere a client cannot reach. */

    'room-accept-terms': function () {
      var g = HC.screens.groupHelpers;
      HC.rooms.acceptTerms().then(function () {
        g.requireTerms(false);
        g.repaint(true);
      }).catch(roomFailed);
    },

    'room-post': function (el) {
      var g = HC.screens.groupHelpers;
      var qid = el.getAttribute('data-id');
      if (askForTerms()) return;
      g.setBusy(qid);
      g.repaint(true);
      HC.rooms.post(qid, g.drafts[qid] || '').then(function () {
        g.clearDraft(qid);
        g.setBusy(null);
        g.repaint(true);
        HC.native.tap('Light');
      }).catch(roomFailed);
    },

    'room-pray': function () {
      var g = HC.screens.groupHelpers;
      if (askForTerms()) return;
      var box = document.querySelector('[data-prayer="1"]');
      g.setBusy('prayer');
      g.repaint(true);
      HC.rooms.pray(box ? box.value : '').then(function () {
        g.clearPrayerDraft();
        g.setBusy(null);
        g.repaint(true);
      }).catch(roomFailed);
    },

    'room-edit-note': function (el) {
      var id = el.getAttribute('data-id');
      var note = HC.rooms.snapshot().notes.filter(function (n) { return n.id === id; })[0];
      if (!note) return;
      var next = window.prompt('Edit what you wrote', note.body);
      if (next === null || !next.trim()) return;
      HC.rooms.editNote(id, next).then(function () {
        HC.screens.groupHelpers.repaint(true);
      }).catch(roomFailed);
    },

    'room-delete-note': function (el) {
      if (!window.confirm('Delete what you wrote? This cannot be undone.')) return;
      HC.rooms.deleteNote(el.getAttribute('data-id')).then(function () {
        HC.screens.groupHelpers.repaint(true);
      }).catch(roomFailed);
    },

    /* The reveal, at its three grains. */

    'room-open-answer': function (el) {
      HC.rooms.openAnswer(el.getAttribute('data-id'), el.getAttribute('data-on') === '1')
        .then(function () { HC.screens.groupHelpers.repaint(true); HC.native.tap('Light'); })
        .catch(roomFailed);
    },

    'room-open-question': function (el) {
      HC.rooms.openQuestion(el.getAttribute('data-id'), el.getAttribute('data-on') === '1')
        .then(function () { HC.screens.groupHelpers.repaint(true); })
        .catch(roomFailed);
    },

    'room-open-all': function (el) {
      HC.rooms.openEverything(el.getAttribute('data-on') === '1')
        .then(function () { HC.screens.groupHelpers.repaint(true); })
        .catch(roomFailed);
    },

    /* The host's questions. */

    'room-edit-question': function (el) {
      var id = el.getAttribute('data-id');
      var q = HC.rooms.snapshot().questions.filter(function (x) { return x.id === id; })[0];
      if (!q) return;
      HC.screens.groupHelpers.setEditing({ id: id, body: q.body });
      HC.screens.groupHelpers.repaint(true);
    },

    'room-cancel-edit': function () {
      HC.screens.groupHelpers.setEditing(null);
      HC.screens.groupHelpers.repaint(true);
    },

    'room-save-question': function (el) {
      var g = HC.screens.groupHelpers;
      var box = document.querySelector('[data-editing="1"]');
      var body = box ? box.value : '';
      HC.rooms.editQuestion(el.getAttribute('data-id'), body).then(function () {
        g.setEditing(null);
        g.repaint(true);
      }).catch(roomFailed);
    },

    'room-remove-question': function (el) {
      if (!window.confirm('Remove this question for everybody in the room?')) return;
      var g = HC.screens.groupHelpers;
      HC.rooms.removeQuestion(el.getAttribute('data-id')).then(function () {
        g.setEditing(null);
        g.repaint(true);
      }).catch(roomFailed);
    },

    'room-add-question': function () {
      var g = HC.screens.groupHelpers;
      var box = document.querySelector('[data-newq="1"]');
      g.setBusy('newq');
      g.repaint(true);
      HC.rooms.addQuestion(box ? box.value : '').then(function () {
        g.clearNewQuestion();
        g.setBusy(null);
        g.repaint(true);
      }).catch(roomFailed);
    },

    /* Guideline 1.2. A reviewer will try all three of these, so they are
       plain buttons on every note rather than anything hidden behind a
       gesture. */

    /* What you already wrote about this guide, offered above the answer box.
       Both of these only ever touch the draft. See fromJournal() in
       js/screens/group.js for why that line is drawn where it is. */

    'room-journal-toggle': function (el) {
      var g = HC.screens.groupHelpers;
      var id = el.getAttribute('data-id');
      g.setShowingJournal(g.getShowingJournal() === id ? null : id);
      g.repaint(true);
    },

    'room-journal-use': function (el) {
      var g = HC.screens.groupHelpers;
      var qid = el.getAttribute('data-id');
      var entry = HC.journal.get(el.getAttribute('data-entry'));
      if (!entry) return;

      // Appended, never substituted: a half typed answer is not ours to eat.
      var had = (g.drafts[qid] || '').trim();
      g.setDraft(qid, had ? had + '\n\n' + entry.bodyText : entry.bodyText);
      g.setShowingJournal(null);
      g.repaint(true);

      var box = document.querySelector('[data-draft="' + qid + '"]');
      if (box) {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
      HC.native.tap('Light');
      c.toast('In the box. Edit it, then post it when you are ready.');
    },

    'room-report': function (el) {
      var why = window.prompt('What is wrong with this one? The person hosting will see it.');
      if (why === null) return;
      HC.rooms.report(el.getAttribute('data-id'), why).then(function () {
        // The repaint matters when the host is the one reporting: the queue
        // at the top of their own room should gain the row now, rather than
        // at the next poll, or the button looks like it did nothing.
        HC.screens.groupHelpers.repaint(true);
        c.toast('Reported. Whoever hosts this room will see it, and you can also write to ' +
                'hello@homechurchnola.com.');
      }).catch(roomFailed);
    },

    'room-block': function (el) {
      var name = el.getAttribute('data-name') || 'this person';
      if (!window.confirm('Block ' + name + '? You will stop seeing anything they write.')) return;
      HC.rooms.block(el.getAttribute('data-id'), true).then(function () {
        HC.screens.groupHelpers.repaint(true);
        c.toast('Blocked. You will not see their writing again.');
      }).catch(roomFailed);
    },

    /* The end of the night, on one sheet. Everything goes in, including the
       answers the group never got round to opening, which the button says and
       the cover repeats. The road is the same one Download guide takes:
       window.print() is a silent no-op inside WKWebView, so a phone gets a
       real file handed to the share sheet where iOS offers Print, Save to
       Files and Mail, and a browser gets the print dialog. */

    'room-sheet': function () {
      readyForSheet(function (snap) {
        if (!HC.native.isNative()) {
          HC.print.night(snap);
          return;
        }
        c.toast('Getting tonight ready.');
        HC.print.nightHtml(snap).then(function (html) {
          return HC.native.shareFile(sheetName(snap), html, 'text/html', 'Tonight');
        }).then(function (ok) {
          if (!ok) c.toast('Could not put that together. Try again in a moment.');
        }).catch(function () {
          c.toast('Could not put that together. Try again in a moment.');
        });
      });
    },

    /* Same sheet, handed to the share sheet with a message already written,
       so the common case is two taps rather than a save and a hunt through
       Files. On a browser there is no share sheet to hand it to, so this
       falls back to the print dialog and says so. */

    'room-send-sheet': function () {
      readyForSheet(function (snap) {
        if (!HC.native.isNative()) {
          c.toast('Save it first, then attach it to a message.');
          HC.print.night(snap);
          return;
        }
        c.toast('Getting tonight ready.');
        HC.print.nightHtml(snap).then(function (html) {
          return HC.native.shareFile(sheetName(snap), html, 'text/html',
            'Here is Thursday night, everything we wrote down.');
        }).then(function (ok) {
          if (!ok) c.toast('Could not put that together. Try again in a moment.');
        }).catch(function () {
          c.toast('Could not put that together. Try again in a moment.');
        });
      });
    },

    'room-unblock': function (el) {
      var name = el.getAttribute('data-name') || 'this person';
      HC.rooms.unblock(el.getAttribute('data-id')).then(function () {
        HC.screens.groupHelpers.repaint(true);
        c.toast('Unblocked. You will see what ' + name + ' writes again.');
      }).catch(roomFailed);
    },

    'room-take-down': function (el) {
      if (!window.confirm('Take this down for everybody in the room?')) return;
      HC.rooms.takeDown(el.getAttribute('data-id')).then(function () {
        HC.screens.groupHelpers.repaint(true);
        c.toast('Taken down. It is gone for everybody, including whoever wrote it.');
      }).catch(roomFailed);
    },

    /* The other way a report ends. Without this the only button that empties
       the queue is the one that deletes somebody's writing, which is a bad
       thing to make the easy path. */
    'room-resolve-report': function (el) {
      HC.rooms.resolveReport(el.getAttribute('data-id')).then(function () {
        HC.screens.groupHelpers.repaint(true);
        c.toast('Left up, and the report is closed.');
      }).catch(roomFailed);
    }
  };

  /* The sheet promises the whole night, "including the answers the group
     never got round to opening". That promise used to be built on the host's
     phone holding every answer, and it does not: a shut answer never reaches
     anybody, the host included, which is the rule the feature rests on.

     Rather than opening a back door for the host to read what the room never
     saw, the sheet opens them. It is the end of the night, the button says
     everything, and this keeps one plain rule: nothing lands on the sheet
     that the group did not see first. The confirm says so, because opening
     every answer is a real thing to do to a room and should not happen
     because somebody tapped Print. */
  function readyForSheet(then) {
    var snap = HC.rooms.snapshot();
    if (!snap.room) return;

    var n = HC.rooms.answerCounts();
    var shut = n.total - n.open;
    if (!shut) { then(snap); return; }

    if (!window.confirm(shut === 1
      ? 'One answer is still shut. Printing opens it to the room first, so nothing on the sheet is a surprise to whoever wrote it. Go ahead?'
      : shut + ' answers are still shut. Printing opens them to the room first, so nothing on the sheet is a surprise to whoever wrote it. Go ahead?')) return;

    c.toast('Opening the last answers.');
    HC.rooms.openEverything(true).then(function () {
      HC.screens.groupHelpers.repaint(true);
      then(HC.rooms.snapshot());
    }).catch(roomFailed);
  }

  // A filename somebody will recognise a week later in Files.
  function sheetName(snap) {
    var when = new Date(snap.room.openedAt || Date.now()).toISOString().slice(0, 10);
    var who = (snap.room.groupName || snap.room.guideTitle || 'group')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return who + '-' + when + '.html';
  }

  /* ------------------------------------------------------- keeping tonight

     A room is swept ninety days after it closes, by migration 0022, and that
     is right: it is other people's writing sitting in a shared place. But it
     means what somebody wrote on a Thursday is on a clock they did not set,
     and the only copy that outlives it is the sheet the host sends round.

     So this puts your own half of the evening in your own journal. Your
     answers, and the prayer requests, which are the one part of a room the
     whole group sees by design and which already go out on the night sheet.
     Nobody else's answers, ever: those were written to the room, not to you.

     The entry id is derived from the room, so keeping twice updates the same
     entry rather than making a second one, and so the room can tell whether
     it has been kept already. */

  function nightEntryId(roomId) {
    return 'night-' + roomId;
  }

  function keepTonight() {
    var snap = HC.rooms.snapshot();
    if (!snap.room) return null;

    var me = HC.auth.isSignedIn() && HC.auth.getUser();
    var meId = me && me.id;
    var mine = snap.notes.filter(function (n) {
      return n.authorId === meId && n.kind !== 'prayer';
    });
    var prayers = snap.notes.filter(function (n) { return n.kind === 'prayer'; });

    if (!mine.length && !prayers.length) return null;

    var when = c.formatDate(new Date(snap.room.openedAt || Date.now()).toISOString().slice(0, 10));
    var html = '';

    mine.forEach(function (note) {
      var q = snap.questions.filter(function (x) { return x.id === note.questionId; })[0];
      if (q) html += '<p><em>' + c.esc(q.body) + '</em></p>';
      html += '<p>' + c.esc(note.body) + '</p>';
    });

    if (prayers.length) {
      html += '<p><strong>What the room was carrying</strong></p><ul>';
      prayers.forEach(function (p) {
        html += '<li>' + c.esc(p.author) + ': ' + c.esc(p.body) + '</li>';
      });
      html += '</ul>';
    }

    var id = nightEntryId(snap.room.id);
    var patch = {
      id: id,
      kind: 'night',
      guideId: snap.room.guideId || null,
      guideTitle: snap.room.guideTitle || null,
      quote: (snap.room.groupName || snap.room.guideTitle || 'Your group') + ', ' + when,
      bodyHtml: html
    };

    return HC.journal.get(id)
      ? HC.journal.update(id, { bodyHtml: html })
      : HC.journal.create(patch);
  }

  /* Asked on the way out, because that is the moment somebody finds out the
     room is over, and it is the last moment they can do anything about it.
     window.confirm, like the other room actions that cannot be undone. It
     never blocks: whatever they answer, `then` runs. */
  function offerToKeep(then) {
    var snap = HC.rooms.snapshot();
    var kept = snap.room && HC.journal.get(nightEntryId(snap.room.id));

    if (!snap.room || kept) { then(); return; }

    var me = HC.auth.isSignedIn() && HC.auth.getUser();
    var wrote = snap.notes.some(function (n) { return n.authorId === (me && me.id); });
    if (!wrote) { then(); return; }

    if (window.confirm('Keep what you wrote tonight in your Journal? ' +
        'A room is deleted ninety days after it closes, and this is the only copy that outlives it.')) {
      keepTonight();
      c.toast('Kept. It is in your Journal.');
    }
    then();
  }

  /* One place for a failed room action. These are ordinary network and
     permission errors and the message from js/rooms.js is already written for
     a person, so this shows it rather than inventing a second wording. */
  function roomFailed(err) {
    var g = HC.screens.groupHelpers;
    if (g) { g.setBusy(null); g.repaint(true); }
    c.toast(err && err.message ? err.message : 'That did not go through. Try again in a moment.');
  }

  // Returns true when the write has been held back for the terms screen.
  function askForTerms() {
    var g = HC.screens.groupHelpers;
    if (!g.needsTerms()) return false;
    g.requireTerms(true);
    g.repaint(true);
    return true;
  }

  /* Where the last thing you typed went, in four words, under the box. It
     changes with sign-in state because the truth does, and a caption that
     says "on this phone" to somebody whose writing is also on a server is
     the kind of small lie that costs a privacy policy its credibility. */
  function savedWhere() {
    return HC.auth.isSignedIn() ? 'Saved to your account' : 'Saved on this phone';
  }

  /* The entry screen's body box. Called debounced, from one place.

     The first save of a new entry is the interesting one: there is no row
     yet, so this makes it and then replaces the route so the screen that is
     already on screen is now looking at something real. `replace` rather than
     push, because 'new' is not a place anybody should be able to go back to. */
  function saveEntryBody(html) {
    var j = HC.screens.journalHelpers;
    var wrap = document.querySelector('[data-entry]');
    if (!wrap) return;

    var id = wrap.getAttribute('data-entry');
    var status = document.querySelector('[data-journal-status]');

    // Whether there is anything in there is a question about words, not about
    // markup: an empty contenteditable is rarely an empty string. It is
    // <br>, or <p><br></p>, depending on the browser and on what was just
    // deleted.
    var words = HC.journal.plainText(html).trim();

    function said() {
      if (!status) return;
      status.textContent = words ? savedWhere() : '';
      status.setAttribute('data-visible', words ? 'true' : 'false');
    }

    if (id !== 'new') {
      HC.journal.update(id, { bodyHtml: html });
      said();
      return;
    }

    // Nothing but whitespace is not an entry yet. Keep waiting.
    if (!words) return;

    var draft = j.getDraft() || {};
    var entry = HC.journal.create({ bodyHtml: html, guideId: draft.guideId || null });
    j.clearDraft();
    wrap.setAttribute('data-entry', entry.id);
    HC.router.replaceCurrent({ name: 'journal-entry', id: entry.id });
    said();
  }

  function paintLockRow() {
    var slot = document.querySelector('[data-lockrow]');
    if (!slot) return;
    slot.innerHTML = HC.screens.profileHelpers.lockRow();
    slot.hidden = false;
  }

  function setSwitch(el, on) {
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    var knob = el.querySelector('.hc-switch');
    if (knob) knob.setAttribute('aria-checked', on ? 'true' : 'false');
  }


  /* ------------------------------------------------------------- the Admin
     screen

     The markup is in js/screens/admin.js and the handling is here, the same
     seam profileHelpers draws. Everything below either edits the draft that
     screen is holding or makes one network call and repaints.
     ---------------------------------------------------------------------- */

  function adminHelpers() {
    return HC.screens.adminHelpers;
  }

  /* The same 400ms debounce wireEvents() uses, hoisted so the admin handlers
     above can reach it too. Keyed, so two fields edited in the same moment do
     not cancel each other. */
  var adminTimers = {};
  function debounceGlobal(key, fn) {
    window.clearTimeout(adminTimers[key]);
    adminTimers[key] = window.setTimeout(fn, 400);
  }

  /* A repaint that keeps the reader where they were. Every admin action ends
     in one of these rather than patching the DOM, because the screen is
     rendered from the draft and the caches in one pass and there is nothing
     to patch. restore:true is what stops a save throwing somebody back to the
     top of a long list. */
  function repaintAdmin() {
    var route = HC.router.current();
    if (!route || route.name !== 'admin') return;
    HC.router.go({ name: 'admin', id: route.id, restore: true }, { force: true });
  }

  /* Every keystroke on the Admin screen. Writes into the draft object and
     draws nothing, for the reason in the input listener above.

     The one exception is a text app setting, which has no Save button because
     a settings screen with one would be a settings screen people leave
     half saved. It debounces to the table instead, keyed per setting so
     editing two of them inside the same 400ms does not cancel the first. */
  function adminInput(name, id, value) {
    var h = adminHelpers();
    var d = h.getDraft();
    var p = h.getPageDraft();
    var n = h.getNewSetting();

    if (name === 'setting') {
      debounceGlobal('setting-' + id, function () {
        HC.admin.saveSetting(id, 'text', value).catch(function (err) {
          HC.components.toast(err.message || 'That did not save.');
        });
      });
      return;
    }

    if (d && ANNOUNCEMENT_FIELDS[name]) { d[name] = value; return; }

    if (p) {
      if (name === 'pageTitle') { p.title = value; return; }
      if (name === 'pageEyebrow') { p.eyebrow = value; return; }
      if (name === 'pageBlurb') { p.blurb = value; return; }
      var index = parseInt(id, 10);
      if (p.sections[index]) {
        if (name === 'sectionHeading') p.sections[index].heading = value;
        if (name === 'sectionBody') p.sections[index].body = value;
      }
      return;
    }

    if (n) {
      if (name === 'newLabel') n.label = value;
      if (name === 'newHelp') n.help = value;
    }
  }

  var ANNOUNCEMENT_FIELDS = {
    title: true, body: true, eyebrow: true,
    imageUrl: true, videoUrl: true, startsOn: true, endsOn: true
  };

  /* The picture. Uploaded the moment it is chosen rather than when the
     announcement is saved, so the person sees it land and can change their
     mind, and so a failure is about the picture rather than about the whole
     announcement. */
  function uploadAnnouncementImage(file) {
    var h = adminHelpers();
    if (!file || !h.getDraft()) return;

    h.setUploading(true);
    repaintAdmin();

    HC.admin.uploadImage(file).then(function (url) {
      var d = h.getDraft();
      if (d) d.imageUrl = url;
    }).catch(function (err) {
      HC.components.toast(err.message || 'That picture would not upload.');
    }).then(function () {
      h.setUploading(false);
      repaintAdmin();
    });
  }

  /* Wraps a network call in the busy flag, so the button that started it is
     disabled and marked while it is out. One helper because every admin write
     wants exactly this and forgetting it is how somebody double posts an
     announcement on a slow connection. */
  function adminRun(token, promise, onDone) {
    var h = adminHelpers();
    h.setBusy(token);
    repaintAdmin();

    return promise.then(function (result) {
      if (onDone) onDone(result);
    }).catch(function (err) {
      HC.components.toast(err.message || 'That did not go through. Try again in a moment.');
    }).then(function () {
      h.setBusy('');
      repaintAdmin();
    });
  }

  function announcementById(id) {
    return HC.admin.announcements().filter(function (a) { return a.id === id; })[0] || null;
  }

  function pageById(id) {
    return HC.admin.pages().filter(function (p) { return p.id === id; })[0] || null;
  }

  /* -------------------------------------------------------------- listeners */

  function wireEvents() {
    document.addEventListener('click', function (evt) {
      var el = evt.target.closest('[data-action]');
      if (!el) return;
      var name = el.getAttribute('data-action');
      var fn = actions[name];
      if (!fn) return;
      evt.preventDefault();
      fn(el, evt);
    });

    /* The dots under a carousel, told which slide is showing. Capture phase
       for the same reason as the error listener below: a scroll event on an
       inner scroller does not bubble, so a listener on document only ever
       hears it on the way down.

       Delegated rather than wired up by the screen that draws the carousel,
       because screens here render to a string and hand back an element, and
       nothing gives them a moment after it is mounted to attach anything.
       This costs one filtered call per scroll frame on a screen with no
       carousel on it, which is nothing, and it means any screen can draw one
       by marking the scroller [data-carousel] and putting [data-dot] children
       next to it.

       The showing slide is the one whose left edge is nearest the scroller's,
       measured rather than divided, so it stays right whatever the slides are
       sized at and whichever way the writing runs. */
    function showingSlide(rail) {
      var slides = rail.firstElementChild ? rail.firstElementChild.children : [];
      var best = -1;
      var bestGap = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var gap = Math.abs(slides[i].offsetLeft - rail.scrollLeft);
        if (gap < bestGap) { bestGap = gap; best = i; }
      }
      return best;
    }

    function paintDots(rail, index) {
      var dots = rail.parentNode ? rail.parentNode.querySelectorAll('[data-dot]') : [];
      for (var d = 0; d < dots.length; d++) {
        if (d === index) dots[d].setAttribute('data-on', 'true');
        else dots[d].removeAttribute('data-on');
      }
    }

    var dotsPending = false;
    document.addEventListener('scroll', function (evt) {
      var rail = evt.target;
      if (!rail || !rail.hasAttribute || !rail.hasAttribute('data-carousel')) return;
      if (dotsPending) return;
      dotsPending = true;
      window.requestAnimationFrame(function () {
        dotsPending = false;
        var index = showingSlide(rail);
        if (index < 0) return;
        paintDots(rail, index);

        /* A picker rather than a gallery: the series rail on Listen changes
           what is drawn under it, so it is told where it landed as well as
           having its dots painted. The screen ignores the frames where the
           slide has not actually changed, which is nearly all of them. */
        if (rail.hasAttribute('data-series-rail') && HC.screens.listenHelpers) {
          HC.screens.listenHelpers.selectSeries(rail, index);
        }

        /* The same arrangement on Group, where the rails pick which Sunday's
           guide a room opens on and which one a room already open is running.
           Nothing is redrawn when one of these lands: every slide carries its
           own guide's id on the button inside it, so the screen only has to
           remember where the rail stopped. */
        if (rail.hasAttribute('data-guide-rail') && HC.screens.groupHelpers) {
          HC.screens.groupHelpers.selectGuide(rail, index);
        }
      });
    }, true);

    /* An image that fails to load. Capture phase, because error events from
       an <img> do not bubble and an ordinary listener here would never fire.

       The tile marks itself and CSS lets the cream block underneath show
       through, which is how missing art looks everywhere else in this app.
       Without this, a photograph that did not arrive draws the web view's
       broken image glyph in the middle of a row of real photographs, which
       looks like a bug in the app rather than one slow request. */
    document.addEventListener('error', function (evt) {
      var el = evt.target;
      if (!el || el.tagName !== 'IMG' || !el.closest) return;
      var tile = el.closest('[data-media-fallback]');
      if (tile) tile.setAttribute('data-failed', 'true');
    }, true);

    // Anything typed is saved quietly, a moment after the typing stops.
    var timers = {};
    function debounce(id, fn) {
      window.clearTimeout(timers[id]);
      timers[id] = window.setTimeout(fn, 400);
    }

    document.addEventListener('input', function (evt) {
      var el = evt.target;

      /* The Group tab. Kept in the screen's own module rather than debounced
         to storage, because none of it is worth persisting and all of it has
         to survive the eight second poll rebuilding the DOM.

         The repaint is conditional on purpose: it only runs when the button
         under the box appears or disappears, which is the only thing about
         typing that changes what is drawn. Repainting on every keystroke
         would be correct and would also mean rebuilding the room between two
         letters of a word. */
      if (el.getAttribute) {
        var g = HC.screens.groupHelpers;
        var draftKey = el.getAttribute('data-draft');
        if (draftKey) {
          var had = (g.drafts[draftKey] || '').trim();
          g.setDraft(draftKey, el.value);
          if (!had !== !el.value.trim()) g.repaint(true);
          return;
        }
        if (el.getAttribute('data-prayer')) {
          var hadPrayer = document.querySelector('[data-action="room-pray"]');
          g.setPrayerDraft(el.value);
          if (!hadPrayer !== !el.value.trim()) g.repaint(true);
          return;
        }
        if (el.getAttribute('data-newq')) {
          var hadQ = document.querySelector('[data-action="room-add-question"]');
          g.setNewQuestion(el.value);
          if (!hadQ !== !el.value.trim()) g.repaint(true);
          return;
        }
        if (el.getAttribute('data-editing')) {
          var open = g.getEditing();
          if (open) g.setEditing({ id: open.id, body: el.value });
          return;
        }
        if (el.name === 'code' && el.closest('[data-join-form]')) {
          // Digits only, and the spacing is redrawn rather than typed. Six
          // digits with a space in the middle is easier to read back off a
          // text message than 486217.
          var digits = el.value.replace(/\D/g, '').slice(0, 6);
          var wasReady = g.getCodeDraft().length === 6;
          g.setCodeDraft(digits);
          el.value = digits.length > 3 ? digits.slice(0, 3) + ' ' + digits.slice(3) : digits;
          if (wasReady !== (digits.length === 6)) g.repaint(true);
          return;
        }
      }

      /* The self-reflection boxes in the guide reader. They are journal
         entries now and always were, so they write through js/journal.js
         rather than into guideState. The question text travels with the save
         so the entry reads right in the Journal without having to go and look
         the guide up again, and still reads right after the guide is
         reworded. */
      var journalKey = el.getAttribute && el.getAttribute('data-journal-key');
      if (journalKey !== null && journalKey !== undefined) {
        var guideId = guideIdFrom(el);
        if (!guideId) return;
        debounce('journal-' + journalKey, function () {
          var guide = HC.data.getGuide(guideId);
          var question = guide && guide.reflectionQuestions && guide.reflectionQuestions[+journalKey];
          HC.journal.setReflection(guideId, journalKey, el.value, question);
          var status = document.querySelector('[data-journal-status="' + journalKey + '"]');
          if (status) {
            status.textContent = el.value.trim() ? savedWhere() : '';
            status.setAttribute('data-visible', el.value.trim() ? 'true' : 'false');
          }
        });
        return;
      }

      /* The Journal's own boxes. The entry screen is the one place in the app
         where typing can bring a row into existence: `new` has no entry
         behind it until there are words, and the route is swapped underneath
         once there are, so the back gesture and a reload both land on the
         real entry rather than on a blank draft. */
      if (el.getAttribute && el.getAttribute('data-journal-body') !== null) {
        // A contenteditable, not a textarea: what was typed is markup, and it
        // is sanitized on the way into the store rather than here.
        debounce('journal-body', function () { saveEntryBody(el.innerHTML); });
        return;
      }

      if (el.getAttribute && el.getAttribute('data-journal-guide') !== null) {
        var j = HC.screens.journalHelpers;
        var wrap = el.closest('[data-entry]');
        var entryId = wrap && wrap.getAttribute('data-entry');
        if (entryId && entryId !== 'new') {
          HC.journal.update(entryId, { guideId: el.value || null });
          c.toast(el.value ? 'Tagged.' : 'Untagged.');
        } else {
          j.setDraft({ guideId: el.value || null });
        }
        return;
      }

      if (el.getAttribute && el.getAttribute('data-journal-search') !== null) {
        debounce('journal-search', function () {
          HC.screens.journalHelpers.setSearch(el.value);
          HC.screens.journalHelpers.repaint();
          var box = document.querySelector('[data-journal-search]');
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        });
        return;
      }

      /* The Admin screen. Every field writes into the draft object that
         js/screens/admin.js is holding rather than into the DOM, so a content
         refresh landing mid-sentence redraws the form with the words still in
         it. Nothing is saved to Supabase here: an announcement is saved when
         somebody presses the button, which is what makes Cancel mean
         something.

         No repaint on keystroke, deliberately. The form is already showing
         what was typed, and rebuilding it would pull the caret out from under
         the thumb, which is the bug the router's replaceCurrent() exists to
         avoid on the Journal. */
      var adminField = el.getAttribute && el.getAttribute('data-admin-field');
      if (adminField) {
        adminInput(adminField, el.getAttribute('data-id'), el.value);
        return;
      }

      var profileField = el.getAttribute && el.getAttribute('data-profile-field');
      if (profileField) {
        // Keyed per field, not shared, so editing first name and then last
        // name inside the same 400ms does not cancel the first save.
        debounce('profile-' + profileField, function () {
          var patch = {};
          patch[profileField] = el.value;
          HC.auth.saveProfile(patch);
          paintAvatar();
        });
        return;
      }

      var memberId = el.getAttribute && el.getAttribute('data-member-note');
      if (memberId) {
        debounce('member-' + memberId, function () {
          HC.store.updateMember(memberId, { note: el.value });
        });
      }
    });

    /* A <mark> in a guide is role="button", not a real one, for the reason in
       js/journal.js: a button inside a paragraph suppresses selection across
       itself on iOS. A real button answers the keyboard for free and this one
       does not, so this is that half. Space is included because a role of
       button says it should be. */
    document.addEventListener('keydown', function (evt) {
      if (evt.key !== 'Enter' && evt.key !== ' ') return;
      var el = evt.target.closest && evt.target.closest('[data-action][role="button"]');
      if (!el) return;
      var fn = actions[el.getAttribute('data-action')];
      if (!fn) return;
      evt.preventDefault();
      fn(el, evt);
    });

    /* A toolbar button must not steal the caret. mousedown is where focus
       moves, so refusing it there is what keeps the selection alive long
       enough for execCommand to act on it. The click still lands. */
    document.addEventListener('mousedown', function (evt) {
      var el = evt.target.closest && evt.target.closest('[data-keep-focus]');
      if (el) evt.preventDefault();
    });

    // The scripture sheet's dropdowns. A <select> reports 'change', and on
    // iOS the wheel reports it once, when the picker is dismissed.
    document.addEventListener('change', function (evt) {
      var what = evt.target.getAttribute && evt.target.getAttribute('data-scripture');
      if (what) HC.editor.setPick(what, evt.target.value);

      // The announcement picture. A file input only ever reports 'change',
      // never 'input', which is why this is here rather than above.
      if (evt.target.hasAttribute && evt.target.hasAttribute('data-admin-image')) {
        uploadAnnouncementImage(evt.target.files && evt.target.files[0]);
      }
    });

    // Forms are inert in v1. Stop the browser from navigating away.
    document.addEventListener('submit', function (evt) {
      evt.preventDefault();
    });

    // Follow the system theme while the user has not chosen one.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (HC.store.getProfile().theme === 'system') HC.store.applyPreferences();
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ------------------------------------------------------------------- boot */

  function boot() {
    HC.store.applyPreferences();

    // Last known good content, straight off the device, before anything is
    // drawn. Synchronous on purpose: it is a single localStorage read, and
    // doing it here means a returning phone opens to this week's guide
    // instead of whatever was frozen into the binary at build time. A first
    // install has no cache and falls through to js/data.js, which is why
    // that file still ships.
    HC.content.primeFromCache();

    renderShell();
    wireEvents();
    wireSheet();
    watchScroll();

    /* The one list, handed to the one thing that has to agree with it. The
       router owns the order a drag runs, this file owns what the sheet draws,
       and syncModules is what keeps them the same list. Called again on every
       'auth' below, because the last stop belongs to whoever is signed in. */
    syncModules();

    HC.dateRail.init({
      scroller: scroller,
      rail: document.getElementById('hc-date-rail'),
      topbar: topbar
    });

    HC.indexRail.init({
      scroller: scroller,
      rail: document.getElementById('hc-index'),
      titles: document.getElementById('hc-index-titles'),
      card: document.getElementById('hc-index-card'),
      veil: document.getElementById('hc-index-veil'),
      live: document.getElementById('hc-index-live')
    });

    // Drag left or right on a tab and the next one comes with your thumb.
    // Wired before the router starts so the first screen is already swipeable.
    HC.swipe.init({
      scroller: scroller,
      mount: mount,
      tabbar: tabbar,
      totop: totop
    });

    HC.router.start({
      mount: mount,
      scroll: scroller,
      routes: {
        home: HC.screens.home,
        listen: HC.screens.listen,
        guide: HC.screens.guide,
        group: HC.screens.group,
        connect: HC.screens.connect,
        more: HC.screens.more,
        practices: HC.screens.practices,
        practice: HC.screens.practice,
        journal: HC.screens.journal,
        'journal-entry': HC.screens.journalEntry,
        give: HC.screens.give,
        profile: HC.screens.profile,
        admin: HC.screens.admin,
        page: HC.screens.page,
        leader: HC.screens.leader,
        'guide-reader': HC.screens.guideReader,
        present: HC.screens.present,
        privacy: HC.screens.privacy,
        terms: HC.screens.terms,
        data: HC.screens.data
      }
    });

    /* Home is on the glass. The greeting in front of it can start leaving,
       which it does on its own schedule: it holds until its own sequence has
       finished rather than cutting away mid animation. See js/splash.js. */
    if (HC.splash) HC.splash.ready();

    // Session restore is async and best effort. If it lands while Profile
    // is on screen, repaint it so the signed-in state catches up.
    HC.store.on('auth', function () {
      paintAvatar();

      /* The row a drag runs is as long as the person holding the phone: Admin
         is the last stop for an admin and is not there at all for anybody
         else. Signing in, signing out, and the role landing on the session
         refresh all arrive here, and this is what makes the swipe agree with
         the sheet from that moment on. */
      syncModules();

      var route = HC.router.current();
      if (route && route.name === 'profile') HC.router.go({ name: 'profile' }, { force: true });
    });

    // A content check finishing changes the line at the bottom of Profile even
    // when the content itself did not change, so repaint it the same way.
    HC.store.on('content', function () {
      /* A newly pinned announcement has to reach a phone that is already
         open, which is the whole path an admin takes: they post it from this
         screen, and the person in the next room is sitting on Listen. The
         strip is shell chrome, so the router's redraw of the current view
         does not touch it, and this is what does.

         Unconditional, unlike the repaint below, because js/content.js only
         redraws when its fingerprint changed and that fingerprint does not
         look at every row. A pin toggled on the third announcement in the
         table is exactly the change it would miss. */
      paintPinBar();

      var route = HC.router.current();
      if (route && route.name === 'profile') {
        HC.router.go({ name: 'profile', restore: true }, { force: true });
      }
    });
    HC.auth.init();

    /* The Group tab. Reads its cached room off the phone and shows it before
       any network happens, same rule as content: never blank, never blocked.

       The subscriber is what makes a room live. js/rooms.js polls while the
       tab is visible and emits on every change, and repaint() decides whether
       anything a person would notice actually moved before touching the DOM.
       Polling only runs while the Group tab is the current view, so sitting on
       Home is not quietly re-reading a room every eight seconds. */
    /* The journal store. Reads off the phone, brings the guide reader's old
       self-reflection answers across on the first launch that sees them, and
       adopts anything written signed out when somebody signs in. */
    HC.journal.init();

    /* The nine practices. index.json comes down now so the grid is ready
       before anybody swipes to it; each practice's own file waits until its
       page is opened. Neither blocks anything, and a screen that asked for
       something still on its way repaints when it lands. */
    HC.practices.init();
    /* A list the Admin screen asked for has arrived. Same shape as the
       practices subscriber below and for the same reason: js/admin.js fetches
       after the screen has already drawn, because a screen here renders to a
       string in one pass and cannot wait.

       Without this the sections draw "Loading…" and stay there forever, which
       is exactly what they did until a browser was pointed at them. Every
       admin write also ends in a repaint, and those go through repaintAdmin()
       directly; this is the one for a read nobody is standing over. */
    HC.store.on('admin', function () {
      var route = HC.router.current();
      if (!route || route.name !== 'admin') return;
      HC.router.go(Object.assign({}, route, { restore: true }),
                   { force: true, animate: false, replace: true });
    });

    HC.store.on('practices', function () {
      var route = HC.router.current();
      if (!route) return;
      if (route.name !== 'practices' && route.name !== 'practice') return;
      /* replace, never push. This is a repaint of the screen somebody is
         already looking at, not a place they went, and pushing here puts a
         second identical entry on the stack: the back arrow then takes one
         tap to go from a practice to the same practice and a second to
         actually leave it. */
      HC.router.go(Object.assign({}, route, { restore: true }),
                   { force: true, animate: false, replace: true });
    });

    /* Selecting words in a guide. Wired after the router so the reader it
       listens to already exists, and it listens to the document rather than
       to any one screen, so a guide that re-renders does not take it with
       it. */
    HC.highlight.init();

    HC.store.on('journal', function () {
      var route = HC.router.current();
      if (route && route.name === 'journal') HC.screens.journalHelpers.repaint();
    });

    HC.rooms.init();

    HC.store.on('room', function () {
      var route = HC.router.current();
      if (route && route.name === 'group') HC.screens.groupHelpers.repaint();
    });

    // An APNs token is not permanent. It changes on restore from backup and
    // sometimes on reinstall, and a church sending to a stale token gets
    // silence rather than an error, so this re-registers on every launch
    // where somebody has already asked for notifications.
    HC.native.resumeNotifications();

    /* The Journal lock row appears only on a phone that can actually
       challenge somebody. The answer is asynchronous and Profile has already
       painted by the time it lands, so the row is put in when it arrives and
       whenever Profile is drawn after that. */
    HC.native.canLock().then(function (can) {
      if (!can) return;
      paintLockRow();
      HC.store.on('view', paintLockRow);
    });

    // Then go and get the current content, after the first paint so nothing
    // waits on the network. If it lands and something actually changed, the
    // current screen redraws in place with the scroll position kept. If the
    // phone is offline, or the project is unreachable, this quietly does
    // nothing and the app carries on with what it already had.
    HC.content.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.HC = window.HC || {});
