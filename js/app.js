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
     array and a line out of MODULES below.

     CAL AND GROUP HAVE SWAPPED. The fourth tile is Cal now and Group is the
     second module behind •••. The count did not move, so the geometry above
     still holds: one name came out of the bar and another went in. Both lists
     were edited together, which is the whole trade the note above describes,
     and HC.router.TABS below was edited with them. */
  var TAB_META = [
    { name: 'home',    label: 'Home',    icon: 'home' },
    { name: 'listen',  label: 'Listen',  icon: 'listen' },
    { name: 'guide',   label: 'Guide',   icon: 'guide' },
    { name: 'cal',     label: 'Cal',     icon: 'calendar' },
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
    /* First in the row, and the position is the argument. A drag left off
       Connect brings in the first module, and Worship is the one of these
       that belongs to Sunday morning the way Listen and Guide do: it is the
       songs from the same service as the message two tabs to its left. The
       three below it are things you do during the week. */
    {
      route: 'worship',
      icon: 'worship',
      title: 'Worship',
      sub: 'The songs from Sunday, and where to hear them again.'
    },
    /* Second, next to Worship, in the slot Cal held before the two swapped.
       It keeps that slot for the same reason Cal had it: these two are the
       church's own Sunday, the songs the band played and the room the guide
       is read in, and a drag left off the bar reaches both of them together.
       Nothing else about the Group tab changed in the move. */
    {
      route: 'group',
      icon: 'group',
      title: 'Group',
      sub: 'Your room, the guide it is reading, and who is in it.'
    },
    {
      route: 'practices',
      icon: 'practiceSabbath',
      title: 'Practices',
      sub: 'Nine practices of Jesus, a few sessions each.'
    },
    /* Straight after Practices, and next to it rather than next to Give,
       because these two are the same kind of thing: somebody else's course,
       gathered here so our people can walk through it together. Practices is
       for somebody already walking. Alpha is for somebody at the start of it,
       or not sure they are on the road at all. */
    {
      route: 'alpha',
      icon: 'alpha',
      title: 'Alpha',
      sub: 'Dinner, a short film, and any question you want to ask.'
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
  var MODULE_ROUTES = ['more', 'worship', 'group', 'practices', 'practice', 'alpha',
                       'journal', 'journal-entry', 'give', 'admin'];

  var TITLES = {
    home: 'Home',
    listen: 'Listen',
    guide: 'Guides',
    group: 'Group',
    connect: 'Connect',
    more: 'More',
    worship: 'Worship',
    // The month grid and the church's own dates under it. Still "Cal" now
    // that it is the fourth tile: the tile's label and this table have to
    // agree, and the short name is what fits under the icon.
    cal: 'Cal',
    practices: 'Practices',
    // Replaced with the practice's own name once its file has loaded, see
    // emitViewChange below. This is what the bar carries until then.
    practice: 'Practice',
    alpha: 'Alpha',
    give: 'Give',
    journal: 'Journal',
    'journal-entry': 'Your entry',
    // The menu carries this the way any stop does, once the screen scrolls.
    // A section is a pushed view and carries it from the moment it opens,
    // beside the arrow back to the menu, where until now it carried nothing.
    admin: 'Admin',
    // One announcement, on its own page. A pushed view like a guide or a
    // journal entry: the arrow and this word in the bar, the back disc by the
    // thumb, and no sideways drag. The card on Home is what opens it.
    announcement: 'Announcement',
    // The box in the top bar. A pushed view like Your account: the arrow and
    // this word in the bar, and no sideways drag out of it.
    search: 'Search',
    profile: 'Your account',
    leader: 'Leader mode',
    'guide-reader': 'Guide',
    present: 'Presenting',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    data: 'Your data'
  };

  /* What every route is called, published, so nothing has to write the list
     out a second time. js/search.js is the reader: a search result naming a
     screen says "Worship" because this says so, and a module renamed here is
     renamed in the search results on the same commit. Read at search time
     rather than at load, so the order of the script tags does not matter. */
  HC.titles = TITLES;

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
        /* Three circles at the right end of the bar, in one flex box of their
           own rather than as three more children of the header.

           THE WRAPPER IS NOT DECORATION. The header lays its children out
           with a gap of --hc-space-md, which is right between the logo and
           the buttons and much too wide between the buttons themselves: on a
           375pt phone three 44pt targets plus two of those gaps leave the
           logo about a centimetre. Grouped, the three sit shoulder to
           shoulder and the header still has exactly two things to space, the
           way it did when there was only the avatar.

           The order is the order they were asked for: the way you change how
           the app looks, then the way you find something in it, then you. */
        '<div class="hc-topbar__actions">' +
          '<button type="button" class="hc-topbar__disc" id="hc-theme-disc" ' +
              'data-action="toggle-theme" aria-pressed="false" ' +
              'aria-label="Switch to dark mode"></button>' +
          '<button type="button" class="hc-topbar__disc" id="hc-search-disc" ' +
              'data-action="go-search" aria-label="Search">' +
            c.icon('search', 'hc-topbar__disc-icon') +
          '</button>' +
          '<button type="button" class="hc-avatar" data-action="go-profile" aria-label="Your account">' +
            '<span class="hc-avatar__disc" id="hc-avatar-disc" aria-hidden="true"></span>' +
          '</button>' +
        '</div>' +
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

  /* The sun in the top bar, and the moon it becomes.

     THE ICON IS THE STATE, NOT THE ACTION. A sun means the app is light right
     now, a moon means it is dark. The other convention, drawing what the tap
     will give you, is just as common and reads backwards the moment somebody
     stops to think about it: a moon on a screen that is already dark looks
     like a moon that did not work. The label is where the action is said, and
     it is said in words, so VoiceOver reads "Switch to dark mode" rather than
     leaving somebody to infer it from a picture they cannot see. aria-pressed
     carries the same state the icon does, for a screen reader that announces
     toggle buttons by their pressed state.

     Repainted from three places, which is every way the theme can move: this
     button, the switch on Your account, and the system changing underneath a
     phone that has not chosen either. */
  function paintThemeToggle() {
    var btn = document.getElementById('hc-theme-disc');
    if (!btn) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = c.icon(dark ? 'moon' : 'sun', 'hc-topbar__disc-icon');
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
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

  /* Tapping the strip. It opens the announcement's own page, and it leaves the
     strip up, because the strip is the church's and the x is the only thing
     that takes it down.

     IT USED TO LAND ON HOME and scroll to the card, with a moment of gold
     around it so a person could tell which of three cards the strip had meant.
     That was the best available answer while the card was the whole
     announcement. It is not any more: an announcement has a page now, with the
     video in it and the pictures and the link, and a strip that says "open
     this" should open it rather than pointing at a summary of it. The card on
     Home does the same thing when it is tapped, so both ways in arrive at the
     same screen.

     THE UNDISMISS STAYS, and it means something slightly different now.
     Somebody may have put this card away on Home last week, before it was
     pinned. Reading the announcement from the strip is as clear a signal as
     there is that they are not done with it, so it goes back on Home for when
     they get there. One card, named by the tap that just happened, and never a
     blanket reset of everything this phone has dismissed. */
  function openPinned(id) {
    HC.store.undismiss(id);
    HC.router.go({ name: 'announcement', id: id });
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

    /* Your account, last, past Admin on the phones that have one.

       A SECOND DOOR TO THE SAME ROOM, ON PURPOSE. The initials in the top bar
       already go here and they stay. They are also the one piece of navigation
       in the app that is not a picture of what it opens: a person who has not
       been told their initials are a button does not go looking for their text
       size behind their own name. This is the tile they do find, and both taps
       land on the same screen, so nothing had to be moved to add it.

       LAST BECAUSE IT IS NOT ONE OF THEM. Everything above is somewhere the
       church put something. This is where you change how the app behaves for
       you, which is the thing you reach for least often and the thing that
       belongs at the end of a list rather than in the middle of one.

       `stop: false` says it is a pushed view, not that a drag cannot reach it,
       and it is the only tile here that needs saying. Every other one is a
       stop: a drag left off Give lands on Admin. This one is where the drag
       ends, one screen past the last stop, and it keeps the arrow and the
       title it has always had, the way Search does, because the initials in
       the top bar open it from every screen in the app and that arrow is the
       way back out to wherever you were. See syncModules below. */
    tiles.push({
      route: 'profile', icon: 'settings', title: 'Settings',
      action: 'go-profile', id: '', stop: false
    });

    return tiles;
  }

  /* Hand the row to the router, which owns where a drag can land. Called at
     boot and again whenever who is signed in changes, because the last stop
     belongs to the person rather than to the build.

     TWO HALVES OF ONE LIST, IN ONE ORDER. The stops go first and the pushed
     views parked past them go second, and both come out of the grid in the
     order the grid draws them, so the sheet you read top to bottom and the
     screens you drag through left to right are the same sequence by
     construction. Today that is every module, then Admin on the phones that
     have one, and then Settings: a drag left off the last stop brings Settings
     in, and a drag right off Settings goes back to it. Settings is still a
     pushed view when it lands, which is what the second argument means and the
     first does not. See the `tail` note in js/router.js. */
  function syncModules() {
    var tiles = sheetTiles();
    function routes(stop) {
      return tiles.filter(function (t) { return (t.stop !== false) === stop; })
                  .map(function (t) { return t.route; });
    }
    HC.router.setModules(routes(true), routes(false));
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

    /* Two ways in now, the initials in the top bar and the cog in the sheet,
       and only one of them can have a sheet up behind it. Closing it here
       rather than leaning on the view change covers the tap that lands while
       you are already on Your account: the router treats that as a scroll to
       the top and fires nothing, so without this the sheet would sit there
       over the screen it was asked to open. */
    'go-profile': function () {
      if (HC.overflow.isOpen()) HC.overflow.close();
      HC.router.go({ name: 'profile' });
    },

    'go-guide': function () {
      HC.router.go({ name: 'guide' });
    },

    'go-leader': function () {
      HC.router.go({ name: 'leader' });
    },

    /* ------------------------------------------------------------ Edit mode

       Fixing a sentence where it is written rather than on a form. The state
       is in js/edit-mode.js and none of these handlers is a security
       boundary: every write below is judged by the policies in migration
       0030, so a member who makes these buttons appear gets a 403 and a
       toast, the same as the rest of Admin.

       Every one of them repaints, because what is drawn changes: the outlines
       appear, a sentence becomes a box, a box becomes the new sentence.
       ------------------------------------------------------------------- */

    'edit-mode-toggle': function () {
      if (!HC.edit.available()) {
        HC.components.toast('Edit mode is for admins.');
        return;
      }
      var nowOn = HC.edit.toggle();
      HC.native.tap('Light');
      repaintView();
      HC.components.toast(nowOn
        ? 'Edit mode on. Tap any outlined text to change it.'
        : 'Edit mode off.');
    },

    // The Done button on the pill, which is the way out from wherever you
    // happen to be reading when you finish.
    'edit-mode-off': function () {
      HC.edit.disable();
      HC.native.tap('Light');
      repaintView();
      HC.components.toast('Edit mode off.');
    },

    'edit-open': function (el) {
      if (!HC.edit.open(el.getAttribute('data-slot'))) return;
      HC.native.tap('Light');
      repaintView();
      focusEditor();
    },

    'edit-cancel': function () {
      HC.edit.cancel();
      repaintView();
    },

    /* Save is two repaints, and the first one is not cosmetic. The button
       says Saving… and goes dead while the write is in the air, which is the
       only thing stopping a slow connection from being sent the same sentence
       four times by somebody who thinks nothing happened. */
    'edit-save': function () {
      var pending = HC.edit.save();
      repaintView();
      pending.then(function (saved) {
        repaintView();
        if (saved) HC.components.toast('Saved. Everybody sees it now.');
      }).catch(function (err) {
        repaintView();
        focusEditor();
        HC.components.toast(err.message ||
          'That did not save. The words are still here, try again in a moment.');
      });
    },

    /* Back to the words the app shipped with. Not behind a confirmation:
       nothing is lost that was not already replaceable by typing it again,
       and the sentence it restores is right there in the box afterwards. */
    'edit-reset': function () {
      var pending = HC.edit.reset();
      repaintView();
      pending.then(function (done) {
        repaintView();
        if (done) HC.components.toast('Back to the app’s own words.');
      }).catch(function (err) {
        repaintView();
        HC.components.toast(err.message || 'That did not go through. Try again in a moment.');
      });
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

    /* One more empty box in the list of pictures. This is change A's + and it
       adds a row rather than a picture: what goes in it is a link somebody
       pastes, or the next thing the file picker uploads. */
    'admin-image-add': function () {
      var d = adminHelpers().getDraft();
      if (!d) return;
      d.images.push('');
      repaintAdmin();
    },

    'admin-image-remove': function (el) {
      var d = adminHelpers().getDraft();
      if (!d) return;
      /* The object stays in the bucket. Deleting it here would orphan the
         picture of any other announcement pointing at the same URL, which is
         what happens the moment somebody reuses one, and a few unreferenced
         images in a 5MB-per-file bucket is a much cheaper problem than a card
         with a broken image on Home. */
      d.images.splice(parseInt(el.getAttribute('data-id'), 10), 1);
      repaintAdmin();
    },

    /* The x in the corner of the link's thumbnail. It takes the picture off
       the link card and leaves the link, which is exactly what change A asked
       for, and it is remembered: `linkImageTouched` is what stops the next
       keystroke in the link field putting the thumbnail back. */
    'admin-link-thumb-clear': function () {
      var d = adminHelpers().getDraft();
      if (!d) return;
      d.linkImageUrl = '';
      d.linkImageTouched = true;
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

    /* ------------------------------------------- the newsletter review queue

       Two taps and no dialog in front of either, which is the whole point of
       the queue: an admin with four parsed drafts on a Monday should be able
       to clear them with four taps and not twelve.

       NEITHER OF THESE IS IRREVERSIBLE, which is what earns them the missing
       confirm. Approve puts a card on Home that Edit and Delete can still
       reach; Discard moves the row into the Posted list below as a draft and
       deletes nothing. The one destructive button in this section, Delete,
       keeps the confirm it has always had. See js/admin.js. */

    /* Check the mailbox now.

       Not written with adminRun, which every other admin action uses, and the
       difference is the waiting. adminRun starts a call, reports it, and
       clears the busy flag; this has to hold the flag across a request that
       finishes immediately and an outcome that arrives half a minute later.
       Holding the button disabled for that whole time is the point: it is what
       stops six taps becoming six mailbox reads, and it is the honest picture
       of what is happening.

       The starting id is read from the network rather than from the cache. The
       cache can be empty on a screen that has just been opened, and a zero
       there would make the first poll return whatever run happened twenty
       minutes ago and report last cycle's result as this tap's. */
    'admin-newsletter-fetch': function () {
      var h = adminHelpers();
      h.setBusy('fetch');
      repaintAdmin();

      HC.admin.latestRun().then(function (previous) {
        var sinceId = previous ? previous.id : null;

        return HC.admin.fetchNewsletter().then(function () {
          HC.components.toast('Checking the mailbox…');
          return pollForRun(sinceId, 20);      // 20 x 3s, a minute of patience
        });
      }).then(function (run) {
        HC.admin.refreshNewsletter();

        if (!run) {
          HC.components.toast('Still checking. It will appear here when it is done.');
          return;
        }
        if (run.ok === false) {
          HC.components.toast(run.note || 'The check did not work.');
          return;
        }
        if (run.drafts > 0) {
          HC.components.toast(run.drafts === 1
            ? 'One new announcement to review.'
            : run.drafts + ' new announcements to review.');
          return;
        }
        // Reached the mailbox and there was nothing new in it, which is the
        // answer six days out of seven and is not a failure.
        HC.components.toast('Nothing new in the mailbox.');
      }).catch(function (err) {
        HC.components.toast(err.message || 'Could not check the mailbox.');
      }).then(function () {
        h.setBusy('');
        repaintAdmin();
      });
    },

    /* ---------------------------------------------- the home groups box

       The paragraph on Connect where the group finder would be, updated from
       whatever the church last said about home groups. Migration 0048 and the
       group_status mode in supabase/functions/newsletter-intake.

       SHAPED LIKE THE MAILBOX BUTTON ABOVE, down to the poll, and for the same
       reason: hc_admin_refresh_group_status returns the moment pg_net accepts
       the request, and what follows is a model call that takes twenty to forty
       seconds. The completion signal is a row in group_status_runs newer than
       the one we started with, which the Edge Function writes whichever way it
       goes.

       THE ONE DIFFERENCE IS WHAT HAPPENS AFTER. This writes a paragraph that
       is already on a public screen, so a finished run refreshes the content
       sync and drops the form's draft, and the words the model chose are in
       the text box a second later — ready to be fixed by the person who knows
       whether they are right. */
    'admin-group-refresh': function () {
      var h = adminHelpers();
      h.setBusy('group');
      repaintAdmin();

      HC.admin.latestGroupRun().then(function (previous) {
        var sinceId = previous ? previous.id : null;

        return HC.admin.refreshGroupStatus().then(function () {
          HC.components.toast('Reading the announcements…');
          return pollForGroupRun(sinceId, 20);   // 20 x 3s, a minute of patience
        });
      }).then(function (run) {
        HC.admin.invalidateGroupStatus();

        /* A minute with no row in the log at all, which has two causes and
           they want different things done about them.

           The ordinary one is a slow model on a busy afternoon, and the run
           lands a moment after this gives up.

           The other one happened on the day this shipped and is worth naming
           rather than shrugging at: the Edge Function had not been redeployed
           since this button was written, so it did not know the group_status
           flag, ignored it, and ran an ordinary mailbox check instead. It
           answers 200, writes a newsletter_runs row, and writes nothing here —
           which from the app looks exactly like a slow model that never
           finishes, forever. The deploy is the fix, and a toast that does not
           say so sends somebody looking at the parse instead. */
        if (!run) {
          HC.components.toast('Nothing came back. Either it is still working, or ' +
            'newsletter-intake needs redeploying.');
          return;
        }

        /* The content sync, and then the form, in that order. The box is read
           from HC.data.church, which only the sync fills, so dropping the
           draft first would seed the form from the words that are still in
           hand — the old ones. */
        return HC.content.refresh().then(function () {
          h.clearGroupBox();
          if (run.ok === false) {
            HC.components.toast(run.note || 'That did not work, and nothing was changed.');
            return;
          }
          HC.components.toast(run.changed
            ? 'The home groups box has been updated. Read it before you leave.'
            : (run.note || 'Nothing about home groups has been posted, so nothing changed.'));
        });
      }).catch(function (err) {
        HC.components.toast(err.message || 'Could not update the home groups box.');
      }).then(function () {
        h.setBusy('');
        repaintAdmin();
      });
    },

    'admin-group-save': function () {
      var h = adminHelpers();
      var box = h.getGroupBox();

      adminRun('group-save', HC.admin.saveGroupNote(box.note, box.imageUrl)
        .then(function () {
          // Dropped so the next draw seeds from what the database now holds,
          // which is the same words unless somebody else was editing too.
          h.clearGroupBox();
        }), function () {
          HC.components.toast('Saved. That is what Connect says now.');
        });
    },

    /* The way back from a shortening nobody liked. Both halves, because the
       run that carried a flyer over and was undone note-only would leave this
       season's poster over last season's sentence. */
    'admin-group-undo': function () {
      var h = adminHelpers();
      var run = HC.admin.lastGroupRun();
      if (!run || !run.previous_note) return;

      adminRun('group-undo',
        HC.admin.saveGroupNote(run.previous_note, run.previous_image)
          .then(function () { h.clearGroupBox(); }),
        function () { HC.components.toast('Put back the way it was.'); });
    },

    'admin-group-image-remove': function () {
      adminHelpers().getGroupBox().imageUrl = '';
      repaintAdmin();
    },

    /* The end of a season. Confirmed, unlike Save beside it, because it throws
       away a paragraph rather than replacing it with one somebody is looking
       at: the current words go, the flyer goes, and what comes back is the
       sentence from before the season. The confirm quotes that sentence, so
       the question is "do you want the card to say this" rather than "are you
       sure", which is a question nobody can answer.

       The draft is dropped after, so the form shows the restored words instead
       of the ones that were on screen when the button was pressed. */
    'admin-group-end-season': function () {
      var h = adminHelpers();
      var back = HC.data.church.groupsBetweenSeasonsNote;

      if (!window.confirm('Put the home groups box back to between seasons?' +
          (back ? '\n\nIt will say: ' + back : '') +
          '\n\nThe flyer comes off too.')) return;

      adminRun('group-end', HC.admin.endGroupSeason().then(function () {
        h.clearGroupBox();
      }), function () {
        HC.components.toast('Back to between seasons.');
      });
    },

    /* ------------------------------------------------- the dates queue

       The same two taps as the announcements queue, on the other half of a
       parsed newsletter item. Approve puts the date on the Connect calendar
       and gives the announcement its Add to calendar button.

       DISCARD CONFIRMS HERE, WHERE THE ANNOUNCEMENT ONE DOES NOT, and the
       asymmetry is deliberate rather than an oversight. Discarding an
       announcement moves it into the Posted list as a draft and nothing is
       lost. Discarding a date deletes it, per 0041 — an unpublished event is
       on no screen in this app, so a marked one could never be found again —
       and a one tap delete on a card somebody is reading for the first time is
       how a real date disappears on a mis-tap. */

    'admin-event-approve': function (el) {
      var id = el.getAttribute('data-id');
      var row = HC.admin.pendingEvents().filter(function (e) { return e.id === id; })[0];
      if (!row) return;

      adminRun('event-approve:' + id, HC.admin.approveEvent(id).then(function () {
        HC.components.toast('“' + row.title + '” is on the calendar.');
      }));
    },

    'admin-event-discard': function (el) {
      var id = el.getAttribute('data-id');
      var row = HC.admin.pendingEvents().filter(function (e) { return e.id === id; })[0];
      if (!row) return;

      if (!window.confirm('Throw away the date for “' + row.title + '”? ' +
                          'The announcement stays, without an Add to calendar button. ' +
                          'There is no undo.')) return;

      adminRun('event-discard:' + id, HC.admin.discardEvent(id).then(function () {
        HC.components.toast('Date discarded.');
      }));
    },

    'admin-review-approve': function (el) {
      var id = el.getAttribute('data-id');
      var row = announcementById(id);
      if (!row) return;

      adminRun('approve:' + id, HC.admin.approveAnnouncement(id).then(function () {
        // Says where it went rather than that it worked. "Approved" is a state
        // and "It is on Home" is the thing somebody actually wanted to know.
        HC.components.toast('“' + row.title + '” is on Home.');
      }));
    },

    'admin-review-discard': function (el) {
      var id = el.getAttribute('data-id');
      var row = announcementById(id);
      if (!row) return;

      adminRun('discard:' + id, HC.admin.discardAnnouncement(id).then(function () {
        // Names the way back, because a tap with no confirm in front of it
        // should say what it did and where the thing went.
        HC.components.toast('Discarded. It is still below as a draft.');
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

    /* Leader mode, granted from here since migration 0036. Not confirmed,
       unlike the role button above it: this is a switch, the way back is the
       same tap, and what it grants is authority inside one group's room
       rather than over the whole app. Turning it off is not destructive
       either, and does not touch the rooms somebody already hosted.

       Moved on screen first and saved after, the same as the settings
       switches: the repaint at the end of adminRun puts it back if the write
       is refused, which is what a member who forged this screen would get. */
    'admin-leader': function (el) {
      var id = el.getAttribute('data-id');
      var person = HC.admin.users().filter(function (u) { return u.id === id; })[0];
      if (!person) return;

      var on = !person.is_leader;
      setSwitch(el, on);
      HC.native.tap('Light');

      adminRun('leader:' + id, HC.admin.setLeader(id, on).then(function () {
        var name = [person.first_name, person.last_name].filter(Boolean).join(' ') ||
          person.email || 'They';
        HC.components.toast(on
          ? name + ' can host a group room now.'
          : 'Leader mode is off for ' + name + '.');
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

    /* ------------------------------------------------------------ the Cal tab

       The month grid, the day it opens, and the three things an admin can do
       to an event. Everything here changes state js/screens/cal.js is holding
       and repaints; nothing here knows how a calendar is drawn.

       The four navigation handlers repaint through the router rather than by
       reaching into the DOM, which is what keeps edit mode honest: a router
       draw calls HC.edit.beginRender() and the registry describes what is
       actually on the glass. See the note in js/screens/connect.js about the
       group list, which is the same trap avoided the other way. */

    'cal-step': function (el) {
      var parts = String(el.getAttribute('data-id') || '').split(':');
      calHelpers().step(parts[0], parseInt(parts[1], 10) || 0);
      repaintCal();
    },

    'cal-today': function () {
      calHelpers().today();
      repaintCal();
    },

    'cal-day': function (el) {
      calHelpers().selectDay(el.getAttribute('data-id'));
      HC.native.tap('Light');
      repaintCal();
    },

    'cal-day-close': function () {
      calHelpers().closeDay();
      repaintCal();
    },

    'cal-event-new': function () {
      calHelpers().startDraft(null);
      repaintCal();
    },

    /* Editing asks Supabase for the row rather than reading the copy on the
       glass, and the reason is in draftFromRow(): the app's copy has the clock
       time and the church's own phrase for it flattened into one field, and
       writing that back would turn "All three services" into a time or a real
       6:00 PM into a label. One round trip on a button an admin presses a few
       times a month is the cheaper half of that trade. */
    'cal-event-edit': function (el) {
      var id = el.getAttribute('data-id');
      HC.admin.event(id).then(function (row) {
        if (!row) {
          c.toast('That event is not there any more.');
          return;
        }
        calHelpers().startDraft(row);
        repaintCal();
      }).catch(function (err) {
        c.toast(err.message || 'Could not open that event.');
      });
    },

    'cal-event-cancel': function () {
      calHelpers().clearDraft();
      repaintCal();
    },

    /* The three things the form insists on, and they are the three an event
       cannot be read without: what it is called, the day, and when on that day.
       The database checks the first two again in migration 0042, because a
       form is a suggestion and the table is the rule. The third is this
       screen's own: a row with neither a clock time nor a phrase is drawn as
       nine in the morning, which is a guess printed as a fact. */
    'cal-event-save': function () {
      var h = calHelpers();
      var d = h.getDraft();
      if (!d) return;

      if (!String(d.title || '').trim()) {
        c.toast('An event needs a name.');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || ''))) {
        c.toast('An event needs a date.');
        return;
      }
      if (!String(d.time || '').trim() && !String(d.timeLabel || '').trim()) {
        c.toast('Give it a time, or say what to call it, like “All three services”.');
        return;
      }

      h.setBusy('save');
      repaintCal();

      HC.admin.saveEvent({
        id: d.id,
        title: String(d.title).trim(),
        startsAt: h.startsAtIso(d),
        timeLabel: String(d.timeLabel || '').trim(),
        location: String(d.location || '').trim(),
        description: String(d.blurb || '').trim()
      }).then(function () {
        h.clearDraft();
        // The grid follows what was just written. A confirmation that says it
        // is on the calendar, over a month the date is not in, is a
        // confirmation somebody has to go and check.
        h.showMonth(d.date);
        c.toast(d.id ? 'Saved.' : 'It is on the calendar.');
      }).catch(function (err) {
        c.toast(err.message || 'That did not save. Try again in a moment.');
      }).then(function () {
        h.setBusy('');
        repaintCal();
      });
    },

    /* The x in the corner of an event. It deletes, so it asks first: there is
       no draft state to fall back into and no Posted list to find it in
       again, which is the same reason discarding a parsed date confirms and
       discarding a parsed announcement does not. */
    'cal-event-delete': function (el) {
      var id = el.getAttribute('data-id');
      var evt = (HC.data.events || []).filter(function (e) { return e.id === id; })[0];
      if (!evt) return;

      if (!window.confirm('Take “' + evt.title + '” off the calendar? ' +
                          'There is no undo.')) return;

      var h = calHelpers();
      h.setBusy('delete:' + id);
      repaintCal();

      HC.admin.deleteEvent(id).then(function () {
        c.toast('Taken off the calendar.');
      }).catch(function (err) {
        c.toast(err.message || 'That did not go through. Try again in a moment.');
      }).then(function () {
        h.setBusy('');
        repaintCal();
      });
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

    /* The link sheet, which is only ever on screen for a writing surface whose
       links survive the sanitizer. Today that is the announcement form. See
       toolbar() in js/editor.js. */

    'link-open': function () {
      HC.editor.openLink();
    },

    'link-close': function () {
      HC.editor.closeLink();
    },

    'link-insert': function () {
      HC.editor.insertLink();
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
        start: HC.screens.calHelpers.eventStart(evt)
      }).then(function (ok) {
        if (ok) HC.native.tap('Light');
        else c.toast('Could not open your calendar from here.');
      });
    },

    'open-url': function (el) {
      c.openExternal(el.getAttribute('data-url'));
    },

    /* The chevrons either side of the week header on Worship.

       They move the rail and nothing else: the scroll they cause is the same
       scroll a thumb causes, so the delegated listener above paints the dots
       and tells the screen which week it landed on, exactly as it would have.
       Redrawing the list from here as well would be the same work done twice
       and a chance for the two answers to differ.

       Measured off the slide rather than multiplied by an index, for the same
       reason showingSlide() measures: it stays right whatever the slides are
       sized at and whichever way the writing runs. */
    'worship-week': function (el) {
      var head = el.closest('.hc-worship__head');
      var rail = head ? head.querySelector('[data-worship-rail]') : null;
      var track = rail ? rail.firstElementChild : null;
      if (!track) return;

      var step = parseInt(el.getAttribute('data-step'), 10) || 0;
      var slides = track.children;
      var here = -1;
      var bestGap = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var gap = Math.abs(slides[i].offsetLeft - rail.scrollLeft);
        if (gap < bestGap) { bestGap = gap; here = i; }
      }

      var next = slides[here + step];
      if (!next) return;
      rail.scrollTo({
        left: next.offsetLeft,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
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
      paintThemeToggle();
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

      /* The play button belongs to the open section and only to the open
         section. Folding a section that is talking also stops it, which is
         handled in there rather than here. */
      if (HC.narration) HC.narration.sectionToggled(el.closest('.hc-section'), !open);

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

    narrate: function (el) {
      HC.narration.toggle(el);
    },

    'narrate-speed': function () {
      HC.narration.cycle();
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

    /* The card on Home, tapped. Every announcement has a page of its own now,
       and this is the way in: the card is a summary and the page is the whole
       thing, with the video, the pictures and the link on it.

       The x beside it is a sibling and not a child, which is what lets both
       exist: a button inside a button is invalid markup that every browser
       resolves differently, and the one thing it must never do is make "put
       this away" ambiguous with "open this". See announcementCard() in
       js/screens/home.js. */
    'open-announcement': function (el) {
      HC.native.tap('Light');
      HC.router.go({ name: 'announcement', id: el.getAttribute('data-id') });
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
      /* Normally only the list is redrawn, which keeps the filter strip and
         the scroll exactly where they are. While edit mode is on, the whole
         screen is: the list is written straight into innerHTML here, and a
         sentence somebody has open for editing inside it would be thrown away
         by a tap on a filter chip. */
      if (HC.edit.isOn()) repaintView();
      else HC.screens.connectHelpers.repaintGroups(mount);
    },

    /* join-group, serve, and submit-step used to live here. All three showed a
       warm toast and did nothing: no name was captured, nobody was told, and
       submit-step called form.reset() on what the person had typed. Connect
       now sends people to the systems the church actually runs, so there is
       nothing left for them to do. Do not add them back without a destination.

       THE TWO BELOW ARE THE EXCEPTION THAT PROVES IT. The contact form at the
       top of Connect has a destination, hello@homechurchnola.com, and the
       handler below is written so that the difference is visible in the code
       rather than only in the intention: the toast that thanks anybody lives
       inside .then(), after the church has the email, and the .catch() puts
       the failure on the screen instead. Nothing here fires optimistically.
       ---------------------------------------------------------------------- */

    'contact-send': function (el) {
      var h = HC.screens.connectHelpers;
      var form = el.closest('form');
      if (!form) return;

      /* Read off the form rather than out of the draft. The draft is there to
         survive a repaint, not to be the truth about what is in the boxes at
         the moment of the tap: an autofill or a paste can put text in a field
         without an input event this app ever hears about. */
      var draft = {};
      Array.prototype.forEach.call(
        form.querySelectorAll('[data-contact-field]'),
        function (input) {
          draft[input.getAttribute('data-contact-field')] = input.value || '';
          h.setContactField(input.getAttribute('data-contact-field'), input.value || '');
        }
      );

      var problem = HC.contact.firstProblem(draft);
      if (problem) {
        c.toast(problem.message);
        var missing = form.querySelector('[data-contact-field="' + problem.field + '"]');
        if (missing) missing.focus();
        return;
      }

      h.setContactBusy(true);
      h.setContactError(null);
      repaintView();

      HC.contact.send(draft).then(function () {
        h.contactDone();
        repaintView();
        HC.native.tap('Light');
        c.toast('Sent. Somebody will write back.');
      }).catch(function (err) {
        h.setContactBusy(false);
        h.setContactError(err.message ||
          'We could not get that through just now. Email the church directly and somebody will answer.');
        repaintView();
      });
    },

    'contact-reset': function () {
      HC.screens.connectHelpers.contactAgain();
      repaintView();
    },

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

      /* Which switches count as "still on", and why this is not simply every
         key in the object.

         The two review switches from migration 0043 default to true on every
         phone, because Profile draws them only for an admin and the server
         refuses them for anybody else, so nothing is gained by drawing a
         member's phone a false it will never see. That makes them useless as
         evidence here: `some(k => next[k])` would be true on every phone in
         the congregation, so a member turning their last real switch off would
         take the syncPreferences branch, and their row would keep `active =
         true` for ever. Nothing addressed by preference would reach them, and
         the `test` topic, which goes to every active phone on purpose, would.

         So the two only count on a phone that is actually an admin's, which is
         the same condition that draws them. */
      var isAdmin = HC.admin && HC.admin.isAdmin();
      var anyStillOn = Object.keys(next).some(function (k) {
        if (!isAdmin && (k === 'announcementReview' || k === 'eventReview')) return false;
        return next[k];
      });

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

    /* One handler for two controls: the switch on Your account and the disc
       in the top bar. Whichever was tapped, both are put back in step
       afterwards, because on Your account they are on screen together and a
       switch that stayed off while the app went dark under it is the kind of
       small lie that makes people stop trusting a settings screen.

       setSwitch is applied by asking for the switch rather than by trusting
       the element that was tapped: the disc has no aria-checked and no knob
       inside it, and calling setSwitch on it would put a checked state on a
       button that is not a switch. */
    'toggle-theme': function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      HC.store.updateProfile({ theme: dark ? 'light' : 'dark' });
      HC.store.applyPreferences();
      HC.native.tap('Light');

      paintThemeToggle();
      var row = document.querySelector('[data-action="toggle-theme"][role="switch"]');
      if (row) setSwitch(row, !dark);
    },

    /* --------------------------------------------------------------- search */

    /* The magnifying glass. Tapping it while already on Search puts the
       keyboard back rather than doing nothing, which is what the router would
       otherwise make of navigating to the view you are already on. */
    'go-search': function () {
      var route = HC.router.current();
      if (route && route.name === 'search') {
        var box = document.querySelector('[data-search-box]');
        if (box) box.focus();
        return;
      }
      HC.native.tap('Light');
      HC.router.go({ name: 'search' });
    },

    /* A result. One handler for every kind of thing on the list, because a
       result already carries the whole address: js/search.js decided where a
       guide, an announcement, a practice or a screen goes when it built the
       index, and this only has to follow it. */
    'search-open': function (el) {
      var name = el.getAttribute('data-route');
      if (!name) return;
      var id = el.getAttribute('data-id');
      HC.native.tap('Light');
      HC.router.go(id ? { name: name, id: id } : { name: name });
    },

    /* There is no 'toggle-leader' here any more, and there should not be one
       again. Leader mode was a switch on this screen until migration 0036,
       when it became the thing that decides whether somebody can open a group
       room and edit the questions the whole group sees. An admin grants it
       under Admin -> Manage users, js/auth.js mirrors it onto the phone on
       every sign in, and hc_room_open checks the database rather than this
       side. A switch here would be a phone granting itself something only the
       church can grant. */

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

      /* The rail is only drawn for the host and hc_room_set_guide refuses
         anybody else, so this is the third answer to the same question. It is
         here because the first two are a screen and a server, and a button
         that arrived by some other route should stop at the door rather than
         at a toast. */
      if (!HC.rooms.isHost()) return;

      var title = HC.data.guideTitle(guide);

      /* Everything the swap would take, in one sentence, before it happens.
         Two sources, because there are two kinds of writing at risk and only
         one of them has left a phone: answers already posted, counted from
         the index so somebody else's shut answer is counted too, and whatever
         is sitting in a box on this phone unposted. */
      var n = HC.rooms.answerCounts().total;
      var mine = g.draftCount();
      var lost = [];
      if (n) {
        lost.push(n === 1 ? 'the one answer already written under them'
                          : 'all ' + n + ' answers already written under them');
      }
      if (mine) {
        lost.push(mine === 1 ? 'the answer you have typed and not posted'
                             : 'the ' + mine + ' answers you have typed and not posted');
      }

      if (lost.length && !window.confirm(
          'Switching to “' + title + '” deletes what the group has written.\n\n' +
          'Tonight’s questions are replaced on every phone in the room, and ' +
          lost.join(' and ') + ' go with them. This cannot be undone. ' +
          'The prayer requests stay.\n\n' +
          'Switch anyway?')) return;

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
  /* Redraw whatever is on screen, in place, keeping the scroll position. The
     same move js/content.js makes when a refresh lands, and for the same
     reason: screens here render to a string in one pass, so anything that
     changes what a screen would draw has to draw it again. */
  function repaintView() {
    var route = HC.router.current();
    if (!route) return;
    HC.router.go(
      { name: route.name, id: route.id, index: route.index, restore: true },
      { force: true }
    );
  }

  /* The caret, after the repaint that put the box on screen. Deferred a frame
     because the element it is looking for does not exist until the router has
     mounted the new view, and the caret goes to the end rather than the start
     so somebody fixing a typo at the end of a sentence is already there. */
  function focusEditor() {
    window.requestAnimationFrame(function () {
      var box = document.querySelector('[data-edit-field]');
      if (!box) return;
      box.focus();
      try { box.setSelectionRange(box.value.length, box.value.length); }
      catch (err) { /* Some browsers refuse this on a just-focused element. */ }
    });
  }

  function calHelpers() {
    return HC.screens.calHelpers;
  }

  /* The Cal tab, redrawn where it stands. Same shape as repaintAdmin below,
     and for the same two reasons: the month, the open day and the draft all
     live in the screen file, and restore:true keeps the scroll where the
     thumb left it so stepping through months does not walk the page back to
     the top each time. */
  function repaintCal() {
    var route = HC.router.current();
    if (!route || route.name !== 'cal') return;
    HC.router.go({ name: 'cal', restore: true }, { force: true });
  }

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

    if (name === 'setting') {
      debounceGlobal('setting-' + id, function () {
        HC.admin.saveSetting(id, 'text', value).catch(function (err) {
          HC.components.toast(err.message || 'That did not save.');
        });
      });
      return;
    }

    /* One box in the list of pictures, addressed by where it sits in the list.
       An index the list does not have is dropped rather than created: the only
       way to see that box is for the draft to have drawn it, so a stale index
       means the form has moved on under a keystroke that was already in
       flight. */
    if (d && name === 'imageUrl') {
      var at = parseInt(id, 10);
      if (d.images[at] !== undefined) d.images[at] = value;
      paintDraftThumbs(d);
      return;
    }

    /* The link, and the one field on this form that fills in another. Pasting
       a link works out a thumbnail for the two kinds of link this app can work
       one out for, and stops the moment somebody has had an opinion of their
       own: the x sets linkImageTouched, and so does typing a thumbnail link by
       hand, and neither is ever overwritten afterwards. */
    if (d && name === 'linkUrl') {
      d.linkUrl = value;
      if (!d.linkImageTouched) d.linkImageUrl = HC.admin.suggestLinkImage(value);
      paintDraftThumbs(d);
      return;
    }

    if (d && name === 'linkImageUrl') {
      d.linkImageUrl = value;
      d.linkImageTouched = true;
      paintDraftThumbs(d);
      return;
    }

    if (d && ANNOUNCEMENT_FIELDS[name]) { d[name] = value; return; }

    /* The home groups paragraph, which is its own small form at the foot of
       the announcements section and is not part of either draft above. Written
       into the object the screen holds and saved when the button is pressed,
       the same rule as everything else on this screen. */
    if (name === 'groupNote') { h.getGroupBox().note = value; return; }

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
  }

  /* The previews on the announcement form, patched in place rather than
     redrawn.

     WHY THIS IS THE ONE PLACE THE ADMIN SCREEN TOUCHES THE DOM. Everything
     else on that screen ends in repaintAdmin(), which rebuilds the form from
     the draft, and that is the right move for a tap. It is the wrong move for
     a keystroke, twice over: a repaint mid-word pulls the caret out from under
     the thumb, and a repaint triggered by a field losing focus destroys the
     button the thumb is in the middle of pressing, so the tap that caused it
     never lands. Both were tried. This is what is left: three <img> elements
     and two hidden attributes, changed under a form that is otherwise
     untouched.

     Every preview is in the markup from the first draw, hidden until it has
     something to show, so nothing here creates or removes an element. A
     picture link typed into a box shows the picture; a link pasted into the
     link field shows the thumbnail the app worked out for it, with the x that
     takes it off. See thumb() in js/screens/admin.js. */
  function paintDraftThumbs(d) {
    var nodes = document.querySelectorAll('[data-thumb-for]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute('data-thumb-for');
      var url = key === 'link'
        ? d.linkImageUrl
        : d.images[parseInt(key.slice('image:'.length), 10)];
      url = String(url == null ? '' : url).trim();

      var img = node.querySelector('img');
      // Only when it actually moved. Writing the same src back would restart
      // the request and flicker the picture on every keystroke.
      if (img && img.getAttribute('src') !== url) {
        if (url) img.setAttribute('src', url);
        else img.removeAttribute('src');
        // A previous URL that did not load left this behind, and the new one
        // deserves its own chance to fail.
        node.removeAttribute('data-failed');
      }
      node.hidden = !url;

      /* The row's other way out, for a box with no picture in it yet and so no
         x to tap. One of the two is always on screen and never both. */
      var alt = node.parentNode &&
        node.parentNode.querySelector('[data-thumb-alt="' + key + '"]');
      if (alt) alt.hidden = !!url;
    }

    /* The thumbnail box, when the app worked one out from the link rather than
       somebody typing it. Written into the field as well as into the preview,
       because a picture on screen that no box accounts for is a picture nobody
       can tell where came from.

       Never while the caret is in it. Somebody typing their own thumbnail link
       has already set linkImageTouched, so nothing above would be overwriting
       them, and this is the belt to that pair of braces. */
    var box = document.querySelector('[data-admin-field="linkImageUrl"]');
    if (box && box !== document.activeElement) {
      var want = String(d.linkImageUrl == null ? '' : d.linkImageUrl);
      if (box.value !== want) box.value = want;
    }
  }

  /* The fields that are one box and one value on the draft. The list of
     pictures and the two link fields that fill each other in are handled above
     rather than here, because neither of them is a plain assignment. */
  var ANNOUNCEMENT_FIELDS = {
    title: true, eyebrow: true, videoUrl: true,
    linkTitle: true, startsOn: true, endsOn: true
  };

  /* The picture. Uploaded the moment it is chosen rather than when the
     announcement is saved, so the person sees it land and can change their
     mind, and so a failure is about the picture rather than about the whole
     announcement.

     Appended rather than assigned, which is the whole of "and another one":
     choosing three photographs off the phone is three taps of the same button
     and never a decision about which of them survives. A box somebody added
     with + and left empty takes the upload instead of growing the list, so
     tapping + and then Choose a picture does what it looks like it does. */
  function uploadAnnouncementImage(file) {
    var h = adminHelpers();
    if (!file || !h.getDraft()) return;

    h.setUploading(true);
    repaintAdmin();

    HC.admin.uploadImage(file).then(function (url) {
      var d = h.getDraft();
      if (!d) return;
      var empty = d.images.indexOf('');
      if (empty > -1) d.images[empty] = url;
      else d.images.push(url);
    }).catch(function (err) {
      HC.components.toast(err.message || 'That picture would not upload.');
    }).then(function () {
      h.setUploading(false);
      repaintAdmin();
    });
  }

  /* The home groups flyer. The same bucket and the same helper as the
     announcement pictures above, because it is the same kind of thing going to
     the same place, and migration 0026 already wrote the upload policies for
     it. The difference is the shape of the field: one picture, so this
     replaces rather than appends, and choosing another is how you change your
     mind.

     Uploaded on choosing rather than on Save, exactly as above: a person sees
     it land, and a picture that would not upload is about the picture instead
     of about the paragraph they had just finished typing. It is not on Connect
     until Save, because the column is what Connect reads. */
  function uploadGroupFlyer(file) {
    var h = adminHelpers();
    if (!file) return;

    h.setUploading(true);
    repaintAdmin();

    HC.admin.uploadImage(file).then(function (url) {
      h.getGroupBox().imageUrl = url;
      HC.components.toast('Added. Save the box to put it on Connect.');
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

  /* Waiting for a newsletter check to finish.

     WHY THIS POLLS AT ALL, rather than the button simply reporting success.
     hc_admin_fetch_newsletter returns the moment pg_net accepts the request,
     because pg_net is fire and forget: the response goes nowhere and the
     Edge Function is only starting. What follows is an IMAP round trip and a
     language model, which together take twenty to forty seconds. A button that
     said "done" at that point would be lying, and the drafts would appear
     under a screen somebody had already stopped looking at.

     So the run log is the completion signal. The intake writes exactly one row
     there whichever way it goes, success or failure, which makes "a row newer
     than the one we started with" a reliable answer to "has it finished".

     Resolves null on timeout rather than rejecting, because a check that is
     still running is not a check that failed. The caller says so and the
     twenty minute tick carries on regardless. */
  function pollForRun(sinceId, tries) {
    if (tries <= 0) return Promise.resolve(null);

    return new Promise(function (resolve) { window.setTimeout(resolve, 3000); })
      .then(function () { return HC.admin.latestRun(); })
      .then(function (run) {
        if (run && run.id !== sinceId) return run;
        return pollForRun(sinceId, tries - 1);
      })
      .catch(function () {
        // One failed poll on a phone in a building with concrete walls is not
        // the check failing. Keep waiting.
        return pollForRun(sinceId, tries - 1);
      });
  }

  /* The same wait, on the other log. Its own function rather than a parameter
     on the one above, because the two watch different tables through different
     reads and a shared one would take a fetcher as an argument to save four
     lines. Same contract: null on timeout, because a run still going is not a
     run that failed. */
  function pollForGroupRun(sinceId, tries) {
    if (tries <= 0) return Promise.resolve(null);

    return new Promise(function (resolve) { window.setTimeout(resolve, 3000); })
      .then(function () { return HC.admin.latestGroupRun(); })
      .then(function (run) {
        if (run && run.id !== sinceId) return run;
        return pollForGroupRun(sinceId, tries - 1);
      })
      .catch(function () {
        return pollForGroupRun(sinceId, tries - 1);
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
      /* A real <a> in text somebody wrote: a scripture reference in a journal
         entry, a link in an announcement. Nothing else in this app renders
         one, because every other destination is a button carrying a
         data-action.

         Intercepted rather than followed, and this is not a nicety. Left
         alone, a tap on one navigates the web view itself: in a browser that
         is the app replaced by a web page with no way back to where somebody
         was reading, and in the packaged app it is a chance the native shell
         happens to catch it first. openExternal() is the one door every other
         outbound link in this app already goes through, so it lands in the
         phone's browser, or in Mail or the dialer for the schemes that want
         those, and the app is still behind it.

         Skipped inside a writing surface, where a tap is somebody putting the
         caret in their own sentence and not asking to go anywhere.

         Skipped for a[download] as well, and that exception is load bearing.
         The claim above — that every anchor here is one somebody wrote — stopped
         being true when downloadInBrowser() in js/native.js started building
         one to save a file with. A download is not a destination: sending its
         href to openExternal() cancels the save and navigates instead, which
         is what broke Add to calendar in the browser. */
      var link = evt.target.closest && evt.target.closest('a[href]');
      if (link && !link.hasAttribute('download') &&
          !link.closest('[contenteditable="true"]')) {
        evt.preventDefault();
        c.openExternal(link.getAttribute('href'));
        return;
      }

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

        /* And a third: the week header on Worship, which changes the setlist
           under it the way the series rail changes the episode list. Same
           arrangement, same reason it is here rather than in the screen. */
        if (rail.hasAttribute('data-worship-rail') && HC.screens.worshipHelpers) {
          HC.screens.worshipHelpers.selectWeek(rail, index);
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
        /* Edit mode's box. Writes into js/edit-mode.js and draws nothing, the
           same arrangement as the Admin form: a content sync landing between
           two letters redraws the screen from that module, so the words
           survive it. */
        if (el.getAttribute('data-edit-field')) {
          HC.edit.setValue(el.value);
          return;
        }

        /* The contact form at the top of Connect. Writes into the screen's own
           state and draws nothing, on purpose: nothing about typing here
           changes what is on the screen, so there is no repaint to make, and
           the state exists only so that tapping a filter chip further down
           does not take a half written message with it. */
        var contactField = el.getAttribute('data-contact-field');
        if (contactField) {
          HC.screens.connectHelpers.setContactField(contactField, el.value);
          return;
        }

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

      /* The announcement's words, in the same editor. Into the draft and
         nowhere else, the same as every other field on that form: nothing is
         saved to Supabase until somebody presses the button, which is what
         makes Cancel mean something. Not debounced and not sanitized here
         either, for the same reason the Admin form does neither: the markup is
         cleaned on the way out, in announcementWords(), where it can also be
         mirrored to plain text in the same pass. */
      if (el.getAttribute && el.getAttribute('data-admin-body') !== null) {
        var draft = adminHelpers().getDraft();
        if (draft) draft.bodyHtml = el.innerHTML;
        return;
      }

      // The link sheet's two boxes. Nothing repaints, for the reason on
      // linkPick in js/editor.js: a repaint mid-word takes the keyboard down.
      var linkPart = el.getAttribute && el.getAttribute('data-link');
      if (linkPart) {
        HC.editor.setLink(linkPart, el.value);
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

      /* The search box. Debounced like the Journal's, and unlike the
         Journal's it does not refocus afterwards, because nothing it does
         touches the field: js/screens/search.js writes the list under the box
         and leaves the box, the caret and the keyboard exactly where they
         are. */
      if (el.getAttribute && el.getAttribute('data-search-box') !== null) {
        debounce('search', function () {
          HC.screens.searchHelpers.setQuery(el.value);
        });
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

      /* The event form on the Cal tab. Same rule as the Admin form above it:
         every keystroke goes into the draft the screen is holding and nothing
         is redrawn, so a content refresh landing mid-sentence cannot take the
         caret with it. Saved when the button is pressed and not before, which
         is what makes Cancel mean something. */
      var calField = el.getAttribute && el.getAttribute('data-cal-field');
      if (calField) {
        calHelpers().setField(calField, el.value);
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

      // The home groups flyer, into the same bucket by the same helper. One
      // picture rather than a list, so it replaces instead of appending.
      if (evt.target.hasAttribute && evt.target.hasAttribute('data-admin-group-image')) {
        uploadGroupFlyer(evt.target.files && evt.target.files[0]);
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
        if (HC.store.getProfile().theme !== 'system') return;
        HC.store.applyPreferences();
        // The phone went dark under a person who never chose either, so the
        // sun in the bar has to become a moon without anybody tapping it.
        paintThemeToggle();
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
    // The disc is drawn empty in the shell markup above and filled here,
    // once, because which of the two icons it holds is a question about the
    // theme applyPreferences() has just settled.
    paintThemeToggle();
    wireEvents();
    wireSheet();
    watchScroll();

    /* Edit mode's idle clock and the two listeners that feed it. Wired on
       every boot rather than when the switch goes on, and off by definition
       at this point: the state lives in a variable in js/edit-mode.js, so a
       cold start is a phone with edit mode off, which is what "turns off when
       you close the app" means here. */
    HC.edit.start();

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
        worship: HC.screens.worship,
        cal: HC.screens.cal,
        practices: HC.screens.practices,
        practice: HC.screens.practice,
        alpha: HC.screens.alpha,
        journal: HC.screens.journal,
        'journal-entry': HC.screens.journalEntry,
        give: HC.screens.give,
        search: HC.screens.search,
        profile: HC.screens.profile,
        admin: HC.screens.admin,
        announcement: HC.screens.announcement,
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
      /* And Home, for the one line on it that is about who is holding the
         phone. Somebody signing in at the gate is signing in while Home is
         already drawn underneath, so without this the first thing they see
         after "You're in!" is a greeting that does not know their name yet.
         restore:true because this is a repaint and not a visit: the router
         writes the live scroll position down on its way through, so a session
         refresh landing mid-scroll puts the page back where the thumb had
         it. */
      else if (route && route.name === 'home') {
        HC.router.go({ name: 'home', restore: true }, { force: true });
      }
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

    /* Who posted an announcement has arrived, which only ever happens on an
       admin's or a leader's phone and only once per launch. Same shape as the
       subscriber above and for the same reason: js/bylines.js reads a table
       the congregation cannot, with a session, after Home has already drawn.

       Two routes rather than one, because the line appears in two places: on
       the card's label on Home and under the header on the announcement's own
       page. Anywhere else is left alone, so a byline landing while somebody is
       reading a guide does not redraw the guide. */
    HC.store.on('bylines', function () {
      var route = HC.router.current();
      if (!route) return;
      if (route.name !== 'home' && route.name !== 'announcement') return;
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
