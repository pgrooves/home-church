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
  var EFFECTIVE = 'October 1, 2026';

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
      'Almost everything you do in this app stays on your phone. We do not track you, there is no analytics, there is no advertising, and we do not sell your information to anyone. That is not a promise we are making for now. It is how the app is built.',
      'Four things leave, and all four are things you choose. Signing in, which puts your email address and whatever you have filled in under Your information on our server so they follow you to another phone. Your journal, once you are signed in, so what you write follows you too. Writing in a group room, which is the point of a room: what you write there is read by the people in it. And writing to us from the form at the top of Connect, which becomes an email to the church office. You can delete the first three from inside the app whenever you like, and the fourth is an email you sent us, which we will delete if you ask.'
    ]);

    html += list('What stays on your phone, and only on your phone', [
      'Which questions you have checked off in a guide.',
      'Your group roster, who was there, and any private notes you keep about the people in it.',
      'Prayer requests you write down in Leader mode.',
      'Dark mode and text size.',
      'Your journal, for as long as you are not signed in.'
    ]);

    html += block('', [
      'None of that is sent anywhere. The app keeps it on your device. Delete the app and it goes with it, and you can clear it yourself at any time from Your data. We do not have a copy, which means we cannot read it, hand it over, or lose it.'
    ]);

    /* The journal is the first thing in this app that somebody writes at
       length, privately, and then syncs. That deserves its own section rather
       than a line in a list, and it deserves the awkward paragraph as well as
       the reassuring one. See supabase/migrations/0023_journal.sql. */
    html += block('Your journal', [
      'Anything you write in the Journal, and any note you attach to something you highlighted in a guide, is yours. Signed out, it never leaves your phone. Signed in, a copy is kept on our server so it is still there when you open the app on a new phone, and so that losing your phone does not lose what you wrote.',
      'No other account can read it. That is not a setting we chose and could change by accident, it is enforced by the database itself: a request for somebody else’s journal comes back empty, and there is no screen anywhere in this app, or in anything the church runs, that shows one person another person’s writing.',
      'Here is the part that would be easy to leave out. Your journal is stored as ordinary text, which means whoever administers our database could read it if they went looking, the same way it is true of your email at any company. We are not going to pretend otherwise by saying it is encrypted so that not even we can read it. That would need a key, and signing in here is a code sent to you rather than a password, so there is nothing to build a key from that would not either live on one phone, defeating the point of it following you, or be held by us, defeating the point of the key.',
      'What we can tell you is what we actually do: nobody at this church reads journals, there is no screen that would show one, and deleting an entry deletes it from our server too. If you would rather keep it all on your phone, do not sign in. Everything in the Journal works either way.',
      'There is a switch under Your account that puts Face ID, Touch ID, or your passcode in front of the Journal. It is worth having and it is worth being precise about what it does: it stops somebody who picks up your unlocked phone from reading what you wrote. It is not encryption, and it does not change anything in the three paragraphs above.'
    ]);

    /* The Group tab is the one place this app holds something a person wrote
       and shows it to somebody else. It gets its own section rather than a
       clause tucked into another one, because a reader skimming for "what
       does it know about me" should hit it. */
    html += block('Group rooms, where writing is the point', [
      'A group room is a room your small group joins with a six digit code. What you write in one is stored on our server, because everybody else in the room has to be able to read it. Nothing else in this app works that way.',
      'What is stored is what you wrote, your first name from Your information, which room, and when. Answers are held back until whoever hosts the room opens them, and until that moment the only person who can read one is you, which is enforced by the database rather than by the screen.',
      'Everybody in that room can read what has been opened. Nobody else can, and neither can somebody who is signed out and merely knows the code. We do not read rooms, and there is no dashboard anywhere that shows them to the church.',
      'You can edit or delete anything you wrote, whenever you like. Whoever hosts the room can take anything down for everybody. Deleting your account takes everything you wrote in every room with it, and if you hosted a room, it takes that room down too, including what everybody else wrote in it.'
    ]);

    html += block('Signing in, which is the one part that does leave', [
      'Signing in is optional. Everything above works whether you sign in or not, and the app never asks you to. What signing in buys you is that Your information follows you to a new phone instead of starting over.',
      'To sign in you give us an email address. We send a six digit code to it, and once you type the code back in you have an account. There is no password to forget or for us to lose.',
      'From that point on, whatever you have filled in under Your information is stored on our server as well as on your phone, so it can be there when you sign in somewhere else. That is your name, and any of these you chose to fill in: your birthday, your campus, your marital status, and your address. If you left a field blank it stays blank, and none of it is required to use the app.'
    ]);

    html += block('', [
      'We use it to know who you are when you sign in, and for nothing else. It is not sold, not rented, not shared with anybody, and not used to advertise to you. Nobody outside the church staff sees it, and you can delete the whole account, and everything in it, from inside the app at any time.'
    ]);

    html += block('What actually leaves your phone', [
      'Content. The app downloads sermons, guides, events, and the church’s own details so you always have this week’s material, and keeps a copy so it still works when you have no signal. That is an ordinary web request, and like any web request it includes your device’s network address. We do not use it to work out who you are and we do not build a profile from it.',
      'Notifications, if you turn them on. Apple gives us an anonymous token for your device, and we keep it alongside which of the switches you turned on, so we know what to send and what not to. None of it is attached to your name, your email, or your account: a row here says that some phone wants the Monday guide notice, never whose phone it is. Turning the switches off stops the sending, and we retire the token when your phone tells Apple the app is gone.',
      /* The exception to the paragraph above, and it is written out rather
         than quietly making that paragraph a little bit untrue. Nothing here
         applies to anybody but the handful of people who run the app, and it
         only says about them a thing the church set by hand in the first
         place. Migration 0043 makes the same argument at length on the
         database's side. */
      'There is one exception, and it applies to the few people who run the app for the church. An admin can be notified that something is waiting for them to approve, and a notification like that has to go to a person rather than to whoever asked, so on an admin’s own phone that token does carry their account. It is set when they turn those two switches on, it comes off when they sign out or switch them back off, and it says nothing about them the church did not already know. If you are not an admin, this paragraph is not about you and your token stays anonymous.'
    ]);

    /* The contact form at the top of Connect, added after the group rooms and
       the journal and written out at the same length, because it is the third
       thing in this app that takes what somebody typed and sends it somewhere.
       The others got a section each and so does this.

       The peppered hash is the paragraph that would be easiest to leave out,
       which is exactly why it is here. This app's whole claim is that it does
       not track anybody, and a form that quietly recorded where a message came
       from without saying so would be the one place that was not true. See
       supabase/functions/contact and migration 0047. */
    html += block('Writing to us from Connect', [
      'At the top of Connect there is a form. What you type into it, your name, your email address and your message, is sent to our server and becomes an email to the church office. That is the whole point of it, and it is the only reason we hold any of it.',
      'A copy is kept on our server as well, so that a message cannot be lost if the email fails to send. Nobody but an admin can read it, it is not attached to your account, and it is deleted after a hundred and eighty days. The email in the church’s mailbox is the part that lasts, in the same way any email you sent us would.',
      'One thing we do record, and we would rather say it than have you find it. Along with the message we keep a scrambled fingerprint of the network address it came from, so that the form cannot be used to send thousands of messages at once. It is put through a one way function with a secret we hold, which means it cannot be turned back into an address, and it is compared only against other messages from the last hour. We do not use it to work out who you are, and nothing else in this app records anything like it.',
      'If you would rather not use the form, the church’s email address is on the same screen and in this policy, and it reaches the same people.'
    ]);

    html += block('When the app hands you off to somebody else', [
      'Some things here are not ours. Giving opens Overflow. Messages open our podcast host or Spotify. Scripture opens BibleGateway. Baptism and Alpha open Church Center. Hosting a group opens Group Vitals. Sending us a prayer request opens a Google form. The email list opens Flodesk.',
      'Each of those opens in your phone’s own browser, and once you are there you are on their site and under their privacy policy, not ours. Anything you type into one of their forms goes to them and to the church. It does not pass through this app, and we only ever see what you chose to send.'
    ]);

    html += list('The services this app depends on', [
      'Supabase, which stores the sermons, guides, and events the app downloads, and which stores your account if you make one. Their servers for this project are in Ohio, in the United States.',
      'Resend, which delivers the six digit sign in code to your email address, and delivers a message you send from the form on Connect to the church. They handle the sending and nothing else.',
      'Apple, which delivers notifications if you have turned them on.'
    ]);

    html += block('', [
      'We do not sell or rent anything about you to anybody, and we never will.'
    ]);

    html += block('How long we keep it', [
      'Whatever is on your phone stays there until you remove it. If you have an account, what is in it stays until you delete the account, and then it is gone from our server rather than hidden or marked inactive.',
      'Group rooms are the exception, and they delete themselves. Ninety days after a room is opened, the room and everything written in it is removed. Long enough that a group can look back at a night, short enough that a hard season somebody wrote about in March is not still sitting on a server in December.',
      'Our copy of a message sent from the form on Connect goes the same way, after a hundred and eighty days. That copy is a safety net under the email, not a record we keep; the email itself sits in the church’s mailbox like any other, and we will delete that too if you ask.',
      'One thing that ninety days does not reach. If whoever hosted a room sent the night out as a document, that file is on the phones it went to, and we cannot delete it for you. It is worth asking them.'
    ]);

    html += block('Getting rid of it', [
      'Open Your account and choose Your data. There are two buttons and they do different things. One erases everything this app has stored on this phone. The other deletes your account and everything synced to it, for good, and you do not have to email anybody or visit a website to do it.',
      'If you would rather ask us to do something about information you have sent the church another way, through a signup or a prayer request form, email us and we will take care of it.'
    ]);

    html += block('Children', [
      'This app is for a whole church, and families use it. It is not aimed at children and we do not advertise to anybody.',
      'We do not knowingly create an account for a child under 13. If your child has made one, email us and we will delete it and everything in it. Parents, the notes, rosters, and prayer requests a child might write in the app never leave their phone at all, so there is nothing on our side to ask us about.'
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
      'Your journal, your notes on a guide, your group’s roster and the prayer requests you keep in Leader mode. They are yours. We claim nothing over anything you write here, we do not read it, and we do not use it to train anything. Signed out it never leaves your phone; signed in, your journal is copied to your account so it follows you, and the privacy policy says exactly what that does and does not mean.',
      'A group room is the one place that works differently, because the whole point of it is that other people read what you wrote. It still belongs to you. You can edit it or delete it whenever you like. But once you post it, the people in that room have seen it, and the next section is about what that asks of everybody.'
    ]);

    /* Guideline 1.2. Apple requires terms forbidding objectionable content
       and agreement to them before a first post, which is why this section
       exists and why js/screens/group.js will not let anybody write until
       they have read it. The database checks the same thing, so this is the
       polite half of a rule enforced somewhere a client cannot reach. */
    html += block('In a group room', [
      'A room is your small group, on a Thursday night, writing down what they would say out loud. Write like that. Nothing hateful, nothing obscene, nothing aimed at somebody, nothing that is not yours to post. If you would not say it with the room looking at you, it does not go in the box.',
      'What other people write in a room stays in the room. It is not yours to forward, screenshot, or repeat somewhere they did not choose.',
      'Every note has a Report button and you can block anybody, which stops their writing reaching you. Whoever hosts the room can take anything down for everybody. We look at reports and act on them within one day, and acting on one can mean removing what was written, removing somebody from a room, or closing their account.',
      'If the problem is the person hosting your room, or you would rather not go through them, write to us at hello@homechurchnola.com and it comes straight to the church.'
    ]);

    html += block('The sheet at the end of the night', [
      'Whoever hosts a room can turn the evening into one document and send it to the group. Everything the room wrote goes on it, including answers the group never got round to opening, and the prayer requests. That is what the button says before you tap it.',
      'Once that document leaves the app it is a file on somebody’s phone and we cannot reach it. Deleting what you wrote afterwards does not take it off a sheet that has already gone out. Worth knowing before you write, and worth a leader thinking about before they send.'
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
     inside the app rather than by emailing somebody, and since sign in went
     live that requirement bites for real. Guideline 5.1.1(v). The harder
     promise underneath it applies either way: a person should be able to see
     what the app holds and get rid of it without asking permission.

     TWO BUTTONS THAT ARE NOT THE SAME BUTTON, and the screen has to make that
     obvious. Erasing clears this phone, which is where the notes and the
     roster and the prayer requests live. Deleting the account clears the
     server, which is where the name and the address live. Somebody who wants
     to be gone entirely taps both, and the copy says so rather than assuming
     one implies the other.

     Two taps each, with the second one meaning it. No undo, and the screen
     says so before the first tap rather than after the second. Only one
     confirmation is ever armed at a time.
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
    var confirmingAccount = route && route.id === 'confirm-account';
    var signedIn = HC.auth.isConfigured() && HC.auth.isSignedIn();
    var html = '<div class="hc-screen hc-legal hc-data">';

    html += c.sectionHeader('The fine print', 'Your data', { flush: true, tag: 'h1' });

    html += block('', [
      signedIn
        ? 'Since you are signed in, there are two piles rather than one, and they are cleared separately. Your information and your journal sync to your account so they can follow you to another phone. Everything else has never left this phone.'
        : 'Everything this app knows about you is on this phone. You are not signed in, so none of it has been sent to the church.'
    ]);

    html += list('What is stored on this device', [
      'Your journal, and your checkmarks on every guide you have opened.',
      'Your group roster, attendance, and private notes.',
      'Prayer requests saved in Leader mode.',
      'Dark mode and text size.',
      'A saved copy of this week’s sermons and guides, so the app works with no signal.'
    ]);

    if (signedIn) {
      html += list('What is stored in your account', [
        'The email address you sign in with.',
        'Your name, and anything else you filled in under Your information: birthday, campus, marital status, and your address if you gave one.',
        'Your journal, including anything you highlighted in a guide and whatever you wrote about it.'
      ]);
    }

    /* Only one confirmation is ever on screen at once. Two irreversible
       buttons side by side, one of them already armed, is how somebody taps
       the one they did not mean. */
    if (confirming) {
      html += block('Are you sure', [
        signedIn
          ? 'Your roster and your prayer requests go with it, and so does the copy of your journal on this phone. There is no undo. Because you are signed in, your journal is also in your account, and this button does not touch that: signing in again on any phone brings it back. Deleting your account is the button that removes it for good.'
          : 'Your journal, your roster, and your prayer requests go with it. There is no undo and no copy anywhere else.'
      ]);
      html += '<div class="hc-data__action hc-data__action--confirm">' +
        c.button('Yes, erase it', { action: 'erase-confirm' }) +
        '<button type="button" class="hc-btn hc-btn--tertiary" data-action="erase-cancel">Keep my things</button>' +
      '</div>';
    } else if (confirmingAccount) {
      html += block('Are you sure', [
        'Your account and everything synced to it are removed from the church’s server, and you are signed out. That includes your journal: every entry, every highlight, and everything you wrote about them. There is no undo. What is saved on this phone stays until you erase that too, so if you want it all gone, use both buttons.'
      ]);
      html += '<div class="hc-data__action hc-data__action--confirm">' +
        c.button('Yes, delete my account', { action: 'account-delete-confirm' }) +
        '<button type="button" class="hc-btn hc-btn--tertiary" data-action="account-delete-cancel">Keep my account</button>' +
      '</div>';
    } else {
      html += block('Erasing this phone', [
        'This removes everything in the first list from this phone at once. It cannot be undone, and because we never had a copy, we cannot put it back for you.'
      ]);
      html += '<div class="hc-data__action">' +
        c.button('Erase everything on this phone', { action: 'erase-ask', variant: 'secondary' }) +
      '</div>';

      if (signedIn) {
        html += block('Deleting your account', [
          'This removes your account and everything in the second list from the church’s server for good. Signing out is not the same thing and neither is erasing this phone, so this is its own button.'
        ]);
        html += '<div class="hc-data__action">' +
          c.button('Delete my account', { action: 'account-delete-ask', variant: 'secondary' }) +
        '</div>';
      }
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
