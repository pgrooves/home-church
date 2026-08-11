/* ==========================================================================
   Home Church, native capability

   One place where the app asks the phone to do something a web page cannot,
   and one place where it decides what to do when the phone is actually a
   browser. Every function here works in both, with the browser path being a
   quieter version of the same idea rather than an error.

   WHY THIS FILE EXISTS AT ALL, beyond the obvious. App Review guideline 4.2
   asks whether an app is more than a repackaged website. This app has a real
   answer, the guide reader is stateful and offline and purpose built, but a
   reviewer sees the answer only if the app behaves like an app: a system
   share sheet, a calendar entry, a notification, a small haptic tick when
   something is confirmed. Those are cheap individually and together they are
   the difference between passing 4.2 and arguing about it.

   Every Capacitor plugin is reached through window.Capacitor.Plugins rather
   than an import, because this project loads classic scripts and has no
   bundler. Capacitor puts its plugins on that global at runtime, so the same
   file runs unmodified in a browser, where the global is simply absent.
   ========================================================================== */

(function (HC) {
  'use strict';

  function plugins() {
    return (window.Capacitor && window.Capacitor.Plugins) || null;
  }

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
              window.Capacitor.isNativePlatform());
  }

  /* ------------------------------------------------------------- haptics
     Deliberately small. A tick when a leader checks a question off in front
     of a group, and nothing else. Haptics used for decoration stop meaning
     anything, and this app has exactly two moments worth confirming.
     ------------------------------------------------------------------- */

  function tap(style) {
    var p = plugins();
    if (!p || !p.Haptics) return;
    try {
      p.Haptics.impact({ style: style || 'Light' });
    } catch (err) { /* a phone without a taptic engine, or an older iOS */ }
  }

  /* --------------------------------------------------------------- share
     Text first, because that is what a one-liner quote card is. The chain is
     the native sheet, then the web Share API, then the clipboard, then an
     honest apology. Each step is a real degradation rather than a failure.
     ------------------------------------------------------------------- */

  function shareText(text, title) {
    var p = plugins();

    if (p && p.Share) {
      return p.Share.share({ text: text, title: title || 'Home Church' })
        .then(function () { return true; })
        .catch(function () { return false; });   // dismissed is not an error
    }

    if (navigator.share) {
      return navigator.share({ text: text, title: title || 'Home Church' })
        .then(function () { return true; })
        .catch(function () { return false; });
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        HC.components.toast('Copied. Go put it somewhere good.');
        return true;
      }, function () {
        HC.components.toast('Your browser would not let us copy that one.');
        return false;
      });
    }

    HC.components.toast('Sharing needs a newer browser, sorry.');
    return Promise.resolve(false);
  }

  /* Writes a file into the app's own cache directory and hands it to the
     share sheet. The cache directory is the right home for these: iOS is
     free to reclaim it, and neither a calendar invitation nor a printed
     guide is something the app needs to keep once it has been handed over.

     Returns false rather than throwing when there is no filesystem, so the
     caller can fall back to something that does work in a browser. */
  function shareFile(name, contents, mimeType, dialogTitle) {
    var p = plugins();
    if (!p || !p.Filesystem || !p.Share) return Promise.resolve(false);

    return p.Filesystem.writeFile({
      path: name,
      data: contents,
      directory: 'CACHE',
      encoding: 'utf8'
    }).then(function (written) {
      return p.Share.share({
        title: dialogTitle || name,
        url: written.uri,
        dialogTitle: dialogTitle || name
      });
    }).then(function () {
      return true;
    }).catch(function () {
      return false;
    });
  }

  /* Browsers get a Blob and a synthetic download instead. Same file, same
     name, different road. */
  function downloadInBrowser(name, contents, mimeType) {
    try {
      var blob = new Blob([contents], { type: mimeType });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking immediately can cancel the download in some browsers.
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ------------------------------------------------------------ calendar
     An .ics file through the share sheet, where iOS offers Add to Calendar.
     No calendar permission is requested and none is needed, because the app
     never reads or writes the calendar itself, it hands over a file and the
     person decides. That is the smaller ask and it is also the one that does
     not need a usage string in Info.plist.
     ------------------------------------------------------------------- */

  // 'YYYYMMDDTHHMMSSZ', which is what an .ics wants.
  function icsStamp(date) {
    function two(n) { return n < 10 ? '0' + n : String(n); }
    return date.getUTCFullYear() +
      two(date.getUTCMonth() + 1) +
      two(date.getUTCDate()) + 'T' +
      two(date.getUTCHours()) +
      two(date.getUTCMinutes()) +
      two(date.getUTCSeconds()) + 'Z';
  }

  // Commas, semicolons, and backslashes are structural in an .ics, and a
  // newline has to be escaped rather than sent. An event blurb containing a
  // comma is not unusual, so this is not theoretical.
  function icsEscape(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function buildIcs(event) {
    var start = event.start instanceof Date ? event.start : new Date(event.start);
    var end = event.end instanceof Date ? event.end
      : (event.end ? new Date(event.end) : new Date(start.getTime() + 60 * 60 * 1000));

    var uid = 'hc-' + start.getTime() + '@homechurchnola.com';

    // CRLF between lines, not LF. The spec says so and some calendar clients
    // are strict about it.
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Home Church//App//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + icsStamp(new Date()),
      'DTSTART:' + icsStamp(start),
      'DTEND:' + icsStamp(end),
      'SUMMARY:' + icsEscape(event.title),
      'DESCRIPTION:' + icsEscape(event.description),
      'LOCATION:' + icsEscape(event.location),
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  function addToCalendar(event) {
    var ics = buildIcs(event);
    var name = (event.title || 'event').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.ics';

    return shareFile(name, ics, 'text/calendar', event.title).then(function (ok) {
      if (ok) return true;
      return downloadInBrowser(name, ics, 'text/calendar');
    });
  }

  /* ------------------------------------------------------- notifications
     Asked for at the moment somebody turns the switch on in Profile, never
     at launch. A permission prompt on first open, before anybody knows what
     the app is, is how an app gets a no forever.

     Version 1 has no accounts, so the token is stored on its own with no
     name attached to it. That is the whole reason push survived the decision
     to switch accounts off: a device token is not a person.
     ------------------------------------------------------------------- */

  var TOKEN_KEY = 'pushToken';

  function saveToken(token) {
    if (!token) return Promise.resolve(false);

    // Same token as last time means the church already has it.
    if (HC.store.storage.get(TOKEN_KEY, null) === token) return Promise.resolve(true);

    var cfg = HC.config || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return Promise.resolve(false);

    return fetch(cfg.SUPABASE_URL + '/rest/v1/device_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ token: token, platform: 'ios' })
    }).then(function (res) {
      if (!res.ok) return false;
      HC.store.storage.set(TOKEN_KEY, token);
      return true;
    }).catch(function () {
      return false;   // offline. The switch stays on and this retries next launch.
    });
  }

  var listening = false;

  function listen(p) {
    if (listening) return;
    listening = true;
    p.PushNotifications.addListener('registration', function (t) {
      saveToken(t && t.value);
    });
    p.PushNotifications.addListener('registrationError', function () {
      // Nothing useful to tell a person here. The switch reflects their
      // intent, and registration retries on the next launch.
    });
  }

  /* Resolves to true only when permission was actually granted, so the
     caller can put the switch back if somebody says no. */
  function enableNotifications() {
    var p = plugins();
    if (!p || !p.PushNotifications) return Promise.resolve(false);

    listen(p);

    return p.PushNotifications.requestPermissions().then(function (result) {
      if (!result || result.receive !== 'granted') return false;
      return p.PushNotifications.register().then(function () { return true; });
    }).catch(function () {
      return false;
    });
  }

  /* Turning the switch off removes the token, so the church stops sending to
     this phone. It does not revoke the iOS permission, which only Settings
     can do, and the app should not pretend otherwise. */
  function disableNotifications() {
    var token = HC.store.storage.get(TOKEN_KEY, null);
    HC.store.storage.remove(TOKEN_KEY);

    var cfg = HC.config || {};
    if (!token || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return Promise.resolve(true);

    return fetch(cfg.SUPABASE_URL + '/rest/v1/device_tokens?token=eq.' +
                 encodeURIComponent(token), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ active: false })
    }).then(function () { return true; }).catch(function () { return true; });
  }

  /* Re-registers on launch when the switch is already on, because an APNs
     token is not permanent. It changes on restore from backup, and sometimes
     on reinstall, and a church sending to a stale token gets silence rather
     than an error. */
  function resumeNotifications() {
    if (!isNative()) return;
    var prefs = HC.store.getProfile().notifications || {};
    if (!prefs.newGuide && !prefs.sundayReminder && !prefs.groupWeek) return;
    enableNotifications();
  }

  HC.native = {
    isNative: isNative,
    tap: tap,
    shareText: shareText,
    shareFile: shareFile,
    downloadInBrowser: downloadInBrowser,
    buildIcs: buildIcs,
    addToCalendar: addToCalendar,
    enableNotifications: enableNotifications,
    disableNotifications: disableNotifications,
    resumeNotifications: resumeNotifications
  };

})(window.HC = window.HC || {});
