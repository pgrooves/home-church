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

      /* THE CLICK MUST NOT REACH THE DELEGATED HANDLER, and this one line is
         the difference between Add to calendar working and Add to calendar
         navigating somewhere nobody asked for.

         wireEvents() in js/app.js listens on document and intercepts every
         a[href] on the way past: it calls preventDefault() and hands the href
         to openExternal() instead, on the reasoning that the only anchors in
         this app are ones a person wrote in their own words. This anchor is
         not one of those. It is a download, and it is synthetic, and letting
         that handler have it cancels the save and then asks the browser to go
         and open a blob: URL — so the .ics never lands and the tap reads as
         the button opening some unrelated page.

         Stopped here rather than only in the handler because the anchor is
         built here and the default behaviour we want is the one it already
         has. */
      a.addEventListener('click', function (e) { e.stopPropagation(); });

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

  /* --------------------------------------------------------- reminders

     One notification, on this phone, at a time one person picked, about one
     event on the Cal tab.

     WHY THESE ARE LOCAL AND NOT PUSH, which is the whole design and the one
     thing to read before changing any of it. Everything under `notifications`
     below is the church addressing a topic: a guide is up, it is Sunday, the
     queue has something in it. The server composes it, APNs carries it, and
     every phone that asked for that topic gets the same words at the same
     moment. A reminder about the Serve Day is not that. It is one phone
     asking to be tapped on the shoulder at 6pm on the Friday, and the church
     has no business knowing that, no reason to store it, and no way to send
     it that would not mean a row per person per event and a cron job walking
     it every minute.

     So it never leaves the phone. iOS holds the notification and delivers it
     whether or not the app is running, whether or not there is a network, and
     whether or not the church's server is up. What arrives on the lock screen
     is indistinguishable from a push, which is the only part the person cares
     about. See js/reminders.js for what the app remembers about it, which is
     one line of localStorage per event — a time, the notification's id, and
     how long before the event that time was — and nothing else.

     WHY canRemind() ANSWERS FALSE IN A BROWSER, and why that is not a gap
     waiting to be filled. There is no way to hand a web page's reminder to
     the operating system: the Notification API fires while the tab is open,
     and a reminder for tomorrow evening from a tab that closed tonight is a
     button that quietly did nothing. That is the same lie as a switch with no
     permission behind it, and this file has a long note under `biometry`
     about not drawing one. So the Cal tab draws the button on a phone and
     leaves it off everywhere else.
     ------------------------------------------------------------------- */

  function localNotifications() {
    var p = plugins();
    return (p && p.LocalNotifications) || null;
  }

  /* Whether this build can actually put something on a lock screen at a time
     nobody is watching. Synchronous on purpose: the Cal tab decides whether to
     draw a button while it is drawing the event, and a promise there means a
     button that appears a frame late on every repaint. */
  function canRemind() {
    return isNative() && !!localNotifications();
  }

  /* Asked at the moment somebody sets their first reminder, which is the same
     rule the push switch keeps and for the same reason: the prompt makes sense
     when it answers a question the person just asked.

     iOS has one notification permission, not two, so a phone that already said
     yes to the church's notifications says yes here without being asked again,
     and a phone that said no to those is asked once more here — which is
     right, because "I do not want the church's Sunday reminder" and "I do not
     want the thing I just asked for" are different answers to different
     questions. */
  function askToRemind() {
    var ln = localNotifications();
    if (!ln) return Promise.resolve(false);

    var check = ln.checkPermissions ? ln.checkPermissions() : Promise.resolve(null);

    return check.then(function (state) {
      if (state && state.display === 'granted') return true;
      if (!ln.requestPermissions) return false;
      return ln.requestPermissions().then(function (result) {
        return !!(result && result.display === 'granted');
      });
    }).catch(function () {
      return false;
    });
  }

  /* Schedules one, replacing whatever was already scheduled under that id.
     iOS treats a repeat id as an update rather than a second notification,
     which is exactly what changing a reminder's time should do.

     `at` is a Date in the phone's own zone, which is the zone the person
     picked it in and the zone the event is on the calendar in. Nothing here
     converts anything: a reminder is a wall clock promise.

     Resolves false rather than throwing on every failure, because there are
     three of them — no plugin, no permission, a time already gone — and to
     the screen waiting on this they are one answer, which is "that did not
     get set". The caller says so and does not save the reminder. */
  function scheduleReminder(reminder) {
    var ln = localNotifications();
    if (!ln || !ln.schedule) return Promise.resolve(false);

    var at = reminder.at instanceof Date ? reminder.at : new Date(reminder.at);
    if (!at.getTime() || at.getTime() <= Date.now()) return Promise.resolve(false);

    return askToRemind().then(function (granted) {
      if (!granted) return false;

      return ln.schedule({
        notifications: [{
          id: reminder.id,
          title: reminder.title,
          body: reminder.body,
          schedule: { at: at },
          /* Comes back on the tap, so opening the notification can open the
             Cal tab rather than wherever the app was left. See the
             localNotificationActionPerformed listener in js/reminders.js. */
          extra: { event: reminder.eventId }
        }]
      }).then(function () { return true; });
    }).catch(function (err) {
      console.warn('reminders: iOS would not take that one.', err);
      return false;
    });
  }

  /* Takes one back off the queue. Silent and always resolves: a reminder the
     phone has already forgotten and a reminder it never had are the same
     thing to somebody who has just turned one off. */
  function cancelReminder(id) {
    var ln = localNotifications();
    if (!ln || !ln.cancel) return Promise.resolve(true);

    return ln.cancel({ notifications: [{ id: id }] })
      .then(function () { return true; }, function () { return true; });
  }

  /* Every reminder iOS is still holding, as ids. Used once, on launch, to
     re-schedule anything this phone remembers wanting that the system has
     lost — which it does on a restore from backup, and on any reinstall.
     Resolves an empty list rather than rejecting, so the caller's reconcile
     is a plain list comparison with no error branch in it. */
  function pendingReminderIds() {
    var ln = localNotifications();
    if (!ln || !ln.getPending) return Promise.resolve([]);

    return ln.getPending().then(function (result) {
      return ((result && result.notifications) || []).map(function (n) {
        return Number(n.id);
      });
    }).catch(function () {
      return [];
    });
  }

  /* Everything this phone has queued, gone. One caller: erasing the app's
     data, which cannot name the reminders it is erasing because the record of
     them is what it just deleted. Safe to be this broad, because the only
     local notifications this app ever schedules are event reminders. */
  function cancelAllReminders() {
    var ln = localNotifications();
    if (!ln || !ln.cancel) return Promise.resolve(true);

    return pendingReminderIds().then(function (ids) {
      if (!ids.length) return true;
      return ln.cancel({
        notifications: ids.map(function (id) { return { id: id }; })
      }).then(function () { return true; }, function () { return true; });
    });
  }

  /* A reminder that was tapped on the lock screen, handed to `fn` as the
     event id it was set for. Registered once, at boot, so a tap that woke the
     app lands on the Cal tab rather than on whatever screen was last open.

     Every plugin in this app is reached through this file and this listener is
     no exception, which is the only reason it is here rather than beside the
     rest of the reminder code in js/reminders.js. */
  function onReminderTapped(fn) {
    var ln = localNotifications();
    if (!ln || !ln.addListener) return;

    try {
      ln.addListener('localNotificationActionPerformed', function (action) {
        var note = action && action.notification;
        var extra = note && note.extra;
        if (extra && extra.event) fn(String(extra.event));
      });
    } catch (err) { /* an older plugin, or none */ }
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
  function registerArgs(token) {
    var prefs = (HC.store.getProfile().notifications) || {};
    return {
      p_token: token,
      p_platform: 'ios',
      p_new_guide: !!prefs.newGuide,
      p_sunday_reminder: !!prefs.sundayReminder,
      p_group_day: !!prefs.groupWeek,
      p_announcements: !!prefs.announcements
    };
  }

  /* One POST, used by both the first registration and every later change. This
     used to be two shapes, an RPC to register and a PATCH straight at the
     table to change a switch, and the PATCH never worked once.

     WHY IT NEVER WORKED, since it is the same mistake twice and worth naming
     so it is not made a third time. PostgREST turns `?token=eq.X` into a WHERE
     clause, and Postgres requires SELECT on every column a WHERE clause reads.
     0010 revoked SELECT from anon on purpose and 0037 refused to give it back,
     for the reason both files spell out: a readable token table is a
     downloadable list of every phone with this app installed. So every switch
     somebody moved came back 42501, and the `res.ok` check below turned it
     into a silent false, on a path with no error surface, for every phone,
     forever. Exactly the bug 0037 found in the registration, in the two lines
     0037's header says are fine.

     Re-registering IS the update. hc_register_device_token upserts all four
     switches and sets active, which is the whole of what a preference change
     is, so there is one door instead of two and the one that works is the one
     that is left. Migration 0043 section 3 takes the table grants away
     entirely on the strength of that. */
  function registerRequest(token) {
    var cfg = HC.config || {};
    return fetch(cfg.SUPABASE_URL + '/rest/v1/rpc/hc_register_device_token', {
      method: 'POST',
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(registerArgs(token))
    });
  }

  /* ------------------------------------------- the two admin switches

     Everything above this point is addressed to a phone. These two are
     addressed to a person: they say "the review queue has something in it",
     and the queue holds words the church has not published yet, so the only
     phones that may hear about it are the phones of people the database agrees
     are admins.

     WHICH IS WHY THEY DO NOT TRAVEL WITH THE OTHER FOUR. registerRequest()
     above carries the publishable key and no session, and a field in that
     request saying "and I am an admin" would be a field anybody could set,
     with every unpublished draft title as the prize. So these go through a
     different function, over the caller's own session, and the server writes
     auth.uid() rather than anything it was handed. Migration 0043 sections 3
     and 4 are the two halves of that.

     Silent throughout, like syncPreferences(). A phone that is offline when a
     switch moves is repaired by the re-register on next launch, and there is
     nothing to say to somebody who has just tapped a switch that already
     looks the way they tapped it. */

  function isAdminHere() {
    return !!(HC.admin && HC.admin.isAdmin());
  }

  function syncAdminPreferences(token) {
    token = token || HC.store.storage.get(TOKEN_KEY, null);
    if (!token || !isAdminHere()) return Promise.resolve(false);

    var prefs = HC.store.getProfile().notifications || {};
    return HC.auth.rpc('hc_set_admin_device_token', {
      p_token: token,
      p_announcement_review: !!prefs.announcementReview,
      p_event_review: !!prefs.eventReview
    }).then(function () {
      return true;
    }).catch(function (err) {
      /* The same reasoning as the console.error in saveToken. There is nobody
         to show this to and nothing useful to say, but a phone plugged into a
         Mac is how the one silent failure in this chain would ever be found. */
      console.warn('push: could not tell the server this is an admin phone.', err);
      return false;
    });
  }

  /* Gives this phone its anonymity back. Two callers, and both of them are a
     moment where this stops being an admin's phone: signing out, and a session
     refresh that comes back saying the church has taken the role away.

     ON SIGN OUT IT HAS TO RUN BEFORE THE SESSION GOES. The function is guarded
     by ownership rather than by hc_is_admin, so a demoted admin can still give
     up the row that names them, and that guard reads auth.uid(). Called after
     the logout it would do nothing, silently.

     The other way an admin phone stops being one is every notification going
     off, and that path does not come through here: hc_deactivate_device_token
     clears the name along with the switches, in one call, from a phone that
     may well be signed out by then. */
  function clearAdminNotifications(token) {
    token = token || HC.store.storage.get(TOKEN_KEY, null);
    if (!token || !HC.auth.isConfigured() || !HC.auth.isSignedIn()) {
      return Promise.resolve(false);
    }

    return HC.auth.rpc('hc_clear_admin_device_token', { p_token: token })
      .then(function () { return true; })
      .catch(function () { return false; });
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

    /* WHY THIS IS AN RPC AND NOT A POST TO THE TABLE, which is what it was
       until migration 0037 and is the reason nothing was ever registered.

       Posting the row with `Prefer: resolution=merge-duplicates` asks
       PostgREST for `insert ... on conflict (token) do update`, and that
       statement needs SELECT on device_tokens as well as INSERT and UPDATE,
       because Postgres has to read the conflicting row to resolve the
       conflict. Migration 0010 revoked SELECT from anon deliberately: a
       readable token table is a downloadable list of every phone with this app
       installed. So every registration came back 403 and the `if (!res.ok)`
       below turned it into a silent false, on a path with no error surface,
       for every phone, forever.

       0037 moves the upsert into a SECURITY DEFINER function that anon may
       call and nothing else. Since 0043 it is the only way in: the table has
       no grants for any client role at all. */
    return registerRequest(token).then(function (res) {
      if (!res.ok) {
        /* SAY SOMETHING. The bug 0037 fixed was invisible for exactly one
           reason: this branch returned false and told nobody, so a permission
           error that happened on every phone every time looked identical to
           being offline. There is no person to show this to, the switch is
           already on and a toast about a REST status would mean nothing to
           anybody, but there is a Web Inspector attached to a phone plugged
           into a Mac, and that is who this line is for. */
        res.text().then(function (detail) {
          console.error('push: the server refused this registration.',
                        res.status, detail);
        }, function () {
          console.error('push: the server refused this registration.', res.status);
        });
        return false;
      }
      HC.store.storage.set(TOKEN_KEY, token);
      /* Second, and only ever second. hc_set_admin_device_token updates a row
         it refuses to create, on the reasoning in 0043 section 4 that a token
         with no registration behind it is a row no phone will ever receive
         anything for. So the anonymous registration is what makes the row, and
         this says whose it is. Not waited on: the four ordinary switches are
         already saved and an admin phone that fails this step is repaired by
         the re-register on next launch. */
      syncAdminPreferences(token);
      return true;
    }).catch(function (err) {
      // Offline. The switch stays on and this retries next launch.
      console.warn('push: could not reach the server to register.', err);
      return false;
    });
  }

  /* A switch moved and the phone is already registered. Silent by design:
     somebody flipping a switch does not need a receipt, and a failure here is
     repaired by the re-register on next launch. */
  function syncPreferences() {
    var token = HC.store.storage.get(TOKEN_KEY, null);
    var cfg = HC.config || {};
    if (!token || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return Promise.resolve(false);

    /* Both halves, because Profile has one kind of switch on it as far as a
       thumb is concerned and two as far as the server is concerned. The
       registration carries the four anonymous preferences; the RPC below
       carries the two an admin has, over their own session, and does nothing
       at all on a phone that is not one. Neither waits on the other: they
       write different columns through different doors. */
    syncAdminPreferences(token);

    return registerRequest(token).then(function (res) {
      if (!res.ok) {
        res.text().then(function (detail) {
          console.error('push: the server refused this preference change.',
                        res.status, detail);
        }, function () {
          console.error('push: the server refused this preference change.', res.status);
        });
      }
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
    p.PushNotifications.addListener('registrationError', function (err) {
      /* Nothing useful to tell a person here: the switch reflects their intent
         and registration retries on the next launch. But this is where a
         missing Push Notifications capability lands, which is step 8 of
         XCODE.md and is invisible from inside the app in every other way. A
         build without the entitlement gets no token, no error on screen, and
         no row in device_tokens, which looks exactly like the bug 0037 fixed
         and is not it. Log it so the two are told apart in one glance. */
      console.error('push: iOS refused to register this device. If this is a ' +
                    'fresh build, check the Push Notifications capability in ' +
                    'Xcode (XCODE.md step 8).', err);
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

    /* One call, and it takes the name off the row along with everything else.
       This was a PATCH straight at the table until 0043 and had never once
       worked, for the reason set out at length above registerRequest(): the
       `?token=eq.X` filter is a WHERE clause and anon has no SELECT. So every
       phone that ever switched notifications off stayed on the list, and the
       app said nothing because this catch resolves true either way.

       THE ANONYMOUS KEY RATHER THAN THE SESSION, even for an admin, and that
       is not an oversight either. Somebody who signed out an hour ago must
       still be able to turn their notifications off, and a phone in this app
       is far more often signed out than signed in. The function does not ask
       who is calling for exactly that reason; migration 0043 section 3b says
       what that costs and why it is the same cost 0010 already accepted.

       Resolves true whatever happens, which is unchanged and is right. The
       switch is off on this phone, the stored token is already gone, and there
       is nothing a person could do about a failure here. A row left active is
       repaired by the sender, which retires anything APNs stops accepting. */
    return fetch(cfg.SUPABASE_URL + '/rest/v1/rpc/hc_deactivate_device_token', {
      method: 'POST',
      headers: restHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ p_token: token })
    }).then(function () { return true; }, function () { return true; });
  }

  /* Re-registers on launch when the switch is already on, because an APNs
     token is not permanent. It changes on restore from backup, and sometimes
     on reinstall, and a church sending to a stale token gets silence rather
     than an error. */
  function resumeNotifications() {
    if (!isNative()) return;
    var prefs = HC.store.getProfile().notifications || {};
    var wantsSomething = prefs.newGuide || prefs.sundayReminder ||
      prefs.groupWeek || prefs.announcements;

    /* The two admin ones count, but only on a phone that is actually an
       admin's. Without the isAdminHere() half this reads as "every phone wants
       something", because the two default to true for everybody: Profile draws
       them for nobody else and the server refuses them for nobody else, but
       this line would have registered a phone whose owner had turned all four
       real switches off. */
    if (isAdminHere() && (prefs.announcementReview || prefs.eventReview)) {
      wantsSomething = true;
    }

    if (!wantsSomething) return;
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
    canRemind: canRemind,
    askToRemind: askToRemind,
    scheduleReminder: scheduleReminder,
    cancelReminder: cancelReminder,
    pendingReminderIds: pendingReminderIds,
    cancelAllReminders: cancelAllReminders,
    onReminderTapped: onReminderTapped,
    enableNotifications: enableNotifications,
    disableNotifications: disableNotifications,
    syncPreferences: syncPreferences,
    syncAdminPreferences: syncAdminPreferences,
    clearAdminNotifications: clearAdminNotifications,
    resumeNotifications: resumeNotifications
  };

})(window.HC = window.HC || {});
