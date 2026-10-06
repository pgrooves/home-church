/* ==========================================================================
   Home Church, HomeKids
   One page for the kids' side of Sunday morning, read by two people at once:
   a parent holding the phone and a child leaning on their arm.

   WHAT IS ON IT, top to bottom, and why in that order:

     1. Which group are you in. Champions, Heroes, Legends + Warriors. Big
        buttons with a colour each, because some of the people tapping them
        cannot read yet. The choice is remembered on the phone and changes
        the questions and the activity further down, nothing else.
     2. This week's kids guide. The big idea in one sentence, then a first
        For parents saying what the kids learned, then the Bible story
        retold for kids, the memory verse, questions and something to do for
        the group picked above, and a short prayer. The same guide serves
        all three groups: the story is shared, the conversation is not.
     3. The checklist and the prize. A few things to do together during the
        week, each one a big tick box, saved on the phone the moment it is
        tapped. On the last Sunday of the month the family opens the Monthly
        report, the month's ticks large with the kid's name on it, shows the
        teacher, and the kid gets to pick from the prize box. The report can
        be saved as a PDF with the month's lessons in it to read again.
     4. For parents, the second one. The teaching tied up with what to ask
        at bedtime, then what the weekly HomeKids email to parents said.
     5. For volunteers. What the email to volunteers said, folded away,
        because most people reading this page are not on the team.

   WHERE IT COMES FROM. The lessons are written by /new-homekids from the
   director's lesson plans, the updates by the newsletter intake from the two
   HomeKids emails, approved by an admin before they appear. Both tables are
   migration 0081. Until either has a row, the page says so warmly rather
   than drawing gaps.

   THE TICKS NEVER LEAVE THE PHONE. See the homekids block in js/store.js.

   WEEKS. The lesson on screen is this week's unless the route carries an id.
   The week header is a carousel like Worship's: swiping it (or the arrows)
   redraws the lesson below and quietly moves the route's id along with it,
   and tapping it opens a calendar of the Sundays that have a lesson. The id
   is on the route rather than in a variable here so the back gesture and a
   content refresh both land on the week somebody was looking at.
   ========================================================================== */

(function (HC) {
  'use strict';

  var c = HC.components;

  var NO_LESSON_YET = 'The first HomeKids guide lands here after Sunday. Check back soon.';
  var REWARD_LINE = 'Tick each one off as you do it this week. On the last Sunday of the ' +
    'month, open your monthly report and show your HomeKids teacher to pick something ' +
    'from the prize box.';
  var SAVED_LINE = 'Weekly progress saved on this phone.';
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

  /* THE HEADER IS A CAROUSEL, the same one as the week header on Worship:
     one slide per Sunday, newest first, dots underneath, chevrons either
     side. Swiping it redraws the lesson below (selectLesson), and js/app.js
     does the scrolling, the snapping and the dots exactly as it does there.
     A tap on the slide lifts a calendar to jump straight to a date. */
  function weekSlide(lesson, i) {
    return '' +
      '<li class="hc-carousel__slide hc-worship-week hc-kids-week__slide">' +
        '<div class="hc-kids-week__open" role="button" tabindex="0" data-action="homekids-calendar" ' +
            'aria-label="' + c.esc(c.formatDate(lesson.taughtOn) + ', ' + lesson.title +
              '. Pick a different Sunday') + '">' +
          '<p class="hc-eyebrow hc-worship-week__date">' +
            (i === 0 ? 'This week · ' : '') + c.esc(c.formatDate(lesson.taughtOn)) +
            c.icon('calendar', 'hc-kids-week__cal') +
          '</p>' +
          '<h2 class="hc-display-l hc-kids-week__title">' + c.esc(lesson.title) + '</h2>' +
          (lesson.passage
            ? '<p class="hc-caption hc-kids-week__passage">' + c.esc(lesson.passage) + '</p>'
            : '') +
        '</div>' +
      '</li>';
  }

  function weekRail(lessons, index) {
    var many = lessons.length > 1;
    var dots = many
      ? '<ol class="hc-carousel__dots" aria-hidden="true">' +
          lessons.map(function (l, i) {
            return '<li class="hc-carousel__dot" data-dot' +
              (i === index ? ' data-on="true"' : '') + '></li>';
          }).join('') +
        '</ol>'
      : '';

    var arrows = many
      ? '<button type="button" class="hc-worship__arrow hc-worship__arrow--prev" ' +
            'data-action="homekids-week" data-step="-1" data-week-prev' +
            (index <= 0 ? ' disabled' : '') +
            ' aria-label="A more recent Sunday">' + c.icon('chevronLeft') + '</button>' +
        '<button type="button" class="hc-worship__arrow hc-worship__arrow--next" ' +
            'data-action="homekids-week" data-step="1" data-week-next' +
            (index >= lessons.length - 1 ? ' disabled' : '') +
            ' aria-label="An earlier Sunday">' + c.icon('chevronRight') + '</button>'
      : '';

    return '' +
      '<div class="hc-worship__head hc-kids-week">' +
        arrows +
        '<div class="hc-carousel hc-worship__carousel">' +
          '<div class="hc-carousel__viewport" data-carousel data-kids-rail>' +
            '<ul class="hc-carousel__track" role="list">' +
              lessons.map(weekSlide).join('') +
            '</ul>' +
          '</div>' +
          dots +
        '</div>' +
      '</div>';
  }

  function paintArrows(wrap, index, count) {
    var prev = wrap.querySelector('[data-week-prev]');
    var next = wrap.querySelector('[data-week-next]');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= count - 1;
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
    if (done >= total) return 'All ' + total + ' done this week. Great job.';
    if (!done) return total + ' to do this week.';
    return done + ' of ' + total + ' done. Keep going.';
  }

  /* Ticks save the moment they are tapped (js/store.js), so there is no
     Save button to forget. This line is the reassurance one would have
     given, and it only appears once there is something to have saved. */
  function savedLine(done) {
    return '<p class="hc-caption hc-kids-saved" data-kids-saved' + (done ? '' : ' hidden') + '>' +
      c.icon('check', 'hc-kids-saved__icon') + '<span>' + c.esc(SAVED_LINE) + '</span>' +
    '</p>';
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
        savedLine(done) +
        c.button('Monthly report', { action: 'homekids-report', className: 'hc-kids-show' }) +
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

  /* The first For parents, straight under the big idea and ahead of the
     story: what the kids learned on Sunday, so the grown up holding the phone
     knows what this week is for before reading it aloud. The second, at the
     end, closes the guide with what to ask at bedtime. Gemini writes both. */
  function parentSummary(lesson) {
    if (!lesson.parentSummary) return '';
    return '<section class="hc-kids-section">' +
      c.sectionHeader('What we learned', 'For parents',
        { eyebrowSlot: 'homekids.summary-eyebrow' }) +
      '<p class="hc-body-serif hc-kids-parent-note">' + c.esc(lesson.parentSummary) + '</p>' +
    '</section>';
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

  /* Everything below the rail that belongs to one Sunday. Its own function
     because a swipe redraws exactly this and nothing above it. */
  function lessonBody(lesson, chosen) {
    var html = '';
    if (lesson) {
      html += bigIdea(lesson);
      html += parentSummary(lesson);
      html += story(lesson);
      html += memoryVerse(lesson);
      html += '<section class="hc-kids-section" data-kids-group-block>' +
        groupBlock(lesson, chosen) + '</section>';
      html += prayer(lesson);
      html += checklist(lesson);
    }
    return html + forParents(lesson);
  }

  function render(route) {
    var lessons = HC.data.homekidsLessonsByDate();
    var lesson = lessonFor(route, lessons);
    var chosen = HC.store.kidsGroup();
    var index = lesson ? Math.max(lessons.indexOf(lesson), 0) : 0;

    var html = '<div class="hc-screen hc-kids"' +
      (lesson
        ? ' data-kids-lesson="' + c.esc(lesson.id) + '" data-index="' + index + '"' +
          ' data-lesson-ids="' + c.esc(lessons.map(function (l) { return l.id; }).join(',')) + '"'
        : '') + '>';

    html += c.sectionHeader('For kids and families', 'HomeKids',
      { flush: true, tag: 'h1', eyebrowSlot: 'homekids.eyebrow' });

    html += groupPicker(chosen);

    if (!lesson) {
      var empty = HC.data.copy('homekids.empty', NO_LESSON_YET);
      html += HC.edit.wrap(empty ? c.emptyState(empty, 'kids') : '',
        { slot: 'homekids.empty', value: empty,
          label: 'what HomeKids says before the first lesson is up' });
    } else {
      html += weekRail(lessons, index);
    }

    html += '<div data-kids-body>' + lessonBody(lesson, chosen) + '</div>';
    html += forVolunteers();

    html += '</div>';
    var el = c.el(html);
    restoreRail(el);
    return el;
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
    var saved = screen && screen.querySelector('[data-kids-saved]');
    if (saved) saved.hidden = !done;
    var reward = screen && screen.querySelector('[data-kids-reward]');
    if (reward) {
      if (done >= ids.length) reward.setAttribute('data-done', 'true');
      else reward.removeAttribute('data-done');
    }
    return on;
  }

  /* Told by js/app.js when the week rail settles on a slide, the way
     selectWeek is on Worship. Redraws the lesson under the rail and moves the
     address to that Sunday without rebuilding the screen, so the rail is not
     pulled out from under the thumb that is still on it. Does nothing on the
     frames where the slide has not actually changed, which is nearly all of
     them. */
  function selectLesson(rail, index) {
    var wrap = rail.closest ? rail.closest('.hc-kids') : null;
    if (!wrap || String(index) === wrap.getAttribute('data-index')) return;

    var ids = (wrap.getAttribute('data-lesson-ids') || '').split(',');
    var lesson = HC.data.getHomekidsLesson(ids[index]);
    if (!lesson) return;

    wrap.setAttribute('data-index', String(index));
    wrap.setAttribute('data-kids-lesson', lesson.id);
    var body = wrap.querySelector('[data-kids-body]');
    if (body) body.innerHTML = lessonBody(lesson, HC.store.kidsGroup());
    paintArrows(wrap, index, ids.length);
    if (HC.router.replaceCurrent) HC.router.replaceCurrent({ name: 'homekids', id: lesson.id });
  }

  /* Puts the rail on the lesson the route asked for. After the frame,
     because a scroller that is not yet on the page has no width to measure,
     and instantly, because this is where the screen opens and not a move.
     Measured against the track for the reason restoreRails gives on Group. */
  function restoreRail(root) {
    var rail = root.querySelector && root.querySelector('[data-kids-rail]');
    if (!rail || !window.requestAnimationFrame) return;
    window.requestAnimationFrame(function () {
      var at = parseInt(root.getAttribute('data-index'), 10) || 0;
      var track = rail.firstElementChild;
      var slide = track && track.children[at];
      if (!slide) return;
      rail.style.scrollBehavior = 'auto';
      rail.scrollLeft = slide.offsetLeft - track.offsetLeft;
      rail.style.scrollBehavior = '';
    });
  }

  /* Slides the rail to a lesson, as if a thumb had. The scroll it causes is
     what tells selectLesson, exactly as with the arrows. */
  function railTo(id) {
    var wrap = document.querySelector('.hc-kids[data-lesson-ids]');
    var rail = wrap && wrap.querySelector('[data-kids-rail]');
    var track = rail && rail.firstElementChild;
    if (!track) return;
    var ids = (wrap.getAttribute('data-lesson-ids') || '').split(',');
    var slide = track.children[ids.indexOf(id)];
    if (!slide) return;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: still ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------- the calendar

     A tap on the week header lifts a month calendar with every Sunday that
     has a lesson marked, so a family looking for the one from a month ago
     picks it out by date rather than swiping through every week between.
     The month grid is the Cal tab's, class for class, so it reads as the
     same calendar. */
  var calMonth = null;   // { year, month } the sheet is showing

  function isoOf(year, month, day) {
    return year + '-' + (month < 9 ? '0' : '') + (month + 1) + '-' + (day < 10 ? '0' : '') + day;
  }

  function monthKey(year, month) { return year * 12 + month; }

  function monthOfIso(iso) {
    return { year: parseInt(iso.slice(0, 4), 10), month: parseInt(iso.slice(5, 7), 10) - 1 };
  }

  function matrix(year, month) {
    var cal = HC.screens.calHelpers;
    if (cal && cal.monthMatrix) return cal.monthMatrix(year, month);
    var lead = new Date(year, month, 1).getDay();
    var days = new Date(year, month + 1, 0).getDate();
    var cells = [], i, weeks = [];
    for (i = 0; i < lead; i++) cells.push(0);
    for (i = 1; i <= days; i++) cells.push(i);
    while (cells.length % 7) cells.push(0);
    for (i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  function calendarBody(showingId) {
    var lessons = HC.data.homekidsLessonsByDate();
    var byDay = {};
    lessons.forEach(function (l) { byDay[l.taughtOn] = l; });
    var newest = monthOfIso(lessons[0].taughtOn);
    var oldest = monthOfIso(lessons[lessons.length - 1].taughtOn);
    var here = monthKey(calMonth.year, calMonth.month);
    var today = isoOf(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    var label = c.monthNames[calMonth.month] + ' ' + calMonth.year;

    var html = '' +
      '<div class="hc-cal__head hc-kids-cal__head">' +
        '<div class="hc-cal__stepper">' +
          '<button type="button" class="hc-cal__step" data-action="homekids-cal-step" ' +
            'data-step="-1" aria-label="The month before"' +
            (here <= monthKey(oldest.year, oldest.month) ? ' disabled' : '') + '>' +
            c.icon('chevronLeft', 'hc-cal__step-icon') + '</button>' +
          '<span class="hc-cal__stepper-label hc-kids-cal__label">' + c.esc(label) + '</span>' +
          '<button type="button" class="hc-cal__step" data-action="homekids-cal-step" ' +
            'data-step="1" aria-label="The month after"' +
            (here >= monthKey(newest.year, newest.month) ? ' disabled' : '') + '>' +
            c.icon('chevronRight', 'hc-cal__step-icon') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="hc-cal__grid" role="grid" aria-label="' + c.esc(label) + '">' +
        '<div class="hc-cal__row hc-cal__row--head" role="row">' +
          c.dayNames.map(function (name) {
            return '<span class="hc-cal__dow" role="columnheader" aria-label="' + c.esc(name) + '">' +
              c.esc(name.slice(0, 1)) + '</span>';
          }).join('') +
        '</div>';

    matrix(calMonth.year, calMonth.month).forEach(function (week) {
      html += '<div class="hc-cal__row" role="row">';
      week.forEach(function (day) {
        if (!day) { html += '<span class="hc-cal__cell" role="gridcell"></span>'; return; }
        var iso = isoOf(calMonth.year, calMonth.month, day);
        var lesson = byDay[iso];
        var open = lesson && lesson.id === showingId;
        var classes = 'hc-cal__day' + (lesson ? ' hc-cal__day--has' : '') +
          (iso === today ? ' hc-cal__day--today' : '') + (open ? ' hc-cal__day--open' : '');
        html += '<span class="hc-cal__cell" role="gridcell">';
        if (lesson) {
          html += '<button type="button" class="' + classes + '" data-action="homekids-cal-pick" ' +
            'data-id="' + c.esc(lesson.id) + '" aria-pressed="' + (open ? 'true' : 'false') + '" ' +
            'aria-label="' + c.esc(c.formatDate(iso) + ', ' + lesson.title) + '">' +
            '<span class="hc-cal__day-num">' + day + '</span>' +
            '<span class="hc-cal__dot" aria-hidden="true"></span>' +
          '</button>';
        } else {
          html += '<span class="' + classes + '"><span class="hc-cal__day-num">' + day + '</span></span>';
        }
        html += '</span>';
      });
      html += '</div>';
    });

    return html + '</div>' +
      '<p class="hc-caption hc-sheet__note">Each marked Sunday has a HomeKids lesson. Tap one to open it.</p>';
  }

  function showingLessonId() {
    var wrap = document.querySelector('.hc-kids[data-kids-lesson]');
    return wrap ? wrap.getAttribute('data-kids-lesson') : null;
  }

  function openCalendar() {
    var lessons = HC.data.homekidsLessonsByDate();
    if (!lessons.length) return;
    hideCalendar();
    var id = showingLessonId();
    var showing = HC.data.getHomekidsLesson(id) || lessons[0];
    calMonth = monthOfIso(showing.taughtOn);

    var layer = c.el('' +
      '<div class="hc-sheet hc-kids-cal" data-sheet="homekids-cal" data-kids-cal role="dialog" ' +
          'aria-modal="true" aria-label="Pick a Sunday">' +
        '<button type="button" class="hc-sheet__scrim" data-action="homekids-cal-close" ' +
          'tabindex="-1" aria-hidden="true"></button>' +
        '<div class="hc-sheet__panel">' +
          '<div class="hc-sheet__head">' +
            '<p class="hc-eyebrow">Pick a Sunday</p>' +
            '<button type="button" class="hc-sheet__close" data-action="homekids-cal-close" ' +
              'aria-label="Close">' + c.icon('close') + '</button>' +
          '</div>' +
          '<div data-kids-cal-body>' + calendarBody(showing.id) + '</div>' +
        '</div>' +
      '</div>');
    (document.getElementById('app') || document.body).appendChild(layer);
  }

  function stepCalendar(el) {
    var body = document.querySelector('[data-kids-cal-body]');
    if (!body || !calMonth) return;
    var to = monthKey(calMonth.year, calMonth.month) + (parseInt(el.getAttribute('data-step'), 10) || 0);
    calMonth = { year: Math.floor(to / 12), month: to % 12 };
    body.innerHTML = calendarBody(showingLessonId());
    var sheet = document.querySelector('[data-kids-cal]');
    if (sheet) sheet.setAttribute('data-settled', 'true');   // no second slide-in
  }

  function pickFromCalendar(el) {
    hideCalendar();
    railTo(el.getAttribute('data-id'));
  }

  function hideCalendar() {
    var open = document.querySelector('[data-kids-cal]');
    if (open && open.parentNode) open.parentNode.removeChild(open);
  }

  /* ------------------------------------------------------ the monthly report

     The card a family holds up on the last Sunday of the month. Drawn over
     everything, with every week's ticks large, the lessons they belong to,
     and whose month it is. Built and appended here rather than routed to,
     because it is a moment and not a place: there is nothing to come back
     to, and the back gesture should still mean the screen underneath.

     Which weeks make a month is HC.data's call (homekidsMonthLessons): a
     week belongs to the month of the Sunday it ends on, so the report shown
     on the last Sunday holds only weeks that are already over. The arrows
     step through every month that has a week in it. */
  function monthLabel(month) {
    var p = month.split('-');
    return c.monthNames[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function weekTally(lesson) {
    var ids = lesson.checklist.map(function (i) { return i.id; });
    return { done: HC.store.kidsCheckedCount(lesson.id, ids), total: ids.length };
  }

  /* Everything the PDF needs, gathered from the phone here so js/print-pdf.js
     never reads storage. */
  function reportData(month) {
    var lessons = HC.data.homekidsMonthLessons(month);
    return {
      month: month,
      monthLabel: monthLabel(month),
      name: HC.store.kidsName(),
      group: HC.data.getHomekidsGroup(HC.store.kidsGroup()),
      groups: HC.data.homekidsGroups || [],
      weeks: lessons.map(function (lesson) {
        var checked = {};
        lesson.checklist.forEach(function (i) {
          if (HC.store.isKidsChecked(lesson.id, i.id)) checked[i.id] = true;
        });
        return { lesson: lesson, checked: checked };
      })
    };
  }

  function reportWeek(lesson) {
    var t = weekTally(lesson);
    return '' +
      '<section class="hc-kids-report__week"' +
          (t.total && t.done >= t.total ? ' data-done="true"' : '') + '>' +
        '<p class="hc-eyebrow hc-kids-report__when">Week of ' +
          c.esc(c.formatDate(lesson.taughtOn)) + '</p>' +
        '<h3 class="hc-kids-report__lesson">' + c.esc(lesson.title) + '</h3>' +
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
        '<p class="hc-caption hc-kids-report__tally">' + t.done + ' of ' + t.total + ' done</p>' +
      '</section>';
  }

  function reportCard(month) {
    var months = HC.data.homekidsReportMonths();
    var at = months.indexOf(month);
    var lessons = HC.data.homekidsMonthLessons(month);

    var done = 0, total = 0, full = 0;
    lessons.forEach(function (l) {
      var t = weekTally(l);
      done += t.done;
      total += t.total;
      if (t.total && t.done >= t.total) full++;
    });
    var all = total > 0 && done >= total;
    var label = monthLabel(month);

    return '' +
      '<div class="hc-kids-teacher__card"' + (all ? ' data-done="true"' : '') + '>' +
        '<button type="button" class="hc-kids-teacher__close" data-action="homekids-hide" ' +
          'aria-label="Close">' + c.icon('close') + '</button>' +
        '<p class="hc-eyebrow hc-kids-teacher__eyebrow">HomeKids · Monthly report</p>' +
        '<div class="hc-kids-report__month">' +
          '<button type="button" class="hc-cal__step" data-action="homekids-report-step" ' +
            'data-step="1" aria-label="The month before"' +
            (at < 0 || at >= months.length - 1 ? ' disabled' : '') + '>' +
            c.icon('chevronLeft', 'hc-cal__step-icon') + '</button>' +
          '<h2 class="hc-kids-teacher__title">' + c.esc(label) + '</h2>' +
          '<button type="button" class="hc-cal__step" data-action="homekids-report-step" ' +
            'data-step="-1" aria-label="The month after"' + (at <= 0 ? ' disabled' : '') + '>' +
            c.icon('chevronRight', 'hc-cal__step-icon') + '</button>' +
        '</div>' +
        '<label class="hc-kids-teacher__name">' +
          '<span class="hc-caption">Whose report is this?</span>' +
          '<input class="hc-input" type="text" data-homekids-name autocomplete="off" ' +
            'placeholder="Your name" value="' + c.esc(HC.store.kidsName()) + '">' +
        '</label>' +
        lessons.map(reportWeek).join('') +
        '<p class="hc-kids-teacher__count">' + done + ' of ' + total + '</p>' +
        '<p class="hc-caption hc-kids-teacher__foot">' +
          c.esc(all
            ? 'Every box, every week. Time for the prize box.'
            : full + ' of ' + lessons.length + (lessons.length === 1 ? ' week' : ' weeks') +
              ' with every box ticked. Nice work this month.') +
        '</p>' +
        c.button('Download as PDF', { action: 'homekids-report-pdf', id: month,
          variant: 'secondary', className: 'hc-kids-report__pdf' }) +
      '</div>';
  }

  function showReport(month) {
    month = month || HC.data.homekidsReportMonth();
    if (!month) return;
    hideTeacher();

    var layer = c.el('' +
      '<div class="hc-kids-teacher" role="dialog" aria-modal="true" ' +
          'aria-label="Monthly report" data-kids-teacher data-month="' + c.esc(month) + '">' +
        reportCard(month) +
      '</div>');
    document.body.appendChild(layer);
    var close = layer.querySelector('.hc-kids-teacher__close');
    if (close) close.focus({ preventScroll: true });
  }

  // The arrows: +1 is an older month, because the list is newest first.
  function stepReport(el) {
    var layer = document.querySelector('[data-kids-teacher]');
    if (!layer) return;
    var months = HC.data.homekidsReportMonths();
    var at = months.indexOf(layer.getAttribute('data-month')) +
      (parseInt(el.getAttribute('data-step'), 10) || 0);
    if (at < 0 || at >= months.length) return;
    layer.setAttribute('data-month', months[at]);
    layer.innerHTML = reportCard(months[at]);
    var step = layer.querySelector('[data-action="homekids-report-step"][data-step="' +
      el.getAttribute('data-step') + '"]');
    if (step && !step.disabled) step.focus({ preventScroll: true });
  }

  function hideTeacher() {
    var open = document.querySelector('[data-kids-teacher]');
    if (open && open.parentNode) open.parentNode.removeChild(open);
  }

  // Leaving the screen, or Escape, puts the card away.
  if (HC.store && HC.store.on) {
    HC.store.on('view', hideTeacher);
    HC.store.on('view', hideCalendar);
  }
  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') { hideTeacher(); hideCalendar(); }
    // The week slide is a div with role="button", so it answers the keys a
    // button would.
    var t = evt.target;
    if ((evt.key === 'Enter' || evt.key === ' ') && t && t.classList &&
        t.classList.contains('hc-kids-week__open')) {
      evt.preventDefault();
      openCalendar();
    }
  });

  HC.screens = HC.screens || {};
  HC.screens.homekids = render;
  HC.screens.homekidsHelpers = {
    pickGroup: pickGroup,
    toggle: toggle,
    selectLesson: selectLesson,
    openCalendar: openCalendar,
    stepCalendar: stepCalendar,
    pickFromCalendar: pickFromCalendar,
    hideCalendar: hideCalendar,
    showReport: showReport,
    stepReport: stepReport,
    reportData: reportData,
    hideTeacher: hideTeacher,
    progressText: progressText
  };

})(window.HC = window.HC || {});
