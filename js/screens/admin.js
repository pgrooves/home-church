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
    { id: 'announcements', icon: 'home',    title: 'Post an announcement',
      sub: 'Write the card on Home, and tell everybody about it.' },
    { id: 'users',         icon: 'group',   title: 'Manage users',
      sub: 'Who is here, who can edit, and who should not be.' },
    { id: 'content',       icon: 'guide',   title: 'Content',
      sub: 'The church’s own words, edited here instead of in the code.' },
    { id: 'settings',      icon: 'connect', title: 'App settings',
      sub: 'Switches and short messages that change the whole app.' }
  ];

  function menu() {
    var html = '<div class="hc-screen hc-admin">';

    html += c.sectionHeader('For the church', 'Admin', { flush: true, tag: 'h1' });
    html += '<p class="hc-body-serif hc-admin__intro">Everything here is live the moment you save it. ' +
      'There is no publish step and no build to wait for.</p>';

    html += '<div class="hc-module-list">';
    SECTIONS.forEach(function (s) {
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
      id: null, eyebrow: '', title: '', body: '',
      imageUrl: '', videoUrl: '',
      startsOn: '', endsOn: '', priority: 0,
      published: true,
      // Off unless somebody asks for it. The strip is the most insistent
      // thing in the app, and a default that puts one there is a default that
      // puts one there on a week nobody meant to.
      pinned: false,
      notify: HC.data.setting('announcement_push_default', true)
    };
  }

  function editorFor(row) {
    return {
      id: row.id,
      eyebrow: row.eyebrow || '',
      title: row.title || '',
      body: row.body || '',
      imageUrl: row.image_url || '',
      videoUrl: row.video_url || '',
      startsOn: row.starts_on || '',
      endsOn: row.ends_on || '',
      priority: row.priority || 0,
      published: row.published !== false,
      // Unlike the notification below, this one is read off the row: it is a
      // state the announcement is in rather than something that happens when
      // you save, so opening an announcement that is pinned has to show it
      // pinned, or saving a typo fix would quietly take the strip down.
      pinned: !!row.pinned,
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

  function announcementForm() {
    var d = draft;
    var isNew = !d.id;

    var html = '<form class="hc-form hc-admin__form" novalidate>';

    html += field({ name: 'title', label: 'Title', value: d.title,
      placeholder: 'City Serve Day, September 12' });

    html += textarea({ name: 'body', label: 'What it says', value: d.body, rows: 4,
      placeholder: 'One or two warm sentences.' });

    html += field({ name: 'eyebrow', label: 'Label', value: d.eyebrow,
      placeholder: 'One thing',
      help: 'Optional. Leave it empty and the card shows the date it went up.' });

    /* The picture. Two ways in, because they solve different problems: the
       file picker is for the photograph that is already on this phone, which
       is most of them, and the URL field is for one that already lives
       somewhere else. They write the same column, so the second overwrites
       the first and the preview always shows what will actually be saved. */
    html += '<div class="hc-admin__image">';
    html += '<span class="hc-field__label">Picture</span>';
    if (d.imageUrl) {
      html += '<div class="hc-admin__thumb">' +
        '<img src="' + c.esc(d.imageUrl) + '" alt="" decoding="async">' +
        '<button type="button" class="hc-btn hc-btn--tertiary hc-btn--small" ' +
          'data-action="admin-image-clear">Remove picture</button>' +
      '</div>';
    }
    html += '<label class="hc-admin__file">' +
      '<input type="file" accept="image/*" data-admin-image hidden>' +
      '<span class="hc-btn hc-btn--secondary">' +
        c.icon('plus', 'hc-btn__icon') +
        '<span>' + (uploading ? 'Uploading…' : (d.imageUrl ? 'Choose a different one' : 'Choose a picture')) + '</span>' +
      '</span>' +
    '</label>';
    html += field({ name: 'imageUrl', label: 'Or paste a picture link', value: d.imageUrl,
      placeholder: 'https://…',
      help: 'Only if the picture already lives somewhere else.' });
    html += '</div>';

    html += field({ name: 'videoUrl', label: 'Video link', value: d.videoUrl,
      placeholder: 'https://youtube.com/watch?v=…',
      help: 'Optional. Shows a button on the card that opens the video in your browser.' });

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

  function announcementsSection() {
    var html = '<div class="hc-screen hc-admin">';
    html += c.sectionHeader('For the church', 'Announcements', { flush: true, tag: 'h1' });

    if (draft) {
      html += announcementForm();
      html += '</div>';
      return html;
    }

    html += '<div class="hc-admin__new">' +
      c.button('Write an announcement', { action: 'admin-announcement-new', icon: 'plus' }) +
    '</div>';

    var rows = HC.admin.announcements();
    if (!rows.length) {
      html += pending('announcements', 'Nothing posted yet. The first one goes at the top of Home.');
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

  function usersSection() {
    var html = '<div class="hc-screen hc-admin">';
    html += c.sectionHeader('For the church', 'Users', { flush: true, tag: 'h1' });

    var rows = HC.admin.users();
    if (!rows.length) {
      html += pending('users', 'Nobody has signed in yet.');
      html += '</div>';
      return html;
    }

    html += '<p class="hc-body-serif hc-admin__intro">An admin can write announcements, ' +
      'edit content, and change what everybody else can do. Everyone else is a member.</p>';

    rows.forEach(function (u) {
      var self = HC.admin.isSelf(u.id);
      var isAdminRow = u.role === 'admin';

      html += '<div class="hc-admin__item">' +
        '<div class="hc-admin__item-head">' +
          '<p class="hc-eyebrow">' + c.esc(isAdminRow ? 'Admin' : 'Member') +
            (self ? ' · You' : '') + '</p>' +
          '<p class="hc-row__title">' + c.esc(personName(u)) + '</p>' +
          '<p class="hc-caption">' + c.esc(u.email || 'No email on file') + '</p>' +
        '</div>' +
        '<div class="hc-admin__item-actions">';

      /* The safety guard, drawn rather than merely enforced. A disabled button
         with a reason under it is a better answer than a button that works
         and then explains why it did not, and it is the same shape the
         database gives back: hc_admin_set_role refuses this, and so does the
         trigger underneath it. */
      if (self) {
        html += '<p class="hc-caption hc-admin__self">You cannot change your own role or ' +
          'remove your own account here. Deleting your account is under Your data.</p>';
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
     into. It lives in Content rather than in App settings on purpose: this is
     not a switch about how the app behaves for the church, it is a thing this
     phone is doing for the next half hour, and App settings is a list of rows
     in a table that are true for everybody.

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

    html += editModeSection();

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

    var rows = HC.admin.settings();

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

    // Asked for on the way in rather than at boot, because a member never
    // needs any of it and an admin opens this screen a few times a week.
    if (id === 'announcements') HC.admin.loadAnnouncements();
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
