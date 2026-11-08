/* ===========================================================================
   The Android branches in js/native.js, and that an iPhone takes none of them.

   The Android port's one rule is that it adds branches and changes nothing an
   iPhone does. So every answer here is asked three times, once per platform
   Capacitor can report, and the iPhone answer is pinned to what the app did
   before Android existed: giving offered, push available, a reminder sent
   to the plugin with no Android-only field in it, push registering as 'ios',
   and no notification channel, which only Android has. PLAY_COMPLIANCE.md sections 3 and 8 say why Android differs.
   =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log('PASS  ' + label); pass++; }
  else { console.log('FAIL  ' + label + '\n        got  ' + a + '\n        want ' + b); fail++; }
};

function fakeStorage() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }
  };
}

/* What a plugin was asked to do, so a test can say "never touched". */
function fakePlugins(calls, opts) {
  const record = (name, value) => function (arg) {
    calls.push([name, arg === undefined ? null : arg]);
    return Promise.resolve(value);
  };
  const plugins = {
    Filesystem: {
      writeFile: record('fs.writeFile', { uri: 'file:///cache/the-guide.pdf' })
    },
    Share: {
      share: record('share.share', {})
    },
    LocalNotifications: {
      checkPermissions: record('ln.checkPermissions', { display: 'granted' }),
      schedule: record('ln.schedule', {})
    },
    PushNotifications: {
      addListener: function () { return Promise.resolve({ remove: function () {} }); },
      checkPermissions: record('push.checkPermissions', { receive: 'granted' }),
      requestPermissions: record('push.requestPermissions', { receive: 'granted' }),
      register: record('push.register', undefined),
      createChannel: record('push.createChannel', undefined)
    }
  };
  /* The app's own Android plugin. Absent unless asked for, the way it is in
     every build from before it existed; `pdfViewer: 'fails'` is a phone
     with no app that opens PDFs. */
  if (opts && opts.pdfViewer) {
    plugins.PdfViewer = {
      open: function (arg) {
        calls.push(['pdf.open', arg]);
        return opts.pdfViewer === 'fails'
          ? Promise.reject(new Error('No app on this phone opens PDFs.'))
          : Promise.resolve();
      }
    };
  }
  return plugins;
}

/* `platform` is what Capacitor.getPlatform() says, or null for a browser. */
function load(platform, opts) {
  const calls = [];
  const sandbox = {
    window: { localStorage: fakeStorage(), console: console },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ set innerHTML(v) {}, firstElementChild: null })
    }
  };
  if (platform) {
    sandbox.window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: fakePlugins(calls, opts)
    };
  }
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  for (const f of ['data.js', 'store.js', 'components.js', 'native.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox);
  }
  return { HC: sandbox.window.HC, calls: calls };
}

const web = load(null).HC.native;
const ios = load('ios');
const android = load('android');

/* ------------------------------------------------------------- platform */

ok('a browser is web', web.platform(), 'web');
ok('an iPhone is ios', ios.HC.native.platform(), 'ios');
ok('an Android phone is android', android.HC.native.platform(), 'android');
ok('only Android says isAndroid',
  [web.isAndroid(), ios.HC.native.isAndroid(), android.HC.native.isAndroid()],
  [false, false, true]);

/* --------------------------------------------------------------- giving */

ok('giving is offered in a browser and on an iPhone, as before',
  [web.offersGiving(), ios.HC.native.offersGiving()], [true, true]);
ok('and not on Android, until there is a determination letter',
  android.HC.native.offersGiving(), false);

/* ----------------------------------------------------------------- push */

ok('push is available on an iPhone, as before', ios.HC.native.pushAvailable(), true);
ok('and on Android, now that Firebase is set up', android.HC.native.pushAvailable(), true);

const later = new Date(Date.now() + 3 * 3600 * 1000);
const reminder = { id: 42, title: 'Group night', body: 'In an hour', at: later, eventId: 'e1' };

Promise.all([
  ios.HC.native.enableNotifications(),
  android.HC.native.enableNotifications()
]).then(function (answers) {
  ok('turning notifications on still registers on an iPhone', answers[0], true);
  ok('on an iPhone that is a permission request and a registration',
    ios.calls.map((c) => c[0]), ['push.requestPermissions', 'push.register']);
  ok('an iPhone is never asked to make a channel, which iOS does not have',
    ios.calls.some((c) => c[0] === 'push.createChannel'), false);
  ok('on Android it registers too', answers[1], true);
  ok('after making the channel the manifest names, then the same two steps',
    android.calls.filter((c) => c[0].indexOf('push.') === 0).map((c) => c[0]),
    ['push.createChannel', 'push.requestPermissions', 'push.register']);
  ok('the channel id is the one AndroidManifest.xml points Firebase at',
    android.calls.filter((c) => c[0] === 'push.createChannel')[0][1].id, 'church');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main',
    'AndroidManifest.xml'), 'utf8');
  ok('and the manifest does point Firebase at it',
    /default_notification_channel_id"\s+android:value="church"/.test(manifest), true);
  ok('the Firebase file the plugin needs is in the build',
    fs.existsSync(path.join(__dirname, '..', 'android', 'app', 'google-services.json')), true);

  /* ------------------------------------------------------------ reminders */

  return Promise.all([
    ios.HC.native.scheduleReminder(reminder),
    android.HC.native.scheduleReminder(reminder)
  ]);
}).then(function (answers) {
  ok('a reminder is scheduled on both', answers, [true, true]);
  const sent = (calls) => calls.filter((c) => c[0] === 'ln.schedule')[0][1].notifications[0];
  ok('the iPhone payload has exactly the keys it always had',
    Object.keys(sent(ios.calls)).sort(), ['body', 'extra', 'id', 'schedule', 'title']);
  ok('Android asks for an inexact alarm, so nobody is sent to Settings',
    sent(android.calls).isExactNotification, false);

  /* ------------------------------------------------- what registers as what */

  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'native.js'), 'utf8');
  ok('registration carries the platform rather than a hard coded ios',
    /p_platform: platform\(\)/.test(src) && !/p_platform: 'ios'/.test(src), true);

  /* ------------------------------------------------------ a PDF handed over

     Download guide, the night sheet, the journal and the HomeKids month all
     come through handOverPdf(). An iPhone gets the share sheet, exactly as
     before. Android opens the PDF in the phone's viewer, because its share
     sheet is "send to" only and the file in it can't be opened. */

  const names = (calls) => calls.map((c) => c[0]);
  const iosPdf = load('ios', { pdfViewer: 'works' });
  const andPdf = load('android', { pdfViewer: 'works' });
  const andNoViewer = load('android', { pdfViewer: 'fails' });
  const andOldBuild = load('android');

  return Promise.all([
    iosPdf.HC.native.handOverPdf('the-guide.pdf', 'JVBERi0=', 'The Guide'),
    andPdf.HC.native.handOverPdf('the-guide.pdf', 'JVBERi0=', 'The Guide'),
    andNoViewer.HC.native.handOverPdf('the-guide.pdf', 'JVBERi0=', 'The Guide'),
    andOldBuild.HC.native.handOverPdf('the-guide.pdf', 'JVBERi0=', 'The Guide'),
    web.handOverPdf('the-guide.pdf', 'JVBERi0=', 'The Guide')
  ]).then(function (got) {
    ok('an iPhone writes the PDF and opens the share sheet, as before',
      [got[0], names(iosPdf.calls)], [true, ['fs.writeFile', 'share.share']]);
    ok('and the iPhone share sheet is asked exactly what it was before',
      iosPdf.calls[1][1], { title: 'The Guide', url: 'file:///cache/the-guide.pdf', dialogTitle: 'The Guide' });
    ok('an iPhone never opens the PDF viewer, even if one were there',
      iosPdf.calls.some((c) => c[0] === 'pdf.open'), false);
    ok('the PDF is written as bytes, not as base64 text',
      iosPdf.calls[0][1], { path: 'the-guide.pdf', directory: 'CACHE', data: 'JVBERi0=' });

    ok('Android opens the PDF in the viewer, and no share sheet',
      [got[1], names(andPdf.calls)], [true, ['fs.writeFile', 'pdf.open']]);
    ok('the viewer is given the file just written',
      andPdf.calls[1][1], { url: 'file:///cache/the-guide.pdf' });

    ok('an Android phone with no PDF app gets the share sheet instead',
      [got[2], names(andNoViewer.calls)], [true, ['fs.writeFile', 'pdf.open', 'share.share']]);
    ok('an Android build from before the viewer gets the share sheet, as before',
      [got[3], names(andOldBuild.calls)], [true, ['fs.writeFile', 'share.share']]);
    ok('a browser has nothing to hand it to, so the caller falls back',
      got[4], false);

    const main = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java',
      'com', 'homechurchnola', 'app', 'MainActivity.java'), 'utf8');
    const plugin = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java',
      'com', 'homechurchnola', 'app', 'PdfViewerPlugin.java'), 'utf8');
    ok('MainActivity registers the viewer before Capacitor builds the bridge',
      main.indexOf('registerPlugin(PdfViewerPlugin.class)') > -1 &&
      main.indexOf('registerPlugin(PdfViewerPlugin.class)') < main.indexOf('super.onCreate(savedInstanceState)'), true);
    ok('the plugin is called by the name js/native.js looks for',
      /@CapacitorPlugin\(name = "PdfViewer"\)/.test(plugin), true);
    ok('and it uses the FileProvider the manifest already declares',
      /getPackageName\(\) \+ "\.fileprovider"/.test(plugin) &&
      /\$\{applicationId\}\.fileprovider/.test(fs.readFileSync(path.join(__dirname, '..', 'android',
        'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8')), true);
    ok('every document goes through handOverPdf, none straight to the share sheet',
      /HC\.native\.shareBinaryFile\(/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8')), false);
  });
}).then(function () {

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch(function (err) {
  console.log('FAIL  threw: ' + (err && err.stack || err));
  process.exit(1);
});
