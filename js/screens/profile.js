/* ==========================================================================
   Home Church, Profile
   Reached only from the avatar. Account, preferences, help, about.
   There is no drawer and no More sheet. This is the whole second surface.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var TEXT_SIZES = [
    { label: 'Standard', value: 1 },
    { label: 'Larger', value: 1.12 },
    { label: 'Largest', value: 1.25 }
  ];

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

  function render() {
    var p = HC.store.getProfile();
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    var html = '<div class="hc-screen hc-profile">';

    html += c.sectionHeader('You', 'Your account', { flush: true, tag: 'h1' });

    // Name and campus
    html += '<div class="hc-profile__fields">';
    html += '<label class="hc-field">' +
      '<span class="hc-field__label">What should we call you</span>' +
      '<input class="hc-input" type="text" name="name" autocomplete="given-name" ' +
        'data-profile-field="name" value="' + c.esc(p.name) + '" placeholder="Your first name">' +
    '</label>';
    html += '<p class="hc-caption hc-profile__hint">This only changes the greeting on your home screen.</p>';
    html += '</div>';

    html += c.row({ title: 'Campus', value: p.campus });
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
    if (!HC.store.storage.available) {
      html += '<p class="hc-caption hc-about__warn">Your browser is not saving anything right now, so notes and checkmarks will not survive a reload. Private browsing usually does this.</p>';
    }
    html += '</div>';

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.profile = render;
  HC.screens.profileHelpers = { TEXT_SIZES: TEXT_SIZES };

})(window.HC = window.HC || {});
