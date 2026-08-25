/* ==========================================================================
   Home Church, rich text
   The allowlist, the sanitizer, and the plain text mirror. One copy of them,
   for the two features in this app that keep markup somebody typed.

   WHY THIS FILE EXISTS. Everything else in this app renders strings it built
   itself and escapes every value through c.esc(). Two things do not: a journal
   entry, which has kept its own bodyHtml since the Journal shipped, and now an
   announcement, which an admin writes in the same editor and which is read by
   the whole church. That is two doors markup can come through, and a sanitizer
   with two copies is a sanitizer that gets fixed once.

   So the code below is the code that used to sit in js/journal.js, moved here
   whole and given one parameter. js/journal.js still exports sanitize() and
   plainText() and still means exactly what it meant; it delegates.

   THE ONE PARAMETER IS THE LINK POLICY, and it is the only thing the two
   callers disagree about.

     'bible'   A journal entry. The only link anybody can put in one is the
               scripture button's, so the only href that survives is Bible
               Gateway's. Somebody pasting a paragraph out of an email does not
               get to smuggle a link into their own notes, which matters
               because an entry can be pushed to a group room.

     'web'     An announcement. The church is writing to the church and "here
               is where you sign up" is most of the job, so http, https,
               mailto and tel survive and nothing else does. javascript: and
               data: are not schemes this app has an opinion about; they are
               refused by not being on the list.

   EVERYTHING NOT NAMED IN ALLOWED IS UNWRAPPED: the tag goes and its text
   stays. That is deliberately not the same as dropping the element, because
   somebody who pastes a paragraph wrapped in something we do not keep should
   still have their words.

   Loaded before js/journal.js and js/editor.js, which both read it, and it
   reads nothing itself.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* b and i are mapped rather than allowed. contenteditable emits either
     depending on the browser and the day, and one representation in storage is
     worth more than being permissive about two. */
  var ALLOWED = {
    STRONG: 'strong', B: 'strong',
    EM: 'em', I: 'em',
    U: 'u', S: 's', STRIKE: 's',
    UL: 'ul', OL: 'ol', LI: 'li',
    P: 'p', BR: 'br', DIV: 'p',
    A: 'a'
  };

  var VOID = { br: true };

  var BIBLE = 'https://www.biblegateway.com/';

  /* Anchored at the start, so a scheme is a scheme and not something that
     appears later in a URL. Leading whitespace and control characters are
     stripped before this runs: `\njavascript:` is the oldest trick there is
     and a browser will happily follow it. */
  var WEB_SCHEME = /^(?:https?|mailto|tel):/i;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* An href, or '' for one that may not be kept. Returning the empty string
     rather than throwing is what makes a refused link degrade into its own
     words instead of into nothing: see the `a` branch in cleanNodes(). */
  function keptHref(href, policy) {
    var url = String(href || '').replace(/^[\s\u0000-\u001f]+/, '');
    if (!url) return '';
    if (policy === 'web') return WEB_SCHEME.test(url) ? url : '';
    // Not startsWith: this has to run in older WKWebViews too.
    return url.indexOf(BIBLE) === 0 ? url : '';
  }

  // Blocks that must never end up inside a <p>. See the note in cleanNodes().
  var BLOCK_INSIDE = /<(ul|ol|p)[\s>]/i;

  function cleanNodes(nodes, policy) {
    var out = '';
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.nodeType === 3) {          // text
        out += esc(node.nodeValue);
        return;
      }
      if (node.nodeType !== 1) return;    // comments and the rest, gone

      var tag = ALLOWED[node.tagName];
      var inner = VOID[tag] ? '' : cleanNodes(node.childNodes, policy);

      if (!tag) {
        out += inner;                     // unwrap, keep the words
        return;
      }
      if (tag === 'br') {
        out += '<br>';
        return;
      }
      if (tag === 'a') {
        var href = keptHref(node.getAttribute('href'), policy);
        out += href ? '<a href="' + esc(href) + '">' + inner + '</a>' : inner;
        return;
      }

      /* A paragraph cannot contain a list. This is not pedantry: press
         return and then the bullet button and a browser hands back
         `first line<div><ul>…</ul></div>`, div maps to p above, and what
         would be stored is `<p><ul>…</ul></p>`. Every parser that then reads
         it back closes the p before the ul and leaves a stray empty one
         after, so the markup changes shape every time it is saved and
         reloaded. Unwrap instead: the block inside already carries the
         break. */
      if (tag === 'p' && BLOCK_INSIDE.test(inner)) {
        out += inner;
        return;
      }

      out += '<' + tag + '>' + inner + '</' + tag + '>';
    });
    return out;
  }

  /* Runs on the way in, when something is saved, and again on the way out,
     before anything reaches innerHTML. Twice is not belt and braces: the copy
     in hand can have been written by an older build of this file, or by a sync
     from one, or by an admin's phone that is three releases behind, and the
     version that renders is the version that must decide what is safe.

     `opts.links` is 'bible' or 'web' and defaults to the stricter of the two.
     A caller that forgets to say gets the journal's policy, which is the right
     way round for a default: the failure is a link that lost its href, not one
     that kept an href it should not have. */
  function sanitize(html, opts) {
    if (!html) return '';
    var policy = opts && opts.links === 'web' ? 'web' : 'bible';
    try {
      var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
      return cleanNodes(doc.body.childNodes, policy).trim();
    } catch (err) {
      // No DOMParser, or something malformed enough to throw. Fall back to
      // the safest possible reading: it is all text.
      return esc(String(html).replace(/<[^>]*>/g, ''));
    }
  }

  /* The plain text mirror. The Journal's search runs on it, its export writes
     it, and it is what crosses into a group room. An announcement's mirror is
     what the push notification reads off the row and what Home prints under
     the title on a card, which is a button and can hold no link. Block tags
     become line breaks so a bulleted list does not come out as one run-on
     sentence. */
  function plainText(html) {
    if (!html) return '';
    try {
      var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
      var walk = function (nodes) {
        var out = '';
        Array.prototype.forEach.call(nodes, function (node) {
          if (node.nodeType === 3) { out += node.nodeValue; return; }
          if (node.nodeType !== 1) return;
          var tag = node.tagName;
          if (tag === 'BR') { out += '\n'; return; }
          var inner = walk(node.childNodes);
          if (tag === 'LI') out += '\n' + inner;
          else if (tag === 'P' || tag === 'DIV' || tag === 'UL' || tag === 'OL') out += '\n' + inner + '\n';
          else out += inner;
        });
        return out;
      };
      return walk(doc.body.childNodes).replace(/\n{3,}/g, '\n\n').trim();
    } catch (err) {
      return String(html).replace(/<[^>]*>/g, '').trim();
    }
  }

  // Plain text on its way to becoming markup: paragraphs, escaped. What an
  // announcement written before the editor existed is drawn through, and what
  // a highlight's quote becomes when it turns into a journal entry.
  function textToHtml(text) {
    var paras = String(text || '').split(/\n{2,}/).filter(function (p) { return p.trim(); });
    return paras.map(function (p) {
      return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  HC.richtext = {
    sanitize: sanitize,
    plainText: plainText,
    textToHtml: textToHtml,

    // For the tests, and for js/journal.js, which asserts nothing but does
    // want the same escaping its own callers had.
    esc: esc
  };

})(window.HC = window.HC || {});
