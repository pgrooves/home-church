/* ==========================================================================
   Home Church, Profile
   Reached only from the avatar. Account, preferences, help, about.
   There is no drawer and no More sheet. This is the whole second surface.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* The church's own descriptions of what each switch on this screen does.
     The switches themselves, and the titles beside them, are not editable:
     "A new guide is posted" names a notification somebody is choosing to
     receive, and the row under it is what that choice means in practice. That
     second half is the part that goes stale, when the church moves the send
     from Monday morning to Sunday night. */
  var NOTIFY_GUIDE = 'Monday morning, once a week';
  var NOTIFY_SUNDAY = 'Saturday evening, service times and address';
  var NOTIFY_NEWS = 'When the church posts something on purpose';
  /* The two admin ones. Not editable, unlike the three above, and the
     difference is not an oversight. Those three describe a schedule the church
     can change its mind about, which is exactly the sort of line that goes
     stale. These two describe what the app does the moment the newsletter is
     parsed, which is not a decision anybody makes on a Tuesday. */
  var NOTIFY_REVIEW_NEWS = 'When the newsletter leaves an announcement waiting on you';
  var NOTIFY_REVIEW_DATES = 'When it leaves a date waiting on you';
  /* There is no LEADER_ copy here any more. Leader mode is a tier an admin
     sets, not a preference this screen has an opinion about, so it says
     nothing at all about it. See the note where the section used to be. */

  // Standard now means 110%, the app's default reading size, not 100%.
  var TEXT_SIZES = [
    { label: 'Standard', value: 1.1 },
    { label: 'Larger', value: 1.25 },
    { label: 'Largest', value: 1.4 }
  ];

  // Local to this screen, same pattern as the day/neighborhood filters on
  // Connect. Reset to idle whenever a code actually goes out or verifies.
  var authIdentifier = '';
  var authStep = 'idle';   // idle | sent

  function field(name, label, value, autocomplete) {
    return '' +
      '<label class="hc-field">' +
        '<span class="hc-field__label">' + c.esc(label) + '</span>' +
        '<input class="hc-input" type="text" autocomplete="' + c.esc(autocomplete || 'off') + '" ' +
          'data-profile-field="' + c.esc(name) + '" value="' + c.esc(value || '') + '">' +
      '</label>';
  }

  function dateField(name, label, value) {
    return '' +
      '<label class="hc-field">' +
        '<span class="hc-field__label">' + c.esc(label) + '</span>' +
        '<input class="hc-input" type="date" data-profile-field="' + c.esc(name) + '" value="' + c.esc(value || '') + '">' +
      '</label>';
  }

  function selectField(name, label, value, options) {
    var opts = options.map(function (pair) {
      var selected = (value || '') === pair[0] ? ' selected' : '';
      return '<option value="' + c.esc(pair[0]) + '"' + selected + '>' + c.esc(pair[1]) + '</option>';
    }).join('');
    return '' +
      '<label class="hc-field">' +
        '<span class="hc-field__label">' + c.esc(label) + '</span>' +
        '<select class="hc-input hc-select" data-profile-field="' + c.esc(name) + '">' + opts + '</select>' +
      '</label>';
  }

  /* ------------------------------------------------------------- account
     Only exists once js/config.js points at a real Supabase project. Until
     then the app has no concept of signing in, and this renders nothing.
     ------------------------------------------------------------------- */

  function accountSection() {
    if (!HC.auth.isConfigured()) return '';

    if (HC.auth.isSignedIn()) {
      var user = HC.auth.getUser();
      // Deleting the account lives on the Your data screen, next to the copy
      // that says what is actually being deleted. It is linked from here as
      // well because this is where somebody looks for it, and because 5.1.1(v)
      // is about being able to find the thing, not only about it existing.
      return '' +
        c.sectionHeader('Synced', 'Signed in') +
        c.row({ title: 'Signed in as ' + (user.email || user.phone || 'you') }) +
        '<div class="hc-mt-lg">' +
          c.button('Sign out', { action: 'sign-out', variant: 'secondary' }) +
          c.button('Delete my account', { action: 'go-legal', id: 'data', variant: 'tertiary' }) +
        '</div>';
    }

    if (authStep === 'sent') {
      return '' +
        c.sectionHeader('Almost there', 'Enter your code') +
        '<p class="hc-body-serif hc-account__copy">We sent a code to ' + c.esc(authIdentifier) +
          '. It can take a minute to land.</p>' +
        '<form class="hc-form" data-auth-form="verify" novalidate>' +
          '<label class="hc-field">' +
            '<span class="hc-field__label">The code</span>' +
            '<input class="hc-input" type="text" inputmode="numeric" autocomplete="one-time-code" ' +
              'name="code" placeholder="6 digit code">' +
          '</label>' +
          c.button('Verify and sign in', { action: 'auth-verify' }) +
        '</form>' +
        '<button type="button" class="hc-btn hc-btn--tertiary hc-mt-lg" data-action="auth-restart">' +
          'Use a different email or phone</button>';
    }

    return '' +
      c.sectionHeader('Keep this with you', 'Sign in') +
      '<p class="hc-body-serif hc-account__copy">Sign in and your information follows you to any phone. Everything else on this screen already works without it.</p>' +
      '<form class="hc-form" data-auth-form="request" novalidate>' +
        '<label class="hc-field">' +
          '<span class="hc-field__label">Enter email below:</span>' +
          '<input class="hc-input" type="text" inputmode="email" autocomplete="email" ' +
            'name="identifier" placeholder="you@example.com" value="' + c.esc(authIdentifier) + '">' +
        '</label>' +
        c.button('Send me a code', { action: 'auth-request' }) +
      '</form>';
  }

  /* ------------------------------------------------------------- identity
     Always renders, account or not. Every field autosaves through
     HC.auth.saveProfile, which writes to this device immediately and, once
     signed in, pushes the same change to Supabase in the background.
     ------------------------------------------------------------------- */

  function identitySection(p) {
    var note = !HC.auth.isConfigured()
      ? ''
      : HC.auth.isSignedIn()
        ? '<p class="hc-caption hc-profile__hint">Synced to your account.</p>'
        : '<p class="hc-caption hc-profile__hint">Saved on this phone for now. Sign in above to carry it to another device.</p>';

    return '' +
      c.sectionHeader('The details', 'Your information') +
      '<div class="hc-profile__fields">' +
        '<div class="hc-form-row">' +
          field('firstName', 'First name', p.firstName, 'given-name') +
          field('lastName', 'Last name', p.lastName, 'family-name') +
        '</div>' +
        '<div class="hc-form-row">' +
          selectField('gender', 'Gender', p.gender, [
            ['', 'Skip this'], ['female', 'Female'], ['male', 'Male']
          ]) +
          dateField('birthdate', 'Birthdate', p.birthdate) +
        '</div>' +
        field('campus', 'Campus', p.campus, 'off') +
        selectField('maritalStatus', 'Marital status', p.maritalStatus, [
          ['', 'Skip this'], ['single', 'Single'], ['married', 'Married'],
          ['widowed', 'Widowed'], ['other', 'Other']
        ]) +
        field('street', 'Street address', p.street, 'address-line1') +
        field('unit', 'Apt, suite, etc.', p.unit, 'address-line2') +
        '<div class="hc-form-row hc-form-row--address">' +
          field('city', 'City', p.city, 'address-level2') +
          field('state', 'State', p.state, 'address-level1') +
          field('zip', 'ZIP', p.zip, 'postal-code') +
        '</div>' +
      '</div>' +
      note;
  }

  function switchRow(opts) {
    return '' +
      '<button type="button" class="hc-switch-row" data-action="' + c.esc(opts.action) + '" ' +
        (opts.id ? 'data-id="' + c.esc(opts.id) + '" ' : '') +
        'role="switch" aria-checked="' + (opts.on ? 'true' : 'false') + '">' +
        '<span class="hc-row__body">' +
          '<span class="hc-row__label">' + c.esc(opts.title) + '</span>' +
          (opts.sub ? '<span class="hc-caption hc-switch-row__sub">' + c.esc(opts.sub) + '</span>' : '') +
        '</span>' +
        '<span class="hc-switch" aria-hidden="true" aria-checked="' + (opts.on ? 'true' : 'false') + '">' +
          '<span class="hc-switch__knob"></span>' +
        '</span>' +
      '</button>';
  }

  /* Where the guides, events, and announcements on this phone came from.

     This is here so that "did the app actually pick up the new guide" can be
     answered by looking at the phone, rather than by refreshing screens and
     guessing. It reads as a normal, warm line to anyone else, which is the
     bar for anything in the About block. */
  function contentLine() {
    if (!HC.content || !HC.content.isConfigured()) return '';
    var s = HC.content.state();

    if (s.status === 'partial') {
      return '<p class="hc-caption hc-about__content">Some of this week’s content did not come through. ' +
        'You have everything from last time, and we will finish catching up when the signal is better.</p>';
    }
    if (s.source === 'network') {
      return '<p class="hc-caption hc-about__content">Content is up to date' +
        (s.fetchedAt ? ', checked ' + when(s.fetchedAt) : '') + '. ' +
        'It is saved on this phone, so it still opens with no signal.</p>';
    }
    if (s.status === 'fetching') {
      return '<p class="hc-caption hc-about__content">Checking for new content.</p>';
    }
    if (s.source === 'cache') {
      return '<p class="hc-caption hc-about__content">Showing your saved copy. ' +
        'We will catch up the next time you have signal.</p>';
    }
    return '<p class="hc-caption hc-about__content">Showing the copy that came with the app. ' +
      'We will catch up the next time you have signal.</p>';
  }

  // 'today at 6:42 PM' when it is today, otherwise the date. Short on purpose.
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'just now';
    var h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    var suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    var clock = h + ':' + m + ' ' + suffix;
    var today = new Date();
    var sameDay = d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    return sameDay ? 'today at ' + clock : c.formatDate(
      d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2)
    );
  }

  function render() {
    var p = HC.store.getProfile();
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    var html = '<div class="hc-screen hc-profile">';

    html += c.sectionHeader('You', 'Your account', { flush: true, tag: 'h1' });

    html += accountSection();
    html += identitySection(p);

    html += c.row({
      title: HC.data.church.address.line1,
      sub: HC.data.church.address.city + ', ' + HC.data.church.address.state,
      action: 'open-url',
      url: HC.data.church.mapsUrl,
      chevron: true
    });

    // Notifications
    html += c.sectionHeader('When we reach out', 'Notifications');
    html += HC.edit.mark(switchRow({
      title: 'A new guide is posted',
      sub: HC.data.copy('profile.notify-guide', NOTIFY_GUIDE),
      action: 'toggle-notify',
      id: 'newGuide',
      on: p.notifications.newGuide
    }), { slot: 'profile.notify-guide',
      value: HC.data.copy('profile.notify-guide', NOTIFY_GUIDE),
      label: 'when a new guide goes out', rows: 2 });
    html += HC.edit.mark(switchRow({
      title: 'Sunday reminder',
      sub: HC.data.copy('profile.notify-sunday', NOTIFY_SUNDAY),
      action: 'toggle-notify',
      id: 'sundayReminder',
      on: p.notifications.sundayReminder
    }), { slot: 'profile.notify-sunday',
      value: HC.data.copy('profile.notify-sunday', NOTIFY_SUNDAY),
      label: 'what the Sunday reminder is', rows: 2 });
    html += HC.edit.mark(switchRow({
      title: 'Announcements',
      sub: HC.data.copy('profile.notify-news', NOTIFY_NEWS),
      action: 'toggle-notify',
      id: 'announcements',
      on: p.notifications.announcements
    }), { slot: 'profile.notify-news',
      value: HC.data.copy('profile.notify-news', NOTIFY_NEWS),
      label: 'when announcements are sent', rows: 2 });
    /* The fourth switch is season gated, the same way Connect gates the group
       finder, and for a harder reason than symmetry. "Only on your group's
       day" needs to know which group you are in, and nothing in this app
       models that: there is no membership, only a roster a leader keeps on
       their own phone. Sending it on every group's day would be noise, and
       sending it on none would be a lie.

       So while groups are out of season it does not render, and the server
       column behind it stays false. When groups come back, this needs a group
       picker in Your information before the switch can be honest. Migration
       0012 says the same thing next to the column. */
    if (HC.data.church.groupsInSeason) {
      html += switchRow({
        title: 'The day your group meets',
        sub: 'Only on your group’s day',
        action: 'toggle-notify',
        id: 'groupWeek',
        on: p.notifications.groupWeek
      });
    }

    /* The two an admin has, and nobody else is shown.

       WHY THEY ARE HERE RATHER THAN ON THE ADMIN SCREEN, which was the other
       option and the more obvious one. Because they are preferences, and this
       screen is where a person's preferences live. The Admin screen is a place
       to do the church's work; deciding whether your own phone buzzes at seven
       in the morning is not that, and somebody looking for a notification
       switch looks where the other four are.

       They sit under the same heading for the same reason, rather than in an
       Admin section of their own. A separate box would say these are a
       different kind of thing, and they are not: they are two more answers to
       "when should this app reach out".

       HIDING THEM IS PRESENTATION AND NOTHING MORE, the same as the Admin row
       further down. hc_set_admin_device_token refuses anybody the database
       does not agree is an admin, so a member who made these appear would
       flip a switch that writes to nothing. See migration 0043 section 4. */
    if (HC.admin && HC.admin.isAdmin()) {
      html += switchRow({
        title: 'Announcements waiting',
        sub: NOTIFY_REVIEW_NEWS,
        action: 'toggle-notify',
        id: 'announcementReview',
        on: p.notifications.announcementReview
      });
      html += switchRow({
        title: 'Dates waiting',
        sub: NOTIFY_REVIEW_DATES,
        action: 'toggle-notify',
        id: 'eventReview',
        on: p.notifications.eventReview
      });
      html += '<p class="hc-caption hc-profile__hint">These two are yours because ' +
        'you are an admin. Nobody else in the church is told what is in the queue, ' +
        'and nothing in it is on Home until you say so.</p>';
    }

    // Reading
    html += c.sectionHeader('Easier to read', 'Display');
    html += '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">Text size</p>';
    html += '<div class="hc-pills">';
    TEXT_SIZES.forEach(function (size) {
      var on = Math.abs((p.textScale || 1) - size.value) < 0.001;
      html += '<button type="button" class="hc-pill" data-action="text-size" ' +
        'data-value="' + size.value + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        c.esc(size.label) + '</button>';
    });
    html += '</div>';

    /* The Journal lock. Drawn only on a phone that answered yes to
       HC.native.canLock(), because a switch that cannot do anything is the
       same lie as a notification switch with no permission behind it. The
       answer is asynchronous, so Profile draws without it and the row is put
       in afterwards by the boot check in js/app.js. */
    html += '<div class="hc-lockrow" data-lockrow hidden></div>';

    html += '<div class="hc-mt-lg">' + switchRow({
      title: 'Dark mode',
      sub: 'Warm charcoal, not black',
      action: 'toggle-theme',
      on: isDark
    }) + '</div>';

    /* THERE IS NO LEADER MODE ON THIS SCREEN, and there should not be one
       again. Somebody is a member, a leader or an admin, an admin sets which
       under Manage users, and nobody sets their own. A screen whose whole job
       is the preferences a person chooses for themselves is the wrong place
       for any of that, and a section here saying "the church decides this"
       reads like a setting that is broken rather than like something that was
       never a setting.

       A leader's way into the roster and the prayer requests is the row in
       the More sheet, and their presentation button is at the top of every
       guide. Both appear on their own once an admin turns Leader mode on, and
       js/auth.js brings that down to the phone on the next sign in or session
       refresh. */

    /* Admin. Drawn only for somebody whose profiles.role is 'admin', which
       js/auth.js mirrors onto this phone on every sign in and every session
       refresh, and clears on sign out.

       A door rather than a setting, which is the only reason it is on this
       screen at all: it opens a screen, it says nothing to anybody who does
       not have it, and it cannot be turned on from here any more than Leader
       mode can.

       Hiding it is presentation and nothing more. Every button behind it is
       checked by the database, in the policies from migration 0026 and the
       admin-gated functions from 0025 and 0027, so a member who made this row
       appear would find a screen where nothing works. See js/admin.js. */
    if (HC.admin && HC.admin.isAdmin()) {
      html += c.sectionHeader('For the church', 'Admin');
      html += '<p class="hc-body-serif hc-profile__leader-copy">Announcements, who can edit, ' +
        'the church’s own pages, and the switches that change the whole app.</p>';
      html += c.row({
        title: 'Open the admin dashboard',
        sub: 'Everything here is live the moment you save it.',
        action: 'go-admin',
        chevron: true,
        serif: true
      });
    }

    // Help and about
    html += c.sectionHeader('Anything else', 'Help and about');
    html += c.row({ title: 'Email the church', action: 'open-url', url: 'mailto:hello@homechurchnola.com', chevron: true });
    html += c.row({ title: 'homechurchnola.com', action: 'open-url', url: HC.data.church.websiteUrl, chevron: true });
    HC.data.church.social.forEach(function (s) {
      html += c.row({ title: s.label, action: 'open-url', url: s.url, chevron: true });
    });

    // The fine print. Apple requires the privacy policy to be reachable inside
    // the app and not only linked from App Store Connect, and a person should
    // be able to find what the app holds on them without hunting for it.
    html += c.sectionHeader('The fine print', 'Privacy and terms');
    html += c.row({ title: 'Privacy policy', action: 'go-legal', id: 'privacy', chevron: true });
    html += c.row({ title: 'Terms of use', action: 'go-legal', id: 'terms', chevron: true });
    html += c.row({
      title: 'Your data',
      sub: HC.auth.isConfigured() && HC.auth.isSignedIn()
        ? 'See what is stored, erase this phone, or delete your account'
        : 'See what is stored on this phone, and erase it',
      action: 'go-legal',
      id: 'data',
      chevron: true
    });

    html += '<div class="hc-about">';
    html += '<img class="hc-mark" src="assets/icons/mark.png" alt="Home Church">';
    html += '<p class="hc-caption">' + c.esc(HC.data.church.name) + ', ' + c.esc(HC.data.church.pastors) + '</p>';
    /* The church's own line about itself, at the foot of Your account.
       Editable here and nowhere else: the name and the pastors above it are
       facts, and the version under it is the build. */
    html += HC.edit.wrap(
      '<p class="hc-caption">' + c.esc(HC.data.church.tagline) + '</p>',
      { table: 'church_profile', id: HC.data.church.id || 'church-home', column: 'tagline',
        target: HC.data.church, field: 'tagline',
        value: HC.data.church.tagline, label: 'the church’s tagline', rows: 3 }
    );
    html += '<p class="hc-caption hc-about__version">Version 1.0</p>';
    html += contentLine();
    if (!HC.store.storage.available) {
      html += '<p class="hc-caption hc-about__warn">Your browser is not saving anything right now, so notes and checkmarks will not survive a reload. Private browsing usually does this.</p>';
    }
    html += '</div>';

    html += '</div>';
    return c.el(html);
  }

  /* Built here rather than in js/app.js so all of Profile's markup is in one
     file, and called from there once the phone has answered. */
  function lockRow() {
    var p = HC.store.getProfile();
    return switchRow({
      title: 'Lock the Journal',
      sub: p.lockJournal
        ? 'Face ID, Touch ID, or your passcode before the Journal opens.'
        : 'Ask for Face ID, Touch ID, or your passcode before opening the Journal.',
      action: 'toggle-lock',
      on: !!p.lockJournal
    }) +
    /* Said here rather than only in the privacy policy, because this is the
       screen where somebody decides, and a lock people think is encryption
       is worse than no lock at all. */
    '<p class="hc-caption hc-lockrow__note">This keeps somebody who picks up your phone out of ' +
      'the Journal. It is not encryption: what you write is still saved on this phone, and in ' +
      'your account if you are signed in.</p>';
  }

  HC.screens = HC.screens || {};
  HC.screens.profile = render;
  HC.screens.profileHelpers = {
    lockRow: lockRow,
    TEXT_SIZES: TEXT_SIZES,
    getAuthIdentifier: function () { return authIdentifier; },
    setAuthIdentifier: function (value) { authIdentifier = value; },
    setAuthStep: function (value) { authStep = value; },
    resetAuth: function () { authIdentifier = ''; authStep = 'idle'; }
  };

})(window.HC = window.HC || {});
