/* ==========================================================================
   Home Church, the fine print
   Privacy policy, terms of service, and the screen where a person deletes
   what this app knows about them.

   WHY THIS TEXT LIVES IN CODE AND NOT IN SUPABASE. Every other word in this
   app is editable from a phone without a build, on purpose, and that is the
   right call for a guide or an event. It is the wrong call here for two
   reasons. Apple requires the privacy policy to be reachable inside the app,
   and a policy that fails to render because the network is down is a policy
   that is not reachable. And legal text should change deliberately, through a
   commit somebody reviewed, rather than through the same one line command
   that fixes a typo in a sermon title.

   THESE ARE DRAFTS. They describe what the app actually does, accurately, as
   of this commit. They have not been read by a lawyer. See LAUNCH_TODO.md.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  // Update this whenever the text below changes in a way that matters, and
  // confirm it before submitting to the App Store.
  var EFFECTIVE = 'August 11, 2026';

  /* ---------------------------------------------------------- small parts */

  function head(eyebrow, title) {
    return c.sectionHeader(eyebrow, title, { flush: true, tag: 'h1' }) +
      '<p class="hc-caption hc-legal__date">Effective ' + c.esc(EFFECTIVE) + '</p>';
  }

  function block(title, paragraphs) {
    var html = '<section class="hc-legal__block">' +
      '<h2 class="hc-legal__heading">' + c.esc(title) + '</h2>';
    paragraphs.forEach(function (p) {
      html += '<p class="hc-body-serif hc-legal__p">' + c.esc(p) + '</p>';
    });
    return html + '</section>';
  }

  function list(title, items) {
    var html = '<section class="hc-legal__block">' +
      '<h2 class="hc-legal__heading">' + c.esc(title) + '</h2>' +
      '<ul class="hc-legal__list">';
    items.forEach(function (i) {
      html += '<li class="hc-body-serif hc-legal__item">' + c.esc(i) + '</li>';
    });
    return html + '</ul></section>';
  }

  function contactBlock() {
    var church = HC.data.church;
    var addr = church.address;
    return '<section class="hc-legal__block">' +
      '<h2 class="hc-legal__heading">Reaching us</h2>' +
      '<p class="hc-body-serif hc-legal__p">' +
        c.esc(church.name) + '<br>' +
        c.esc(addr.line1) + '<br>' +
        c.esc(addr.city + ', ' + addr.state + ' ' + addr.zip) +
      '</p>' +
      c.button('Email the church', {
        action: 'open-url',
        url: 'mailto:hello@homechurchnola.com',
        variant: 'secondary'
      }) +
    '</section>';
  }

  /* ------------------------------------------------------- privacy policy */

  function privacy() {
    var html = '<div class="hc-screen hc-legal">';

    html += head('The fine print', 'Privacy policy');

    html += block('The short version', [
      'Almost everything you do in this app stays on your phone. We do not track you, there is no analytics, there is no advertising, and we do not sell your information to anyone. That is not a promise we are making for now. It is how the app is built.'
    ]);

    html += list('What stays on your phone, and only on your phone', [
      'Your name and anything you type into Your information.',
      'Your notes on a guide, and which questions you have checked off.',
      'Your group roster, who was there, and any private notes you keep about the people in it.',
      'Prayer requests you write down in Leader mode.',
      'Dark mode, text size, and whether Leader mode is on.'
    ]);

    html += block('', [
      'None of that is sent anywhere. The app keeps it on your device. Delete the app and it goes with it, and you can clear it yourself at any time from Your account. We do not have a copy, which means we cannot read it, hand it over, or lose it.'
    ]);

    html += block('What actually leaves your phone', [
      'Content. The app downloads sermons, guides, events, and the church’s own details so you always have this week’s material, and keeps a copy so it still works when you have no signal. That is an ordinary web request, and like any web request it includes your device’s network address. We do not use it to work out who you are and we do not build a profile from it.',
      'Notifications, if you turn them on. Apple hands us an anonymous token for your device so we can tell you when a new guide is posted. The token is not attached to your name or your email, and turning notifications off ends it.'
    ]);

    html += block('When the app hands you off to somebody else', [
      'Some things here are not ours. Giving opens Overflow. Messages open our podcast host or Spotify. Scripture opens BibleGateway. Baptism and Alpha open Church Center. Hosting a group opens Group Vitals. Sending us a prayer request opens a Google form. The email list opens Flodesk.',
      'Each of those opens in your phone’s own browser, and once you are there you are on their site and under their privacy policy, not ours. Anything you type into one of their forms goes to them and to the church. It does not pass through this app, and we only ever see what you chose to send.'
    ]);

    html += list('The services this app depends on', [
      'Supabase, which stores the sermons, guides, and events the app downloads. Their servers for this project are in Ohio, in the United States.',
      'Google Fonts, which serves two typefaces and therefore receives your device’s network address.',
      'Apple, which delivers notifications if you have turned them on.'
    ]);

    html += block('', [
      'We do not sell or rent anything about you to anybody, and we never will.'
    ]);

    html += block('How long we keep it', [
      'Whatever is on your phone stays there until you remove it. There is nothing on our side to keep, because the app does not send it to us.'
    ]);

    html += block('Getting rid of it', [
      'Open Your account and choose Your data. You can erase everything this app has stored on your phone in two taps. If you would rather ask us to do something about information you have sent the church another way, email us and we will take care of it.'
    ]);

    html += block('Children', [
      'This app is for a whole church, and families use it. It is not aimed at children, and we do not knowingly collect anything from a child under 13. If you think a child has sent us something, email us and we will delete it.'
    ]);

    html += block('If this changes', [
      'We will change the date at the top, and if the change is one you would want to know about, we will say so in the app rather than hoping you check.'
    ]);

    html += contactBlock();

    html += '</div>';
    return c.el(html);
  }

  /* ------------------------------------------------------------- terms */

  function terms() {
    var html = '<div class="hc-screen hc-legal">';

    html += head('The fine print', 'Terms of use');

    html += block('The short version', [
      'Use the app. Be decent with it. We built it for our church and we are not claiming it is perfect.'
    ]);

    html += block('What this is', [
      'Home Church makes this app for our congregation and for anyone else who wants it. Sermons, small group guides, what is coming up, and a way to find us on a Sunday.'
    ]);

    html += block('Using it', [
      'Do not use the app to break the law, and do not try to break the app. Do not take the guides and sell them.',
      'Short of that, use them. Print one, hand it around your group, read a line out loud, quote it somewhere. That is what they were written for, and you do not need to ask.'
    ]);

    html += block('What you write is yours', [
      'Your notes, your journal entries, your group’s roster and prayer requests. They are yours, they stay on your phone, and we do not have them. We claim nothing over anything you write here.'
    ]);

    html += block('What we can do', [
      'We can change the app, add to it, or stop offering it. If we ever stop, we will tell you rather than let it go quiet.'
    ]);

    html += block('No promises', [
      'The app is offered as it is. We do not promise it will always work, that it will be free of mistakes, or that it will always be available. To the fullest extent Louisiana law allows, Home Church is not liable for any loss or damage arising from your use of the app, or from not being able to use it.'
    ]);

    html += block('Louisiana', [
      'These terms are governed by the laws of the State of Louisiana, without regard to its conflict of law rules.'
    ]);

    html += block('If this changes', [
      'New date at the top, and we will tell you if the change is one that matters.'
    ]);

    html += contactBlock();

    html += '</div>';
    return c.el(html);
  }

  /* --------------------------------------------------------------- data
     Apple requires that a person be able to start deleting their account
     inside the app rather than by emailing somebody. There are no accounts
     in this version, so the requirement does not bite, but the harder
     promise underneath it still applies: a person should be able to see
     what the app holds and get rid of it without asking permission.

     Two taps, with the second one meaning it. No undo, and the screen says
     so before the first tap rather than after the second.
     ------------------------------------------------------------------- */

  /* The armed state lives in the route, not in a variable up here.

     It was a module variable first, and that was wrong in a way that only
     showed up under the back gesture. Arming the confirmation pushes a history
     entry, so going back lands on the previous entry for this same screen, and
     a module variable knows nothing about that: you would arrive at an
     unarmed screen still showing "Yes, erase it". A confirmation nobody armed
     is worse than no confirmation at all, because it trains the tap.

     Put it in the route and history does the work. Back genuinely disarms,
     forward genuinely re-arms, and a cold launch on a shared link cannot land
     anybody on a primed delete button.

     It rides in the route's `id` slot, which the router already serializes and
     which this screen has no other use for. */
  function data(route) {
    var confirming = route && route.id === 'confirm';
    var html = '<div class="hc-screen hc-legal hc-data">';

    html += c.sectionHeader('The fine print', 'Your data', { flush: true, tag: 'h1' });

    html += block('', [
      'Everything this app knows about you is on this phone. Nothing here has been sent to the church, and there is no account to close, because this version of the app does not have accounts.'
    ]);

    html += list('What is stored on this device', [
      'Your name and the rest of Your information.',
      'Your notes and checkmarks on every guide you have opened.',
      'Your group roster, attendance, and private notes.',
      'Prayer requests saved in Leader mode.',
      'Dark mode, text size, and Leader mode.',
      'A saved copy of this week’s sermons and guides, so the app works with no signal.'
    ]);

    if (!confirming) {
      html += block('Erasing it', [
        'This removes all of it from this phone at once. It cannot be undone, and because we never had a copy, we cannot put it back for you.'
      ]);
      html += '<div class="hc-data__action">' +
        c.button('Erase everything on this phone', { action: 'erase-ask', variant: 'secondary' }) +
      '</div>';
    } else {
      html += block('Are you sure', [
        'Your notes, your roster, and your prayer requests go with it. There is no undo and no copy anywhere else.'
      ]);
      html += '<div class="hc-data__action hc-data__action--confirm">' +
        c.button('Yes, erase it', { action: 'erase-confirm' }) +
        '<button type="button" class="hc-btn hc-btn--tertiary" data-action="erase-cancel">Keep my things</button>' +
      '</div>';
    }

    html += block('Anything else', [
      'If you have sent the church information some other way, through a baptism signup or a prayer request form, email us and we will take care of it.'
    ]);

    html += contactBlock();

    html += '</div>';
    return c.el(html);
  }

  HC.screens = HC.screens || {};
  HC.screens.privacy = privacy;
  HC.screens.terms = terms;
  HC.screens.data = data;
  HC.screens.legalHelpers = {
    EFFECTIVE: EFFECTIVE
  };

})(window.HC = window.HC || {});
