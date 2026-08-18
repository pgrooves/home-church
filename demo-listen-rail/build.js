var fs=require('fs');
var html=fs.readFileSync('mockup.src.html','utf8');
function b64(p){return 'data:image/png;base64,'+fs.readFileSync('../'+p).toString('base64');}
html=html.split('__DATA__').join(fs.readFileSync('listen.json','utf8'))
  .split('__MARK__').join(b64('assets/icons/mark.png'))
  .split('__LOCKUP_INK__').join(b64('assets/img/logo-lockup-ink.png'))
  .split('__LOCKUP__').join(b64('assets/img/logo-lockup.png'));
fs.writeFileSync('mockup.html',html);
console.log('built', html.length, 'placeholders left', (html.match(/__[A-Z_]+__/g)||[]).length);
