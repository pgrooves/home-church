/* ==========================================================================
   Home Church, Admin
   One screen with four sections behind it, reached from Your account and
   drawn only for somebody whose profiles.role is 'admin'.

   THE PROMISE THIS SCREEN KEEPS: nothing in here should ever need the
   Supabase dashboard. Writing an announcement, sending the notification that
   goes with it, promoting somebody, editing a page of the church's own words,
   flipping a switch. All of it from a phone, on a Saturday night, with no SQL
   and no build.

   NAVIGATION. `admin` is a pushed view like Your account rather than a stop,
   because it is somewhere you go and come back from and not one of the places
   the app lives. The four sections are the same route with an id on it, which
   costs nothing and means the back gesture walks out of a section into the
   menu and then out of the menu, which is what a thumb expects.

   FORMS. Every screen in this app renders to a string in one pass and hands
   back an element, so there is no moment after mounting in which to attach a
   listener. The form below therefore keeps its in-progress state in a module
   level object rather than in the DOM, exactly the way the sign-in form in
   js/screens/profile.js keeps authIdentifier. That is also what makes a
   repaint mid-typing survivable: a content refresh landing while somebody is
   half way through an announcement redraws the screen from `draft`, and the
   words are still there.

   THE ORDER OF THE FOUR is the order they get used, not alphabetical.
   Announcements is the thing somebody opens this screen to do.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  /* ------------------------------------------------------------ the state

     Everything in flight, kept here rather than in the DOM. Cleared by
     resetDrafts(), which the router calls on the way into the menu, so
     backing out of a half written announcement and opening a different one
     does not inherit the first one's fields. */

  var draft = null;        // the announcement being written or edited
  var pageDraft = null;    // the content page being edited
  var busy = '';           // the id of whatever is mid network call
  var uploading = false;

  function resetDrafts() {
    draft = null;
    pageDraft = null;
    busy = '';
    uploading = false;
  }

  /* -------------------------------------------------------------- helpers */

  function field(opts) {
    var value = opts.value == null ? '' : String(opts.value);
    return '' +
      '<label class="hc-field">' +
        '<span class="hc-field__label">' + c.esc(opts.label) + '</span>' +
        '<input class="hc-input" type="' + c.esc(opts.type || 'text') + '" ' +
          'data-admin-field="' + c.esc(opts.name) + '" ' +
          (opts.id ? 'data-id="' + c.esc(opts.id) + '" ' : '') +
          (opts.inputmode ? 'inputmode="' + c.esc(opts.inputmode) + '" ' : '') +
          'autocomplete="off" ' +
          (opts.placeholder ? 'placeholder="' + c.esc(opts.placeholder) + '" ' : '') +
          'value="' + c.esc(value) + '">' +
        (opts.help ? '<span class="hc-caption hc-field__help">' + c.esc(opts.help) + '</span>' : '') +
      '</label>';
  }

  function textarea(opts) {
    return '' +
      '<label class="hc-field">' +
        '<span class="hc-field__label">' + c.esc(opts.label) + '</span>' +
        '<textarea class="hc-input hc-textarea" rows="' + (opts.rows || 4) + '" ' +
          'data-admin-field="' + c.esc(opts.name) + '" ' +
          (opts.id ? 'data-id="' + c.esc(opts.id) + '" ' : '') +
          (opts.placeholder ? 'placeholder="' + c.esc(opts.placeholder) + '" ' : '') +
          '>' + c.esc(opts.value || '') + '</textarea>' +
        (opts.help ? '<span class="hc-caption hc-field__help">' + c.esc(opts.help) + '</span>' : '') +
      '</label>';
  }

  /* The same switch markup Your account uses, so a toggle here looks and
     behaves like a toggle there. Copied rather than shared because the one in
     profile.js is a private helper of that file and lifting it into
     components.js is a bigger change than this screen should be making. */
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

  /* A section that has asked for its rows and has not got them yet, or asked
     and failed. Both are real states on a phone in a building with concrete
     walls, and neither should be a blank screen. */
  function pending(key, emptyMessage) {
    var err = HC.admin.failed(key);
    if (err) {
      return c.emptyState(err.message ||
        'Could not reach the church’s servers. Pull back and try again.');
    }
    if (!HC.admin.ready(key)) {
      return '<p class="hc-caption hc-admin__loading">Loading…</p>';
    }
    return c.emptyState(emptyMessage);
  }

  /* 'YYYY-MM-DD' in the phone's own zone. The date columns are plain dates,
     so this never involves a timezone. Same helper Home uses, for the same
     reason: an announcement retires at midnight in Metairie. */
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  /* ==================================================================== menu */

  var SECTIONS = [
    /* "Manage Announcements" rather than "Post an announcement", because
       posting is one of four things behind this row: the section also holds
       the newsletter review queue, the list of everything already posted, and
       Edit, Notify and Delete on each of them. The old name described the
       button at the top and nothing under it. Nothing about the section
       itself changed with the name. */
    { id: 'announcements', icon: 'home',    title: 'Manage Announcements',
      sub: 'Write the card on Home, and tell everybody about it.' },
    { id: 'users',         icon: 'group',   title: 'Manage users',
      sub: 'Who is here, who can edit, and who should not be.' },
    /* HIDDEN, not deleted. The page editor behind this row is one paragraph on
       Give and nothing else: Edit mode does the same job in the place the
       words actually are, and this row was a second door to a form nobody
       walked through. The section itself still builds, and taking `hidden`
       off this line is the whole of putting it back. Edit mode's switch does
       not come back with it — it moved to App settings, see
       editModeSection(). */
    { id: 'content',       icon: 'guide',   title: 'Content', hidden: true,
      sub: 'The church’s own words, edited here instead of in the code.' },
    { id: 'settings',      icon: 'connect', title: 'App settings',
      sub: 'Switches and short messages that change the whole app.' }
  ];

  function isHidden(id) {
    return SECTIONS.some(function (s) { return s.id === id && s.hidden; });
  }

  function menu() {
    var html = '<div class="hc-screen hc-admin">';

    html += c.sectionHeader('For the church', 'Admin', { flush: true, tag: 'h1' });
    html += '<p class="hc-body-serif hc-admin__intro">Everything here is live the moment you save it. ' +
      'There is no publish step and no build to wait for.</p>';

    html += '<div class="hc-module-list">';
    SECTIONS.forEach(function (s) {
      if (s.hidden) return;
      html += '<button type="button" class="hc-module" data-action="go-admin" data-id="' + c.esc(s.id) + '">' +
        '<span class="hc-module__disc" aria-hidden="true">' + c.icon(s.icon, 'hc-module__icon') + '</span>' +
        '<span class="hc-module__body">' +
          '<span class="hc-module__title">' + c.esc(s.title) + '</span>' +
          '<span class="hc-caption">' + c.esc(s.sub) + '</span>' +
        '</span>' +
        c.icon('chevronRight', 'hc-row__chevron') +
      '</button>';
    });
    html += '</div>';

    html += '</div>';
    return html;
  }

  /* ========================================================== announcements */

  function blankDraft() {
    return {
      id: null, eyebrow: '', title: '',
      // Markup, from the same editor the Journal writes in. The plain text
      // the notification reads is derived from this on save and is not a
      // field anybody fills in. See announcementWords() in js/admin.js.
      bodyHtml: '',
      // Every picture, in the order they will be shown. Empty, so a new
      // announcement opens with no picture box at all: most of them have no
      // photograph, and an empty box is a question nobody asked.
      images: [],
      videoUrl: '',
      linkUrl: '', linkTitle: '', linkImageUrl: '',
      // Whether somebody has had an opinion about the thumbnail yet. Until
      // they have, pasting a link fills it in for them; once they have, a
      // second paste never overwrites what they chose. See the x in
      // linkFields() and 'admin-link-thumb-clear' in js/app.js.
      linkImageTouched: false,
      startsOn: '', endsOn: '', priority: 0,
      published: true,
      // Off unless somebody asks for it. The strip is the most insistent
      // thing in the app, and a default that puts one there is a default that
      // puts one there on a week nobody meant to.
      pinned: false,
      // Null on anything written here, always. Only a row parsed out of the
      // newsletter carries a review state, and this form never creates one.
      reviewState: null,
      notify: HC.data.setting('announcement_push_default', true)
    };
  }

  /* An announcement written before the rich text editor existed has words in
     `body` and nothing in `body_html`. Opening it here has to put those words
     in the editor, or saving a date change would take the paragraph off Home.
     So plain text becomes paragraphs on the way in, which is the same
     conversion js/journal.js makes for an entry that started as a highlight,
     and after one save the row has both columns like every other one. */
  function draftBody(row) {
    if (row.body_html) return row.body_html;
    return row.body ? HC.richtext.textToHtml(row.body) : '';
  }

  /* The pictures, from whichever column this row actually has. 0033's list
     wins; 0026's single column is the fallback, so an announcement written
     last month opens with its photograph in the first box rather than with an
     empty one and a picture that reappears on Home after the save. */
  function draftImages(row) {
    var list = Array.isArray(row.image_urls) ? row.image_urls : [];
    var urls = list.filter(function (u) {
      return typeof u === 'string' && u.trim();
    }).map(function (u) { return u.trim(); });
    if (urls.length) return urls;
    return row.image_url ? [String(row.image_url)] : [];
  }

  function editorFor(row) {
    return {
      id: row.id,
      eyebrow: row.eyebrow || '',
      title: row.title || '',
      bodyHtml: draftBody(row),
      images: draftImages(row),
      videoUrl: row.video_url || '',
      linkUrl: row.link_url || '',
      linkTitle: row.link_title || '',
      linkImageUrl: row.link_image_url || '',
      // True from the moment an announcement is opened, never derived. What
      // is on the row is what somebody already decided, including the
      // decision to have no thumbnail at all, and re-deriving one here would
      // put back the picture they took off last week.
      linkImageTouched: true,
      startsOn: row.starts_on || '',
      endsOn: row.ends_on || '',
      priority: row.priority || 0,
      published: row.published !== false,
      // Unlike the notification below, this one is read off the row: it is a
      // state the announcement is in rather than something that happens when
      // you save, so opening an announcement that is pinned has to show it
      // pinned, or saving a typo fix would quietly take the strip down.
      pinned: !!row.pinned,
      // Carried through the form so saving knows whether this is a parsed
      // draft being approved or an ordinary announcement being edited. See
      // saveAnnouncement() in js/admin.js.
      reviewState: row.review_state || null,
      // Never on by default when editing. The notification is for the moment
      // an announcement goes up, and fixing a typo an hour later should not
      // buzz four hundred phones a second time.
      notify: false
    };
  }

  /* Somebody else's announcement that is already pinned and already on Home,
     or null. Asked of the list this screen is holding rather than of the
     network, which is the same list the rows underneath the form are drawn
     from, so it cannot disagree with what is on the screen.

     `id` is the row being edited, and is null while writing a new one, which
     is why the comparison is against it rather than a bare `!row.pinned`: an
     announcement is not its own rival. */
  function otherPinned(id) {
    return HC.admin.announcements().filter(function (row) {
      return row.pinned && row.id !== id && isLiveNow(row);
    })[0] || null;
  }

  /* -------------------------------------------------------- the pictures

     A list rather than a field, which is the whole of change A's second half.
     Each row is a box holding one URL with its own preview above it and its
     own x, and the + at the bottom adds another empty one. The file picker
     appends rather than replaces, so choosing three photographs off the phone
     is three taps of the same button and not a decision about which one wins.

     THE PREVIEW IS THE POINT OF THE X BEING WHERE IT IS. Every thumbnail in
     this form carries its remove in its own top right corner, the picture
     rows and the link's thumbnail alike, so "take this one off" is the same
     gesture wherever somebody meets it.

     IT IS ALWAYS IN THE MARKUP, hidden while it has no picture to show, and
     `key` is how paintDraftThumbs() in js/app.js finds it again. That is what
     lets a pasted picture link appear under the box as it is typed without the
     form being redrawn: a redraw on a keystroke takes the caret with it, and a
     redraw on a field losing focus destroys the button that is in the middle
     of being pressed. Drawn here with the state the draft is already in, so
     opening an announcement that has pictures shows them without waiting for
     anybody to type.

     No src attribute at all while it is empty, because `src=""` is a real
     request, for the page itself. */
  function thumb(key, url, action, id, label) {
    return '' +
      '<div class="hc-admin__thumb" data-media-fallback ' +
          'data-thumb-for="' + c.esc(key) + '"' + (url ? '' : ' hidden') + '>' +
        '<img' + (url ? ' src="' + c.esc(url) + '"' : '') +
          ' alt="" decoding="async" loading="lazy">' +
        '<button type="button" class="hc-admin__thumb-x" data-action="' + c.esc(action) + '" ' +
          (id == null ? '' : 'data-id="' + c.esc(id) + '" ') +
          'aria-label="' + c.esc(label) + '">' + c.icon('close') + '</button>' +
      '</div>';
  }

  function imageFields(d) {
    var html = '<div class="hc-admin__image">';
    html += '<span class="hc-field__label">Pictures</span>';

    if (!d.images.length) {
      html += '<p class="hc-caption hc-admin__loading">No pictures yet. Choose one ' +
        'off this phone, or paste a link to one.</p>';
    }

    d.images.forEach(function (url, i) {
      html += '<div class="hc-admin__image-row">';
      html += thumb('image:' + i, url, 'admin-image-remove', String(i),
        'Remove this picture');
      html += field({
        name: 'imageUrl', id: String(i),
        label: 'Picture ' + (i + 1),
        value: url,
        placeholder: 'https://…'
      });
      /* The row's other way out, for a box with nothing in it yet and so no
         thumbnail to carry an x. One of the two is on screen and never both,
         which paintDraftThumbs() keeps true as the box is typed into. */
      html += '<div class="hc-admin__item-actions" data-thumb-alt="image:' + i + '"' +
          (url ? ' hidden' : '') + '>' +
        c.button('Remove', { action: 'admin-image-remove', id: String(i),
          variant: 'tertiary', small: true }) +
      '</div>';
      html += '</div>';
    });

    /* Two ways to add one, because they solve different problems: the file
       picker is for the photograph that is already on this phone, which is
       most of them, and + is for one that lives somewhere else already. Both
       append to the same list. */
    html += '<div class="hc-admin__image-add">';
    html += '<label class="hc-admin__file">' +
      '<input type="file" accept="image/*" data-admin-image hidden>' +
      '<span class="hc-btn hc-btn--secondary hc-btn--small">' +
        c.icon('plus', 'hc-btn__icon') +
        '<span>' + (uploading ? 'Uploading…' : 'Choose a picture') + '</span>' +
      '</span>' +
    '</label>';
    html += c.button('Add a picture link', { action: 'admin-image-add',
      variant: 'secondary', small: true, icon: 'plus' });
    html += '</div>';

    html += '<p class="hc-caption hc-field__help">They appear in this order, ' +
      'under the words. The first one is the picture on the card on Home.</p>';

    return html + '</div>';
  }

  /* ----------------------------------------------------------- the link

     One link, with a thumbnail that can be taken off. The x sits in the
     thumbnail's own top right corner, which is where change A asked for it and
     is the same corner the picture rows put theirs in.

     The thumbnail is filled in for a YouTube link and for a link that is
     itself a photograph, and left empty for everything else, which is most
     links. suggestLinkImage() in js/admin.js says at length why the app does
     not go and fetch the page to look for an og:image. Where it cannot guess,
     the Picture control above is the answer: paste or upload one and it is the
     card's thumbnail. */
  function linkFields(d) {
    var html = '<div class="hc-admin__link">';
    html += '<span class="hc-field__label">A link</span>';

    html += field({ name: 'linkUrl', label: 'Where it goes', value: d.linkUrl,
      placeholder: 'homechurch.org/serve',
      help: 'A web address, an email address, or a phone number.' });

    /* All three fields are always here, and none of them appears or
       disappears as the one above is typed into. That is not tidiness: making
       these conditional on d.linkUrl would mean the form changing shape on the
       first letter of a link, which either costs a redraw mid-word or leaves
       the fields hidden until something else redraws. Two optional boxes with
       a sentence under each is the cheaper answer. */
    html += field({ name: 'linkTitle', label: 'What to call it', value: d.linkTitle,
      placeholder: 'Sign up for Serve Day',
      help: 'Optional. Empty shows the link’s own address.' });

    html += thumb('link', d.linkImageUrl, 'admin-link-thumb-clear', null,
      'Show this link without a thumbnail');

    html += field({ name: 'linkImageUrl', label: 'Thumbnail', value: d.linkImageUrl,
      placeholder: 'https://…',
      help: 'Filled in for a YouTube link. The x on the picture takes it off ' +
        'and leaves the link.' });

    return html + '</div>';
  }

  function announcementForm() {
    var d = draft;
    var isNew = !d.id;

    var html = '<form class="hc-form hc-admin__form" novalidate>';

    html += field({ name: 'title', label: 'Title', value: d.title,
      placeholder: 'City Serve Day, September 12' });

    /* The words, in the app's own editor rather than in a textarea. Bold,
       italic, underline, both kinds of list, a real hyperlink, and the
       scripture button the Journal has. Same surface an admin has already used
       to write a journal entry, which is the reason it is this one and not a
       second editor written for this form. See js/editor.js.

       links: 'web' is what separates it from the Journal's: an announcement
       may carry an ordinary link and an entry may not. js/richtext.js says
       why. */
    html += '<div class="hc-field">' +
      '<span class="hc-field__label">What it says</span>' +
      HC.editor.field({
        hook: 'admin-body',
        links: 'web',
        status: false,
        className: 'hc-rt--admin',
        html: d.bodyHtml,
        label: 'What the announcement says',
        placeholder: 'One or two warm sentences.'
      }) +
    '</div>';

    html += field({ name: 'eyebrow', label: 'Label', value: d.eyebrow,
      placeholder: 'One thing',
      help: 'Optional. Leave it empty and the card shows the date it went up.' });

    html += imageFields(d);

    html += field({ name: 'videoUrl', label: 'YouTube video', value: d.videoUrl,
      placeholder: 'https://youtube.com/watch?v=…',
      help: 'Optional. The video plays inside the announcement, in the app.' });

    if (d.videoUrl && !c.youtubeId(d.videoUrl)) {
      html += '<p class="hc-caption hc-admin__warn">That is not a YouTube link ' +
        'this app can play. A watch, share or embed link works; a playlist ' +
        'does not.</p>';
    }

    html += linkFields(d);

    html += '<div class="hc-form-row">' +
      field({ name: 'startsOn', label: 'Starts', type: 'date', value: d.startsOn,
        help: 'Empty shows it now.' }) +
      field({ name: 'endsOn', label: 'Comes down', type: 'date', value: d.endsOn,
        help: 'Empty leaves it up.' }) +
    '</div>';

    html += switchRow({
      title: 'Published',
      sub: d.published
        ? 'On Home as soon as you save, inside the dates above.'
        : 'Saved as a draft. Only you can see it.',
      action: 'admin-draft-toggle',
      id: 'published',
      on: d.published
    });

    /* The pinned strip, and it sits directly under Published because that is
       the order the two happen in: an announcement goes up, and then it is
       either quiet on Home or it is across the top of everything.

       It is the most insistent thing this form can do. A card waits on Home
       until somebody scrolls to it; this follows a person into Listen and the
       Journal and stays there until they tap the x. So the sentence under it
       says what it does in those terms, including the way out, because the
       congregation's way out is the only part of it they control. */
    html += switchRow({
      title: 'Pin a banner',
      sub: d.pinned
        ? 'The title above rides across the top of every tab. Tapping it opens ' +
          'this announcement, and the x puts it away.'
        : 'No banner. The announcement is a card on Home like any other.',
      action: 'admin-draft-toggle',
      id: 'pinned',
      on: d.pinned
    });

    if (d.pinned && !d.published) {
      html += '<p class="hc-caption hc-admin__warn">A draft has no banner. ' +
        'Turn Published on, or turn this off.</p>';
    }

    /* One strip, however many rows carry the flag. Said here, once, at the
       moment somebody is about to create the second one, rather than left for
       them to discover by pinning something and watching nothing change. */
    var rival = d.pinned && d.published ? otherPinned(d.id) : null;
    if (rival) {
      html += '<p class="hc-caption hc-admin__warn">“' + c.esc(rival.title) +
        '” is pinned as well. Only one banner shows: the higher priority one, ' +
        'and then the newer.</p>';
    }

    /* The notification switch, and the sentence under it is the whole design.
       A push cannot be unsent, so the one thing this control must never be is
       ambiguous about what happens when the button is pressed. */
    html += switchRow({
      title: 'Tell everybody',
      sub: d.notify
        ? 'Sends a notification to every phone that wants them. This cannot be undone.'
        : 'Nobody is notified. The card still appears on Home.',
      action: 'admin-draft-toggle',
      id: 'notify',
      on: d.notify
    });

    if (d.notify && !d.published) {
      html += '<p class="hc-caption hc-admin__warn">A draft cannot be announced. ' +
        'Turn Published on, or turn this off.</p>';
    }

    html += '<div class="hc-mt-lg">' +
      c.button(isNew ? 'Post it' : 'Save changes', {
        action: 'admin-announcement-save',
        busy: busy === 'save'
      }) +
      c.button('Cancel', { action: 'admin-announcement-cancel', variant: 'tertiary' }) +
    '</div>';

    html += '</form>';
    return html;
  }

  /* Is this row actually on Home right now? The same three questions
     hc_admin_send_announcement asks before it will send anything, in the same
     order, so the button and the database agree about what is announceable.

     Duplicated rather than shared because there is nothing to share across:
     one is plpgsql and one is JavaScript. The database is the one that
     decides, and this exists so a person is not offered a button that comes
     back refused. */
  function isLiveNow(row) {
    if (row.published === false) return false;
    var today = todayLocal();
    if (row.starts_on && today < row.starts_on) return false;
    if (row.ends_on && today >= row.ends_on) return false;
    return true;
  }

  /* One row in the list. The status line is generated rather than typed, so a
     card that is a draft, or scheduled, or expired, says which without
     anybody having to remember to keep a label in step with two date
     columns. */
  function announcementStatus(row) {
    var today = todayLocal();
    // The pin rides on the front of whatever the row's status already is, so
    // an admin scanning the list can see which one is across the top of the
    // app without opening it. A pinned draft says "Draft" and nothing more,
    // which is the truth: there is no banner until it is published.
    var pin = row.pinned && isLiveNow(row) ? 'Pinned · ' : '';
    if (row.published === false) return 'Draft';
    if (row.starts_on && today < row.starts_on) return 'Goes up ' + c.formatDateShort(row.starts_on);
    if (row.ends_on && today >= row.ends_on) return 'Came down ' + c.formatDateShort(row.ends_on);
    if (row.ends_on) return pin + 'On Home until ' + c.formatDateShort(row.ends_on);
    return pin + 'On Home';
  }

  /* ------------------------------------------------ the newsletter intake

     Two things: whether the poll is working, and what it has found that
     nobody has looked at yet. Both are drawn at the top of this section
     because both are what somebody opening it on a Monday morning came to
     see. See migration 0038 and supabase/functions/newsletter-intake.
     ------------------------------------------------------------------- */

  /* "12 minutes ago". Deliberately coarse: the difference between 12 and 13
     minutes is not information, and the only thing this line has to answer is
     whether the job is running at all. */
  function agoText(iso) {
    var then = Date.parse(iso);
    if (!then) return '';
    var mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return 'a minute ago';
    if (mins < 60) return mins + ' minutes ago';
    var hours = Math.round(mins / 60);
    if (hours === 1) return 'an hour ago';
    if (hours < 24) return hours + ' hours ago';
    var days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }

  /* One line, always in the same place, so where to look never changes. It is
     a warning when the last poll failed and a caption when it did not, which
     is the difference between "you need to do something" and "this is fine".

     THE `note` ON A SUCCESSFUL RUN IS DRAWN TOO, and that is not redundant.
     The intake defers an email rather than failing it when Gemini is busy, so
     a run can be perfectly ok and still have found nothing to show for itself
     for two days running. Without this branch that case is indistinguishable
     from a week in which no newsletter was sent, which is exactly the silent
     failure this notice exists to prevent. */
  function newsletterNotice() {
    // Nothing at all until the answer is in hand. A line that says "loading"
    // and then says "fine" is two redraws to tell somebody nothing.
    if (!HC.admin.ready('newsletter')) return '';

    var err = HC.admin.failed('newsletter');
    if (err) {
      return '<p class="hc-caption hc-admin__warn">Could not check on the newsletter ' +
        'reader just now. The drafts below are still whatever it last found.</p>';
    }

    var run = HC.admin.lastRun();
    if (!run) {
      return '<p class="hc-caption hc-admin__loading">The newsletter reader has not run yet. ' +
        'It checks the inbox every twenty minutes.</p>';
    }

    var when = agoText(run.ran_at);

    if (run.ok === false) {
      return '<p class="hc-caption hc-admin__warn">The newsletter reader failed ' +
        c.esc(when) + '. ' + c.esc(run.note || 'No reason was recorded.') + '</p>';
    }

    if (run.note) {
      return '<p class="hc-caption hc-admin__warn">Newsletter checked ' + c.esc(when) +
        '. ' + c.esc(run.note) + '</p>';
    }

    return '<p class="hc-caption hc-admin__loading">Newsletter checked ' + c.esc(when) + '.</p>';
  }

  /* What a parsed draft says about itself above the buttons. The dates matter
     more here than anywhere else on this screen: they are the field the model
     is most likely to have got wrong, and they are the reason somebody would
     open Edit rather than tapping Approve. */
  function reviewDates(row) {
    if (!row.starts_on && !row.ends_on) return 'No dates. It would stay up until you take it down.';
    if (row.starts_on && row.ends_on) {
      return 'On Home ' + c.formatDateShort(row.starts_on) + ' to ' + c.formatDateShort(row.ends_on) + '.';
    }
    if (row.starts_on) return 'Goes up ' + c.formatDateShort(row.starts_on) + ', with no end date.';
    return 'Comes down ' + c.formatDateShort(row.ends_on) + '.';
  }

  /* Why approving this would change nothing, or '' when it would work.

     THE FAILURE THIS EXISTS FOR. Home applies the date window on top of
     `published`, in liveAnnouncements() in js/data.js, so an announcement can
     be approved, correct, and still absent from Home because its window has
     closed or has not opened. Nothing said so: the button reported success,
     because the write did succeed, and Home simply did not change. That is the
     hardest kind of wrong to find, and somebody hit it before this line
     existed.

     The intake no longer writes a window that would do this. But a row parsed
     before that fix, or one an admin has since edited by hand, still can, so
     the warning stays: it costs one line and it is the only thing standing
     between a person and a silent no-op. */
  function whyNotLive(row) {
    var today = todayLocal();
    if (row.starts_on && today < row.starts_on) {
      return 'Approving this will not put it on Home yet. It is dated to appear ' +
        c.formatDateShort(row.starts_on) + '. Edit the dates to show it now.';
    }
    if (row.ends_on && today >= row.ends_on) {
      return 'These dates have already passed, so approving this would not show it ' +
        'on Home at all. Edit the dates first.';
    }
    return '';
  }

  /* The internal note, from migration 0043.

     WHAT IT IS FOR. The intake tells every admin at once that the queue has
     something in it, so more than one person can be on this screen at the same
     time, which was never true before there was a notification. The first one
     to tap Approve settles it for everybody, and this is what the others see
     afterwards: not a card that vanished, but a line saying who dealt with it.

     ADMINS AND NOBODY ELSE. review_approvals has one select policy and it is
     hc_is_admin(), and there is no anon read path to it at all. That is why
     the name lives in a table of its own rather than in a column on
     announcements: the app's content sync reads announcements with the
     publishable key, so a name stored there would be a name on every phone in
     the church. See 0043 section 7.

     Drawn as a caption rather than as a warning, because it is not one. It is
     the ordinary record of somebody having done their job. */
  function approvedNote(kind, id, lead) {
    var note = HC.admin.approvalFor(kind, id);
    if (!note) return '';

    var when = note.approved_at
      ? ' · ' + c.formatDateShort(String(note.approved_at).slice(0, 10))
      : '';

    return '<p class="hc-caption hc-admin__approved">' +
      c.esc(lead + ' ' + (note.approved_by_name || 'an admin')) + c.esc(when) + '</p>';
  }

  function reviewSection(rows) {
    var html = c.sectionHeader('', 'Needs review');
    html += '<p class="hc-caption hc-admin__intro-note">Parsed out of the newsletter ' +
      'and not on Home. Approve puts one up as it is written; Edit opens it in the ' +
      'form first; Discard takes it out of this list and leaves it below as a draft.</p>';

    rows.forEach(function (row) {
      var from = row.created_at
        ? 'From the newsletter · ' + c.formatDateShort(String(row.created_at).slice(0, 10))
        : 'From the newsletter';

      html += '<div class="hc-admin__item hc-admin__item--review">' +
        '<div class="hc-admin__item-head">' +
          '<p class="hc-eyebrow">' + c.esc(from) + '</p>' +
          '<p class="hc-row__title">' + c.esc(row.title) + '</p>' +
          (row.body ? '<p class="hc-caption">' + c.esc(row.body) + '</p>' : '') +
          '<p class="hc-caption hc-admin__review-dates">' + c.esc(reviewDates(row)) + '</p>' +
          /* Said before the tap, not discovered after it. Approving an
             announcement that carries an event changes two screens, and a
             button that quietly writes to the Connect tab as well as Home is
             a button that does more than it says. */
          /* Says where the date went, and does not claim this button puts it
             there. Since 0041 the event is approved on its own card below, so
             an admin who approves only the announcement should not be left
             wondering why the calendar did not change. */
          (row.event_id
            ? '<p class="hc-caption hc-admin__review-dates">This one has a date. ' +
              'It is waiting separately under Dates to review.</p>'
            : '') +
          (whyNotLive(row)
            ? '<p class="hc-caption hc-admin__warn">' + c.esc(whyNotLive(row)) + '</p>'
            : '') +
        '</div>' +
        '<div class="hc-admin__item-actions">' +
          c.button('Approve', { action: 'admin-review-approve', id: row.id,
            small: true, busy: busy === 'approve:' + row.id }) +
          c.button('Edit', { action: 'admin-announcement-edit', id: row.id,
            variant: 'secondary', small: true }) +
          c.button('Discard', { action: 'admin-review-discard', id: row.id,
            variant: 'tertiary', small: true, busy: busy === 'discard:' + row.id }) +
        '</div>' +
      '</div>';
    });

    return html;
  }

  /* ------------------------------------------------ the events queue

     Dates parsed out of the newsletter, waiting on somebody. A second queue
     under the announcements one, because since 0041 they are two decisions:
     approving the words on a card is not vouching for a date that will land in
     the church's calendar and then in people's phones.

     WHY THE DATE IS THE BIGGEST THING ON THE CARD. It is the only field here
     that can be wrong in a way nobody catches. A misworded announcement is
     visible on Home and fixable; a date that is a week out is correct-looking
     everywhere and wrong in four hundred calendars, and the app cannot reach
     in and take it back. So the card leads with when, not with what. */
  function eventWhen(row) {
    if (!row.starts_at) return 'No date';

    var d = new Date(row.starts_at);
    if (isNaN(d.getTime())) return 'No date';

    var day = c.formatDate(d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2));

    // time_label is what the intake writes when the email gave no hour, so it
    // says "Time to be announced" rather than a nine o'clock nobody chose.
    if (row.time_label) return day + ', ' + row.time_label;

    var hour = d.getHours();
    var mins = ('0' + d.getMinutes()).slice(-2);
    var ampm = hour >= 12 ? 'PM' : 'AM';
    var shown = hour % 12 === 0 ? 12 : hour % 12;
    return day + ', ' + shown + ':' + mins + ' ' + ampm;
  }

  function eventsSection(rows) {
    var html = c.sectionHeader('', 'Dates to review');
    html += '<p class="hc-caption hc-admin__intro-note">Parsed out of the newsletter ' +
      'and not on the Connect calendar yet. Approving one puts it there with an ' +
      'Add to calendar button, on the announcement as well.</p>';

    rows.forEach(function (row) {
      html += '<div class="hc-admin__item hc-admin__item--review">' +
        '<div class="hc-admin__item-head">' +
          '<p class="hc-eyebrow">' + c.esc(eventWhen(row)) + '</p>' +
          '<p class="hc-row__title">' + c.esc(row.title) + '</p>' +
          (row.location
            ? '<p class="hc-caption">' + c.esc(row.location) + '</p>'
            : '<p class="hc-caption hc-admin__review-dates">No location given.</p>') +
        '</div>' +
        '<div class="hc-admin__item-actions">' +
          c.button('Approve', { action: 'admin-event-approve', id: row.id,
            small: true, busy: busy === 'event-approve:' + row.id }) +
          c.button('Discard', { action: 'admin-event-discard', id: row.id,
            variant: 'tertiary', small: true, busy: busy === 'event-discard:' + row.id }) +
        '</div>' +
      '</div>';
    });

    return html;
  }

  function announcementsSection() {
    var html = '<div class="hc-screen hc-admin">';
    html += c.sectionHeader('For the church', 'Announcements', { flush: true, tag: 'h1' });

    if (draft) {
      html += announcementForm();
      html += '</div>';
      return html;
    }

    html += newsletterNotice();

    /* Check the mailbox now. Above Write an announcement and aligned right,
       which is the order the two are reached for: the newsletter is the thing
       that fills this screen most weeks, and writing one by hand is the
       exception.

       Secondary and small on purpose. Write an announcement is the primary
       action on this screen and stays the only full width button; this one is
       a convenience over something that already happens on its own every
       twenty minutes, and a second primary button would make the two look like
       a choice somebody has to make. */
    html += '<div class="hc-admin__fetch">' +
      c.button('Fetch Announcements', {
        action: 'admin-newsletter-fetch',
        icon: 'plus',
        variant: 'secondary',
        small: true,
        busy: busy === 'fetch'
      }) +
    '</div>';

    html += '<div class="hc-admin__new">' +
      c.button('Write an announcement', { action: 'admin-announcement-new', icon: 'plus' }) +
    '</div>';

    var rows = HC.admin.announcements();
    if (!rows.length) {
      html += pending('announcements', 'Nothing posted yet. The first one goes at the top of Home.');
      html += '</div>';
      return html;
    }

    /* The queue first, and the rows in it are taken out of the list below.
       One announcement drawn twice on one screen, with a different set of
       buttons each time, is two things as far as a thumb is concerned. */
    var waiting = HC.admin.pending();
    if (waiting.length) html += reviewSection(waiting);

    // The dates queue, under the announcements one. Two decisions, two
    // queues, in the order they are made: the words, then the date.
    var dates = HC.admin.pendingEvents();
    if (dates.length) html += eventsSection(dates);

    rows = rows.filter(function (row) { return row.review_state !== 'pending'; });
    if (!rows.length) {
      html += '</div>';
      return html;
    }

    html += c.sectionHeader('', 'Posted');
    rows.forEach(function (row) {
      html += '<div class="hc-admin__item">' +
        '<div class="hc-admin__item-head">' +
          '<p class="hc-eyebrow">' + c.esc(announcementStatus(row)) + '</p>' +
          '<p class="hc-row__title">' + c.esc(row.title) + '</p>' +
          (row.body ? '<p class="hc-caption">' + c.esc(row.body) + '</p>' : '') +
          approvedNote('announcement', row.id, 'Approved by') +
          /* And its date, when it had one and somebody has approved that too.
             Said here because this is the only screen an approved event is
             visible from at all: the dates queue empties on approval and the
             Connect tab shows the church a calendar entry, not a decision. So
             the announcement carries the note for both halves of what the
             newsletter parsed, which is also the order the two were decided
             in. */
          (row.event_id ? approvedNote('event', row.event_id, 'Its date, by') : '') +
        '</div>' +
        '<div class="hc-admin__item-actions">' +
          c.button('Edit', { action: 'admin-announcement-edit', id: row.id,
            variant: 'secondary', small: true }) +
          /* Notify is only drawn for a row that is on Home. A draft, one dated
             for next month, and one that has already come down are all refused
             by hc_admin_send_announcement, and a button whose only outcome is
             an error message should not be on the screen. The status line
             directly above already says which of the three it is. */
          (isLiveNow(row)
            ? c.button('Notify', { action: 'admin-announcement-notify', id: row.id,
                variant: 'secondary', small: true, busy: busy === 'notify:' + row.id })
            : '') +
          c.button('Delete', { action: 'admin-announcement-delete', id: row.id,
            variant: 'tertiary', small: true }) +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    return html;
  }

  /* ================================================================== users */

  function personName(u) {
    var name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return name || u.email || 'Somebody';
  }

  /* What somebody is, in one word, for the line above their name. Admin wins
     over Leader when both are true, which is the order they are granted in and
     the order they matter in: an admin can do everything a leader can. */
  function personStanding(u) {
    if (u.role === 'admin') return 'Admin';
    return u.is_leader ? 'Leader' : 'Member';
  }

  function usersSection() {
    var html = '<div class="hc-screen hc-admin">';
    html += c.sectionHeader('For the church', 'Users', { flush: true, tag: 'h1' });

    var rows = HC.admin.users();
    if (!rows.length) {
      html += pending('users', 'Nobody has signed in yet.');
      html += '</div>';
      return html;
    }

    html += '<p class="hc-body-serif hc-admin__intro">Everybody here is one of three. ' +
      'A member reads, writes in their own journal, and joins a group room. A leader ' +
      'also gets the leader tools and can host one. An admin can do all of that, and ' +
      'write announcements, edit content, and set what everybody else is. Nobody can ' +
      'change their own.</p>';

    rows.forEach(function (u) {
      var self = HC.admin.isSelf(u.id);
      var isAdminRow = u.role === 'admin';

      html += '<div class="hc-admin__item">' +
        '<div class="hc-admin__item-head">' +
          '<p class="hc-eyebrow">' + c.esc(personStanding(u)) +
            (self ? ' · You' : '') + '</p>' +
          '<p class="hc-row__title">' + c.esc(personName(u)) + '</p>' +
          '<p class="hc-caption">' + c.esc(u.email || 'No email on file') + '</p>' +
        '</div>';

      /* Leader mode, on the row rather than behind a second screen, because
         this is the thing an admin comes here to do most often: somebody has
         started leading a group and needs to be able to open a room on
         Thursday.

         MEMBERS ONLY, AND THAT IS THE WHOLE RULE. An admin already has
         everything Leader mode grants and hosts a room without it (migration
         0036), so a switch on an admin's row is one that changes nothing
         anybody can see, whether it is your own row or somebody else's. The
         line below says so instead. Demote an admin and the switch comes back
         on their row, still holding whatever it held: the value is never
         thrown away, it is only hidden while it cannot matter. */
      if (isAdminRow) {
        /* Your own row says this once, in the line under the buttons, rather
           than twice in two stacked captions. */
        if (!self) {
          html += '<p class="hc-caption hc-admin__self">An admin has the leader tools ' +
            'and can host a group room already. There is no Leader mode to turn on.</p>';
        }
      } else {
        html += switchRow({
          title: 'Leader mode',
          sub: u.is_leader
            ? 'On. Leader tools, and they can open a group room.'
            : 'Off. Turn it on for somebody who leads a group.',
          action: 'admin-leader',
          id: u.id,
          on: !!u.is_leader
        });
      }

      html += '<div class="hc-admin__item-actions">';

      /* The safety guard, drawn rather than merely enforced. A disabled button
         with a reason under it is a better answer than a button that works
         and then explains why it did not, and it is the same shape the
         database gives back: hc_admin_set_role refuses this, and so does the
         trigger underneath it. */
      if (self) {
        html += '<p class="hc-caption hc-admin__self">You cannot change your own role or ' +
          'remove your own account here, and an admin has the leader tools already. ' +
          'Deleting your account is under Your data.</p>';
      } else {
        html += c.button(isAdminRow ? 'Make a member' : 'Make an admin', {
          action: 'admin-role',
          id: u.id,
          variant: 'secondary',
          small: true,
          busy: busy === 'role:' + u.id
        });
        html += c.button('Remove', {
          action: 'admin-user-remove',
          id: u.id,
          variant: 'tertiary',
          small: true,
          busy: busy === 'remove:' + u.id
        });
      }

      html += '</div></div>';
    });

    html += '</div>';
    return html;
  }

  /* ================================================================ content */

  function pageEditorFor(row) {
    return {
      id: row.id,
      title: row.title || '',
      eyebrow: row.eyebrow || '',
      blurb: row.blurb || '',
      sections: (row.sections || []).map(function (s) {
        return { heading: s.heading || '', body: s.body || '' };
      }),
      published: row.published !== false,
      sortOrder: row.sort_order || 0
    };
  }

  function pageForm() {
    var d = pageDraft;
    var html = '<form class="hc-form hc-admin__form" novalidate>';

    html += field({ name: 'pageTitle', label: 'Page title', value: d.title });
    html += field({ name: 'pageEyebrow', label: 'Label above the title', value: d.eyebrow,
      help: 'Optional. The small tracked line, like "Thank you" on Give.' });
    html += textarea({ name: 'pageBlurb', label: 'Opening paragraph', value: d.blurb, rows: 5,
      help: 'Leave a blank line between paragraphs.' });

    /* Sections are optional and most pages have none. They are here for the
       page that genuinely has parts to it, and they are two plain fields
       rather than a block editor for the reason in migration 0026: a rich
       content model is how an editor turns into a project. */
    html += c.sectionHeader('', 'Sections');
    if (!d.sections.length) {
      html += '<p class="hc-caption hc-admin__loading">No sections. The page is just the ' +
        'paragraph above, which is usually right.</p>';
    }
    d.sections.forEach(function (s, i) {
      html += '<div class="hc-admin__item">' +
        field({ name: 'sectionHeading', id: String(i), label: 'Heading ' + (i + 1), value: s.heading }) +
        textarea({ name: 'sectionBody', id: String(i), label: 'Text', value: s.body, rows: 4 }) +
        '<div class="hc-admin__item-actions">' +
          c.button('Remove section', { action: 'admin-section-remove', id: String(i),
            variant: 'tertiary', small: true }) +
        '</div>' +
      '</div>';
    });
    html += '<div class="hc-mt-lg">' +
      c.button('Add a section', { action: 'admin-section-add', variant: 'secondary', small: true }) +
    '</div>';

    html += switchRow({
      title: 'Published',
      sub: d.published ? 'Live in the app.' : 'Hidden from everybody but you.',
      action: 'admin-page-toggle',
      id: 'published',
      on: d.published
    });

    html += '<div class="hc-mt-lg">' +
      c.button('Save changes', { action: 'admin-page-save', busy: busy === 'page' }) +
      c.button('Cancel', { action: 'admin-page-cancel', variant: 'tertiary' }) +
    '</div>';

    html += '</form>';
    return html;
  }

  /* The switch that turns the rest of the app into something you can type
     into. It sits at the top of App settings, above the rows out of
     app_settings, because Content is hidden and this was the only thing in
     there anybody used. It is still not the same kind of switch as the ones
     under it — those are rows in a table that are true for everybody, this is
     a thing this phone is doing for the next half hour — which is why it is
     drawn from HC.edit rather than from a setting, and why it is above the
     list rather than inside it.

     THE THREE SENTENCES UNDER IT ARE THE FEATURE'S CONTRACT and they are
     worth keeping accurate if any of this changes. Somebody who turns this on
     and walks away has to know it will be off when they come back, or they
     will assume the app is broken when their next tap does not open a box. */
  function editModeSection() {
    var on = HC.edit.isOn();

    var html = c.sectionHeader('', 'Edit in place');
    html += switchRow({
      title: 'Edit mode',
      sub: on
        ? 'On. Outlined text anywhere in the app opens for editing when you tap it.'
        : 'Outline the text you are allowed to change, anywhere in the app, and edit it where it sits.',
      action: 'edit-mode-toggle',
      id: 'edit-mode',
      on: on
    });
    html += '<p class="hc-caption hc-admin__loading">' +
      'Saving an edit changes it for everybody, straight away. Headings, buttons and ' +
      'anything the app relies on are never outlined. Edit mode is only ever on for this ' +
      'phone, it turns itself off after thirty minutes of nothing happening, and closing ' +
      'the app turns it off too.</p>';

    return html;
  }

  function contentSection() {
    var html = '<div class="hc-screen hc-admin">';
    html += c.sectionHeader('For the church', 'Content', { flush: true, tag: 'h1' });

    if (pageDraft) {
      html += pageForm();
      html += '</div>';
      return html;
    }

    html += '<p class="hc-body-serif hc-admin__intro">Pages of the church’s own writing. ' +
      'Edit one here and it changes in the app straight away, with no new version to ship.</p>';

    var rows = HC.admin.pages();
    if (!rows.length) {
      html += pending('pages', 'No pages yet.');
    } else {
      rows.forEach(function (row) {
        html += '<div class="hc-admin__item">' +
          '<div class="hc-admin__item-head">' +
            '<p class="hc-eyebrow">' + c.esc(row.published === false ? 'Draft' : 'Live') + '</p>' +
            '<p class="hc-row__title">' + c.esc(row.title) + '</p>' +
            (row.blurb ? '<p class="hc-caption">' + c.esc(row.blurb) + '</p>' : '') +
          '</div>' +
          '<div class="hc-admin__item-actions">' +
            c.button('Edit', { action: 'admin-page-edit', id: row.id,
              variant: 'secondary', small: true }) +
            c.button('Delete', { action: 'admin-page-delete', id: row.id,
              variant: 'tertiary', small: true }) +
          '</div>' +
        '</div>';
      });
    }

    /* WHY PRACTICES IS NOT IN THAT LIST, said here rather than left as a gap
       somebody has to investigate. The nine practices are Practicing the
       Way's writing and their videos, not this church's, and the header of
       js/practices.js sets out at length why they are generated once by a
       script, read by a person, and committed. An in-app editor over somebody
       else's copyrighted teaching is a different decision than an editor over
       our own paragraph about giving, and it is not one this screen makes
       quietly. */
    html += c.sectionHeader('', 'Not edited here');
    html += c.row({
      title: 'The nine Practices',
      sub: 'The teaching, the sessions and the videos are Practicing the Way’s, not ' +
        'ours. They are built from their published material and reviewed before they ' +
        'ship, so they are not editable in the app. Our own words around them, the ' +
        'opening line, the credit and the texting invitation, are: turn on Edit mode ' +
        'and tap them on the Practices screen.',
      serif: true
    });

    html += '</div>';
    return html;
  }

  /* =============================================================== settings */

  // The keys migration 0026 seeds. Read by name elsewhere in the app, so they
  // are not offered for deletion. See the note in settingsSection().
  var SEEDED = {
    home_banner_on: true,
    home_banner_message: true,
    announcement_push_default: true
  };

  function settingsSection() {
    var html = '<div class="hc-screen hc-admin">';
    html += c.sectionHeader('For the church', 'App settings', { flush: true, tag: 'h1' });

    // Above the seeded rows, so the first switch on this screen is the one an
    // admin came here to flip. It needs nothing fetched, which is also why it
    // can draw while the rows below are still loading.
    html += editModeSection();

    var rows = HC.admin.settings();

    /* A header the screen did not need while the rows were the only thing on
       it. With Edit mode above them they do: without it the pinned banner
       reads as part of "Edit in place", which is the one switch on this
       screen that is not true for everybody. */
    html += c.sectionHeader('', 'Switches and messages');

    if (!rows.length) {
      html += pending('settings', 'No settings yet.');
    } else {
      rows.forEach(function (s) {
        if (s.kind === 'boolean') {
          html += switchRow({
            title: s.label,
            sub: s.help || '',
            action: 'admin-setting-toggle',
            id: s.key,
            on: !!s.value_bool
          });
        } else {
          html += field({
            name: 'setting',
            id: s.key,
            label: s.label,
            value: s.value_text || '',
            help: s.help || ''
          });
        }
        // Only rows somebody added from this screen can be removed. The three
        // the app ships with are read by name in the code, and deleting one
        // would not break anything, because HC.data.setting() takes a
        // fallback, but it would silently change behaviour with no way back
        // from inside the app.
        if (!SEEDED[s.key]) {
          html += '<div class="hc-admin__item-actions">' +
            c.button('Remove this setting', { action: 'admin-setting-delete', id: s.key,
              variant: 'tertiary', small: true }) +
          '</div>';
        }
      });
      html += '<p class="hc-caption hc-admin__loading">Text boxes save as you type. ' +
        'Switches save the moment you tap them.</p>';
    }

    html += '</div>';
    return html;
  }

  /* ================================================================== render */

  function render(route) {
    var id = route && route.id;

    /* A member who has arrived here anyway, by an old history entry or by a
       demotion that landed while the screen was open. Not an error page: the
       app simply does not have this screen for them, and every button on it
       would be refused by the database in any case. */
    if (!HC.admin.isAdmin()) {
      return c.el('<div class="hc-screen hc-admin">' +
        c.sectionHeader('For the church', 'Admin', { flush: true, tag: 'h1' }) +
        c.emptyState('This part of the app is for the church’s admins.') +
      '</div>');
    }

    /* A section nobody can reach from the menu any more, arrived at by an old
       history entry or by the back gesture walking into one. It draws the menu
       instead of a screen with no way in, which is also what makes hiding a
       section a one word change: nothing else has to know it is gone. */
    if (id && isHidden(id)) id = '';

    // Asked for on the way in rather than at boot, because a member never
    // needs any of it and an admin opens this screen a few times a week.
    if (id === 'announcements') HC.admin.loadAnnouncements();
    // The intake's heartbeat, alongside the rows themselves. Two tables, two
    // fetches, and the section can draw before either has landed.
    if (id === 'announcements') HC.admin.loadNewsletter();
    if (id === 'announcements') HC.admin.loadPendingEvents();
    // And who approved what, for the note under each posted row. A fourth
    // fetch on this section, and the smallest of them: one row per thing ever
    // approved out of the two queues.
    if (id === 'announcements') HC.admin.loadApprovals();
    if (id === 'users') HC.admin.loadUsers();
    if (id === 'content') HC.admin.loadPages();
    if (id === 'settings') HC.admin.loadSettings();

    if (id === 'announcements') return c.el(announcementsSection());
    if (id === 'users') return c.el(usersSection());
    if (id === 'content') return c.el(contentSection());
    if (id === 'settings') return c.el(settingsSection());

    return c.el(menu());
  }

  HC.screens = HC.screens || {};
  HC.screens.admin = render;

  /* Everything js/app.js needs to drive this screen. Same shape as
     profileHelpers: the markup lives here, the event handling lives there,
     and this is the seam between them. */
  HC.screens.adminHelpers = {
    resetDrafts: resetDrafts,

    getDraft: function () { return draft; },
    startDraft: function (row) { draft = row ? editorFor(row) : blankDraft(); },
    clearDraft: function () { draft = null; },

    getPageDraft: function () { return pageDraft; },
    startPageDraft: function (row) { pageDraft = pageEditorFor(row); },
    clearPageDraft: function () { pageDraft = null; },

    setBusy: function (value) { busy = value || ''; },
    setUploading: function (value) { uploading = !!value; }
  };

})(window.HC = window.HC || {});
