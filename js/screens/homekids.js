/* ==========================================================================
   Home Church, HomeKids
   One page for the kids' side of Sunday morning, read by two people at once:
   a parent holding the phone and a child leaning on their arm.

   WHAT IS ON IT, top to bottom, and why in that order:

     1. Which group are you in. Champions, Heroes, Legends + Warriors. Big
        buttons with a colour each, because some of the people tapping them
        cannot read yet. The choice is remembered on the phone and changes
        the questions and the activity further down, nothing else.
     2. This week's kids guide. The big idea in one sentence, then For
        parents (the note to parents and what the weekly HomeKids email said),
        then the Bible story retold for kids, the memory verse, questions and
        something to do for the group picked above, and a short prayer. The
        same guide serves all three groups: the story is shared, the
        conversation is not. Before the first lesson, For parents sits under
        the empty state instead.
     3. The checklist and the prize. A few things to do together during the
        week, each one a big tick box. Next Sunday the family shows the
        teacher the ticks, and the kid gets to pick from the prize box. The
        teacher card is the same ticks, large, with the kid's name on it.
     4. For volunteers. What the email to volunteers said, folded away,
        because most people reading this page are not on the team.

   WHERE IT COMES FROM. The lessons are written by /new-homekids from the
   director's lesson plans, the updates by the newsletter intake from the two
   HomeKids emails, approved by an admin before they appear. Both tables are
   migration 0081. Until either has a row, the page says so warmly rather
   than drawing gaps.

   THE TICKS NEVER LEAVE THE PHONE. See the homekids block in js/store.js.

   WEEKS. The lesson on screen is this week's unless the route carries an id,
   which is how the arrows step back through earlier Sundays. The id is on the
   route rather than in a variable here so the back gesture and a content
   refresh both land on the week somebody was looking at.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var NO_LESSON_YET = 'The first HomeKids guide lands here after Sunday. Check back soon.';
  var REWARD_LINE = 'Tick each one off as you do it this week. Next Sunday, show your ' +
    'HomeKids teacher, and you get to pick something from the prize box.';
  var PICK_A_GROUP = 'Tap your group up top to see your questions.';
  var NO_PARENT_NEWS = 'News from the HomeKids team shows up here each week.';

  /* ------------------------------------------------------------ the groups */

  function groupPicker(chosen) {
    var groups = HC.data.homekidsGroups || [];
    return '' +
      '<div class="hc-kids-groups" role="group" aria-label="Pick your HomeKids group">' +
        groups.map(function (g) {
          var on = g.key === chosen;
          return '' +
            '<button type="button" class="hc-kids-group hc-kids-group--' + c.esc(g.tone) + '" ' +
              'data-action="homekids-group" data-id="' + c.esc(g.key) + '" ' +
              'aria-pressed="' + (on ? 'true' : 'false') + '">' +
              '<span class="hc-kids-group__dot" aria-hidden="true"></span>' +
              '<span class="hc-kids-group__name">' + c.esc(g.name) + '</span>' +
              '<span class="hc-kids-group__ages">Ages ' + c.esc(g.ages) + '</span>' +
            '</button>';
        }).join('') +
      '</div>';
  }

  /* What changes when the group does: the questions and the thing to do.
     Drawn on its own so a tap on a group button repaints just this. */
  function groupBlock(lesson, key) {
    var group = HC.data.getHomekidsGroup(key);
    if (!group) {
      return '<p class="hc-kids-nudge">' + c.esc(PICK_A_GROUP) + '</p>';
    }

    var block = (lesson.groups && lesson.groups[key]) || { questions: [], activity: '' };
    var html = '';

    if (block.questions.length) {
      html += '<div class="hc-kids-block">' +
        c.sectionHeader(group.name + ' · ages ' + group.ages, 'Talk about it') +
        '<ol class="hc-kids-questions" role="list">' +
          block.questions.map(function (q, i) {
            return '<li class="hc-kids-question">' +
              '<span class="hc-kids-question__n" aria-hidden="true">' + (i + 1) + '</span>' +
              '<span class="hc-kids-question__text">' + c.esc(q) + '</span>' +
            '</li>';
          }).join('') +
        '</ol>' +
      '</div>';
    }

    if (block.activity) {
      html += '<div class="hc-kids-block">' +
        '<p class="hc-eyebrow hc-kids-block__eyebrow">Try it this week</p>' +
        '<p class="hc-kids-activity">' + c.esc(block.activity) + '</p>' +
      '</div>';
    }

    return html || '<p class="hc-kids-nudge">The questions for ' + c.esc(group.name) +
      ' are on their way.</p>';
  }

  /* ------------------------------------------------------------ the lesson */

  function weekHead(lesson, index, count) {
    var arrows = count > 1
      ? '<button type="button" class="hc-worship__arrow hc-worship__arrow--prev" ' +
            'data-action="homekids-week" data-step="-1"' + (index <= 0 ? ' disabled' : '') +
            ' aria-label="A more recent Sunday">' + c.icon('chevronLeft') + '</button>' +
        '<button type="button" class="hc-worship__arrow hc-worship__arrow--next" ' +
            'data-action="homekids-week" data-step="1"' + (index >= count - 1 ? ' disabled' : '') +
            ' aria-label="An earlier Sunday">' + c.icon('chevronRight') + '</button>'
      : '';

    return '' +
      '<div class="hc-worship__head hc-kids-week">' +
        arrows +
        '<div class="hc-worship-week">' +
          '<p class="hc-eyebrow hc-worship-week__date">' +
            (index === 0 ? 'This week · ' : '') + c.esc(c.formatDate(lesson.taughtOn)) +
          '</p>' +
          '<h2 class="hc-display-l hc-kids-week__title">' + c.esc(lesson.title) + '</h2>' +
          (lesson.passage
            ? '<p class="hc-caption hc-kids-week__passage">' + c.esc(lesson.passage) + '</p>'
            : '') +
        '</div>' +
      '</div>';
  }

  function bigIdea(lesson) {
    if (!lesson.bigIdea) return '';
    return '' +
      '<div class="hc-kids-idea">' +
        '<p class="hc-eyebrow hc-kids-idea__eyebrow">The big idea</p>' +
        '<p class="hc-kids-idea__text">' + c.esc(lesson.bigIdea) + '</p>' +
      '</div>';
  }

  function story(lesson) {
    if (!lesson.story.length) return '';
    return '' +
      '<section class="hc-kids-section">' +
        c.sectionHeader('Read it together', 'The story') +
        lesson.story.map(function (p) {
          return '<p class="hc-kids-story">' + c.esc(p) + '</p>';
        }).join('') +
      '</section>';
  }

  function memoryVerse(lesson) {
    var v = lesson.memoryVerse;
    if (!v) return '';
    return '' +
      '<section class="hc-kids-section">' +
        c.sectionHeader('Say it until you know it', 'Memory verse') +
        c.quoteCard(v.text, v.reference) +
      '</section>';
  }

  function prayer(lesson) {
    if (!lesson.prayer) return '';
    return '' +
      '<section class="hc-kids-section">' +
        c.sectionHeader('Before bed', 'Pray together') +
        '<p class="hc-kids-story hc-kids-prayer">' + c.esc(lesson.prayer) + '</p>' +
      '</section>';
  }

  /* ------------------------------------------------------- the checklist */

  function progressText(done, total) {
    if (!total) return '';
    if (done >= total) return 'All ' + total + ' done. Show your teacher on Sunday.';
    if (!done) return total + ' to do this week.';
    return done + ' of ' + total + ' done. Keep going.';
  }

  function checkItem(lesson, item) {
    var on = HC.store.isKidsChecked(lesson.id, item.id);
    return '' +
      '<button type="button" class="hc-kids-check" data-action="homekids-check" ' +
        'data-id="' + c.esc(item.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="hc-kids-check__box" aria-hidden="true">' +
          c.icon('check', 'hc-kids-check__tick') +
        '</span>' +
        '<span class="hc-kids-check__text">' + c.esc(item.text) + '</span>' +
      '</button>';
  }

  function checklist(lesson) {
    if (!lesson.checklist.length) return '';
    var ids = lesson.checklist.map(function (i) { return i.id; });
    var done = HC.store.kidsCheckedCount(lesson.id, ids);
    var all = done >= ids.length;
    var reward = HC.data.copy('homekids.reward', REWARD_LINE);

    return '' +
      '<section class="hc-kids-section">' +
        c.sectionHeader('Do it together', 'This week’s checklist',
          { eyebrowSlot: 'homekids.checklist-eyebrow' }) +
        '<div class="hc-kids-reward" data-kids-reward' + (all ? ' data-done="true"' : '') + '>' +
          '<span class="hc-kids-reward__star" aria-hidden="true">' + c.icon('star') + '</span>' +
          HC.edit.wrap(
            reward ? '<p class="hc-kids-reward__text">' + c.esc(reward) + '</p>' : '',
            { slot: 'homekids.reward', value: reward,
              label: 'the line about the prize box on HomeKids', rows: 3 }
          ) +
        '</div>' +
        '<div class="hc-kids-checks">' +
          lesson.checklist.map(function (item) { return checkItem(lesson, item); }).join('') +
        '</div>' +
        '<p class="hc-caption hc-kids-progress" data-kids-progress aria-live="polite">' +
          c.esc(progressText(done, ids.length)) +
        '</p>' +
        c.button('Show my teacher', { action: 'homekids-show', id: lesson.id,
          className: 'hc-kids-show' }) +
      '</section>';
  }

  /* --------------------------------------------------------- the updates */

  function updateCard(u) {
    var html = '';
    if (u.happensOn) {
      html += '<p class="hc-eyebrow hc-kids-update__when">' + c.esc(c.formatDate(u.happensOn)) + '</p>';
    }
    html += '<h3 class="hc-kids-update__title">' + c.esc(u.title) + '</h3>';
    if (u.summary) html += '<p class="hc-body-serif hc-kids-update__summary">' + c.esc(u.summary) + '</p>';
    if (u.details.length) {
      html += '<ul class="hc-kids-update__details">' +
        u.details.map(function (d) { return '<li>' + c.esc(d) + '</li>'; }).join('') +
      '</ul>';
    }
    if (u.links.length) {
      html += '<div class="hc-kids-update__links">' +
        u.links.map(function (l) {
          return '<button type="button" class="hc-inline-link" data-action="open-url" ' +
            'data-url="' + c.esc(l.url) + '">' +
            c.icon('arrowOut', 'hc-share__icon') + '<span>' + c.esc(l.label) + '</span>' +
          '</button>';
        }).join('') +
      '</div>';
    }
    return c.card(html, { edge: true });
  }

  function forParents(lesson) {
    var news = HC.data.liveHomekidsUpdates('parents');
    var note = lesson && lesson.parentNote;
    var html = '<section class="hc-kids-section">' +
      c.sectionHeader('From the HomeKids team', 'For parents',
        { eyebrowSlot: 'homekids.parents-eyebrow' });

    if (note) {
      html += '<p class="hc-body-serif hc-kids-parent-note">' + c.esc(note) + '</p>';
    }

    if (news.length) {
      html += '<div class="hc-kids-updates">' + news.map(updateCard).join('') + '</div>';
    } else if (!note) {
      var empty = HC.data.copy('homekids.parents-empty', NO_PARENT_NEWS);
      html += HC.edit.wrap(empty ? c.emptyState(empty, 'kids') : '',
        { slot: 'homekids.parents-empty', value: empty,
          label: 'what For parents says before the first email' });
    }

    return html + '</section>';
  }

  /* Folded, and absent entirely until the volunteer email has said something,
     so a parent is never shown an empty section meant for somebody else. */
  function forVolunteers() {
    var news = HC.data.liveHomekidsUpdates('volunteers');
    if (!news.length) return '';
    return c.collapsible({
      id: 'homekids-volunteers',
      eyebrow: 'Serving in HomeKids',
      title: 'For volunteers',
      open: false,
      body: '<div class="hc-kids-updates">' + news.map(updateCard).join('') + '</div>'
    });
  }

  /* ------------------------------------------------------------ the screen */

  function lessonFor(route, lessons) {
    if (route && route.id) {
      var picked = HC.data.getHomekidsLesson(route.id);
      if (picked) return picked;
    }
    return HC.data.currentHomekidsLesson();
  }

  function render(route) {
    var lessons = HC.data.homekidsLessonsByDate();
    var lesson = lessonFor(route, lessons);
    var chosen = HC.store.kidsGroup();

    var html = '<div class="hc-screen hc-kids"' +
      (lesson ? ' data-kids-lesson="' + c.esc(lesson.id) + '"' : '') + '>';

    html += c.sectionHeader('For kids and families', 'HomeKids',
      { flush: true, tag: 'h1', eyebrowSlot: 'homekids.eyebrow' });

    html += groupPicker(chosen);

    if (!lesson) {
      var empty = HC.data.copy('homekids.empty', NO_LESSON_YET);
      html += HC.edit.wrap(empty ? c.emptyState(empty, 'kids') : '',
        { slot: 'homekids.empty', value: empty,
          label: 'what HomeKids says before the first lesson is up' });
    } else {
      var index = lessons.indexOf(lesson);
      html += weekHead(lesson, index, lessons.length);
      html += bigIdea(lesson);
      // Straight under the big idea, ahead of the story: the parent holding
      // the phone reads what this week is for before reading it aloud.
      html += forParents(lesson);
      html += story(lesson);
      html += memoryVerse(lesson);
      html += '<section class="hc-kids-section" data-kids-group-block>' +
        groupBlock(lesson, chosen) + '</section>';
      html += prayer(lesson);
      html += checklist(lesson);
    }

    if (!lesson) html += forParents(lesson);
    html += forVolunteers();

    html += '</div>';
    return c.el(html);
  }

  /* ----------------------------------------------------------- the taps */

  function screenLesson(el) {
    var scope = el.closest('[data-kids-lesson]');
    return scope ? HC.data.getHomekidsLesson(scope.getAttribute('data-kids-lesson')) : null;
  }

  function pickGroup(el) {
    var key = el.getAttribute('data-id');
    HC.store.setKidsGroup(key);
    var screen = el.closest('.hc-kids');
    if (!screen) return;
    Array.prototype.forEach.call(screen.querySelectorAll('[data-action="homekids-group"]'),
      function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
    var lesson = screenLesson(el);
    var block = screen.querySelector('[data-kids-group-block]');
    if (lesson && block) block.innerHTML = groupBlock(lesson, key);
  }

  /* Returns whether the box is now ticked, so the caller can tap the phone. */
  function toggle(el) {
    var lesson = screenLesson(el);
    if (!lesson) return false;
    var on = HC.store.toggleKidsChecked(lesson.id, el.getAttribute('data-id'));
    el.setAttribute('aria-pressed', on ? 'true' : 'false');

    var ids = lesson.checklist.map(function (i) { return i.id; });
    var done = HC.store.kidsCheckedCount(lesson.id, ids);
    var screen = el.closest('.hc-kids');
    var line = screen && screen.querySelector('[data-kids-progress]');
    if (line) line.textContent = progressText(done, ids.length);
    var reward = screen && screen.querySelector('[data-kids-reward]');
    if (reward) {
      if (done >= ids.length) reward.setAttribute('data-done', 'true');
      else reward.removeAttribute('data-done');
    }
    return on;
  }

  function step(el) {
    var lesson = screenLesson(el);
    var lessons = HC.data.homekidsLessonsByDate();
    var next = lessons[lessons.indexOf(lesson) + (parseInt(el.getAttribute('data-step'), 10) || 0)];
    if (!next) return;
    HC.router.go({ name: 'homekids', id: next.id }, { replace: true });
  }

  /* The card a family holds up on Sunday. Drawn over everything, with the
     ticks large, the lesson it belongs to, and whose list it is. Built and
     appended here rather than routed to, because it is a moment and not a
     place: there is nothing to come back to, and the back gesture should
     still mean the screen underneath. */
  function showTeacher(el) {
    var lesson = HC.data.getHomekidsLesson(el.getAttribute('data-id'));
    if (!lesson) return;
    hideTeacher();

    var ids = lesson.checklist.map(function (i) { return i.id; });
    var done = HC.store.kidsCheckedCount(lesson.id, ids);
    var all = done >= ids.length && ids.length > 0;

    var html = '' +
      '<div class="hc-kids-teacher" role="dialog" aria-modal="true" aria-label="Show your teacher" data-kids-teacher>' +
        '<div class="hc-kids-teacher__card"' + (all ? ' data-done="true"' : '') + '>' +
          '<button type="button" class="hc-kids-teacher__close" data-action="homekids-hide" ' +
            'aria-label="Close">' + c.icon('close') + '</button>' +
          '<p class="hc-eyebrow hc-kids-teacher__eyebrow">HomeKids · ' +
            c.esc(c.formatDate(lesson.taughtOn)) + '</p>' +
          '<h2 class="hc-kids-teacher__title">' + c.esc(lesson.title) + '</h2>' +
          '<label class="hc-kids-teacher__name">' +
            '<span class="hc-caption">Whose list is this?</span>' +
            '<input class="hc-input" type="text" data-homekids-name autocomplete="off" ' +
              'placeholder="Your name" value="' + c.esc(HC.store.kidsName()) + '">' +
          '</label>' +
          '<ul class="hc-kids-teacher__list" role="list">' +
            lesson.checklist.map(function (item) {
              var on = HC.store.isKidsChecked(lesson.id, item.id);
              return '<li class="hc-kids-teacher__item"' + (on ? ' data-on="true"' : '') + '>' +
                '<span class="hc-kids-teacher__mark" aria-hidden="true">' +
                  c.icon(on ? 'star' : 'check') + '</span>' +
                '<span>' + c.esc(item.text) + '</span>' +
                '<span class="hc-visually-hidden">' + (on ? ', done' : ', not yet') + '</span>' +
              '</li>';
            }).join('') +
          '</ul>' +
          '<p class="hc-kids-teacher__count">' + done + ' of ' + ids.length + '</p>' +
          '<p class="hc-caption hc-kids-teacher__foot">' +
            c.esc(all ? 'Every one. Time for the prize box.' : 'Nice work this week.') +
          '</p>' +
        '</div>' +
      '</div>';

    var layer = c.el(html);
    document.body.appendChild(layer);
    var close = layer.querySelector('.hc-kids-teacher__close');
    if (close) close.focus({ preventScroll: true });
  }

  function hideTeacher() {
    var open = document.querySelector('[data-kids-teacher]');
    if (open && open.parentNode) open.parentNode.removeChild(open);
  }

  // Leaving the screen, or Escape, puts the card away.
  if (HC.store && HC.store.on) HC.store.on('view', hideTeacher);
  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') hideTeacher();
  });

  HC.screens = HC.screens || {};
  HC.screens.homekids = render;
  HC.screens.homekidsHelpers = {
    pickGroup: pickGroup,
    toggle: toggle,
    step: step,
    showTeacher: showTeacher,
    hideTeacher: hideTeacher,
    progressText: progressText
  };

})(window.HC = window.HC || {});
