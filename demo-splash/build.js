/* Inlines the brand PNGs into every *.src.html here and writes two outputs
   for each.

   NAME.artifact.html is the fragment, styles and markup only, which is what
   the published Artifact renders inside its own document.
   NAME.html is the same fragment wrapped in a document, for opening the file
   straight off disk. Neither is committed, both are one command away. */

var fs = require('fs');

function b64(p) {
  return 'data:image/png;base64,' + fs.readFileSync('../' + p).toString('base64');
}

var art = {
  __MARK__: b64('assets/icons/mark.png'),
  __LOCKUP_INK__: b64('assets/img/logo-lockup-ink.png'),
  __LOCKUP__: b64('assets/img/logo-lockup.png')
};

fs.readdirSync('.').filter(function (f) {
  return /\.src\.html$/.test(f);
}).forEach(function (file) {
  var name = file.replace(/\.src\.html$/, '');
  var fragment = fs.readFileSync(file, 'utf8');

  Object.keys(art).forEach(function (key) {
    fragment = fragment.split(key).join(art[key]);
  });

  var page = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '</head>\n<body>\n' + fragment + '\n</body>\n</html>\n';

  fs.writeFileSync(name + '.artifact.html', fragment);
  fs.writeFileSync(name + '.html', page);

  console.log('built', name, 'placeholders left',
    (fragment.match(/__[A-Z_]+__/g) || []).length);
});
