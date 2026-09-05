/* ==========================================================================
   Home Church, Connect
   Groups in season, serve teams, and next steps. The events that used to sit
   under them are the Cal tab now, in js/screens/cal.js.

   THE RULE THIS SCREEN NOW KEEPS: nothing here tells a person that something
   will happen unless something actually happens. Before this pass, three
   controls on this screen were reassuring lies. Tapping a serve team said
   "someone from that team will find you on Sunday" and told nobody. Tapping a
   group said "we will pass your name to the host" from a card that had no
   field to type a name into. The next step forms collected a name, a contact,
   and a note, and then threw all three away.

   Every one of them now either goes somewhere real or says nothing. The
   destinations are the systems the church already runs, Church Center, Group
   Vitals, Flodesk, and an SMS keyword, because those have somebody watching
   them and a second copy in this app would not.

   AND THEN A FORM CAME BACK, at the top of this screen, which deserves an
   explanation given the four paragraphs above it. The rule was never "no
   forms". It was that nothing may claim to have happened unless it happened.
   The next steps form broke it by calling form.reset() on what it collected;
   this one keeps it by sending an email to hello@homechurchnola.com, which is
   a mailbox with people in it, and by refusing to say "thank you" until that
   email has actually been accepted for delivery. When it fails it says so and
   puts the church's address on screen instead.

   The other half of the rule is that the destination is a system the church
   already runs. That is why this sends mail to an inbox somebody reads every
   day rather than filling a table that would need a screen, a notification,
   and somebody remembering it exists. See supabase/functions/contact, and
   js/contact.js, which is the only file here that talks to it.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  // Filter state lives here so the list can repaint without a full navigation.
  var filters = { day: 'all', neighborhood: 'all' };

  /* What somebody has typed into the contact form, held for as long as this
     screen is on and not one moment longer. Kept here rather than read off the
     inputs because tapping a day filter repaints this screen, and a person who
     loses a half written message to a filter chip does not write it again.

     Never persisted. js/contact.js says why at length: an unsent message to
     the church left on a phone is not a convenience. */
  var contact = { name: '', email: '', message: '', website: '' };
  var contactBusy = false;
  var contactSent = false;
  var contactError = null;

  function uniq(list, prop) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      if (!seen[item[prop]]) {
        seen[item[prop]] = true;
        out.push(item[prop]);
      }
    });
    return out;
  }

  function pills(name, values, active) {
    var html = '<div class="hc-pills" role="group" aria-label="Filter by ' + c.esc(name) + '">';
    html += '<button type="button" class="hc-pill" data-action="filter" data-filter="' + c.esc(name) + '" ' +
      'data-value="all" aria-pressed="' + (active === 'all' ? 'true' : 'false') + '">Any</button>';
    values.forEach(function (v) {
      html += '<button type="button" class="hc-pill" data-action="filter" data-filter="' + c.esc(name) + '" ' +
        'data-value="' + c.esc(v) + '" aria-pressed="' + (active === v ? 'true' : 'false') + '">' +
        c.esc(v) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function matches(group) {
    if (filters.day !== 'all' && group.day !== filters.day) return false;
    if (filters.neighborhood !== 'all' && group.neighborhood !== filters.neighborhood) return false;
    return true;
  }

  /* The church's own words that still live in this file. Each one is the
     default for a slot: an admin rewriting one from inside the app writes a
     row in text_overrides and these stay as the floor a phone with no signal
     draws. See js/edit-mode.js. */
  var NO_MATCH = 'No group matches that yet. Widen the filter, or tell us what you need and we will start one.';
  var STEP_NOTE = 'Opens in your browser.';
  var SMS_NOTE = 'Opens Messages with the number filled in.';
  // The Add to calendar fallback moved to js/components.js with the button, so
  // that its two callers cannot drift to two different default labels.

  /* An information card, not a button. It was a button, and tapping it claimed
     a name would be passed to the host from a card with nowhere to type one.
     Everything a person needs in order to decide is on the card instead, and
     the one thing the app cannot honestly offer, joining, is not pretended at.
     See LAUNCH_TODO.md, this is the last open destination on this screen. */
  function groupCard(group) {
    var status = group.openings ? 'Room for more' : 'Full for now';
    var inner = '' +
      '<p class="hc-eyebrow">' + c.esc(group.day + 's, ' + group.time) + '</p>' +
      '<p class="hc-card__title">' + c.esc(group.name) + '</p>' +
      '<p class="hc-caption hc-card__meta">' +
        c.esc(group.neighborhood) + ' &middot; ' + c.esc(group.host) + ' &middot; ' + c.esc(group.lifeStage) +
      '</p>' +
      /* What the group is like, which is the only part of a group card that
         is a description. The name, the day, the neighborhood, the host and
         the life stage are not: the first is what the group is called, and the
         day and the neighborhood are what the filter chips above the list are
         built from and compared against. Reword one of those and the chip that
         used to select it matches nothing. */
      HC.edit.wrap(
        '<p class="hc-body-serif hc-group__blurb">' + c.esc(group.blurb) + '</p>',
        { table: 'groups', id: group.id, column: 'blurb',
          target: group, field: 'blurb',
          value: group.blurb, label: group.name + ', what the group is like', rows: 4 }
      ) +
      '<p class="hc-caption hc-group__status" data-open="' + (group.openings ? 'true' : 'false') + '">' +
        c.esc(status) + '</p>';
    return c.card(inner);
  }

  /* What the filter says when it has filtered everything away. Editable,
     because "we will start one" is a promise this church makes and a church
     between seasons may not want to make it.

     THE ONE THING TO KNOW ABOUT EDITING THIS ONE: the list is also redrawn on
     its own by repaintGroups() below, straight into innerHTML, without the
     router and without a render pass, which would throw away an open editor.
     js/app.js therefore repaints the whole screen instead of just the list
     while edit mode is on. See the filter handler there. */
  function groupList() {
    var empty = HC.data.copy('connect.groups-empty', NO_MATCH);
    var list = (HC.data.groups || []).filter(matches);
    if (!list.length) {
      return HC.edit.wrap(
        empty ? c.emptyState(empty) : '',
        { slot: 'connect.groups-empty', value: empty,
          label: 'what the group finder says when nothing matches' }
      );
    }
    return list.map(groupCard).join('');
  }

  /* A web address written into the note, drawn as something a thumb can use.

     WHY THIS EXISTS AT ALL. The note used to be one evergreen sentence about
     a season that had not started, and a sentence has no links in it. It is
     now whatever the church last said about home groups, shortened from an
     announcement, and "sign up here" announcements carry the sign-up link.
     Escaping that to plain text would leave somebody looking at a URL they
     cannot tap and would have to retype by hand off a phone screen.

     ESCAPED FIRST, ALWAYS. Every span between the matches goes through esc(),
     and the href and the text of each match go through it too. The only markup
     that reaches the page from here is the anchor this function wrote. Nothing
     else in the note is treated as HTML, because the note is prose and one day
     somebody will write "<3" in it.

     http and https only. Those are the two schemes a URL in a shortened
     announcement is, and the anchor is picked up by the delegated handler in
     js/app.js, which opens it in the phone's browser rather than navigating
     the web view. A trailing full stop belongs to the sentence rather than to
     the address, so it is left outside the link. */
  var NOTE_URL = /https?:\/\/[^\s<>"')]+/g;

  function linkify(text) {
    var out = '';
    var last = 0;
    var m;

    NOTE_URL.lastIndex = 0;
    while ((m = NOTE_URL.exec(text)) !== null) {
      var url = m[0].replace(/[.,;:!?)]+$/, '');
      out += c.esc(text.slice(last, m.index));
      out += '<a href="' + c.esc(url) + '">' + c.esc(url) + '</a>';
      last = m.index + url.length;
    }

    return out + c.esc(text.slice(last));
  }

  /* The one thing the card is asking somebody to do, and the only place it is
     ever drawn: across the bottom of the block, centred.

     WHY IT IS NOT IN THE PARAGRAPH, where 0048 left it. A link people join a
     group through is not a sentence — it is the action, and every other card
     in this app puts its action at the foot of the card where a thumb is
     already resting. It also could not survive being one: the group finder
     link this church posts is 355 characters of query string, which does not
     fit in a 300 character note and cost two runs of the button before it was
     given a column of its own. Migration 0054, and the header of
     supabase/functions/group-status/index.ts.

     http and https only, which is the same rule linkify() below follows and
     is enforced in two places on purpose. The button hands its URL to
     openExternal() through the delegated handler in js/app.js, and a scheme
     that is not a web address has no business being handed to a browser.
     Migration 0054 refuses one on the way in; this refuses to draw one that
     got in some other way. */
  var WEB_URL = /^https?:\/\//i;

  function joinButton() {
    var url = HC.data.church.groupsNoteLinkUrl;
    if (!url || !WEB_URL.test(url)) return '';

    var label = HC.data.church.groupsNoteLinkLabel || 'Join a group';

    return '<div class="hc-group__cta">' +
      c.button(label, { action: 'open-url', url: url }) +
    '</div>';
  }

  /* Groups run in seasons, and between them there is nothing to join. A filter
     strip standing over an empty list reads as a broken screen rather than as
     a season, so the whole finder drops and this takes its place. One boolean
     in church_profile, flipped twice a year.

     "Between seasons" is now the emptier half of what this box does. Since
     migration 0048 an admin can put the current word about home groups here in
     one tap — Settings -> Admin -> Announcements, Update from the latest
     announcement — so out of season it says what it always said, and in the
     week groups open it says how to get into one. Both are the same paragraph
     and the same card; only the words move.

     The flyer, when there is one, is above the words rather than below them,
     because a season's art is what somebody recognises from the stage and the
     paragraph is the detail underneath it. It is drawn at whatever shape it
     is: cropping a flyer is how the date printed along the bottom of it goes
     missing. See .hc-group__flyer in css/screens.css. */
  function offSeason() {
    var note = HC.data.church.groupsOffSeasonNote;
    var flyer = HC.data.church.groupsNoteImageUrl;
    var join = joinButton();
    if (!note && !flyer && !join) return '';

    var inner = '';

    if (flyer) {
      inner += '<img class="hc-group__flyer" src="' + c.esc(flyer) + '" alt="" ' +
        'loading="lazy" decoding="async">';
    }

    /* Still editable exactly where it is read, and that has not changed: the
       column is the one 0030 opened and 0031 kept, and Edit mode still turns
       this paragraph into a text box on a long press. What it edits is the
       plain note, which is why `value` is the raw string and only the drawn
       copy is linkified. */
    if (note) {
      inner += HC.edit.wrap(
        '<p class="hc-body-serif hc-group__off-season">' + linkify(note) + '</p>',
        { table: 'church_profile', id: HC.data.church.id || 'church-home',
          column: 'groups_off_season_note',
          target: HC.data.church, field: 'groupsOffSeasonNote',
          value: note, label: 'the home groups note', rows: 4 }
      );
    }

    /* Last, always, whatever else the card is carrying. Under the flyer and
       under the words, because it is the answer to what they say rather than
       part of it. */
    inner += join;

    /* The label over the card, which is the other half of what the button
       writes. "Between seasons" standing over a paragraph explaining how to
       join a group this Sunday is the contradiction migration 0049 exists to
       fix: the words and the label move together, decided in the same breath
       from the same announcement, so they cannot disagree by more than a
       content sync.

       TWO SLOTS AND NOT ONE, which is the whole reason this is read through
       copy() rather than passed as a literal like the other eyebrows on this
       screen. They are two different sentences a church might want to reword
       differently — "Coming back soon" is a fine edit to one of them and a
       lie over the other — and one slot holding whichever was last edited
       would put the wrong one on screen at the turn of a season. The slot on
       screen is the slot Edit mode offers, so a long press edits the state
       somebody is actually looking at. */
    var inSeason = HC.data.church.groupsNoteInSeason;
    var eyebrowSlot = inSeason ? 'connect.in-season-eyebrow' : 'connect.off-season-eyebrow';
    var eyebrow = HC.data.copy(eyebrowSlot, inSeason ? 'Open now' : 'Between seasons');

    return '' +
      c.sectionHeader(eyebrow, 'Home groups', { eyebrowSlot: eyebrowSlot }) +
      c.card(inner, { edge: true });
  }

  /* --------------------------------------------------------- serve teams
     Descriptions, opened by tap. Not one tap interest buttons, which is what
     these were: a single tap fired off a claim that someone would find you on
     Sunday, with no confirmation and no way to tell what the tap would do
     before you made it. Reading about a team should cost nothing.
     ------------------------------------------------------------------- */

  function serveTeam(team) {
    var body = '';

    // Only two teams publish a schedule. The line drops rather than leaving a
    // gap on the five that do not.
    if (team.commitment) {
      body += HC.edit.wrap(
        '<p class="hc-eyebrow hc-eyebrow--legible hc-serve__commitment">' +
          c.esc(team.commitment) + '</p>',
        { table: 'serve_teams', id: team.id, column: 'commitment',
          target: team, field: 'commitment',
          value: team.commitment, label: team.name + ', how often', rows: 2 }
      );
    }

    /* The team's description. This, the commitment line above it and the
       requirement below are all editable where they are read; the team's name
       is not, because that is what the team is called on a Sunday and in the
       bulletin, and it is edited from the Admin form where the whole team is
       in view. Migration 0031 grants an admin those three columns on this
       table and nothing else, so that is also all a phone could write. */
    body += HC.edit.wrap(
      '<p class="hc-body-serif hc-serve__blurb">' + c.esc(team.blurb) + '</p>',
      { table: 'serve_teams', id: team.id, column: 'blurb',
        target: team, field: 'blurb',
        value: team.blurb, label: team.name + ', what the team does', rows: 4 }
    );

    // A background check or a training process. Its own line, after the
    // description, because it is the thing somebody needs before they decide
    // and not a detail to find out later.
    if (team.requirement) {
      body += HC.edit.wrap(
        '<p class="hc-caption hc-serve__requirement">' + c.esc(team.requirement) + '</p>',
        { table: 'serve_teams', id: team.id, column: 'requirement',
          target: team, field: 'requirement',
          value: team.requirement, label: team.name + ', what it asks first', rows: 3 }
      );
    }

    return c.collapsible({
      id: 'team-' + team.id,
      eyebrow: 'Serve team',
      title: team.name,
      body: body,
      // One team is an item under Serve teams, not a part of the page. The
      // right edge indexes the page. See collapsible() in js/components.js.
      index: false
    });
  }

  /* One signup for every team, which is how the church already runs it. The
     button is dropped rather than shown dead if there is no number on file. */
  function serveSignup() {
    var serve = HC.data.church.serve || {};
    if (!serve.blurb && !serve.number) return '';

    var link = c.smsUrl(serve.number, serve.keyword);
    var html = '' +
      c.sectionHeader('Interested?', serve.title || 'Sign up to serve', { eyebrowSlot: 'connect.serve-signup-eyebrow' }) +
      HC.edit.wrap(
        '<p class="hc-body-serif hc-serve__signup-copy">' + c.esc(serve.blurb) + '</p>',
        { table: 'church_profile', id: HC.data.church.id || 'church-home',
          column: 'serve_signup_blurb',
          target: serve, field: 'blurb',
          value: serve.blurb, label: 'the invitation to serve', rows: 4 }
      );

    if (link) {
      var label = serve.keyword
        ? 'Text ' + serve.keyword + ' to ' + serve.number
        : 'Text us at ' + serve.number;
      html += '<div class="hc-serve__signup-action">' +
        c.button(label, { action: 'open-url', url: link, icon: 'connect' }) +
        HC.edit.wrap(
          '<p class="hc-caption hc-serve__signup-note">' +
            c.esc(HC.data.copy('connect.serve-sms-note', SMS_NOTE)) + '</p>',
          { slot: 'connect.serve-sms-note',
            value: HC.data.copy('connect.serve-sms-note', SMS_NOTE),
            label: 'the note under the serve signup button' }
        ) +
      '</div>';
    }

    return html;
  }

  /* --------------------------------------------------------- the contact form
     The first thing on this screen, above everything else, because "how do I
     talk to somebody" is the question a stranger opens Connect with and the
     one the app was quietest about. Every other route out of here goes to a
     system that assumes you already know which one you want.

     WHY THE HEADING IS NOT EDITABLE and the words around it are. Same rule
     the whole app keeps: a heading is how somebody finds their place on a
     page, and the eyebrow, the invitation, the note under the button and what
     it says once it has sent are all the church's own voice and all of them
     go stale. Those are slots, rewritable from a phone in edit mode.

     THE BUTTON IS NEVER DISABLED. It could be, and then typing would have to
     repaint the screen to enable it, which costs the keyboard and the cursor
     position on a phone. Instead the tap is where the checking happens, the
     same way Leader mode adds a member, and what is missing is said in a
     sentence with the cursor put back in the field that needs it.
     ------------------------------------------------------------------- */

  /* The address the church has published everywhere else. Hardcoded, and it
     agrees with js/screens/legal.js and js/screens/profile.js, which have both
     always spelled it out. There is no email column on church_profile to read
     it from; if one is ever added, all three should read it. */
  var CHURCH_EMAIL = 'hello@homechurchnola.com';

  var CONTACT_BLURB = 'Questions, prayer, a hard week, or you are new and not ' +
    'sure where to start. Write to us here and a real person answers.';
  var CONTACT_NOTE = 'Goes to the church office. Nobody else sees it.';
  var CONTACT_THANKS = 'That is with us. Somebody will write back, usually within a day or two.';

  function contactField(opts) {
    var id = 'hc-contact-' + opts.name;
    var input = opts.rows
      ? '<textarea class="hc-input hc-textarea" id="' + id + '" rows="' + opts.rows + '" ' +
          'name="' + c.esc(opts.name) + '" data-contact-field="' + c.esc(opts.name) + '" ' +
          'maxlength="' + opts.max + '" ' +
          'placeholder="' + c.esc(opts.placeholder || '') + '">' + c.esc(opts.value) + '</textarea>'
      : '<input class="hc-input" id="' + id + '" type="' + c.esc(opts.type || 'text') + '" ' +
          'name="' + c.esc(opts.name) + '" data-contact-field="' + c.esc(opts.name) + '" ' +
          'maxlength="' + opts.max + '" ' +
          (opts.autocomplete ? 'autocomplete="' + c.esc(opts.autocomplete) + '" ' : '') +
          (opts.inputmode ? 'inputmode="' + c.esc(opts.inputmode) + '" ' : '') +
          'placeholder="' + c.esc(opts.placeholder || '') + '" ' +
          'value="' + c.esc(opts.value) + '">';

    return '<label class="hc-field" for="' + id + '">' +
      '<span class="hc-field__label">' + c.esc(opts.label) + '</span>' +
      input +
    '</label>';
  }

  /* What it says once it has gone. A card rather than a toast: a toast is
     gone in two seconds and this is the answer to "did that work", which
     somebody may well look back at. The way to write a second message is a
     button, so nobody has to guess whether tapping something will lose the
     first one. */
  function contactSentCard() {
    var thanks = HC.data.copy('connect.contact-thanks', CONTACT_THANKS);
    return c.card(
      '<p class="hc-eyebrow">Sent</p>' +
      HC.edit.wrap(
        '<p class="hc-body-serif hc-contact__thanks">' + c.esc(thanks) + '</p>',
        { slot: 'connect.contact-thanks', value: thanks,
          label: 'what the contact form says once a message has gone' }
      ) +
      '<div class="hc-contact__again">' +
        c.button('Write another', { action: 'contact-reset', variant: 'secondary' }) +
      '</div>',
      { edge: true }
    );
  }

  /* No Supabase project means nothing behind the form, and this screen does
     not draw controls with nothing behind them. The church's address is not a
     degraded version of a contact form, it is the thing the form is a
     convenience over, so saying it plainly is the honest fallback. */
  function contactFallback() {
    return c.card(
      '<p class="hc-body-serif hc-contact__blurb">' +
        'Write to us at ' + c.esc(CHURCH_EMAIL) + ' and a real person answers.' +
      '</p>' +
      '<div class="hc-contact__actions">' +
        c.button('Email the church', {
          action: 'open-url', url: 'mailto:' + CHURCH_EMAIL, icon: 'connect'
        }) +
      '</div>',
      { edge: true }
    );
  }

  function contactForm() {
    var html = c.sectionHeader('Talk to us', 'Get in touch', {
      eyebrowSlot: 'connect.contact-eyebrow'
    });

    if (!HC.contact || !HC.contact.isAvailable()) return html + contactFallback();
    if (contactSent) return html + contactSentCard();

    var blurb = HC.data.copy('connect.contact-blurb', CONTACT_BLURB);
    var note = HC.data.copy('connect.contact-note', CONTACT_NOTE);
    var limits = HC.contact.limits;

    html += HC.edit.wrap(
      '<p class="hc-body-serif hc-contact__blurb">' + c.esc(blurb) + '</p>',
      { slot: 'connect.contact-blurb', value: blurb,
        label: 'the invitation above the contact form', rows: 4 }
    );

    html += '<form class="hc-form hc-contact__form" data-contact-form novalidate>';

    html += contactField({
      name: 'name', label: 'Your name', value: contact.name,
      max: limits.name, autocomplete: 'name', placeholder: 'First and last'
    });

    html += contactField({
      name: 'email', label: 'Your email', value: contact.email,
      max: limits.email, type: 'email', autocomplete: 'email',
      inputmode: 'email', placeholder: 'So we can write back'
    });

    html += contactField({
      name: 'message', label: 'Your message', value: contact.message,
      max: limits.message, rows: 5, placeholder: 'Say as much or as little as you like.'
    });

    /* The honeypot. Hidden from people and from screen readers, which is both
       halves of the job: aria-hidden and tabindex keep it off the path
       somebody navigating by keyboard or by VoiceOver actually walks, and a
       bot filling in every field it can find fills this one too.

       NOT type="hidden", which is the version that does not work. Bots skip
       hidden inputs and fill visible ones; this has to look like a real field
       to something reading the markup and be unreachable to a person. */
    html += '<div class="hc-contact__hp" aria-hidden="true">' +
      '<label for="hc-contact-website">Website</label>' +
      '<input id="hc-contact-website" type="text" name="website" ' +
        'data-contact-field="website" tabindex="-1" autocomplete="off">' +
    '</div>';

    /* The last failure, said where the person is looking rather than in a
       toast that has already gone. role="alert" so it is read out the moment
       it appears, since the person who most needs to know the send failed is
       the one who cannot see the screen. */
    if (contactError) {
      html += '<p class="hc-contact__error" role="alert">' + c.esc(contactError) + '</p>';
    }

    html += c.button(contactBusy ? 'Sending…' : 'Send', {
      action: 'contact-send', busy: contactBusy, icon: 'connect'
    });

    html += '</form>';

    html += HC.edit.wrap(
      '<p class="hc-caption hc-contact__note">' + c.esc(note) + '</p>',
      { slot: 'connect.contact-note', value: note,
        label: 'the note under the contact form' }
    );

    /* The way through when the form is the thing that is broken. Drawn only
       after a failure, because offering two ways to do one thing before
       either has been tried is how a screen starts to look like a settings
       page. */
    if (contactError) {
      html += '<div class="hc-contact__actions">' +
        c.button('Email the church instead', {
          action: 'open-url', url: 'mailto:' + CHURCH_EMAIL, variant: 'secondary'
        }) +
      '</div>';
    }

    return html;
  }

  /* ------------------------------------------------------ the Instagram rail
     A strip of the church's latest posts, across the top of this screen.

     WHY IT CAN BE INVISIBLE AND THAT IS FINE. Instagram serves no API to a
     Personal account, and the church's account is still one, so there is
     nothing feeding this yet. Rather than a feature flag somebody has to
     remember to flip, the rail obeys the rule this screen already keeps
     everywhere else: a section whose list is empty does not render at all.
     Zero rows means zero markup, not an empty strip. The day the sync writes
     its first rows the rail appears on every phone, with no App Store build,
     because the rows arrive through the same content pipeline as events.

     WHAT IT DELIBERATELY IS NOT. Not a copy of Instagram. No like counts, no
     comments, no inline video. It is a window with nine photographs in it and
     a door to the real thing, because every one of those extra things is
     something the app would then have to keep true.
     ------------------------------------------------------------------- */

  function instagramProfileUrl() {
    var social = (HC.data.church.social || []).filter(function (s) {
      return s.label === 'Instagram';
    })[0];
    return social ? social.url : '';
  }

  /* What VoiceOver reads for a tile.

     A rail of nine buttons all announcing "Instagram post" is a rail nobody
     can navigate, so the caption does the work when there is one. Instagram
     captions run to paragraphs and end in a drift of hashtags, so this takes
     the first line and caps it. "Opens Instagram" is on the end because the
     tile leaves the app, and a link that leaves should say so before it is
     followed rather than after. */
  function tileLabel(post) {
    var first = String(post.caption || '').split('\n')[0].trim();
    if (first.length > 120) {
      first = first.slice(0, 119).replace(/\s+\S*$/, '') + '…';
    }
    var fallback = post.mediaType === 'VIDEO' ? 'Instagram video' : 'Instagram post';
    var when = post.postedAt ? c.formatDate(String(post.postedAt).slice(0, 10)) : '';

    // Joining these with '. ' would double the stop on every caption that
    // already ends in one, and VoiceOver reads "Sunday dot dot". Each part
    // gets punctuated only if it needs it, then they join on a space.
    function sentence(s) {
      return /[.!?…]$/.test(s) ? s : s + '.';
    }

    return [first || fallback, when, 'Opens Instagram']
      .filter(Boolean).map(sentence).join(' ');
  }

  /* alt="" on the image is correct, not an oversight. The button already
     carries the description, and a nested image with its own alt text makes a
     screen reader announce the same post twice.

     data-media-fallback marks the tile for the image error listener in
     app.js. An image that never arrives leaves the cream block underneath it
     showing, which is the same treatment missing art gets everywhere else in
     the app, rather than a broken image glyph in a row of photographs. */
  function instagramTile(post) {
    return '' +
      '<li class="hc-rail__item">' +
        '<button type="button" class="hc-post" data-action="open-url" ' +
          'data-media-fallback data-url="' + c.esc(post.permalink) + '" ' +
          'aria-label="' + c.esc(tileLabel(post)) + '">' +
          '<img class="hc-post__img" src="' + c.esc(post.imageUrl) + '" alt="" ' +
            'loading="lazy" decoding="async">' +
          (post.mediaType === 'VIDEO' ? c.playBadge() : '') +
        '</button>' +
      '</li>';
  }

  function instagramRail() {
    var posts = (HC.data.instagramPosts || []).filter(function (p) {
      return p.imageUrl && p.permalink;
    });
    if (!posts.length) return '';

    // role="list" restores the semantics Safari drops the moment a list has
    // list-style: none, which is every styled list in this app.
    var html = c.sectionHeader('Lately', 'On Instagram', { eyebrowSlot: 'connect.instagram-eyebrow' }) +
      '<div class="hc-rail">' +
        '<ul class="hc-rail__track" role="list">';

    posts.forEach(function (p) { html += instagramTile(p); });

    // The way out of the rail and into the actual feed. Reads the URL from
    // church.social rather than hardcoding it, so the handle lives in exactly
    // one place, which is the row Profile already links from.
    var profile = instagramProfileUrl();
    if (profile) {
      html += '<li class="hc-rail__item">' +
        '<button type="button" class="hc-post hc-post--more" data-action="open-url" ' +
          'data-url="' + c.esc(profile) + '" ' +
          'aria-label="See more on Instagram. Opens Instagram">' +
          c.icon('arrowOut', 'hc-post__more-icon') +
          '<span class="hc-post__more-label">See more</span>' +
        '</button>' +
      '</li>';
    }

    return html + '</ul></div>';
  }

  /* EVENTS ARE NOT ON THIS SCREEN ANY MORE. They were the fourth section, and
     they are now the Cal tab, the fourth tile in the bar: a month you can
     walk through, with
     the same upcoming list under it. Nothing about an event changed in the
     move, including the Add to calendar button and the editable description,
     and eventStart() went with them. See js/screens/cal.js.

     What stays here is the reason it moved. Connect answers "where do I fit",
     which is groups, serve teams and next steps. "What is on, and when" is a
     different question and it now has a screen shaped like the answer. */

  /* ---------------------------------------------------------- next steps
     Was a form that collected a name, a contact, and a note and then called
     form.reset() on them. Now a description and, when there is somewhere real
     to land, a button that says where it goes before it goes there. A step
     with no url renders as a description, which is honest, rather than as a
     button that does nothing.
     ------------------------------------------------------------------- */

  function nextStep(step) {
    /* The one on this screen that goes stale fastest, and the reason edit
       mode exists. Migration 0006 shipped "The next one is August 23" in the
       baptism step, which is a date sitting inside a paragraph that nobody
       thinks of as a date until it is wrong. */
    var body = HC.edit.wrap(
      '<p class="hc-body-serif hc-step__blurb">' + c.esc(step.blurb) + '</p>',
      { table: 'next_steps', id: step.id, column: 'blurb',
        target: step, field: 'blurb',
        value: step.blurb, label: step.title + ', the description', rows: 4 }
    );

    if (step.url) {
      /* The button's words are the church's, in a column of its own, so they
         are edited as a row rather than as a slot. Where it goes is not
         editable: a relabelled button still opens the same link. */
      var note = HC.data.copy('connect.step-note', STEP_NOTE);
      body += '<div class="hc-step__action">' +
        HC.edit.mark(
          c.button(step.ctaLabel || 'Open', {
            action: 'open-url',
            url: step.url,
            icon: 'arrowOut'
          }),
          { table: 'next_steps', id: step.id, column: 'cta_label',
            target: step, field: 'ctaLabel',
            value: step.ctaLabel || 'Open',
            label: step.title + ', the words on the button', rows: 2 }
        ) +
        HC.edit.wrap(
          note ? '<p class="hc-caption hc-step__note">' + c.esc(note) + '</p>' : '',
          { slot: 'connect.step-note', value: note,
            label: 'the note under a next step button' }
        ) +
      '</div>';
    }

    return c.collapsible({
      id: 'step-' + step.id,
      eyebrow: 'Next step',
      title: step.title,
      body: body,
      index: false
    });
  }

  function render() {
    var church = HC.data.church;
    var groups = HC.data.groups || [];
    var html = '<div class="hc-screen hc-connect">';

    html += c.sectionHeader('Find your people', 'Connect', { flush: true, tag: 'h1', eyebrowSlot: 'connect.eyebrow' });

    /* First, above the rail and above the group finder. Everything else on
       this screen answers "where do I fit", which is a question you can only
       ask once you know the place; this one answers "who do I talk to", which
       is the question underneath it.

       Under the h1 rather than over it, for the same reason the Instagram
       rail is: a screen whose first element is a form has no title, and a
       screen reader arriving in a text box with no heading above it has
       nothing to say about where it landed. */
    html += contactForm();

    // Under the h1, never above it. A screen whose first element is a strip of
    // unlabeled photographs reads as an ad banner to a person and as an
    // unheaded region to a screen reader. Renders nothing at all until the
    // Instagram sync exists, so today this line is a no-op.
    html += instagramRail();

    if (!church.groupsInSeason) {
      html += offSeason();
    } else if (groups.length) {
      html += c.sectionHeader('Open seats', 'Find a group', { eyebrowSlot: 'connect.groups-eyebrow' });
      html += '<div class="hc-filters">';
      html += '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">Day</p>';
      html += pills('day', uniq(groups, 'day'), filters.day);
      html += '<p class="hc-eyebrow hc-eyebrow--legible hc-filters__label">Neighborhood</p>';
      html += pills('neighborhood', uniq(groups, 'neighborhood'), filters.neighborhood);
      html += '</div>';
      html += '<div class="hc-group-list" data-group-list>' + groupList() + '</div>';
    } else {
      // In season and yet no groups is the same experience for a person as
      // being between seasons, so say the same thing rather than nothing.
      html += offSeason();
    }

    // Every list below is an editable table, so each one can legitimately come
    // back empty. A section header standing over nothing reads as a bug, so
    // the whole section drops instead.
    var serveTeams = HC.data.serveTeams || [];
    if (serveTeams.length) {
      html += c.sectionHeader('Lend a hand', 'Serve teams',
        { eyebrowSlot: 'connect.serve-eyebrow', right: true });
      serveTeams.forEach(function (t) { html += serveTeam(t); });
      html += serveSignup();
    }

    var nextSteps = HC.data.nextSteps || [];
    if (nextSteps.length) {
      html += c.sectionHeader('Start somewhere', 'Next steps',
        { eyebrowSlot: 'connect.steps-eyebrow', right: true });
      nextSteps.forEach(function (s) { html += nextStep(s); });
    }

    html += '</div>';
    return c.el(html);
  }

  function setFilter(name, value) {
    filters[name] = value;
  }

  function repaintGroups(scope) {
    var target = scope.querySelector('[data-group-list]');
    if (target) target.innerHTML = groupList();
  }

  /* --------------------------------------------------- the form's own state
     Reached from the action handlers in js/app.js, which own every tap in the
     app and do not reach into a screen's variables directly. */

  function getContact() {
    return contact;
  }

  function setContactField(name, value) {
    if (!(name in contact)) return;
    contact[name] = value;
    /* Typing clears the last failure without a repaint. The message said the
       send did not work; the moment somebody starts changing what they are
       sending, it is answering a question nobody is asking any more. Cleared
       in state only, so the paragraph stays on screen until the next redraw
       and the keyboard does not jump. */
    contactError = null;
  }

  function setContactBusy(on) {
    contactBusy = !!on;
  }

  function setContactError(message) {
    contactError = message || null;
  }

  /* Sent. The draft goes with it, because the next message is a new message
     and finding the last one still in the boxes is how somebody sends the
     same thing twice. */
  function contactDone() {
    contact = { name: '', email: '', message: '', website: '' };
    contactBusy = false;
    contactError = null;
    contactSent = true;
  }

  function contactAgain() {
    contactSent = false;
    contactError = null;
  }

  HC.screens = HC.screens || {};
  HC.screens.connect = render;
  HC.screens.connectHelpers = {
    /* Exported for tests/group-note.test.js rather than for js/app.js, which
       is the only thing every other name here is for.

       WORTH THE EXCEPTION because of what this function is: the one place on
       this screen where a string from the database reaches the page as
       something other than escaped text. Everything else in this app goes
       through c.esc() and stops there. A regression that let a note write its
       own markup would not look like a broken layout, it would look like
       nothing at all, and the note is now written by a model reading email.
       So the escaping is asserted rather than reviewed. */
    linkify: linkify,

    /* Exported for the same test and for the same kind of reason: this is the
       one control on a public screen that takes somebody off it, and what it
       refuses to draw — anything that is not an http or https address — is a
       claim worth asserting rather than reading. */
    joinButton: joinButton,

    setFilter: setFilter,
    repaintGroups: repaintGroups,
    getContact: getContact,
    setContactField: setContactField,
    setContactBusy: setContactBusy,
    setContactError: setContactError,
    contactDone: contactDone,
    contactAgain: contactAgain
  };

})(window.HC = window.HC || {});
