/* ==========================================================================
   Home Church, Alpha
   One page. What Alpha is, what a night looks like, the questions it works
   through, one video, and a way in at the bottom.

   WHY ONE PAGE AND NOT ELEVEN. Alpha publishes a great deal, a film for every
   session, a leader's handbook, a training course, a weekend away. None of
   that belongs here. The person this screen is for has not signed up yet and
   is deciding whether to, probably on a Tuesday night on a phone, and what
   they need is the shape of the thing and one honest look at it. Everything
   past that is what the eleven weeks are for.

   So the rule for this file is the same one js/screens/practices.js keeps for
   a practice page: one shape, in one order, and anything that would be a
   twelfth section is a reason to cut rather than a reason to scroll.

   WHOSE WORK THIS IS. Alpha's, and the credit block says so under the header
   the way the Practicing the Way one does, in the same place, for the same
   reason. The video that plays on this screen is Alpha's, from their YouTube
   channel, and the church wrote none of the course.

   THE SENTENCES ARE OURS. The framing copy on this page is Home Church's own
   voice about somebody else's course, which is exactly the kind of writing
   that goes slightly stale, so every one of those sentences is a slot an
   admin can rewrite in place. The eleven questions are not: they are Alpha's
   session titles and rewriting one would put a question on the screen that
   the course never asks. Same line js/screens/practices.js draws.

   VIDEO. It plays here, in the app, on the same poster and the same play
   badge every other video in the app uses. There is no link out to YouTube
   on this screen. The id was checked against YouTube's oEmbed before it was
   written down, which is how a video whose owner has disabled embedding gets
   caught before it ships as a poster that does nothing.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* Alpha's own home, and the one link out this screen makes. Same exception
     the Practices credit makes and for the same reason: the no-external-links
     rule exists so video plays in the app instead of throwing somebody to
     YouTube, and it must never be the reason a person cannot reach the people
     who actually made this. */
  var ALPHA = 'https://alphausa.org';

  /* Where the church takes a signup. A Church Center registration, so it opens
     in the system browser the way giving and baptism already do.

     THE FALLBACK IS A DEAD LINK EVERY SEASON. This is a registration for one
     specific run of Alpha and its number changes when the next one opens, so
     the real answer lives in church_profile.alpha_signup_url and this is only
     what a phone draws before it has ever reached Supabase. Which is fine on
     the day it ships and wrong a year later, and the switch beside it is what
     covers that: alpha_in_season false takes the button off the screen
     entirely rather than leaving somebody a form that closed in March. See
     migration 0035. */
  var SIGNUP_URL = 'https://homechurchnola.churchcenter.com/registrations/events/3798127';

  /* ------------------------------------------------- the church's own words */

  var LEDE = 'Alpha is a few weeks of dinner, a short film, and a conversation ' +
    'where you can say what you actually think. It is for anybody curious about ' +
    'faith, Jesus, or why any of this matters, and it costs nothing.';

  var CREDIT = 'Alpha is not ours. It started at a church in London and has ' +
    'since run in more than a hundred countries, and every film and every ' +
    'session on this page is theirs. We run it here because it is the best ' +
    'front door we know of for somebody with questions.';

  var NIGHT_LEDE = 'Every night is the same three things, in the same order, ' +
    'for about an hour and a half.';

  var QUESTIONS_LEDE = 'One question a week. Nobody is going to ask you to ' +
    'answer them, they are what the room works through together.';

  var DAY_AWAY = 'Partway through there is a day away, which is three of ' +
    'these in one go and the part most people end up talking about ' +
    'afterwards: who the Holy Spirit is, what the Spirit does, and how you ' +
    'can be filled with the Spirit.';

  var INVITE_NOTE = 'A short film from Alpha, on what a night actually ' +
    'looks like.';

  var SIGNUP_LEAD = 'That is it. Come hungry, bring the question you have ' +
    'never asked out loud.';

  var SIGNUP_NOTE = 'Opens Church Center in your browser. Dates, times, and ' +
    'where we are meeting are all on the form.';

  var OFF_SEASON = 'Alpha is between seasons right now. When the next one ' +
    'opens this is where you will find it, and we will make sure you hear ' +
    'about it before it fills up.';

  /* -------------------------------------------------------------- the video

     From Alpha's own YouTube channel, and near the top because it is short and
     answers the question somebody arrived with. A full session film used to
     sit further down the page and does not any more: half an hour of the
     course is more than somebody deciding whether to come needs, and this
     screen is for the deciding. */

  var INVITE = { videoId: 'n_-76aOBMPY', title: 'So, this is Alpha?' };

  /* --------------------------------------------------------- what a night is

     Three, and the order is the argument. The meal is first because it is
     first, and because a church that leads with the talk has told you what it
     actually wants from the evening. */

  var NIGHT = [
    { title: 'A meal',
      body: 'We eat together first. No name tags, no going round the room ' +
        'introducing yourself.' },
    { title: 'A short film',
      body: 'Around half an hour, on one question. You watch it, nobody ' +
        'preaches at you.' },
    { title: 'The conversation',
      body: 'Small groups, same people every week. Say as much or as little ' +
        'as you want, and no question is off limits.' }
  ];

  /* -------------------------------------------------------- the eleven weeks

     Alpha's session titles, in Alpha's order, as questions because that is
     what they are. Not editable, for the reason at the top of this file: these
     are the course, not our description of it.

     Eleven, and then three more that run together on one day partway through
     rather than as three separate weeks. That day is Alpha's own shape and is
     why the count of questions and the count of evenings do not match, so it
     is named under the list rather than folded into it as an eight and a half.

     What is deliberately not here is the calendar. Which night, how many
     weeks, when the day away falls: all of that is on the signup form, and a
     schedule written in two places is a schedule that is wrong in one of
     them. */

  var QUESTIONS = [
    'Is there more to life than this?',
    'Who is Jesus?',
    'Why did Jesus die?',
    'How can I have faith?',
    'Why and how do I pray?',
    'Why and how should I read the Bible?',
    'How does God guide us?',
    'Why and how should I tell others?',
    'How can I resist evil?',
    'Does God heal today?',
    'What about the church?'
  ];

  /* --------------------------------------------------------- what people ask

     The four that come up before anybody signs up, answered plainly. Every
     answer is a slot, because these are the church's promises about how it
     runs the thing and they should be fixable the week one of them stops
     being true. */

  var ASKED = [
    { id: 'cost',
      q: 'What does it cost?',
      a: 'Nothing. Dinner is on us too.' },
    { id: 'talk',
      q: 'Do I have to talk?',
      a: 'No. Plenty of people listen for the first few weeks, and nobody ' +
        'is going to put you on the spot.' },
    { id: 'believe',
      q: 'Do I have to believe any of it?',
      a: 'No. Alpha is built for people who are not sure, and half the room ' +
        'usually is not.' },
    { id: 'miss',
      q: 'What if I miss a week?',
      a: 'Come the next one. Nobody is keeping a register.' }
  ];

  /* ---------------------------------------------------------------- credit */

  function credit() {
    var text = HC.data.copy('alpha.credit', CREDIT);

    /* Escaped first, then the one word this paragraph is about is set in bold,
       which is the same order js/screens/practices.js does it in and for the
       same reason: the words come out of a text box, so they are escaped like
       everything else, and only a literal that survived escaping is marked up.
       An admin who rewrites the sentence without the word in it gets no bold
       rather than a hole. */
    var shown = c.esc(text).replace(/\bAlpha\b/, '<strong>Alpha</strong>');

    return '' +
      '<aside class="hc-alpha-credit" aria-label="Source and credit">' +
        HC.edit.wrap(
          '<p class="hc-alpha-credit__text">' + shown + '</p>',
          { slot: 'alpha.credit', value: text,
            label: 'the credit to Alpha', rows: 6 }
        ) +
        c.button('alphausa.org', {
          action: 'open-url',
          url: ALPHA,
          variant: 'secondary',
          icon: 'arrowOut'
        }) +
      '</aside>';
  }

  /* ----------------------------------------------------------------- video

     The same poster, badge and swap as every other video in the app. See the
     note on video() in js/screens/practices.js: the poster is what gets
     replaced when somebody taps, and the line under it survives. */

  function video(v, note, slot, label) {
    var text = HC.data.copy(slot, note);
    return '' +
      '<div class="hc-video" data-video="' + c.esc(v.videoId) + '">' +
        /* data-media-fallback hands this to the image error listener in
           js/app.js. The thumbnail is the one thing on this screen that needs
           a network, and a phone with none should get the cream block and the
           play badge rather than the web view's broken image glyph. */
        '<button type="button" class="hc-video__poster" data-media-fallback ' +
            'data-action="play-video" ' +
            'data-id="' + c.esc(v.videoId) + '" ' +
            'data-provider="youtube" ' +
            'aria-label="Play ' + c.esc(v.title) + '">' +
          '<img class="hc-video__thumb" src="' + c.esc(c.youtubeThumb(v.videoId)) + '" ' +
            'alt="" loading="lazy" aria-hidden="true">' +
          c.playBadge() +
        '</button>' +
        HC.edit.wrap(
          text ? '<p class="hc-caption hc-video__meta">' + c.esc(text) + '</p>' : '',
          { slot: slot, value: text, label: label, rows: 3 }
        ) +
      '</div>';
  }

  /* ------------------------------------------------------------- a night */

  function night() {
    var lede = HC.data.copy('alpha.night-lede', NIGHT_LEDE);
    var html = c.sectionHeader('Every week', 'How a night goes');

    html += HC.edit.wrap(
      lede ? '<p class="hc-body-serif hc-alpha__p">' + c.esc(lede) + '</p>' : '',
      { slot: 'alpha.night-lede', value: lede,
        label: 'the line above the three parts of a night', rows: 3 }
    );

    html += '<div class="hc-alpha-night">';
    NIGHT.forEach(function (part) {
      html += '' +
        '<div class="hc-alpha-part">' +
          '<p class="hc-alpha-part__title">' + c.esc(part.title) + '</p>' +
          '<p class="hc-alpha-part__body">' + c.esc(part.body) + '</p>' +
        '</div>';
    });
    return html + '</div>';
  }

  /* --------------------------------------------------------- the questions

     The numbered question row, which is the app's most distinctive component
     and the one carried straight out of the printed guides. Eleven weeks of
     Alpha is a numbered list of questions, so it is drawn as one rather than
     as a new kind of list invented for this screen. */

  function questions() {
    var lede = HC.data.copy('alpha.questions-lede', QUESTIONS_LEDE);
    var html = c.sectionHeader('One a week', 'What you will talk about');

    html += HC.edit.wrap(
      lede ? '<p class="hc-body-serif hc-alpha__p">' + c.esc(lede) + '</p>' : '',
      { slot: 'alpha.questions-lede', value: lede,
        label: 'the line above the list of questions', rows: 3 }
    );

    html += '<div class="hc-alpha-questions">';
    QUESTIONS.forEach(function (q, i) {
      html += c.numberedRow(i + 1, '<p class="hc-question">' + c.esc(q) + '</p>');
    });
    html += '</div>';

    /* The day away, under the numbered list and set apart from it with the
       signature left edge, the way a practice's action step is. It is three
       of Alpha's sessions and it is not an evening, so numbering it in the
       run above would have said something about the calendar that is not
       true. */
    var away = HC.data.copy('alpha.day-away', DAY_AWAY);
    html += HC.edit.wrap(
      away
        ? '<div class="hc-alpha-away">' +
            '<span class="hc-eyebrow hc-alpha-away__label">And a day away</span>' +
            '<p class="hc-alpha-away__text">' + c.esc(away) + '</p>' +
          '</div>'
        : '',
      { slot: 'alpha.day-away', value: away,
        label: 'the note about the Alpha day away', rows: 5 }
    );

    return html;
  }

  /* ------------------------------------------------------------ what people ask */

  function asked() {
    var html = c.sectionHeader('Before you ask', 'What people want to know');

    html += '<div class="hc-alpha-asked">';
    ASKED.forEach(function (item) {
      var answer = HC.data.copy('alpha.asked-' + item.id, item.a);
      html += '<div class="hc-alpha-ask">' +
        '<p class="hc-alpha-ask__q">' + c.esc(item.q) + '</p>' +
        HC.edit.wrap(
          answer ? '<p class="hc-alpha-ask__a">' + c.esc(answer) + '</p>' : '',
          { slot: 'alpha.asked-' + item.id, value: answer,
            label: 'the answer to “' + item.q + '”', rows: 4 }
        ) +
      '</div>';
    });
    return html + '</div>';
  }

  /* ------------------------------------------------------------- signing up

     The whole point of the screen, so it is last and it is the only primary
     button on it.

     BETWEEN SEASONS IS A REAL STATE and it gets the same treatment the group
     finder gets on Connect: the button comes off entirely and a warm sentence
     takes its place. A signup button standing over a registration that closed
     in March is worse than no button, and it is the failure this page would
     otherwise walk into on its own, quietly, the first season nobody thought
     about it. One boolean in church_profile, flipped twice a year, exactly
     like groups_in_season beside it. */

  function signup() {
    var church = (HC.data && HC.data.church) || {};

    if (church.alphaInSeason === false) {
      var off = church.alphaOffSeasonNote;
      if (!off) return '';
      return '' +
        c.sectionHeader('Between seasons', 'Alpha') +
        c.card(HC.edit.wrap(
          '<p class="hc-body-serif hc-alpha__off-season">' + c.esc(off) + '</p>',
          { table: 'church_profile', id: church.id || 'church-home',
            column: 'alpha_off_season_note',
            target: church, field: 'alphaOffSeasonNote',
            value: off, label: 'the between seasons note on Alpha', rows: 4 }
        ), { edge: true });
    }

    /* The registration this season, from church_profile, or the one that
       shipped in this file. Never both, and never a button with nothing
       behind it: an empty column takes the whole block off the screen the way
       a missing number takes the texting button off Practices. */
    var url = church.alphaSignupUrl || SIGNUP_URL;
    if (!url) return '';

    var lead = HC.data.copy('alpha.signup-lead', SIGNUP_LEAD);
    var note = HC.data.copy('alpha.signup-note', SIGNUP_NOTE);

    return '' +
      '<div class="hc-alpha-signup">' +
        HC.edit.wrap(
          lead ? '<p class="hc-alpha-signup__lead">' + c.esc(lead) + '</p>' : '',
          { slot: 'alpha.signup-lead', value: lead,
            label: 'the line above the Alpha signup button', rows: 3 }
        ) +
        c.button(HC.data.copy('alpha.signup-button', 'Save your spot'), {
          action: 'open-url',
          url: url,
          icon: 'arrowOut',
          labelSlot: 'alpha.signup-button',
          labelName: 'the Alpha signup button'
        }) +
        HC.edit.wrap(
          note ? '<p class="hc-caption hc-alpha-signup__note">' + c.esc(note) + '</p>' : '',
          { slot: 'alpha.signup-note', value: note,
            label: 'the line under the Alpha signup button', rows: 4 }
        ) +
      '</div>';
  }

  /* ------------------------------------------------------------------ page */

  function render() {
    var html = '<div class="hc-screen hc-alpha">';

    /* 1. Who this is, and whose work it is. The credit goes above anything
          somebody might stop reading before, same as on a practice page. */
    html += c.sectionHeader('Come and see', 'Alpha', { flush: true, tag: 'h1' });

    html += credit();

    var lede = HC.data.copy('alpha.lede', LEDE);
    html += HC.edit.wrap(
      lede ? '<p class="hc-body-serif hc-alpha__lede">' + c.esc(lede) + '</p>' : '',
      { slot: 'alpha.lede', value: lede,
        label: 'the opening line on Alpha', rows: 5 }
    );

    /* 2. Ninety seconds of it, before any of the reading. */
    html += video(INVITE, INVITE_NOTE, 'alpha.invite-note',
      'the line under the short Alpha video');

    /* 3. The shape of an evening. */
    html += night();

    /* 4. The eleven questions. */
    html += questions();

    /* 5. The four questions people ask before they sign up. */
    html += asked();

    /* 6. The way in. Last, and the only primary button on the page. */
    html += signup();

    /* 7. Where it came from. Last on the page for the same reason it is last
          on a practice page: these are somebody else's words and video, and
          the app should say so without being asked. */
    html += '<p class="hc-caption hc-alpha__source">' +
      'The course, the session films, and the questions on this page are the ' +
      'work of Alpha, at ' + c.esc(ALPHA.replace(/^https?:\/\//, '')) + '. ' +
      'The video is theirs too, played here from their YouTube channel.</p>';

    return c.el(html + '</div>');
  }

  HC.screens = HC.screens || {};
  HC.screens.alpha = render;

})(window.HC = window.HC || {});
