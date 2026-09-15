/* Builds mockup.html from mockup.src.html.

   Two jobs, the same two every demo folder has. The brand PNGs are inlined
   as data URIs, so the page opens from the filesystem with no server and no
   relative paths to get wrong. And the wrapper is added back: the source
   carries no <html>, <head> or <body> of its own, because the same file is
   published as an Artifact, where the wrapper is supplied.

       cd demo-swipe-hint && node build.js
*/
var fs = require('fs');

function b64(p) {
  return 'data:image/png;base64,' + fs.readFileSync(__dirname + '/../' + p).toString('base64');
}

var body = fs.readFileSync(__dirname + '/mockup.src.html', 'utf8')
  .split('__LOCKUP_INK__').join(b64('assets/img/logo-lockup-ink.png'))
  .split('__LOCKUP__').join(b64('assets/img/logo-lockup.png'));

var cut = body.indexOf('</style>') + 8;
var head = body.slice(0, cut);
var rest = body.slice(cut);

var html =
  '<!doctype html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n' +
  head +
  '\n</head>\n<body>' + rest + '\n</body>\n</html>\n';

fs.writeFileSync(__dirname + '/mockup.html', html);

var left = (html.match(/__[A-Z_]+__/g) || []).length;
console.log('built mockup.html,', html.length, 'bytes, placeholders left', left);
