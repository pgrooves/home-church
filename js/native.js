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

  function restHeaders(extra) {
    var cfg = HC.config || {};
    return Object.assign({
      'Content-Type': 'application/json',
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY
    }, extra || {});
  }

  /* WHY THE SWITCHES LIVE ON THE SERVER NOW, reversing what migration 0010
     said. That comment argued the three preferences belonged on the phone
     because the church only needs to know which phones want anything at all,
     and that per-topic filtering could happen "on the sending side".

     The sending side is the server. A push is composed and addressed before
     the phone is involved, so a phone that wants the guide notice but not the
     Sunday reminder cannot drop one on arrival: iOS has already drawn it on
     the lock screen before any of our code runs. Either the server knows, or
     two of the three switches are decorative. Migration 0012 adds the columns
     and explains the privacy trade in full. */
  function prefsBody() {
    var prefs = (HC.store.getProfile().notifications) || {};
    return {
      active: true,
      wants_new_guide: !!prefs.newGuide,
      wants_sunday_reminder: !!prefs.sundayReminder,
      wants_group_day: !!prefs.groupWeek
    };
  }

  function saveToken(token) {
    if (!token) return Promise.resolve(false);

    var cfg = HC.config || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return Promise.resolve(false);

    /* This used to return early when the token matched the stored one, which
       looked like a sensible optimisation and quietly broke two things. A
       preference changed after the first registration never reached the
       server, and `active` was left false forever after somebody switched
       everything off and later changed their mind, because the upsert only
       updates the columns it actually sends. Re-registering on every launch
       costs one request and repairs both. */
    var row = Object.assign({ token: token, platform: 'ios' }, prefsBody());

    return fetch(cfg.SUPABASE_URL + '/rest/v1/device_tokens', {
      method: 'POST',
      headers: restHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row)
    }).then(function (res) {
      if (!res.ok) return false;
      HC.store.storage.set(TOKEN_KEY, token);
      return true;
    }).catch(function () {
      return false;   // offline. The switch stays on and this retries next launch.
    });
  }

  /* A switch moved and the phone is already registered, so this is an update
     rather than another registration. Silent by design: somebody flipping a
     switch does not need a receipt, and a failure here is repaired by the
     re-register on next launch. */
  function syncPreferences() {
    var token = HC.store.storage.get(TOKEN_KEY, null);
    var cfg = HC.config || {};
    if (!token || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return Promise.resolve(false);

    return fetch(cfg.SUPABASE_URL + '/rest/v1/device_tokens?token=eq.' +
                 encodeURIComponent(token), {
      method: 'PATCH',
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(prefsBody())
    }).then(function (res) {
      return res.ok;
    }).catch(function () {
      return false;
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
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        active: false,
        wants_new_guide: false,
        wants_sunday_reminder: false,
        wants_group_day: false
      })
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

  /* ------------------------------------------------------------- biometry

     Face ID, or Touch ID, or the passcode, in front of the Journal.

     WHAT THIS IS AND IS NOT, because the difference matters and the screen
     that turns it on says the same thing. This puts the phone's own check in
     front of a screen. It is not encryption. The entries are still in
     localStorage, still on the church's server if somebody is signed in, and
     still readable by anybody who can open a web inspector on an unlocked
     phone. What it stops is the ordinary thing it is for: somebody picking up
     your phone while it is unlocked and reading your journal.

     Encrypting it properly is the same dead end as in
     supabase/migrations/0023_journal.sql. Sign in is a one time code, so
     there is no password to derive a key from, and a key held only by the
     phone makes the sync decorative.

     THE PLUGIN IS OPTIONAL. Everything else in this file degrades to a
     quieter version of the same idea in a browser. This one cannot: there is
     no browser equivalent of Face ID, and the WebAuthn dance is a different
     feature wearing the same word. So available() answers false everywhere
     except a native build with the plugin installed, and Profile does not
     draw a switch that cannot do anything. A switch that stays on while
     nothing happens is the same lie as the notification switches above.

     The plugin is @aparajita/capacitor-biometric-auth, reached by name off
     the Plugins global like every other one. If it is not installed, this is
     simply a feature the build does not have.

     THE NAME ON THE GLOBAL IS NOT THE NAME ON THE PACKAGE. It calls
     registerPlugin('BiometricAuthNative') and exports that proxy as
     `BiometricAuth`, so the import name and the runtime name differ. Reaching
     for the wrong one does not throw; it returns undefined, canLock() answers
     false forever, and the switch never appears on a phone that could have
     had it. That is a silent nothing rather than an error, which is the worst
     shape a bug can take, so both names are tried and the real one is first.
     ------------------------------------------------------------------- */

  function biometrics() {
    var p = plugins();
    if (!p) return null;
    return p.BiometricAuthNative || p.BiometricAuth || null;
  }

  /* Resolves true only when this phone can actually challenge somebody.
     Deliberately generous about which kind: Face ID, Touch ID, and the plain
     device passcode are all fine here. The point is that the phone asks. */
  function canLock() {
    if (!isNative()) return Promise.resolve(false);
    var b = biometrics();
    if (!b || !b.checkBiometry) return Promise.resolve(false);

    return b.checkBiometry().then(function (info) {
      return !!(info && (info.isAvailable || info.strongBiometryIsAvailable));
    }).catch(function () { return false; });
  }

  /* Resolves true when the person proved they are the person. A refusal and a
     failure both resolve false rather than rejecting: to the screen waiting
     on this they are the same answer, which is "not now", and every caller
     would otherwise need the same catch.

     allowDeviceCredential means a phone whose owner has Face ID switched off,
     or a face the sensor cannot read today, can still get in with the
     passcode. Without it the feature locks people out of their own writing,
     which is a worse failure than not having it. */
  function unlock(reason) {
    var b = biometrics();
    if (!b || !b.authenticate) return Promise.resolve(false);

    return b.authenticate({
      reason: reason || 'Open your journal',
      cancelTitle: 'Not now',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Use passcode'
    }).then(function () { return true; })
      .catch(function () { return false; });
  }

  HC.native = {
    isNative: isNative,
    tap: tap,
    canLock: canLock,
    unlock: unlock,
    shareText: shareText,
    shareFile: shareFile,
    downloadInBrowser: downloadInBrowser,
    buildIcs: buildIcs,
    addToCalendar: addToCalendar,
    enableNotifications: enableNotifications,
    disableNotifications: disableNotifications,
    syncPreferences: syncPreferences,
    resumeNotifications: resumeNotifications
  };

})(window.HC = window.HC || {});
