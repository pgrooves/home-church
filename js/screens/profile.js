/* ==========================================================================
   Home Church, Profile
   Reached only from the avatar. Account, preferences, help, about.
   There is no drawer and no More sheet. This is the whole second surface.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

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
      return '' +
        c.sectionHeader('Synced', 'Signed in') +
        c.row({ title: 'Signed in as ' + (user.email || user.phone || 'you') }) +
        '<div class="hc-mt-lg">' + c.button('Sign out', { action: 'sign-out', variant: 'secondary' }) + '</div>';
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
          '<span class="hc-field__label">Email or phone number</span>' +
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

    if (s.source === 'network') {
      return '<p class="hc-caption hc-about__content">Content is up to date' +
        (s.fetchedAt ? ', checked ' + when(s.fetchedAt) : '') + '.</p>';
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
    html += switchRow({
      title: 'A new guide is posted',
      sub: 'Monday morning, once a week',
      action: 'toggle-notify',
      id: 'newGuide',
      on: p.notifications.newGuide
    });
    html += switchRow({
      title: 'Sunday reminder',
      sub: 'Saturday evening, service times and address',
      action: 'toggle-notify',
      id: 'sundayReminder',
      on: p.notifications.sundayReminder
    });
    html += switchRow({
      title: 'The day your group meets',
      sub: 'Only on your group’s day',
      action: 'toggle-notify',
      id: 'groupWeek',
      on: p.notifications.groupWeek
    });

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

    html += '<div class="hc-mt-lg">' + switchRow({
      title: 'Dark mode',
      sub: 'Warm charcoal, not black',
      action: 'toggle-theme',
      on: isDark
    }) + '</div>';

    // Leader mode
    html += c.sectionHeader('For leaders', 'Leader mode');
    html += '<p class="hc-body-serif hc-profile__leader-copy">If you lead a group, turn this on. You get presentation mode inside every guide, a roster, and somewhere to keep prayer requests.</p>';
    html += switchRow({
      title: 'Leader mode',
      sub: 'Adds leader tools, changes nothing else',
      action: 'toggle-leader',
      on: p.leaderMode
    });

    if (p.leaderMode) {
      html += '<div class="hc-mt-lg">' +
        c.button('Open leader tools', { action: 'go-leader', variant: 'secondary', icon: 'connect' }) +
      '</div>';
    }

    // Help and about
    html += c.sectionHeader('Anything else', 'Help and about');
    html += c.row({ title: 'Email the church', action: 'open-url', url: 'mailto:hello@homechurchnola.com', chevron: true });
    html += c.row({ title: 'homechurchnola.com', action: 'open-url', url: HC.data.church.websiteUrl, chevron: true });
    HC.data.church.social.forEach(function (s) {
      html += c.row({ title: s.label, action: 'open-url', url: s.url, chevron: true });
    });

    html += '<div class="hc-about">';
    html += '<img class="hc-mark" src="assets/icons/mark.png" alt="Home Church">';
    html += '<p class="hc-caption">' + c.esc(HC.data.church.name) + ', ' + c.esc(HC.data.church.pastors) + '</p>';
    html += '<p class="hc-caption">' + c.esc(HC.data.church.tagline) + '</p>';
    html += '<p class="hc-caption hc-about__version">Version 1.0</p>';
    html += contentLine();
    if (!HC.store.storage.available) {
      html += '<p class="hc-caption hc-about__warn">Your browser is not saving anything right now, so notes and checkmarks will not survive a reload. Private browsing usually does this.</p>';
    }
    html += '</div>';

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.profile = render;
  HC.screens.profileHelpers = {
    TEXT_SIZES: TEXT_SIZES,
    getAuthIdentifier: function () { return authIdentifier; },
    setAuthIdentifier: function (value) { authIdentifier = value; },
    setAuthStep: function (value) { authStep = value; },
    resetAuth: function () { authIdentifier = ''; authStep = 'idle'; }
  };

})(window.HC = window.HC || {});
