/* Inlines the gold mark into the source and writes both outputs.

   artifact.html is the fragment, styles and markup only, which is what the
   published Artifact renders inside its own document.
   mockup.html is the same fragment wrapped in a document, for opening the
   file straight off disk. Neither is committed, both are one command away. */

var fs = require('fs');

var src = fs.readFileSync('mockup.src.html', 'utf8');
var mark = 'data:image/png;base64,' +
  fs.readFileSync('../assets/icons/mark.png').toString('base64');

var fragment = src.split('__MARK__').join(mark);

var page = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '</head>\n<body>\n' + fragment + '\n</body>\n</html>\n';

fs.writeFileSync('artifact.html', fragment);
fs.writeFileSync('mockup.html', page);

console.log('built, placeholders left',
  (fragment.match(/__[A-Z_]+__/g) || []).length);
