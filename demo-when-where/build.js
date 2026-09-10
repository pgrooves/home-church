/* Writes mockup.html from mockup.src.html.

   NOTHING TO INLINE, WHICH IS THE WHOLE DIFFERENCE from the build.js files in
   the demo folders beside this one. Those inline the brand PNGs as data URIs
   because their pages draw the lockup; this page draws no image at all — the
   three photographs on the screen are empty frames here, since the real ones
   come out of Supabase Storage at runtime. So this copies, and it exists
   anyway so that every demo folder is opened the same way and mockup.html
   stays the generated file .gitignore says it is.

     node build.js
*/

var fs = require('fs');

var html = fs.readFileSync('mockup.src.html', 'utf8');
fs.writeFileSync('mockup.html', html);
console.log('built', html.length, 'placeholders left', (html.match(/__[A-Z_]+__/g) || []).length);
