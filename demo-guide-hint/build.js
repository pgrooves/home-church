/* Wraps mockup.src.html into a standalone mockup.html.

   The source carries no <html>, <head> or <body> of its own, because the same
   file is published as an Artifact, where the wrapper is supplied. This adds
   the wrapper back so the study opens from the filesystem with no server.

       cd demo-guide-hint && node build.js
*/
var fs = require('fs');

var body = fs.readFileSync(__dirname + '/mockup.src.html', 'utf8');

var head = body.slice(0, body.indexOf('</style>') + 8);
var rest = body.slice(body.indexOf('</style>') + 8);

var html =
  '<!doctype html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n' +
  head +
  '\n</head>\n<body>' + rest + '\n</body>\n</html>\n';

fs.writeFileSync(__dirname + '/mockup.html', html);
console.log('built mockup.html,', html.length, 'bytes');
