/* ==========================================================================
   Home Church, cold start seed

   NOT the source of truth, and not a place to add content. Supabase is both.
   js/content.js fetches every content table on app open and swaps the rows
   into the arrays below in place, so whatever is published there is what
   people actually read.

   What this file is for: the floor. A brand new install on a phone with no
   signal has no cache and no network, and it still has to open to a real
   app rather than a set of empty screens. That is this. It is a frozen
   snapshot and it is allowed to go stale, because the moment there is any
   connection at all it gets replaced by live content.

   So do not hand edit content in here. Publishing to both places is what
   lets the two drift, and a stale copy that looks authoritative is worse
   than an obviously old one. Use the slash commands, which write to
   Supabase only. Regenerate the seed from the database if the floor ever
   needs raising.

   Loaded as a classic script, not an ES module, so the app opens straight
   from the file system and inside a Capacitor web view without a build step.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* ------------------------------------------------------------------ church
     Seed only. The live values are the one row in `church_profile`. Four
     screens read church.address.* without checking, so content.js never
     clears this from an empty table, it only overwrites it from a real row. */

  var church = {
    // The row in `church_profile` this seeds. Only Edit mode reads it.
    id: 'church-home',
    name: 'Home Church',
    tagline: 'A church of the city. Built from New Orleans. Built for New Orleans.',
    pastors: 'Stephen and Laura Daigle',
    address: {
      line1: '216 Giuffrias Ave',
      city: 'Metairie',
      state: 'LA',
      zip: '70001'
    },
    // Directions open in Apple Maps on iOS and fall back to the web map elsewhere.
    mapsUrl: 'https://maps.apple.com/?address=216%20Giuffrias%20Ave,%20Metairie,%20LA%2070001',
    serviceDay: 'Sunday',
    serviceTimes: ['8:00 AM', '9:30 AM', '11:00 AM'],
    givingUrl: 'https://donate.overflow.co/homechurchnola',
    websiteUrl: 'https://www.homechurchnola.com',
    social: [
      // The dot is load bearing. Every other handle the church owns is
      // homechurchnola, Instagram alone is homechurch.nola, and this link
      // shipped without the dot pointing at an account that is not theirs.
      { label: 'Instagram', url: 'https://www.instagram.com/homechurch.nola' },
      { label: 'Facebook', url: 'https://www.facebook.com/homechurchnola' },
      { label: 'YouTube', url: 'https://www.youtube.com/@homechurchnola' },
      { label: 'X', url: 'https://x.com/homechurchnola' },
      { label: 'TikTok', url: 'https://www.tiktok.com/@homechurchnola' }
    ],
    serve: {
      number: '833-801-3857',
      keyword: 'SERVE',
      title: 'Sign up to serve',
      blurb: 'Interested in serving with Home Church? Tap below and a member of our team will be in touch. We cannot wait to serve with you.'
    },
    /* Signing up for the next Practicing the Way group, under the grid of
       nine. Deliberately has no number of its own: it borrows serve.number
       above, so the church has one texting number on file and changing
       providers is one edit rather than two. See js/screens/practices.js.

       THE KEYWORD HAS TO BE PROVISIONED. SERVE above is a real keyword the
       church's SMS provider routes somewhere. PRACTICES is not, yet. The
       message still arrives either way, because this only prefills the body
       of a text a person then sends by hand, so the worst case is that a
       human reads the word instead of an autoresponder. Set it up on the
       provider's side, or change the keyword here to one that already works. */
    practicesSignup: {
      keyword: 'PRACTICES',
      blurb: 'To join our next Practicing the Way small group, text us:'
    },
    // Between seasons. The four groups below never render while this is false,
    // which is deliberate: they are still placeholders with invented hosts.
    // Replace them with the real groups before flipping this back to true.
    groupsInSeason: false,
    groupsOffSeasonNote: 'Home groups are between seasons right now. When the next one starts this is where you will find it, and we will make sure you hear about it before it fills up.',

    /* Alpha, behind •••, and the same switch groups have one line up. True
       here because there is a live registration to point at on the day this
       shipped, which is the honest default: a church running Alpha wants the
       button, and a church between seasons flips one boolean rather than
       taking a screen apart.

       THE URL IS A ONE SEASON URL. That number is a specific Church Center
       registration and it closes when this run of Alpha does. The row in
       church_profile is the real answer and this is only what a phone draws
       before it has ever reached Supabase, so turning the switch off is what
       matters when the season ends, not editing this line. See
       js/screens/alpha.js. */
    alphaInSeason: true,
    alphaSignupUrl: 'https://homechurchnola.churchcenter.com/registrations/events/3798127',
    alphaOffSeasonNote: 'Alpha is between seasons right now. When the next one opens this is where you will find it, and we will make sure you hear about it before it fills up.'
  };

  /* ----------------------------------------------------------------- podcast
     Every Sunday message is published to Spotify. The show link below is the
     one the church hands out. Each sermon carries its own episodeUrl, one of
     the per-episode links off that show page, and falls back to the show
     itself while an episode link is still missing.
     -------------------------------------------------------------------- */

  var podcast = {
    // The row in `podcast_show` this seeds. Only Edit mode reads it, to write
    // the blurb back to the right row.
    id: 'show-home-church-nola',
    name: 'Home Church NOLA',
    platform: 'Spotify',
    showUrl: 'https://open.spotify.com/show/7iJGZvY5MVm7CjPggvvPOa',
    blurb: 'Every Sunday message, on Spotify by Monday. Follow the show and the next one lands in your feed.'
  };

  /* ------------------------------------------------------------------ series */

  var series = [
    {
      id: 'series-david',
      title: 'The Life of David',
      subtitle: 'A shepherd, a king, a mess, a promise.',
      startedOn: '2026-05-03',
      current: true,
      blurb: 'The whole story, the field and the giant and the cave and the throne and the ruin and the road back. We are not skipping the hard parts.'
    },
    {
      id: 'series-ephesians',
      title: 'Ephesians',
      subtitle: 'The Queen of the Epistles, start to finish.',
      startedOn: '2025-04-27',
      current: false,
      blurb: 'A riot started this church, and Paul writes to help it grow up. Six months through the whole letter, ending in the armor and the call to pray.'
    },
    {
      id: 'series-relationships',
      title: 'Relationships',
      subtitle: 'Friendship, marriage, and the people closest to you.',
      startedOn: '2025-02-02',
      current: false,
      blurb: 'A collection of talks on the choices that shape a life more than almost anything else, who you befriend and who you marry.'
    },
    {
      id: 'series-following-jesus',
      title: 'Following Jesus',
      subtitle: 'Be with Jesus, become like Jesus, do what he did.',
      startedOn: '2025-01-05',
      current: false,
      blurb: 'The vision series. Three goals, and a life built around the practices of Jesus in an urban, digital world.'
    }
  ];

  /* ----------------------------------------------------------------- sermons
     episodeUrl is this message's own Spotify episode link, taken off the show
     page in `podcast`. summary is that episode's notes, an array of
     paragraphs, and it is what the Listen screen shows when you open a
     message. Leave either one null and the app falls back, to the show link
     and to `description` respectively, so a sermon is never broken by a
     missing episode.
     -------------------------------------------------------------------- */

  var sermons = [
    {
      id: 'sermon-who-s-in-your-corner',
      seriesId: 'series-david',
      title: 'Who’s In Your Corner?',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-08-09',
      publishedOn: '2026-08-10',
      duration: '33 min',
      passage: '2 Samuel 15-19',
      guideId: 'guide-unsung-heroes',
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19623061-who-s-in-your-corner',
      summary: [
        'Who’s in your corner when life falls apart?',
        'In this message, Pastor Stephen looks at the people who stood with David during one of the darkest seasons of his life. From friends who stayed, to friends who showed up, to friends who told him the truth, we see why faithful friendships are essential to becoming who God has called us to be.',
        'You don’t just need more people around you, you need the right people close to you.'
      ],
      description: 'Who’s in your corner when life falls apart?'
    },
    {
      id: 'sermon-winning-at-work-losing-at-home',
      seriesId: 'series-david',
      title: 'Winning at Work, Losing at Home',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-08-02',
      publishedOn: '2026-08-04',
      duration: '33 min',
      passage: '2 Samuel 13-19',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19595571-winning-at-work-losing-at-home',
      summary: ['Family dysfunction, broken relationships, and generational sin are realities many people face. Pastor Stephen unpacks the powerful story of David and Absalom to show how hidden sin can destroy a family, and how God’s grace can restore what feels beyond repair. If you’re praying for healing in your home, this message will remind you that no family is too broken for Jesus.'],
      description: 'Family dysfunction, broken relationships, and generational sin are realities many people face. '
    },
    {
      id: 'sermon-failure-isn-t-final',
      seriesId: 'series-david',
      title: 'Failure Isn’t Final',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-07-26',
      publishedOn: '2026-07-28',
      duration: '42 min',
      passage: '2 Samuel 11 & 12',
      guideId: 'guide-slow-burn',
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19564904-failure-isn-t-final',
      summary: [
        'It started with one look, but it didn’t stop there.',
        'David’s story shows how quickly a private compromise can turn into a public disaster. One bad decision became a cover-up, the cover-up became destruction, and the consequences reached far beyond him.',
        'In this message, Pastor Stephen unpacks the story of David and Bathsheba and shows us why hidden sin always costs more than we think, but also why failure does not have to be the end of your story. There is still grace. There is still healing. And there is still a way home.',
        'Thank you for listening to this message from Home Church. We pray it moves you closer to Jesus.'
      ],
      description: 'It started with one look, but it didn’t stop there.'
    },
    {
      id: 'sermon-the-table-of-grace-adam-suter',
      seriesId: 'series-david',
      title: 'The Table of Grace (Adam Suter)',
      preacher: 'Adam Suter',
      preacherShort: 'Adam',
      preachedOn: '2026-07-19',
      publishedOn: '2026-07-22',
      duration: '41 min',
      passage: '2 Samuel 9',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19523532-the-table-of-grace-adam-suter',
      summary: ['Pastor Adam continues our study on the life of David with 2 Samuel 9.'],
      description: 'Pastor Adam continues our study on the life of David with 2 Samuel 9.'
    },
    {
      id: 'sermon-the-table-of-grace-allen-barrera',
      seriesId: 'series-david',
      title: 'The Table of Grace (Allen Barrera)',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2026-07-19',
      publishedOn: '2026-07-21',
      duration: '37 min',
      passage: '2 Samuel 9',
      guideId: 'guide-seat-table',
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19523494-the-table-of-grace-allen-barrera',
      summary: ['Pastor Allen continues our study on the life of David with 2 Samuel 9.'],
      description: 'Pastor Allen continues our study on the life of David with 2 Samuel 9.'
    },
    {
      id: 'sermon-you-gotta-fight',
      seriesId: 'series-david',
      title: 'You Gotta Fight!',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-07-12',
      publishedOn: '2026-07-14',
      duration: '36 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19495336-you-gotta-fight',
      summary: [
        'Pastor Stephen challenges us to fight for what matters most: our faith, our relationships, and our God-given purpose. David had received the promise, but he still had to step forward in faith and fight to possess everything God had placed before him.',
        'Whether you have become discouraged, distracted, or comfortable, this message will reignite your faith and remind you that passivity is the enemy of your purpose. It is time to believe God again, take your next step of obedience, and trust Him to bring the victory.',
        'We pray this message from Home Church encourages you, strengthens your faith, and moves you closer to Jesus.'
      ],
      description: 'Pastor Stephen challenges us to fight for what matters most: our faith, our relationships, and our God-given purpose. '
    },
    {
      id: 'sermon-when-god-says-no',
      seriesId: 'series-david',
      title: 'When God Says ‘No’',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-07-05',
      publishedOn: '2026-07-07',
      duration: '37 min',
      passage: '2 Samuel 7; 1 Chronicles 17',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19458419-when-god-says-no',
      summary: [
        'What do you do when God says no?',
        'In Part 9 of our series on the life of David, Pastor Stephen Daigle teaches from 2 Samuel 7 and 1 Chronicles 17, where David has a good plan to build God a temple, but God gives him an unexpected answer.',
        'This message, “When God Says No,” is about trusting God’s timing, submitting to His lordship, and believing that His “no” is often protection, direction, and preparation for a greater “yes.” If you’ve ever wrestled with unanswered prayers, closed doors, disappointment, or waiting on God, this message will encourage you to trust that God’s plans are still good.',
        'God may not always give you the miracle you want, but He will always give you the grace you need.'
      ],
      description: 'What do you do when God says no?'
    },
    {
      id: 'sermon-i-found-out',
      seriesId: null,
      title: 'I Found Out',
      preacher: 'Josiah Malinich',
      preacherShort: 'Josiah',
      preachedOn: '2026-06-28',
      publishedOn: '2026-06-30',
      duration: '32 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19424979-i-found-out',
      summary: ['Josiah Malinich teaches on the secret to contentment. Josiah and his wife Mikayla are planting Total City Church in Mechanicsburg, Pennsylvania later this year. We are grateful to partner with them as they expand the kingdom in Pennsylvania!'],
      description: 'Josiah Malinich teaches on the secret to contentment. '
    },
    {
      id: 'sermon-don-t-force-it',
      seriesId: 'series-david',
      title: 'Don’t Force It',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-06-21',
      publishedOn: '2026-06-23',
      duration: '33 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19388144-don-t-force-it',
      summary: [
        'David was anointed long before he was appointed. He had the promise, but he still had to walk through the process. Instead of forcing the door open, David trusted God’s timing, stayed faithful in the small, and served where God placed him.',
        'If you’ve ever felt delayed, overlooked, or tempted to take matters into your own hands, this message will remind you: you don’t have to force what God has already promised.'
      ],
      description: 'David was anointed long before he was appointed. '
    },
    {
      id: 'sermon-the-honor-test',
      seriesId: 'series-david',
      title: 'The Honor Test',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-06-14',
      publishedOn: '2026-06-15',
      duration: '33 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19346328-the-honor-test',
      summary: [
        'How do you handle people who hurt you, attack you, or misunderstand you? In this message, Pastor Stephen looks at David’s response to Saul and shows us that the real test of character is not what we do when life is easy, but what we do when we have every reason to retaliate.',
        'David teaches us to pray first, create healthy distance, and choose honor, even under pressure.'
      ],
      description: 'How do you handle people who hurt you, attack you, or misunderstand you? '
    },
    {
      id: 'sermon-embracing-god-s-discipline',
      seriesId: 'series-david',
      title: 'Embracing God’s Discipline',
      preacher: 'Jim Johnson',
      preacherShort: 'Jim',
      preachedOn: '2026-06-07',
      publishedOn: '2026-06-09',
      duration: '38 min',
      passage: 'Deuteronomy 8:1-5',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19319797-embracing-god-s-discipline',
      summary: ['Life is full of cave seasons, but what is God doing behind the scenes? Jim Johnson teaches on God’s Discipline and what’s really happening in the caves.'],
      description: 'Life is full of cave seasons, but what is God doing behind the scenes? Jim Johnson teaches on God’s Discipline and what’s really happening in the caves.'
    },
    {
      id: 'sermon-cave-seasons',
      seriesId: 'series-david',
      title: 'Cave Seasons: When God Feels Far Away',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-05-31',
      publishedOn: '2026-06-02',
      duration: '34 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19278619-cave-seasons',
      summary: [
        'Life was going great… until it wasn’t.',
        'David went from the palace to a cave, losing nearly everything along the way. But what if your darkest season isn’t a sign that God has abandoned you? What if it’s where He’s preparing you? In this message, Pastor Stephen explores David’s time in the Cave of Adullam and how God uses pain, waiting, and wilderness seasons to form us into the people He has called us to be.'
      ],
      description: 'Life was going great… until it wasn’t.'
    },
    {
      id: 'sermon-show-me-your-friends',
      seriesId: 'series-david',
      title: 'Show Me Your Friends',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-05-24',
      publishedOn: '2026-05-26',
      duration: '37 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19240033-show-me-your-friends',
      summary: ['The people around you have more influence than you realize. Looking at the friendship of David and Jonathan, we explore the qualities of life-giving relationships and why the right community can change the course of your life.'],
      description: 'The people around you have more influence than you realize. '
    },
    {
      id: 'sermon-david-goliath',
      seriesId: 'series-david',
      title: 'David & Goliath (It’s not what you think)',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-05-17',
      publishedOn: '2026-05-19',
      duration: '37 min',
      passage: '1 Samuel 17',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19202738-david-goliath',
      summary: ['Fear. Anxiety. Addiction. Insecurity. Shame. This week, we walked 1 Samuel 17 and through the story of David & Goliath. David discovered what it looks like to trust God in the middle of overwhelming battles and you can as well.'],
      description: 'Fear. '
    },
    {
      id: 'sermon-why-god-makes-you-wait',
      seriesId: 'series-david',
      title: 'Why God Makes You Wait',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-05-10',
      publishedOn: '2026-05-12',
      duration: '34 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19161491-why-god-makes-you-wait',
      summary: [
        'What do you do when God gives you a promise but then makes you wait?',
        'This week we look at the tension between anointing and process. David was chosen by God, filled with the Spirit, and destined for greatness, yet he found himself back in the fields serving sheep. In this message, we talk about waiting seasons, hidden preparation, spiritual formation, and why God often develops leaders in lonely places before promoting them publicly.',
        'If you’re frustrated, overlooked, stuck in the process, or wondering why God hasn’t moved yet, this message is for you.'
      ],
      description: 'What do you do when God gives you a promise but then makes you wait?'
    },
    {
      id: 'sermon-quit-pretending',
      seriesId: 'series-david',
      title: 'Quit Pretending You Have It All Together',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-05-03',
      publishedOn: '2026-05-04',
      duration: '39 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19118612-quit-pretending',
      summary: [
        'Many people disqualify themselves because of their past or their imperfections.',
        'But when God chose David, He wasn’t looking for perfection, He was looking at the heart.',
        'In this message, Pastor Stephen explores what it means to have a heart after God: a heart that seeks Him, serves faithfully, and finds its satisfaction in Him alone.'
      ],
      description: 'Many people disqualify themselves because of their past or their imperfections.'
    },
    {
      id: 'sermon-running-ragged',
      seriesId: null,
      title: 'Running Ragged',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2026-04-26',
      publishedOn: '2026-04-28',
      duration: '41 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/19087534-running-ragged',
      summary: ['Pastor Allen Barrera preaches on the topic of finding your purpose.'],
      description: 'Pastor Allen Barrera preaches on the topic of finding your purpose.'
    },
    {
      id: 'sermon-easter-2026',
      seriesId: null,
      title: 'Easter 2026: Who Do You Say He Is?',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-04-05',
      publishedOn: '2026-04-06',
      duration: '32 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18969142-easter-2026',
      summary: ['There’s a growing curiosity about Jesus. In this Easter message, Pastor Stephen explores the historical reality of the resurrection and asks the question Jesus still asks today: Who do you say He is? Because if the tomb is empty, it changes everything.'],
      description: 'There’s a growing curiosity about Jesus. '
    },
    {
      id: 'sermon-lessons-from-a-donkey',
      seriesId: null,
      title: 'Lessons From A Donkey',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-03-29',
      publishedOn: '2026-03-31',
      duration: '28 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18937135-lessons-from-a-donkey',
      summary: ['On Palm Sunday, Jesus didn’t choose a war horse, He chose a donkey. In this message, we discover how God uses the unlikely, why He wants you free, and what it means to carry Christ into a broken world.'],
      description: 'On Palm Sunday, Jesus didn’t choose a war horse, He chose a donkey. '
    },
    {
      id: 'sermon-don-t-keep-it-to-yourself',
      seriesId: null,
      title: 'Don’t Keep It to Yourself',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-03-22',
      publishedOn: '2026-03-23',
      duration: '34 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18889571-don-t-keep-it-to-yourself',
      summary: ['Following Jesus was never meant to stay private. You don’t need to have all the answers to make a difference. This message will help you see how your story, your life, and your everyday moments can lead others to Jesus.'],
      description: 'Following Jesus was never meant to stay private. '
    },
    {
      id: 'sermon-light-in-darkness',
      seriesId: null,
      title: 'Light in Darkness',
      preacher: 'Adam Suter',
      preacherShort: 'Adam',
      preachedOn: '2026-03-15',
      publishedOn: '2026-03-16',
      duration: '27 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18851711-light-in-darkness',
      summary: ['What does it look like to be light in darkness? "You can’t be light in light". Adam Suter gives us a history lesson on St. Patricks Day and helps us to know how we can practically be light in the darkness.'],
      description: 'What does it look like to be light in darkness? '
    },
    {
      id: 'sermon-it-starts-at-home',
      seriesId: null,
      title: 'It Starts At Home',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-03-08',
      publishedOn: '2026-03-10',
      duration: '33 min',
      passage: 'Deuteronomy 6:4-9',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18818898-it-starts-at-home',
      summary: [
        'The next generation won’t follow Jesus by accident, it starts at home.',
        'Pastor Stephen talks about how faith is formed through intentional parenting, modeled faith, and a strong community. Listen to discover how we can raise a generation that loves God, loves the Church, and lives out their purpose.'
      ],
      description: 'The next generation won’t follow Jesus by accident, it starts at home.'
    },
    {
      id: 'sermon-i-still-do',
      seriesId: null,
      title: 'I Still Do',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2026-03-01',
      publishedOn: '2026-03-02',
      duration: '36 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18777399-i-still-do',
      summary: ['Pastor Allen Barrera continues our relationship series while reflecting on the marital vows and giving practical advice on how to strengthen your marriage.'],
      description: 'Pastor Allen Barrera continues our relationship series while reflecting on the marital vows and giving practical advice on how to strengthen your marriage.'
    },
    {
      id: 'sermon-divorce',
      seriesId: null,
      title: 'Divorce',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-02-22',
      publishedOn: '2026-02-23',
      duration: '37 min',
      passage: 'Matthew 19; Deuteronomy 24',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18730982-divorce',
      summary: ['What does the Bible say about divorce? Jesus doesn’t cancel broken stories, He redeems them.'],
      description: 'What does the Bible say about divorce? Jesus doesn’t cancel broken stories, He redeems them.'
    },
    {
      id: 'sermon-how-to-strengthen-your-marriage',
      seriesId: null,
      title: 'How to Strengthen Your Marriage',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-02-15',
      publishedOn: '2026-02-16',
      duration: '25 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18690438-how-to-strengthen-your-marriage',
      summary: [
        'Every relationship faces conflict. The question isn’t if you fight, it’s how you fight.',
        'This week, Pastor Stephen talks about building marriages that last by seeking God first, fighting fair, choosing forgiveness, protecting purity, and refusing to give up.',
        'Healthy marriages don’t happen by accident. They’re built on purpose.'
      ],
      description: 'Every relationship faces conflict. The question isn’t if you fight, it’s how you fight.'
    },
    {
      id: 'sermon-why-marriage',
      seriesId: null,
      title: 'Why Marriage?',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-02-08',
      publishedOn: '2026-02-10',
      duration: '35 min',
      passage: 'Genesis 2',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18654016-why-marriage',
      summary: ['What is marriage for? This message looks at God’s original design for marriage and how it shapes us in the way of Jesus, whether married or single.'],
      description: 'What is marriage for? This message looks at God’s original design for marriage and how it shapes us in the way of Jesus, whether married or single.'
    },
    {
      id: 'sermon-community-etiquette',
      seriesId: null,
      title: 'Community Etiquette',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-02-01',
      publishedOn: '2026-02-03',
      duration: '37 min',
      passage: '1 Thessalonians 5:12-15',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18614008-community-etiquette',
      summary: ['Many people know church as a service or a sermon, but the Bible describes it as a family. This message explores God’s vision for life together: honoring leadership, supporting the struggling, staying when it’s hard, and choosing community over isolation. If you’ve ever wondered how church is supposed to work, this message is for you.'],
      description: 'Many people know church as a service or a sermon, but the Bible describes it as a family. '
    },
    {
      id: 'sermon-the-key-you-forgot-you-had',
      seriesId: null,
      title: 'The Key You Forgot You Had',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-01-25',
      publishedOn: '2026-01-26',
      duration: '33 min',
      passage: 'Romans 12:1-2',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18571611-the-key-you-forgot-you-had',
      summary: [
        'Why memorize Scripture when you have a Bible app?',
        'This teaching looks at Jesus’ relationship with Scripture and how storing God’s Word in our hearts transforms the way we think, resist temptation, and walk with God.'
      ],
      description: 'Why memorize Scripture when you have a Bible app?'
    },
    {
      id: 'sermon-how-to-study-the-bible',
      seriesId: null,
      title: 'How to Study the Bible',
      preacher: null,
      preacherShort: null,
      preachedOn: '2026-01-18',
      publishedOn: '2026-01-19',
      duration: '35 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18531464-how-to-study-the-bible',
      summary: [
        'How do you study the Bible without feeling overwhelmed or confused?',
        'In this message, we break down how to study the Bible, why Scripture matters for spiritual growth, and how Jesus Himself used God’s Word to resist temptation and shape His life. You’ll learn how to read the Bible with context, intention, and community. If you want to grow in your relationship with Jesus and build your life on a strong biblical foundation, this message is for you.'
      ],
      description: 'How do you study the Bible without feeling overwhelmed or confused?'
    },
    {
      id: 'sermon-how-to-read-the-bible',
      seriesId: null,
      title: 'How to Read the Bible',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-01-11',
      publishedOn: '2026-01-12',
      duration: '42 min',
      passage: 'Joshua 1:7-8; Psalm 1',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18495879-how-to-read-the-bible',
      summary: ['Did you know that there is a specific way we are supposed to read the Bible? In this message, Pastor Stephen shows why the Bible wasn’t designed to be skimmed for quotes, but meditated on for transformation. Listen as we learn about the practice of Lectio Divina.'],
      description: 'Did you know that there is a specific way we are supposed to read the Bible? '
    },
    {
      id: 'sermon-read-your-bible',
      seriesId: null,
      title: 'Read Your Bible',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-01-04',
      publishedOn: '2026-01-05',
      duration: '36 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18454724-read-your-bible',
      summary: ['Start 2026 with Home Church! Storms don’t test your faith, they reveal your foundation. In this message, Pastor Stephen talks about why God’s Word is the only foundation strong enough to sustain your life when pressure comes.'],
      description: 'Start 2026 with Home Church! '
    },
    {
      id: 'sermon-god-visits-prepared-places',
      seriesId: null,
      title: 'God Visits Prepared Places',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-12-28',
      publishedOn: '2025-12-30',
      duration: '44 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18429733-god-visits-prepared-places',
      summary: ['Do you want 2026 to be better than 2025? If so, this message is for you. You don’t drift into order. You prepare for it. In our final message of 2025, Pastor Stephen explores prayer, fasting, and spiritual alignment to show why God moves where space has been intentionally made.'],
      description: 'Do you want 2026 to be better than 2025? '
    },
    {
      id: 'sermon-the-presence-of-god',
      seriesId: null,
      title: 'The Presence of God',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-12-14',
      publishedOn: '2025-12-16',
      duration: '35 min',
      passage: 'Isaiah 7:14',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18363971-the-presence-of-god',
      summary: ['Feeling distant from God? You’re not abandoned, you’re being invited to see differently. In this message, Pastor Stephen explores the promise of Immanuel, challenges feeling-based faith, and shows how to recognize and live aware of God’s presence even when you don’t feel it. This message is for anyone wrestling with loneliness, doubt, or the silence of God.'],
      description: 'Feeling distant from God? '
    },
    {
      id: 'sermon-the-power-of-god',
      seriesId: null,
      title: 'The Power of God',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-12-07',
      publishedOn: '2025-12-09',
      duration: '38 min',
      passage: '1 Corinthians 4:20; 1 Corinthians 2:3-5; 1 Thessalonians 1:4-5',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18324539-the-power-of-god',
      summary: ['Fresh from Brazil, Pastor Stephen reflects on witnessing God move in power and asks why so many believers in the West live without it. This message unpacks a biblical framework for accessing God’s power in everyday life and invites you to step into the victorious, Spirit-filled life you were created for.'],
      description: 'Fresh from Brazil, Pastor Stephen reflects on witnessing God move in power and asks why so many believers in the West live without it. '
    },
    {
      id: 'sermon-unshakable-hope',
      seriesId: null,
      title: 'Unshakable Hope',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2025-11-30',
      publishedOn: '2025-12-05',
      duration: '46 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18307338-unshakable-hope',
      summary: ['Pastor Allen reminds us to find hope in Christ, have hope in the cross and Keep hope on the throne.'],
      description: 'Pastor Allen reminds us to find hope in Christ, have hope in the cross and Keep hope on the throne.'
    },
    {
      id: 'sermon-generosity-s-starting-place',
      seriesId: null,
      title: 'Generosity’s Starting Place',
      preacher: 'Adam Suter',
      preacherShort: 'Adam',
      preachedOn: '2025-11-30',
      publishedOn: '2025-12-01',
      duration: '38 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18280897-generosity-s-starting-place',
      summary: ['Adam Suter looks at the interaction between Zacchaeus and Jesus to show us where Generosity starts.'],
      description: 'Adam Suter looks at the interaction between Zacchaeus and Jesus to show us where Generosity starts.'
    },
    {
      id: 'sermon-stewardship',
      seriesId: null,
      title: 'Stewardship',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-11-16',
      publishedOn: '2025-11-18',
      duration: '32 min',
      passage: 'Luke 12',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18215073-stewardship',
      summary: ['In this message, Pastor Stephen unpacks what Jesus teaches about stewardship and generosity, reminding us that when God owns it all, everything shifts. We learn how to trust Jesus with our resources, manage what’s in our hands wisely, and live with the kind of open-handed faith that impacts every part of life.'],
      description: 'In this message, Pastor Stephen unpacks what Jesus teaches about stewardship and generosity, reminding us that when God owns it all, everything shifts. '
    },
    {
      id: 'sermon-the-good-life',
      seriesId: null,
      title: 'The Good Life',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-11-02',
      publishedOn: '2025-11-03',
      duration: '37 min',
      passage: 'Matthew 6:19-24',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18123759-the-good-life',
      summary: ['Everyone’s chasing “the good life”, more money, more freedom, more stuff. But Jesus flipped that idea upside down when He said, “It’s more blessed to give than to receive.” In this message, Pastor Stephen unpacks what Jesus really taught about money, generosity, and the kind of life that actually leads to joy. You’ll see why true freedom isn’t found in getting more; it’s found in giving more.'],
      description: 'Everyone’s chasing “the good life”, more money, more freedom, more stuff. '
    },
    {
      id: 'sermon-one-year-anniversary-think-big',
      seriesId: null,
      title: 'One Year Anniversary: Think Big!',
      preacher: 'Stephen and Laura Daigle',
      preacherShort: 'Stephen and Laura',
      preachedOn: '2025-10-26',
      publishedOn: '2025-10-28',
      duration: '38 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18089154-one-year-anniversary-think-big',
      summary: ['Home Church just turned one! In this anniversary message, Pastors Stephen and Laura remind us that the church isn’t a building, it’s people with big faith, big sacrifice, and big hearts. Year two is about stretching wider, trusting deeper, and believing that the best is still ahead. The word for this season: Think Big.'],
      description: 'Home Church just turned one! '
    },
    {
      id: 'sermon-a-case-study-ephesus',
      seriesId: 'series-ephesians',
      title: 'A Case Study: Ephesus',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-10-19',
      publishedOn: '2025-10-21',
      duration: '39 min',
      passage: 'Acts 19; Revelation 2:1-5',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18048528-a-case-study-ephesus',
      summary: ['Ephesus was the New Orleans of the ancient world, diverse, coastal, creative, and powerful. The Gospel didn’t just survive there; it thrived and flipped the city upside down. In A Case Study: Ephesus, Pastor Stephen unpacks how a church that once sparked revival later drifted from its first love, and what Jesus’ words in Revelation still mean for us today. It’s a reminder that faith isn’t just about right beliefs or good habits; it’s about a heart that burns for God. Maybe it’s time to clear out the buildup, rediscover what stirred you at first, and fall in love with Jesus again.'],
      description: 'Ephesus was the New Orleans of the ancient world, diverse, coastal, creative, and powerful. '
    },
    {
      id: 'sermon-pray-first',
      seriesId: 'series-ephesians',
      title: 'Pray First',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-10-12',
      publishedOn: '2025-10-14',
      duration: '32 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/18009329-pray-first',
      summary: ['In this message, Pastor Stephen closes out the book of Ephesians with Paul’s final instruction, to pray. Prayer isn’t just another discipline; it’s the lifeline of the believer and the greatest weapon we have against the enemy. It’s how we stand firm, stay grounded, and see the Kingdom advance. Discover why prayer isn’t just the way forward, it’s the destination.'],
      description: 'In this message, Pastor Stephen closes out the book of Ephesians with Paul’s final instruction, to pray. '
    },
    {
      id: 'sermon-helmet-and-sword',
      seriesId: 'series-ephesians',
      title: 'The Helmet of Salvation & The Sword of The Spirit',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-10-05',
      publishedOn: '2025-10-07',
      duration: '34 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17970485-helmet-and-sword',
      summary: ['Too many Christians live with “stinkin thinkin.” Our thought processes create our identity, which should be a reflection of our salvation and the security we have in Christ. But, oftentimes we continue to live with our earthly issues and failures, letting them lead our lives. The sword of the spirit is for when we, as believers, move from the defensive to the offensive. It’s the very word of God given to us to use as a weapon against the enemy. In this message, Pastor Stephen teaches us how to think differently about ourselves and our lives through our salvation in Jesus and you’ll discover what the sword of the spirit is and how we can utilize it!'],
      description: 'Too many Christians live with “stinkin thinkin.” Our thought processes create our identity, which should be a reflection of our salvation and the security we have in Christ. '
    },
    {
      id: 'sermon-shield-of-faith',
      seriesId: 'series-ephesians',
      title: 'Shield of Faith',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-09-28',
      publishedOn: '2025-09-30',
      duration: '40 min',
      passage: 'Ephesians 6:15',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17936042-shield-of-faith',
      summary: ['What is your first line of protection against the attacks of the enemy? Faith. Faith is not a feeling. Faith is a choice. In this message, Pastor Stephen gives us 3 ways to develop and use our faith, so we can live in the fullness of everything God has for us.'],
      description: 'What is your first line of protection against the attacks of the enemy? '
    },
    {
      id: 'sermon-shoes-of-peace',
      seriesId: 'series-ephesians',
      title: 'Shoes of Peace',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-09-21',
      publishedOn: '2025-09-23',
      duration: '35 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17891574-shoes-of-peace',
      summary: ['When our peace comes from our Savior, we can stand firm. But, when our peace is based on our situations, we stumble and fall. Peace should be the default of every believer. Pastor Stephen encourages individuals to receive peace from Jesus and to make peace wherever they go. If you’ve struggled with fear, anxiety, worry, or depression, this is a message for you. If you’ve been in conflict, had relationship struggles, or experienced social tension, this is a word for you.'],
      description: 'When our peace comes from our Savior, we can stand firm. '
    },
    {
      id: 'sermon-close-to-the-chest',
      seriesId: 'series-ephesians',
      title: 'Close To The Chest | Pastor Jessie Davis',
      preacher: 'Jessie Davis',
      preacherShort: 'Jessie',
      preachedOn: '2025-09-14',
      publishedOn: '2025-09-16',
      duration: '27 min',
      passage: 'Ephesians 6:14; Luke 8:26-29',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17850708-close-to-the-chest',
      summary: [
        'One of the greatest areas in our lives the enemy loves to attack is our righteousness. Righteousness guards the most vital parts of our lives, which makes it a prime target. In this message, Jessie teaches us what righteousness is and how we can daily live it out.',
        'Jessie Davis Pastors at One City Church in Denver, Colorado.'
      ],
      description: 'One of the greatest areas in our lives the enemy loves to attack is our righteousness. '
    },
    {
      id: 'sermon-the-belt-of-truth',
      seriesId: 'series-ephesians',
      title: 'The Belt of Truth',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-09-07',
      publishedOn: '2025-09-09',
      duration: '29 min',
      passage: 'Ephesians 6:14',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17814790-the-belt-of-truth',
      summary: ['When you’re in the middle of spiritual warfare, the enemy always comes with deceit and lies. He is the master of deception. Truth is what stabilizes the believer, bringing peace, hope for the future, and rest in the promises of God. If you’ve been battling discouragement, anxiety, and fear, listen now.'],
      description: 'When you’re in the middle of spiritual warfare, the enemy always comes with deceit and lies. '
    },
    {
      id: 'sermon-stand-and-fight',
      seriesId: 'series-ephesians',
      title: 'Stand and Fight!',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-08-31',
      publishedOn: '2025-09-03',
      duration: '38 min',
      passage: 'Ephesians 6:10-13',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17786310-stand-and-fight',
      summary: ['We all experience spiritual warfare. As followers of Jesus, we walk through life with a target on our backs. However, we don’t always recognize the attacks, and we don’t always walk in the victory that’s been given to us through Jesus. In this message Pastor Stephen teaches us how to identify spiritual warfare and how to use the weapons we’ve been given.'],
      description: 'We all experience spiritual warfare. '
    },
    {
      id: 'sermon-god-s-design-for-community',
      seriesId: null,
      title: 'God’s Design for Community',
      preacher: 'Bri Guillory',
      preacherShort: 'Bri',
      preachedOn: '2025-08-24',
      publishedOn: '2025-08-26',
      duration: '33 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17733629-god-s-design-for-community',
      summary: [
        'God’s design for life isn’t solo, it’s shoulder-to-shoulder. In this message, Bri explores how Biblical community brings unlikely people together, opens doors for others to meet Jesus, and gives us a taste of Heaven on earth. Learn how to step into the life God intended, together.',
        'Bri Guillory serves as the Executive Director of Communication at Home Church and oversees our Home Groups.'
      ],
      description: 'God’s design for life isn’t solo, it’s shoulder-to-shoulder. '
    },
    {
      id: 'sermon-we-re-at-war',
      seriesId: 'series-ephesians',
      title: 'We’re At War',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-08-17',
      publishedOn: '2025-08-19',
      duration: '34 min',
      passage: 'Ephesians 6:10-11',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17689467-we-re-at-war',
      summary: ['A riot began the church in Ephesus. A few years into their journey, Paul writes to help them mature into who they really are in Christ, but his closing commissioning to them may not be what you’d expect. In this message, Pastor Stephen unpacks what it means to recognize the real enemy, rely on God’s strength, and fight with the armor He provides.'],
      description: 'A riot began the church in Ephesus. '
    },
    {
      id: 'sermon-the-way-you-work',
      seriesId: 'series-ephesians',
      title: 'The Way You Work',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-08-10',
      publishedOn: '2025-08-12',
      duration: '29 min',
      passage: 'Ephesians 6:5-9',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17658378-the-way-you-work',
      summary: ['Your 9 to 5 might feel ordinary, but God calls it sacred. In this message, Pastor Stephen unpacks how the way you work, from your attitude to your excellence, is one of the greatest ways to display Jesus to the world. Whether you’re at a desk, in a classroom, or on a construction site, discover how to turn your everyday grind into worship that makes an eternal impact.'],
      description: 'Your 9 to 5 might feel ordinary, but God calls it sacred. '
    },
    {
      id: 'sermon-let-us-go-to-the-other-side',
      seriesId: null,
      title: 'Let Us Go To The Other Side',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-08-03',
      publishedOn: '2025-08-05',
      duration: '40 min',
      passage: 'Mark 4 & 5',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17617965-let-us-go-to-the-other-side',
      summary: ['Jesus didn’t call us to stay comfortable, He called us to cross over. In this message, Pastor Stephen reminds us that the mission is people, and the other side of obedience is often resistance. If you’ve ever wondered why following Jesus gets harder when you’re doing it right, this message will awaken your heart, sharpen your vision, and call you into the waters where rescue happens. You were saved to save!'],
      description: 'Jesus didn’t call us to stay comfortable, He called us to cross over. '
    },
    {
      id: 'sermon-mission-minded',
      seriesId: null,
      title: 'Mission Minded | Pastor Mark Kresge',
      preacher: 'Mark Kresge',
      preacherShort: 'Mark',
      preachedOn: '2025-07-27',
      publishedOn: '2025-07-29',
      duration: '40 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17581742-mission-minded',
      summary: [
        'Jesus didn’t come to start a religion, He came on a rescue mission. In a world full of confusion and pain, He sees the lost with compassion and calls us to do the same. This message will awaken your heart to the urgency of the Gospel, the power of the Kingdom, and your role in the greatest mission on earth.',
        'Mark Kresge serves as the Connection Pastor at Jesus Culture Sacramento.'
      ],
      description: 'Jesus didn’t come to start a religion, He came on a rescue mission. '
    },
    {
      id: 'sermon-better-parenting',
      seriesId: 'series-ephesians',
      title: 'Better Parenting',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2025-07-20',
      publishedOn: '2025-07-22',
      duration: '42 min',
      passage: 'Ephesians 6:1-4',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17543240-better-parenting',
      summary: ['What if parenting isn’t about being perfect, but being present, obedient, and Spirit-led? This message from Pastor Allen Barrera flips the script on modern parenting pressure and dives into God’s blueprint for raising kids who thrive. Whether you’re raising toddlers or teens, this is for every parent who wants to lead with grace, discipline, and eternal purpose.'],
      description: 'What if parenting isn’t about being perfect, but being present, obedient, and Spirit-led? '
    },
    {
      id: 'sermon-a-better-marriage',
      seriesId: 'series-ephesians',
      title: 'A Better Marriage',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-07-13',
      publishedOn: '2025-07-14',
      duration: '42 min',
      passage: 'Ephesians 5:22-33',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17503672-a-better-marriage',
      summary: ['Is marriage outdated, or just misunderstood? In a culture flooded with confusion about gender roles, love, and power, this message dives deep into God’s original design for marriage and why it still matters. Whether you’re single, dating, or a decade in, you’ll walk away with a fresh, empowering perspective that’s honest, biblical, and surprisingly relevant.'],
      description: 'Is marriage outdated, or just misunderstood? '
    },
    {
      id: 'sermon-a-better-way',
      seriesId: null,
      title: 'A Better Way',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-07-06',
      publishedOn: '2025-07-07',
      duration: '37 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17461972-a-better-way',
      summary: ['What if freedom isn’t found in following your feelings, but in walking in the light? In this episode, we talk sex, identity, and the quiet idols that are discipling an entire generation. The chains are real, but so is the way out.'],
      description: 'What if freedom isn’t found in following your feelings, but in walking in the light? '
    },
    {
      id: 'sermon-reconciliation',
      seriesId: null,
      title: 'Reconciliation',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-06-29',
      publishedOn: '2025-07-01',
      duration: '43 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17430407-reconciliation',
      summary: ['Broken relationships feel final, but what if they’re not? This week, we explore how the gospel invites us not just to forgive, but to pursue reconciliation, even when it’s messy or one-sided. Discover why healing relationships may be the most powerful way we reflect the heart of Jesus.'],
      description: 'Broken relationships feel final, but what if they’re not? '
    },
    {
      id: 'sermon-forgiveness',
      seriesId: 'series-ephesians',
      title: 'Forgiveness',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-06-22',
      publishedOn: '2025-06-24',
      duration: '33 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17387997-forgiveness',
      summary: [
        'Forgiveness is integral in our discipleship with Jesus. We live in a world polluted by sin and shame, and relationships in this broken world are often marked by disappointment, loss, and pain. God is calling us to forgive because Jesus himself chose to forgive.',
        'Ephesians 4:40-32; Matthew 6:14-15; Matt 18:21-22'
      ],
      description: 'Forgiveness is integral in our discipleship with Jesus. '
    },
    {
      id: 'sermon-you-re-not-that-person-anymore',
      seriesId: 'series-ephesians',
      title: 'You’re Not That Person Anymore',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-06-15',
      publishedOn: '2025-06-17',
      duration: '33 min',
      passage: 'Ephesians 4:17-32',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17351881-you-re-not-that-person-anymore',
      summary: ['Tired of going through the motions? This message breaks down how to ditch the old life and actually live out your faith in real, everyday ways. Ephesians 4 hits different when you realize it’s not just about belief, it’s about becoming.'],
      description: 'Tired of going through the motions? '
    },
    {
      id: 'sermon-finding-unity',
      seriesId: 'series-ephesians',
      title: 'Finding Unity',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2025-06-08',
      publishedOn: '2025-06-10',
      duration: '40 min',
      passage: 'Ephesians 4:1-6',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17312435-finding-unity',
      summary: ['Pastor Allen continues our study of Ephesians as we jump into chapter 4.'],
      description: 'Pastor Allen continues our study of Ephesians as we jump into chapter 4.'
    },
    {
      id: 'sermon-tearing-down-to-build-up',
      seriesId: 'series-ephesians',
      title: 'Tearing Down to Build Up',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-05-25',
      publishedOn: '2025-05-27',
      duration: '35 min',
      passage: 'Ephesians 2:11-22',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17233351-tearing-down-to-build-up',
      summary: ['Following Jesus isn’t just a solo journey, it’s a family thing. Pastor Stephen dives into Ephesians 2 and talks about how the gospel doesn’t just save us personally, it brings us into a new community. No more “us vs. them.” God is building something bigger than our preferences, politics, and pasts, and you have a place in it. You’re not just invited in… you’re family now.'],
      description: 'Following Jesus isn’t just a solo journey, it’s a family thing. '
    },
    {
      id: 'sermon-from-death-to-life',
      seriesId: 'series-ephesians',
      title: 'From Death To Life',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-05-18',
      publishedOn: '2025-05-19',
      duration: '38 min',
      passage: 'Ephesians 2:1-10',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17188684-from-death-to-life',
      summary: ['Ephesians 2:1-10 is the simplest and most direct presentations of Jesus that we have. Pastor Stephen walks through these verses as we continue our study of Ephesians.'],
      description: 'Ephesians 2:1-10 is the simplest and most direct presentations of Jesus that we have. Pastor Stephen walks through these verses as we continue our study of Ephesians.'
    },
    {
      id: 'sermon-eyes-wide-open',
      seriesId: 'series-ephesians',
      title: 'Eyes Wide Open',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-05-11',
      publishedOn: '2025-05-13',
      duration: '22 min',
      passage: 'Ephesians 1:15-23',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17151187-eyes-wide-open',
      summary: ['Happy Mother’s Day! We continue our study of Ephesians looking at Pauls prayer for the church in Ephesus.'],
      description: 'Happy Mother’s Day! We continue our study of Ephesians looking at Pauls prayer for the church in Ephesus.'
    },
    {
      id: 'sermon-in-christ-it-s-better-than-you-think',
      seriesId: 'series-ephesians',
      title: 'In Christ: It’s Better Than You Think',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-05-04',
      publishedOn: '2025-05-05',
      duration: '38 min',
      passage: 'Ephesians 1:3-14',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17101295-in-christ-it-s-better-than-you-think',
      summary: ['Ephesians, the Queen of the Epistles, is the most concise complete presentation of what God is doing thru Jesus. Of the 41 command verbs in the book, 40 of them are in chapters 4-6. There is only 1 command in the first 3 chapters, ‘Remember’. Before you ever talk about what you are supposed to do, C at its base is about what God has done for us in Christ.'],
      description: 'Ephesians, the Queen of the Epistles, is the most concise complete presentation of what God is doing thru Jesus. '
    },
    {
      id: 'sermon-what-happened-in-ephesus',
      seriesId: 'series-ephesians',
      title: 'What happened in Ephesus?',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-04-27',
      publishedOn: '2025-04-28',
      duration: '43 min',
      passage: 'Acts 19; Ephesians 1:1-2',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17055936-what-happened-in-ephesus',
      summary: ['Home Church will be studying the book of Ephesians! If we are going to understand a book fully then we are going to have to understand as much as we can about the people who are receiving this letter. Pastor Stephen lays the foundation for the beginning of our study of the book of Ephesians.'],
      description: 'Home Church will be studying the book of Ephesians! '
    },
    {
      id: 'sermon-easter-2025',
      seriesId: null,
      title: 'Easter 2025',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-04-20',
      publishedOn: '2025-04-22',
      duration: '42 min',
      passage: '1 Corinthians 15',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/17021085-easter-2025',
      summary: ['He is risen! Pastor Stephen shares a message on the resurrection at our first Easter as a church!'],
      description: 'He is risen! Pastor Stephen shares a message on the resurrection at our first Easter as a church!'
    },
    {
      id: 'sermon-it-s-time-to-come-home-ii',
      seriesId: null,
      title: 'It’s Time To Come Home II',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-04-13',
      publishedOn: '2025-04-14',
      duration: '39 min',
      passage: 'Luke 15:25-32',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16974735-it-s-time-to-come-home-ii',
      summary: ['What about the older brother? Pastor Stephen teaches on the second half of the Parable of the Prodigal Son. For certain types of people, grace is not only amazing, it is also infuriating. Just because one of the sons didn’t run away doesn’t mean that he wasn’t lost. There is more to this parable than you think.'],
      description: 'What about the older brother? '
    },
    {
      id: 'sermon-it-s-time-to-come-home',
      seriesId: null,
      title: 'It’s Time To Come Home',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-04-06',
      publishedOn: '2025-04-08',
      duration: '33 min',
      passage: 'Luke 15',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16939986-it-s-time-to-come-home',
      summary: ['God doesn’t cancel people, He has compassion on them. Pastor Stephen teaches from Luke 15 and the parable of the prodigal son, a parable of redemption and restoration. We can apply the story of the prodigal son to our own lives, realizing when we take one step towards God, He is running towards us!'],
      description: 'God doesn’t cancel people, He has compassion on them. '
    },
    {
      id: 'sermon-vision-sunday-2025',
      seriesId: null,
      title: 'Vision Sunday 2025',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-03-30',
      publishedOn: '2025-04-01',
      duration: '45 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16894932-vision-sunday-2025',
      summary: ['God has been doing some incredible things since our journey started at Home Church in 2024. Having a vision isn’t just necessary for our church, but also for YOU! Pastor Stephen teaches on vision, talks about where we’ve been, where we’re going, and what it will take for that to happen!'],
      description: 'God has been doing some incredible things since our journey started at Home Church in 2024. '
    },
    {
      id: 'sermon-the-lord-s-supper',
      seriesId: null,
      title: 'The Lord’s Supper',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-03-23',
      publishedOn: '2025-03-25',
      duration: '40 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16857126-the-lord-s-supper',
      summary: ['The Lord’s supper, communion, the eucharist, whatever you call eating and drinking with God, this practice is at the very center of the church. And yet it’s changed over the years. What started out as a full meal, around a table, in a home, with a spirit of gratitude, joy and celebration, has since become a quiet, contemplative, individualistic meditation on our sin and its cost to Jesus. How did this practice evolve? Or devolve? And how could we re-imagine this practice as a meal?'],
      description: 'The Lord’s supper, communion, the eucharist, whatever you call eating and drinking with God, this practice is at the very center of the church. '
    },
    {
      id: 'sermon-marriage-ii',
      seriesId: 'series-relationships',
      title: 'Marriage II',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-03-09',
      publishedOn: '2025-03-11',
      duration: '43 min',
      passage: 'Acts 18',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16770225-marriage-ii',
      summary: ['Pastor Stephen shares practical tips on how to have a healthy marriage and encourages us to look at the lives of Priscilla and Aquila as we evaluate what it means to have a marriage that is on mission. The strongest unity is formed by a mutual commitment to a common cause, and there are three specific things we see in Priscilla and Aquila’s life that demonstrate a marriage that is on mission together.'],
      description: 'Pastor Stephen shares practical tips on how to have a healthy marriage and encourages us to look at the lives of Priscilla and Aquila as we evaluate what it means to have a marriage that is on mission. '
    },
    {
      id: 'sermon-marriage-i',
      seriesId: 'series-relationships',
      title: 'Marriage I',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2025-03-02',
      publishedOn: '2025-03-04',
      duration: '60 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16732763-marriage-i',
      summary: ['Pastor Allen Barrera gives a practical message on how to have a healthy marriage.'],
      description: 'Pastor Allen Barrera gives a practical message on how to have a healthy marriage.'
    },
    {
      id: 'sermon-it-starts-with-you',
      seriesId: 'series-relationships',
      title: 'It Starts With You',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-02-23',
      publishedOn: '2025-02-25',
      duration: '44 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16690205-it-starts-with-you',
      summary: ['Healthy relationships begin with healthy individuals. As we continue our collection of talks on relationships, Pastor Stephen talks about the importance of YOU. Our greatest blessings come in the form of people, but if we don’t put work into our relationships, they won’t work. The best way to thrive in our relationships is to bring the best version of ourselves.'],
      description: 'Healthy relationships begin with healthy individuals. '
    },
    {
      id: 'sermon-friendship-iii',
      seriesId: 'series-relationships',
      title: 'Friendship III',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-02-16',
      publishedOn: '2025-02-18',
      duration: '36 min',
      passage: 'John 15:15; 1 John 1:7; James 5:16',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16644894-friendship-iii',
      summary: ['What’s the ‘secret sauce’ to a good friendship? What does Jesus have to say about friendship?'],
      description: 'What’s the ‘secret sauce’ to a good friendship? What does Jesus have to say about friendship?'
    },
    {
      id: 'sermon-friendship-ii',
      seriesId: 'series-relationships',
      title: 'Friendship II',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-02-09',
      publishedOn: '2025-02-11',
      duration: '35 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16600551-friendship-ii',
      summary: [
        'What does the character of a good friend look like?',
        'Nobody navigates life successfully without good friends. Even Jesus had friends during His earthly life. Some friends are better than others, though. So what makes for a good friend? The book of Proverbs offers a number of character traits to give us a portrait of the kind of friends we should look for, and the kind of friends we should be. Ultimately, we will find that the very best friends are those who are most like Jesus.'
      ],
      description: 'What does the character of a good friend look like?'
    },
    {
      id: 'sermon-friendship',
      seriesId: 'series-relationships',
      title: 'Friendship',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-02-02',
      publishedOn: '2025-02-03',
      duration: '39 min',
      passage: 'Proverbs 27:19',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16553977-friendship',
      summary: [
        'We begin a new collection of talks focused on Relationships! There are very few choices in life as important as who you decide to become friends with. Listen in as Pastor Stephen talks about healthy friends, unhealthy friends and expectations you should have when evaluating friendships.',
        'A Mirror reflects a man’s face but what he is really like is shown by the kind of friends he chooses. Proverbs 27:19 TLB'
      ],
      description: 'We begin a new collection of talks focused on Relationships! '
    },
    {
      id: 'sermon-do-what-jesus-did',
      seriesId: 'series-following-jesus',
      title: 'Do What Jesus Did',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-01-26',
      publishedOn: '2025-01-28',
      duration: '40 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16518809-do-what-jesus-did',
      summary: ['How do we live like Jesus? How do we actually do what he did? As the church, we are called to not only follow Jesus in spirit but we are called to continue his work on earth as it is in heaven. This means healing the sick, praying for the lost, opening up our homes and our lives to those far from God. The end goal is to do what he did. In this teaching, we explore the next steps in forming our lives around the practices of Jesus.'],
      description: 'How do we live like Jesus? '
    },
    {
      id: 'sermon-become-like-jesus',
      seriesId: 'series-following-jesus',
      title: 'Become Like Jesus',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2025-01-19',
      publishedOn: '2025-01-21',
      duration: '46 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16476737-become-like-jesus',
      summary: ['One of the most important teachings in the life of our church: How do we change to become like Jesus? The promise of the New Testament is nothing short of full-on transformation, but so many of us feel a disconnect between that promise and our reality. Is change really possible? The answer is: yes, but the odds are, it’s not what you think. Pastor Stephen continues our Following Jesus vision series.'],
      description: 'One of the most important teachings in the life of our church: How do we change to become like Jesus? '
    },
    {
      id: 'sermon-be-with-jesus',
      seriesId: 'series-following-jesus',
      title: 'Be With Jesus',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-01-12',
      publishedOn: '2025-01-12',
      duration: '44 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16426306-be-with-jesus',
      summary: ['The first goal of apprenticeship to Jesus is to “be with Jesus.” But how do we “abide in the vine” in the chaos of the urban, digital world in 2025? It’s pretty straightforward: to experience the life of Jesus, we adopt the lifestyle of Jesus.'],
      description: 'The first goal of apprenticeship to Jesus is to “be with Jesus.” But how do we “abide in the vine” in the chaos of the urban, digital world in 2025? '
    },
    {
      id: 'sermon-following-jesus',
      seriesId: 'series-following-jesus',
      title: 'Following Jesus',
      preacher: null,
      preacherShort: null,
      preachedOn: '2025-01-05',
      publishedOn: '2025-01-07',
      duration: '46 min',
      passage: 'Luke 13:1-5; Luke 9:57-62',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16396279-following-jesus',
      summary: ['How would Jesus respond to the terrorist attack that took place on January 1, 2025 in New Orleans? What does it mean to “follow” Jesus? To be a disciple, or apprentice, of the rabbi from Nazareth? In this teaching we explore a life built around three goals: be with Jesus, become like Jesus, and do what he did.'],
      description: 'How would Jesus respond to the terrorist attack that took place on January 1, 2025 in New Orleans? '
    },
    {
      id: 'sermon-praying-for-the-new-you',
      seriesId: null,
      title: 'Praying for the New You',
      preacher: 'Allen Barrera',
      preacherShort: 'Allen',
      preachedOn: '2024-12-29',
      publishedOn: '2024-12-29',
      duration: '39 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16353895-praying-for-the-new-you',
      summary: ['Pastor Allen closes out 2024 with a powerful message on Prayer.'],
      description: 'Pastor Allen closes out 2024 with a powerful message on Prayer.'
    },
    {
      id: 'sermon-jesus-at-the-center',
      seriesId: null,
      title: 'Jesus at the Center',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2024-12-22',
      publishedOn: '2024-12-24',
      duration: '25 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16336949-jesus-at-the-center',
      summary: ['In this powerful Christmas message, Pastor Stephen challenges us to make Jesus the central focus of the season. He explores practical ways to keep Christ at the heart of our celebrations, reminding us that true joy and peace come from honoring Him above all. Through focusing on Jesus, we can experience a deeper, more meaningful Christmas.'],
      description: 'In this powerful Christmas message, Pastor Stephen challenges us to make Jesus the central focus of the season. '
    },
    {
      id: 'sermon-burnout-to-balance',
      seriesId: null,
      title: 'Burnout to Balance: I’m Too Busy For This',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2024-12-15',
      publishedOn: '2024-12-17',
      duration: '37 min',
      passage: 'Matthew 11',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16294481-burnout-to-balance',
      summary: ['Pastor Stephen wraps up our first series with what the philosopher Dallas Willard called “the great enemy of spiritual life”, hurry. To live the way of Jesus, we have to slow down. But this is hard to do in the urban, digital world we call home. In this teaching from Matthew 11, we teach on “the secret of the easy yoke.” When we slow down and match our pace of life to that of Jesus, the way of Jesus becomes easy.'],
      description: 'Pastor Stephen wraps up our first series with what the philosopher Dallas Willard called “the great enemy of spiritual life”, hurry. '
    },
    {
      id: 'sermon-relationship-rehab',
      seriesId: null,
      title: 'Relationship Rehab',
      preacher: null,
      preacherShort: null,
      preachedOn: '2024-12-08',
      publishedOn: '2024-12-10',
      duration: '44 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16251385-relationship-rehab',
      summary: ['Central to Jesus’ vision of the Kingdom of God is the calling of a brand new family, not built around ethnicity, but around the family of God. We can have an active part in that family through commitment and intentional, relational living. The skill of navigating conflict and emotions is key to thriving in the family of God.'],
      description: 'Central to Jesus’ vision of the Kingdom of God is the calling of a brand new family, not built around ethnicity, but around the family of God. '
    },
    {
      id: 'sermon-messy-beautiful-necessary',
      seriesId: null,
      title: 'Messy, Beautiful, Necessary: Why You Need Community',
      preacher: null,
      preacherShort: null,
      preachedOn: '2024-12-01',
      publishedOn: '2024-12-03',
      duration: '39 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16212078-messy-beautiful-necessary',
      summary: ['We all long for friends, but it can be a struggle to find them. As the world around us is becoming increasingly lonely, what can we do to build solid friendships? Community plays a vital role in our transformation. But there is a gap between the idea of community and the messy reality of community. Discipleship happens in the space in between.'],
      description: 'We all long for friends, but it can be a struggle to find them. '
    },
    {
      id: 'sermon-the-great-banquet',
      seriesId: null,
      title: 'The Great Banquet',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2024-11-24',
      publishedOn: '2024-11-26',
      duration: '28 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16178187-the-great-banquet',
      summary: ['Jesus told a Parable about a Great Banquet to show us what heaven is like and how we should live now. Pastor Stephen unpacks this parable as Home Church celebrates its first ever baptisms!'],
      description: 'Jesus told a Parable about a Great Banquet to show us what heaven is like and how we should live now. '
    },
    {
      id: 'sermon-how-we-do-this',
      seriesId: null,
      title: 'How We Do This',
      preacher: null,
      preacherShort: null,
      preachedOn: '2024-11-17',
      publishedOn: '2024-11-19',
      duration: '32 min',
      passage: null,
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16133951-how-we-do-this',
      summary: ['Long before followers of Jesus ever built cathedrals, they met in homes, around a table, eating and drinking as brothers and sisters. As family. This is a very simple idea that tragically we’ve lost over the millennia, at great cost to the church. What if we were to recapture the shared meal as the center of gravity in our church?'],
      description: 'Long before followers of Jesus ever built cathedrals, they met in homes, around a table, eating and drinking as brothers and sisters. '
    },
    {
      id: 'sermon-a-new-family',
      seriesId: null,
      title: 'A New Family',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2024-11-03',
      publishedOn: '2024-11-06',
      duration: '40 min',
      passage: 'Matthew 10:1-4; Mark 3:31-35',
      guideId: null,
      episodeUrl: 'https://www.buzzsprout.com/2420925/episodes/16058994-a-new-family',
      summary: [
        'To follow Jesus is to live in community. Pastor Stephen unpacks God’s plan for community.',
        'Matthew 10:1-4; Mark 3:31-35'
      ],
      description: 'To follow Jesus is to live in community. Pastor Stephen unpacks God’s plan for community.'
    }
  ];

  /* ------------------------------------------------------------------ guides */

  var guides = [
    {
      id: 'guide-seat-table',
      sermonId: 'sermon-the-table-of-grace-allen-barrera',
      seriesId: 'series-david',
      themeTitle: null,   // inherits sermon.title, set only to override
      subtitle: 'What a forgotten grandson of a dead king teaches us about grace',
      primaryPassage: null,   // these four inherit from the sermon, same as
      preacher: null,         // themeTitle. Set one only to override.
      preacherShort: null,
      preachedOn: null,

      shortSummary: [
        'David finally has everything. The wars are quiet, the throne is steady, the kingdom is his. And in the middle of all that, he asks a question nobody asked him to ask. Is there anyone left of Saul’s house I can show kindness to? Saul hunted him through the wilderness for years. Every political instinct says finish the family and sleep well. David goes looking instead.',
        'They find a man named Mephibosheth. He is Jonathan’s son, crippled in both feet since he was five years old, living in a town called Lo-debar, which means no pasture. It is the middle of nowhere on purpose. He has spent his whole adult life staying small and staying hidden from the man who is now sending soldiers to bring him in. When he finally stands in front of the king, he calls himself a dead dog. He is braced for a sentence.',
        'What he gets is a table. David restores every acre of Saul’s land, assigns a household to work it, and seats Mephibosheth with the king’s own sons for the rest of his life. Here is the line most of us miss. The chapter ends by telling us he was still lame in both feet. Grace did not fix his legs. It changed his address, and it changed what he was called. That is the whole gospel in one chapter, and you are Mephibosheth.'
      ],

      fullSummary: [
        'Second Samuel 9 opens on a rare moment of calm. David has come through the cave years, the civil war, and the consolidation of the kingdom. He is secure. And security usually makes people protective, not generous. This is the chapter where David does the opposite of what a new king is supposed to do.',
        'His question is the hinge of the whole story. Is there still anyone left of the house of Saul, that I may show him kindness for Jonathan’s sake? The word behind kindness is hesed, the covenant loyalty of God, the stubborn love that keeps showing up after the relationship has given it every reason to quit. And notice the motive. Not for Saul’s sake, and not for Mephibosheth’s sake either. For Jonathan’s sake. Mephibosheth is not pursued because of anything he has done. He is pursued because of a promise made about somebody else.',
        'Ziba, a servant of Saul’s old household, tells David there is one son of Jonathan left, and adds a detail he did not have to add, he is crippled in his feet. That is not medical history, that is a warning. He is no threat and he is no asset. Second Samuel 4 tells us how it happened. When word came that Saul and Jonathan had died in battle, his nurse picked up the five year old and ran, and in the running she dropped him. He lost the use of his feet in the panic of a day he had nothing to do with. Some of what we carry is like that. We did not choose it, we inherited it, and we have been limping on it ever since.',
        'He is living in Lo-debar. The name means no pasture, and it sits east of the Jordan, far from Jerusalem and far from anybody who would recognize a royal face. He is in exile in his own country, being kept by a man named Machir. A grandson of a king is living off somebody else’s charity in a town whose name is basically nothing here. That is what shame does. It relocates you. It picks a small place and it tells you that you are lucky to have it.',
        'When David sends for him, Mephibosheth comes and falls on his face. He does not say hello. He says, what is your servant, that you should look upon a dead dog like me? That is not humility, that is an identity. He has believed something about himself so long that he says it out loud before anyone else can. And David does not argue with the sentence. He interrupts it. Do not fear, for I will surely show you kindness for the sake of your father Jonathan, and I will restore to you all the land of Saul your grandfather, and you shall eat at my table always.',
        'Look at what grace actually does here, because it moves in three directions. Grace pursues. David initiates all of it. Mephibosheth never petitions the king, never sends a letter, never cleans himself up first. He is found, and the searching started before he knew he was being searched for. Grace provides. The land comes back, all of it, and Ziba and his fifteen sons and twenty servants are assigned to work it. Mephibosheth is given more than a pardon, he is given an inheritance he did not earn and could not have farmed himself. Grace produces. The last verses show him living in Jerusalem, eating at the king’s table always, and the text repeats that phrase four times in this chapter like it wants to make sure we heard it. He is listed with the king’s sons. The seat changed what he was called.',
        'And then the chapter ends, and it is the strangest and best ending in the book. Now he lived in Jerusalem, for he ate always at the king’s table. And he was lame in both his feet. The writer had every chance to give us a healing and he did not. Mephibosheth still cannot walk. He is still carried to dinner. But when the table cloth comes down, nobody can tell whose feet work. Sitting there with the king’s sons, he looks exactly like a son, because he is one.',
        'That is the honest version of grace and we need it, because a lot of us are waiting to feel fixed before we feel welcome. Some things in your life are going to be a limp for a long time. The invitation is not conditional on the limp being gone. You are not seated because you got better. You are seated because somebody kept a promise, and the promise was not about you.',
        'One more thing worth carrying home. Later in the story, when David’s own son runs him out of Jerusalem, Mephibosheth is the one who refuses to groom himself or wash his clothes until the king comes back safe. Grace made him loyal. It always does. Nobody who has really eaten at that table stays casual about the one who set it.'
      ],

      anchors: [
        {
          label: 'Grace pursues',
          body: 'David asks the question first. Mephibosheth is not applying, he is being found. The search started in Jerusalem long before it reached Lo-debar, and it was set in motion by a promise made to somebody else.'
        },
        {
          label: 'Grace provides',
          body: 'The land comes back in full, with a household assigned to work it. This is not a suspended sentence, it is an inheritance. Grace does not just cancel the debt, it hands over the deed.'
        },
        {
          label: 'Grace produces',
          body: 'He eats at the king’s table always, listed with the king’s sons. The seat does the work that self improvement never could. What he is called changes, and the loyalty that shows up later grows out of the meal, not out of the effort.'
        }
      ],

      groupSections: [
        {
          heading: 'Getting started',
          questions: [
            'Think about the last time somebody was kind to you and you had not done a single thing to earn it. What did you do with it, did you receive it easily or did you start looking for a way to pay it back?',
            'When you hear the word grace, what is the first picture that comes to mind, and where did that picture come from?'
          ]
        },
        {
          heading: 'The question David asked',
          questions: [
            'David is finally safe, and safety usually makes people careful. Read 2 Samuel 9:1 out loud. What does it cost David to go looking for someone from Saul’s family, and what would it have cost him to just let it go?',
            'David does this for Jonathan’s sake, not for Mephibosheth’s. Where in your life have you received something good because of a promise somebody else made, a parent, a mentor, a friend who spoke up for you when you were not in the room?',
            'Is there a name that comes to mind when you ask David’s question about your own life, someone you could show kindness to who has no way to return it?'
          ]
        },
        {
          heading: 'Lo-debar',
          questions: [
            'Lo-debar means no pasture. Mephibosheth chose a nowhere town because nowhere felt safer than being seen. What is your Lo-debar, the place you go small and stay quiet so nobody looks too closely?',
            'He was dropped at five years old and has limped ever since, through no fault of his own. Name one thing you are still carrying that you did not choose. How does it shape the way you walk into a room today?'
          ]
        },
        {
          heading: 'Dead dog',
          questions: [
            'Mephibosheth names himself before David can. What is the name you use for yourself when you are being honest, the one you would not say in front of most people?',
            'David does not argue with that name, he interrupts it with a new one. Who is the last person who told you something true about yourself that you had a hard time believing, and did you let it land?',
            'Where are you still trying to be useful enough to keep a seat that was never based on your usefulness?'
          ]
        },
        {
          heading: 'The table',
          questions: [
            'Read 2 Samuel 9:9-11. The land, the servants, the seat. Which of those three would be hardest for you to accept without offering to pay for it, and why that one?',
            'The phrase eating at the king’s table always shows up four times in one chapter. What do you think the writer wants us to feel by repeating it, and what does always do to how you would sit down?'
          ]
        },
        {
          heading: 'Still lame in both feet',
          questions: [
            'The chapter ends with his feet still broken. What have you been waiting to have fixed before you would let yourself feel fully welcome by God?',
            'Say the thing you assume disqualifies you. Now say it again with 2 Samuel 9:13 attached to it. What actually changes, and what stays the same?',
            'Mephibosheth still needed to be carried to that table every single night. Who in this room could carry you this month, and would you let them?'
          ]
        },
        {
          heading: 'This week',
          questions: [
            'One specific person, one specific kindness, no way for them to repay you. Who is it and when this week are you doing it?',
            'What is one place you have been living small that you are willing to leave, and what would the first step out of that town actually look like on your calendar?'
          ]
        }
      ],

      reflectionQuestions: [
        'Where in your life are you still living in Lo-debar, keeping yourself in a small place because it feels safer than being found?',
        'What name have you agreed to that God has never once called you? Write it down, and write down what He calls you instead.',
        'Mephibosheth was pursued because of a promise made about Jonathan. Whose faithfulness are you living downstream of right now, and have you ever thanked them?',
        'What are you doing to stay useful enough to keep your seat, and what would change in your week if the seat were already secure?',
        'Name the limp you have quietly decided disqualifies you. What would it look like to come to the table this week without waiting for it to be healed?',
        'Who dropped you, and what has that cost you? You do not have to forgive it today. Can you name it honestly before God tonight?',
        'Who is your Mephibosheth, someone with nothing to offer you and no way to pay you back? What is the one concrete thing you are going to do for them this week?',
        'If you truly believed you were seated with the sons and not on probation, what is the first thing you would stop doing tomorrow morning?'
      ],

      oneLiners: [
        'Grace did not fix his legs. It changed his address.',
        'Shame always picks the small town. It tells you that nowhere is the safest place you will ever live.',
        'He was pursued because of a promise, and the promise was not about him.',
        'When the tablecloth comes down, nobody can tell whose feet work.',
        'He called himself a dead dog. The king called him a son. Only one of them was telling the truth.',
        'Grace is not a suspended sentence. It hands you the deed.',
        'You are not seated because you got better. You are seated because somebody kept their word.',
        'He never walked to that table. He was carried to it every night, and he came anyway.',
        'Some of what you carry, you did not choose. You inherited it in the running.',
        'David had every political reason to finish that family. He set a place for it instead.',
        'The word always shows up four times in this chapter. Read it slow.',
        'You do not have to be fixed to be welcome. You have to be found.',
        'A grandson of a king was living off somebody else’s charity, because that is what shame does. It relocates you.',
        'Grace made him loyal. It always does. Nobody eats at that table and stays casual about it.'
      ],

      scriptures: [
        {
          reference: '2 Samuel 9:1',
          note: 'The question that starts everything. David is safe and goes looking anyway, and the search begins in the king’s heart, not in Mephibosheth’s need.'
        },
        {
          reference: '2 Samuel 9:3',
          note: 'Ziba mentions the crippled feet without being asked. Read it as a warning, this one is no threat and no use to you.'
        },
        {
          reference: '2 Samuel 4:4',
          note: 'The backstory of the injury. He was five, his nurse ran, and she dropped him. Useful for the conversation about what we carry but did not choose.'
        },
        {
          reference: '2 Samuel 9:6-8',
          note: 'The dead dog line. Sit here a while. This is identity talking, not manners.'
        },
        {
          reference: '2 Samuel 9:7',
          note: 'Do not fear. The three gifts arrive in one sentence, kindness, the land, the table. Grace pursues, provides, produces.'
        },
        {
          reference: '2 Samuel 9:9-11',
          note: 'Ziba and his fifteen sons and twenty servants are assigned to the land. The inheritance comes with the means to keep it.'
        },
        {
          reference: '2 Samuel 9:13',
          note: 'The ending the writer chose. He ate always at the king’s table, and he was lame in both his feet. Both halves are the point.'
        },
        {
          reference: '1 Samuel 20:14-17',
          note: 'The covenant with Jonathan that David is keeping years later. This is where the promise was made.'
        },
        {
          reference: '2 Samuel 19:24-30',
          note: 'What grace produced. When the throne is threatened, Mephibosheth will not wash until the king comes home safe.'
        },
        {
          reference: 'Ephesians 2:4-6',
          note: 'The same movement in Paul’s language, dead, then made alive, then seated. Pair it with the table if the group wants the New Testament echo.'
        },
        {
          reference: 'Luke 14:12-14',
          note: 'Jesus tells us to invite the people who cannot repay us. This is what David did, and it is the assignment at the end of the guide.'
        }
      ],

      closingScripture: {
        text: 'So Mephibosheth lived in Jerusalem, for he ate always at the king’s table. Now he was lame in both his feet.',
        reference: '2 Samuel 9:13'
      }
    },

    {
      id: 'guide-slow-burn',
      sermonId: 'sermon-failure-isn-t-final',
      seriesId: 'series-david',
      themeTitle: null,   // inherits sermon.title, set only to override
      subtitle: 'How a good man ends up somewhere he never planned to go',
      primaryPassage: null,   // these four inherit from the sermon, same as
      preacher: null,         // themeTitle. Set one only to override.
      preacherShort: null,
      preachedOn: null,

      shortSummary: [
        'Nobody wakes up in the morning and decides to detonate their life. That is not how it works, and 2 Samuel 11 is careful to show us that it is not how it worked for David either. The chapter opens with a season, a location, and a decision so small you could miss it. In the spring, when kings go out to battle, David sent Joab, and David stayed. One sentence, one man in the wrong place, and everything after it is downhill.',
        'Then the story slows down and shows you the machinery. He saw. He inquired. He sent. He took. Four verbs, and between each one there was a door he could have walked out of and did not. What follows is worse than the sin itself, an eight month cover up that runs through deceit, manipulation, drunkenness, and finally a letter carried by the man it kills. This is what unconfessed sin does. It recruits. It needs more sin to stay hidden.',
        'It stays buried for the better part of a year, and then Nathan walks in with a story about a lamb, and David convicts himself before he realizes he is the defendant. You are the man. And here is the hope in the wreckage. David does not spin it, does not manage it, does not blame the season or the roof. He says I have sinned against the Lord, and that sentence is where the healing starts. Every sin gets exposed eventually. You get to choose whether you bring it into the light or wait for the light to come find it.'
      ],

      fullSummary: [
        'Second Samuel 11 begins with a time stamp that is doing a lot of work. In the spring of the year, the time when kings go out to battle. The writer is telling you where David is supposed to be before he tells you where he was. David sent Joab and all Israel, and they ravaged the Ammonites and besieged Rabbah. But David remained at Jerusalem. The tragedy is already in motion and nothing has technically happened yet.',
        'Start with environment, because that is where this always starts. David is at the point in his life where the fighting is other people’s job. He is successful, he is unaccountable, he is unoccupied, and he is alone. Every one of those is fine on its own. Stacked together on a spring evening they are a set of conditions. He gets up from his couch in the late afternoon and walks on the roof, the highest point in the city, where a king can see everything and nobody can see him. He did not plan anything. He just put himself somewhere with nothing to do and nobody to answer to, and that is usually enough.',
        'Then the progression. Watch the verbs, because the writer is deliberate with them. He saw a woman bathing. That is the moment that was not yet a sin, and it is also the last moment that was not. He sent and inquired about the woman. That is the second look, the one that goes and gets a name. Somebody tells him exactly who she is, the daughter of Eliam and the wife of Uriah the Hittite. That answer is a stop sign with two names on it. He gets the warning and keeps driving. So David sent messengers and took her. Saw, inquired, sent, took. Four steps, and every single one of them had a door.',
        'What comes next is the part we do not talk about enough, because it lasts longer and does more damage than the night on the roof. She sends five words back, I am pregnant, and David goes to work. He recalls Uriah from the front, expecting a soldier to do what soldiers do on leave. Uriah sleeps at the palace door instead. Twice. He will not go home while the ark and the army are in the field, and his integrity is so loud that David gets him drunk to try to lower it, and even drunk Uriah has more honor than sober David. So David writes a letter. Set Uriah in the forefront of the hardest fighting, then draw back from him so he is struck down. And he seals it and hands it to Uriah to carry. The man delivers his own death sentence to the general and never knows.',
        'That is the anatomy of a cover up. It never stays one sin. Lust became adultery, adultery recruited deceit, deceit recruited manipulation, manipulation recruited murder, and murder recruited a whole command structure into silence, because Joab knew. Then the chapter ends with a line that should make your skin cold. But the thing that David had done displeased the Lord. Everyone in Jerusalem thought the story was over. It was not over, it was just quiet.',
        'It stays quiet for something close to a year. The baby is born. Life goes on. David keeps ruling, keeps writing, keeps showing up to work. Psalm 32 is probably his own account of those months, and it does not sound like peace, it sounds like a body breaking down. When I kept silent, my bones wasted away through my groaning all day long. Silence is not the same thing as being fine.',
        'Then chapter 12, and Nathan the prophet walks in with a story. A rich man with countless flocks, a poor man with one little ewe lamb that ate from his own plate and slept in his arms like a daughter. A traveler comes, and the rich man takes the poor man’s lamb. David is furious. He passes sentence immediately, the man deserves to die and he must repay fourfold. And Nathan says four words. You are the man.',
        'Notice what David does not do, because this is the turn. He does not attack the messenger, and he had the power to. He does not explain the season or the pressure or the loneliness. He does not point out that Bathsheba was on a roof line in plain view. He says I have sinned against the Lord. Seven words in English, three in Hebrew. That is the whole confession, and Nathan answers immediately, the Lord also has put away your sin.',
        'Grace is instant. Consequences are not, and this is where honesty matters more than comfort. The child dies. The sword never leaves David’s house. Amnon, Tamar, Absalom, the whole back half of the book is the wreckage moving downstream. Forgiveness is not the same thing as the removal of consequences, and anybody who tells you otherwise is selling something. But listen to what David does after the child dies. He gets up. He washes. He worships. He eats. That is a man who has been forgiven and knows it, living inside a consequence he cannot undo.',
        'So there are two ways out of this chapter and only two. Confession or exposure. David got almost twelve months of quiet and it nearly killed him from the inside. Every single thing that is hidden right now is going to be brought into the light. That is not a threat, it is a promise, and it is actually good news, because you get to choose the terms. You can carry it into the light yourself, tonight, in a room with people who love you, or you can wait until it comes out on its own timeline in front of people you did not choose. One of those still has your dignity in it.'
      ],

      anchors: [
        {
          label: 'Your environment',
          body: 'Before the sin there was a setting. Wrong season, wrong place, no accountability, nothing to do, alone on a roof at dusk. David did not plan this, he just stood where it could happen. Most falls are the ordinary result of conditions nobody bothered to change.'
        },
        {
          label: 'The slow progression',
          body: 'He saw, he inquired, he sent, he took. Four verbs with a door beside each one. Then the cover up, which lasted eight months and did more damage than the night did. Unconfessed sin recruits. It always needs another sin to stay hidden.'
        },
        {
          label: 'Confession or exposure',
          body: 'Nathan tells a story and David sentences himself. He does not spin it, he says I have sinned against the Lord. Forgiveness comes in the same breath, and the consequences still run their course. Everything hidden comes to light. You only choose the terms.'
        }
      ],

      groupSections: [
        {
          heading: 'Getting started',
          questions: [
            'Tell the group about a time you made one small decision that you did not think mattered, and then watched it matter a lot. What was the decision, not the outcome?',
            'When something is going wrong in your life, who finds out first, and how long does it usually take them?'
          ]
        },
        {
          heading: 'Where David was standing',
          questions: [
            'Read 2 Samuel 11:1. Name the four conditions in David’s life that night, successful, unaccountable, unoccupied, alone. Which of those four is most true of you in this season?',
            'David was not where he was supposed to be, and nothing bad had happened yet. Where are you right now that you know you should not be, even though nothing has happened?',
            'What time of day and what setting are you most likely to make a decision you regret? Be specific, name the hour and the room.'
          ]
        },
        {
          heading: 'Saw, inquired, sent, took',
          questions: [
            'Walk the four verbs in 2 Samuel 11:2-4 out loud. At which step would it still have been easy for David to stop, and at which step do you think it stopped being easy?',
            'Somebody told David exactly who she was, whose daughter and whose wife, and he kept going. When did you last get clear information that should have stopped you, and what did you do with it?',
            'What is the second look in your life, the thing you have permission to see once and keep going back to?'
          ]
        },
        {
          heading: 'The cover up',
          questions: [
            'The cover up took eight months and cost a man his life. What did David spend on keeping this hidden, and what are you currently spending, in energy, time, or money, to keep something quiet?',
            'Uriah drunk had more integrity than David sober. What does it do to you that David tried to make a good man worse to make himself look better?',
            'Read Psalm 32:3-4. David describes silence in physical terms, wasting bones and dried up strength. Where do you feel your unspoken things in your body?'
          ]
        },
        {
          heading: 'You are the man',
          questions: [
            'Nathan tells a story instead of making an accusation, and David walks into it. Why do you think a story got past his defenses when a direct confrontation might not have?',
            'David had the power to kill Nathan and did not. Who has permission to say the hard thing to you, and when is the last time they used it?',
            'David responded with seven words and no explanation. What is the sentence you would have to say out loud, with no context and no defense attached, and who would you have to say it to?'
          ]
        },
        {
          heading: 'Forgiven and still in the wreckage',
          questions: [
            'Nathan says the Lord has put away your sin, and the child still dies. How do you hold instant forgiveness and lasting consequence at the same time without letting go of one of them?',
            'After the worst outcome arrives, David gets up, washes, worships, and eats. What would getting up and washing look like this week in the situation you are actually in?',
            'Where have you confessed something and are still living inside the consequence, and what has that done to your view of God?'
          ]
        },
        {
          heading: 'This week',
          questions: [
            'Confession or exposure, and there is not a third option. What is the one thing you are going to bring into the light, and what is the date and the name of the person you are telling?',
            'What is one condition in your environment you can actually change before next Sunday, a setting, an hour, an app, a route home? Say the change out loud so this room can ask you about it.'
          ]
        }
      ],

      reflectionQuestions: [
        'What are the conditions of your fall, the specific combination of time, place, and mood where you are most likely to give in? Write them down plainly.',
        'Where are you supposed to be right now that you are not, at work, at home, in a friendship, in your own family?',
        'Name your second look. What are you letting yourself return to on the grounds that the first time was innocent?',
        'What are you currently spending to keep something hidden? Count the hours, the money, and the lies, and write the total.',
        'Who has standing to walk into your life and say you are the man? If nobody does, what is the first step toward giving somebody that permission this month?',
        'Is there a person in your story you have treated the way David treated Uriah, as an obstacle instead of a man? What do you owe them?',
        'If everything you are hiding came out this week without your permission, what would hurt the most, and what does that tell you about where to start?',
        'David got up, washed, worshiped, and ate while the consequence was still sitting there. What is your version of getting up, and when are you doing it?'
      ],

      oneLiners: [
        'Nobody blows up their life on purpose. They just stop paying attention to the small stuff.',
        'In the spring, when kings go out to battle, David stayed. The whole chapter is already downhill from there.',
        'He saw, he inquired, he sent, he took. There was a door beside every one of those verbs.',
        'The second look is the one that costs you. The first one is just eyesight.',
        'Somebody told him whose wife she was. That was a stop sign with two names on it, and he drove through it.',
        'Unconfessed sin recruits. It cannot stay hidden by itself, so it goes and finds help.',
        'The cover up lasted eight months and did more damage than the night ever did.',
        'Uriah drunk had more honor than David sober.',
        'He handed the man his own death sentence and let him carry it across the country.',
        'Silence is not peace. Ask David’s bones.',
        'Nathan told him a story, and David convicted himself before he knew he was on trial.',
        'You are the man. Four words, eight months late, and exactly on time.',
        'Grace was instant. The consequences took a generation. Both of those are true and neither one cancels the other.',
        'Forgiveness is not the removal of consequences. Anybody who tells you different is selling something.',
        'Everything hidden comes into the light. You do not get to choose whether, you only get to choose how.'
      ],

      scriptures: [
        {
          reference: '2 Samuel 11:1',
          note: 'The setup. Right season for war, wrong place for the king. Read it slowly, the sin is already possible before anyone has done anything.'
        },
        {
          reference: '2 Samuel 11:2-4',
          note: 'Saw, inquired, sent, took. Have someone read it and have the group call out the four verbs as they land.'
        },
        {
          reference: '2 Samuel 11:3',
          note: 'He is told whose daughter and whose wife. Clear information, ignored. Good place to talk about warnings we actually receive.'
        },
        {
          reference: '2 Samuel 11:6-13',
          note: 'The two attempts to send Uriah home, including the drunkenness. The contrast between the soldier and the king is the whole point.'
        },
        {
          reference: '2 Samuel 11:14-17',
          note: 'The letter, carried by its own victim. This is where a private failure becomes a body count.'
        },
        {
          reference: '2 Samuel 11:27',
          note: 'But the thing that David had done displeased the Lord. The chapter ends quiet, not resolved.'
        },
        {
          reference: 'Psalm 32:3-5',
          note: 'David’s own account of the silent months, then the turn when he stops covering. Pair this with the eight month gap between the chapters.'
        },
        {
          reference: '2 Samuel 12:1-6',
          note: 'Nathan’s parable of the ewe lamb, and David’s furious sentence on himself. Read it aloud, it lands better spoken.'
        },
        {
          reference: '2 Samuel 12:7',
          note: 'You are the man. Let the room sit in silence for a beat after this one.'
        },
        {
          reference: '2 Samuel 12:13',
          note: 'The confession and the immediate answer. Three words in Hebrew, and the forgiveness arrives in the same breath.'
        },
        {
          reference: '2 Samuel 12:20',
          note: 'He arose, washed, worshiped, and ate. What forgiven people do while a consequence is still in the room.'
        },
        {
          reference: 'Psalm 51:1-12',
          note: 'The prayer traditionally tied to this moment. A good closing reading if the group needs somewhere to put what came up.'
        },
        {
          reference: 'Luke 8:17',
          note: 'Nothing is hidden that will not be made manifest. The confession or exposure choice, in Jesus’ own words.'
        },
        {
          reference: 'James 5:16',
          note: 'Confess your sins to one another and pray for one another, that you may be healed. Healing is attached to the room, not just to the private prayer.'
        }
      ],

      closingScripture: {
        text: 'I acknowledged my sin to you, and I did not cover my iniquity. I said, I will confess my transgressions to the Lord, and you forgave the iniquity of my sin.',
        reference: 'Psalm 32:5'
      }
    },

    {
      id: 'guide-unsung-heroes',
      sermonId: 'sermon-who-s-in-your-corner',
      seriesId: 'series-david',
      themeTitle: null,   // inherits sermon.title, set only to override
      subtitle: 'What nine forgotten names teach you about the friends you actually need',
      primaryPassage: null,   // these four inherit from the sermon, same as
      preacher: null,         // themeTitle. Set one only to override.
      preacherShort: null,
      preachedOn: null,

      shortSummary: [
        'David is at the lowest point of his life. His son Absalom has taken the throne, David has fled Jerusalem into the wilderness, and the people closest to him have turned. Buried inside the chapters that tell that story are nine names, and almost nobody remembers them. Ittai. Zadok and Abiathar. Hushai. Shobi, Machir, and Barzillai. Joab. Nobody in the room had heard of half of them, and they are the reason David makes it back to his throne. Friends are not the extra thing bolted on top of following God. They are how a lot of the actual carrying gets done.',
        'But there is a wrong expectation worth clearing out of the way first. Church does not hand you deep friendship just because you showed up on a Sunday. Your relational capacity is genuinely capped, that is not a flaw, it is how you are built, and the goal was never to know everybody in the building. It is to have a handful of people who actually know you. Spreading yourself thin across a hundred connections gets you exactly that, connections, and none of the depth you are actually hungry for.',
        'Proverbs gives three ways to test whether the people around you, and you yourself, are the real thing. A good friend is constant, still there in the trouble and not just the good years. A good friend keeps it real, willing to risk hurting you for your good, but only once you have actually given them permission. And a good friend gives you counsel that is built on Jesus rather than on a season that is going to end. The question underneath all of it is not who is failing you. It is whether you are the kind of friend you are looking for.'
      ],

      fullSummary: [
        'Charles Spurgeon once said that if he had to give one piece of advice to a young man about where to live, it would be to sacrifice anything in order to live near friends. That sets the register for the whole sermon. It also sets up a hard correction. The instinct plenty of us carry, the quiet line that goes I do not need many friends, I can do this on my own, is not strength. It is a sign of injury. You were not built to run alone, and pretending otherwise usually means something broke a friendship a while back and you decided not to let it happen again.',
        'Start with David’s own record before the crisis. His closest friend was Jonathan, the clearest picture of covenant friendship anywhere in scripture. Jonathan died when David was around thirty, after roughly twelve years of knowing each other. Here is the strange gap. Scripture says remarkably little about David having close friends after that, not until he is in his sixties and back in a crisis. It is worth wondering whether a man who got emotionally wrecked that young held people at arm’s length for decades afterward. Plenty of us do the same thing. A best friend in high school, in college, in some season, then something painful happens and the friendship goes away, and we walk into church saying we know we need people while quietly keeping everyone far enough away that it can never happen again.',
        'The text for this one is 2 Samuel 15 through 19, and the setting is the lowest, most exposed moment of David’s life. His son Absalom has staged a coup and effectively run him off the throne. David is fleeing Jerusalem into the wilderness on foot, weeping, his own son publicly humiliating him in front of the whole kingdom. Right there, in the middle of the collapse, scripture names nine specific people God used to carry him back to his purpose. Most of their names, nobody in the room had ever heard.',
        'The first is Ittai the Gittite, in 2 Samuel 15:19-21. David actually tries to talk him out of coming. You are a foreigner, an exile from your own country, you only got here yesterday, why would you wander around with us, go back. Ittai answers with a covenant oath, as surely as the Lord lives, wherever my lord the king may be, whether it means life or death, there will your servant be. Here is the detail worth sitting with. Ittai was from Gath, which means he came from the same people as Goliath. He had every historical reason to be David’s enemy, and instead he is the one who will not leave. Sometimes the people who end up closest to you were on the other side of something in a previous season.',
        'Next come Zadok and Abiathar, the priests who carry the ark out of the city to be with David rather than staying safe behind, 2 Samuel 15:24-29. These are the ones who stand in your corner when everyone else is turning. Alongside them is Hushai the Archite, called David’s friend by name in the text, who turns around and walks straight back into Jerusalem at real personal risk to undermine Absalom’s counsel from the inside, 2 Samuel 15:32-37.',
        'Then in 2 Samuel 17:27-29 come three more, Shobi, Machir, and Barzillai. They show up in the wilderness with bedding, bowls, wheat, barley, honey, curds, and sheep, because they knew David and his people would be hungry, tired, and thirsty out there. Nobody had to ask them and nobody had to organize them. They saw a need and moved. That is the whole category, the friends who bring the food before you even know you are hungry.',
        'Joab gets treated differently, on purpose. After Absalom is killed, David falls apart, covering his face and crying out for his son over and over, and the army that just won the battle for him slinks back into the city like they lost. Joab kicks the door down, in 2 Samuel 19:1-7. He tells David flat out that he has just humiliated the men who saved his life and the lives of his family, that he apparently loves the people who hate him and hates the people who love him, and that if he does not get up and go encourage his troops right now, not a man will be left with him by nightfall. Joab is the friend who cares enough to confront. That is a category of friend most people do not have and desperately need.',
        'So the first claim is straightforward. Friends are not optional, they are essential, and God routinely uses people whose names you would never recognize to carry you through the worst season of your life. But a correction has to come right behind it, because church does not hand you this automatically just by you showing up. The room is full of people working through their own stuff, and if you assume deep friendship will just happen to you, you will end up disappointed. The Dunbar model, developed by anthropologist Robin Dunbar, lays out the actual shape of relational capacity, roughly five intimate friends, fifteen close friends, fifty friends, a hundred fifty meaningful relationships, and up to five hundred acquaintances. Even Jesus had this shape, twelve disciples, and inside that, Peter, James, and John pulled closer than the rest. That is part of why Home Church runs multiple services instead of building one enormous room. The goal was never a crowd. It is a family where people can actually connect.',
        'Psychotherapist Elizabeth Earnshaw calls the specific problem the friendship depth gap, surrounded by connection, starving for intimacy. You can stand in a room of hundreds and feel completely unseen. You can have a public account and no one who knows anything real about your life. The research says most people are not actually short on friends, they have plenty, what is missing is depth, and what blocks depth is the fear of being known. Communication complexity makes the math concrete, three people is three lines of communication, eight people is twenty eight, fourteen people is ninety one. A great deal of church hurt comes from placing unrealistic expectations on a whole group of people, expectations you could not meet yourself either. You cannot expect everyone to call you back. You can expect a handful of people to actually know you, love you, and grow with you.',
        'From Proverbs come three tests, and they cut both ways, aimed at the people around you and at you. A good friend is constant, present in the trouble and not only in the good years, Proverbs 18:24, there is a friend who sticks closer than a brother. A good friend keeps it real, willing to risk hurting you for your good, Proverbs 27:6, the wounds of a friend are faithful, but that only happens once you have explicitly given someone permission to say the hard thing. And a good friend gives godly counsel, built on Jesus rather than on a season that is going to end, Proverbs 27:17, iron sharpens iron, and plastic does not sharpen iron. It all lands on Proverbs 18:24 read a second way, a man who has friends must show himself friendly. You reap what you sow, so the first question is not who around you is failing. It is whether you are the kind of friend you are looking for. Underneath every friendship in the chapter is the one it is all modeled on. It takes knowing one to be one, and the best friend you will ever have is Jesus, who gave his life for you before you were in any position to earn it.'
      ],

      anchors: [
        {
          label: 'Constant',
          body: 'Present in the trouble, not just the good years. Time and crisis are what actually reveal who your real friends are, not how good things feel when nothing is going wrong. If you are not willing to disadvantage yourself for someone else, you are not this kind of friend yet either, and that cuts toward you before it cuts toward anyone around you.'
        },
        {
          label: 'Keeps it real',
          body: 'Willing to risk hurting you for your good, the way a friend cutting your grass without being asked says more than any text ever could. But correction like that will not happen unless you explicitly give someone permission to say the hard thing and mean it when they do.'
        },
        {
          label: 'Godly counsel',
          body: 'Built on Jesus rather than on a season that eventually ends. A high school friendship built on high school disappears at graduation. A friendship built on shared conviction outlasts every transition, because iron sharpens iron, and plastic does not sharpen iron.'
        }
      ],

      groupSections: [
        {
          heading: 'Getting started',
          questions: [
            'Name one person outside this room who would notice within a day if something was wrong with you. How would they notice, a missed text, a different tone of voice, something else?',
            'When you hear the phrase best friend, whose face comes to mind first, and how long has it actually been since you talked to them?'
          ]
        },
        {
          heading: 'Arm’s length',
          questions: [
            'David lost his closest friend Jonathan around age thirty, and scripture goes quiet on him having close friends again until he is in his sixties and in crisis. Has a friendship that ended badly ever changed how close you let people get afterward? What specifically did it change?',
            'The instinct to say I do not need many friends, I can do this on my own, is a sign of injury, not strength. Where do you catch yourself saying some version of that, and what is actually underneath it when you are honest?'
          ]
        },
        {
          heading: 'The nine',
          questions: [
            'Ittai came from the same people as Goliath and had every reason to be David’s enemy, yet he is the one who would not leave. Has someone who was on the other side of something in a previous season become one of your closest people since? What made that shift possible?',
            'Shobi, Machir, and Barzillai showed up with food that nobody asked for and nobody organized. Think of a hard season in your own life. Who moved without being asked, and what did that action say to you that words never could have?',
            'Joab kicked the door down and told David a truth he did not want to hear. Who in your life actually has that kind of access to you, and when did they last use it?'
          ]
        },
        {
          heading: 'Five, fifteen, fifty',
          questions: [
            'Roughly five intimate friends, fifteen close, fifty friends, that is the shape the Dunbar model gives relational capacity. Looking honestly at your own life right now, is your five full, half full, or empty?',
            'Name one place you have felt quietly disappointed by this church or your group. Could that actually be an expectation problem, something you were expecting from a crowd of people that only a handful of people could ever give you?',
            'The friendship depth gap is being surrounded by connection while starving for intimacy. Where in your life right now do you have the most connection and the least depth?'
          ]
        },
        {
          heading: 'Cutting the grass',
          questions: [
            'When David’s own family and future were on the line, people showed up with bedding and food before he asked. What would cutting the grass look like for someone in your life this week, something you could do without being asked and without announcing it?',
            'If you are not willing to disadvantage yourself, your time, your plans, your money, for someone else’s benefit, you are not yet the friend you are hoping to have. When was the last time that actually cost you something real?',
            'Is there something you have been sitting on about a friend, something true and hard, that you have not said because you were afraid of what it would cost you? What would it take to say it well this week?'
          ]
        },
        {
          heading: 'Iron and plastic',
          questions: [
            'Every friendship is built on something. If a friendship of yours disappeared the moment high school ended, or the job changed, or you moved, what was it actually built on?',
            'Are the people closest to you going after what you are going after, spiritually, in this season? What does your honest answer suggest about the next six months?',
            'Who has your explicit permission to say a hard thing to you and know you will not shut them out for it? If the answer is no one, what is actually stopping you from giving that permission to somebody this week?'
          ]
        },
        {
          heading: 'This week',
          questions: [
            'Stay five minutes after service this week and introduce yourself to one person you have never met. Who are you hoping it turns out to be, even though you cannot control that part?',
            'Pick one name from your five, your fifteen, or your fifty, and do one specific, calendarable thing for them this week without being asked. What is the thing, and what day is it happening?'
          ]
        }
      ],

      reflectionQuestions: [
        'Write down the actual names in your five, your fifteen, and your fifty. Be honest about which tiers are really full and which you have just been telling yourself are full.',
        'Is there a friendship wound in your past you have never actually named as a wound, one that has quietly set the distance you keep from people ever since? Name it tonight, even just to yourself.',
        'Take the three marks one at a time, constant, keeps it real, gives godly counsel, and rate yourself honestly on each. Which one is weakest, and what is one specific thing you could do about it this week?',
        'When was the last time you disadvantaged yourself, real cost to your time, your money, or your plans, for someone else’s benefit? If nothing recent comes to mind, sit with why.',
        'Who has permission to tell you hard things about yourself? If the honest answer is no one, write down the name of the person you could give that permission to, and decide when you will actually have that conversation.',
        'Take your closest three friendships and name what each one is actually built on, a season, a shared activity, proximity, or Jesus. What does that predict about whether they survive your next transition?',
        'What conviction are you currently keeping to yourself that, if you actually said it out loud to your people, would either deepen those friendships or reveal they were shallower than you thought?',
        'Is Jesus functionally your friend, or only your Savior and Lord in the abstract? What would it look like this week to actually relate to him as the friendship underneath every other friendship you have?'
      ],

      oneLiners: [
        'Friends are not optional. They are essential.',
        'It is a sign of injury, not strength, to say you do not need friends.',
        'David’s friends were unsung heroes. You have never heard their names, and they are the ones God used to pull him back.',
        'Sometimes the people who get closest to you were your enemies in a previous season.',
        'Nobody had to tell them what to do. They just did it.',
        'Joab was the friend who cared enough to confront.',
        'If you think you can just show up and deep friendship will happen to you, you are greatly misled.',
        'We are surrounded by connection but starving for intimacy.',
        'You can be in a room of hundreds of people and feel completely unseen.',
        'Your relational capacity is capped. That is not a flaw, that is how God designed you.',
        'A lot of church hurt comes from unrealistic expectations placed on a group of people, expectations you could not meet either.',
        'How do you know a fake friend from a true friend? Time and trouble.',
        'If you will not disadvantage yourself for someone else’s advantage, you are not a good friend.',
        'Do not sit here judging the people in your life. Look in the mirror first.',
        'Iron sharpens iron. Plastic does not sharpen iron.'
      ],

      scriptures: [
        {
          reference: '2 Samuel 15:19-21',
          note: 'Ittai the Gittite refuses to leave David’s side during the flight from Absalom, even though David tries to send him home. He is from Gath, Goliath’s own people, which makes his loyalty the least likely thing in the chapter.'
        },
        {
          reference: '2 Samuel 15:24-29',
          note: 'Zadok and Abiathar, the priests, carry the ark out of Jerusalem to be with David. A picture of the people who stand in your corner the moment everyone else turns.'
        },
        {
          reference: '2 Samuel 15:32-37',
          note: 'Hushai the Archite, called David’s friend by name, walks back into danger to undermine Absalom’s counsel from the inside.'
        },
        {
          reference: '2 Samuel 17:27-29',
          note: 'Shobi, Machir, and Barzillai bring food and bedding into the wilderness without being asked. Use this for the friends who see a need and just move.'
        },
        {
          reference: '2 Samuel 19:1-7',
          note: 'Joab confronts David in his grief and tells him the truth he does not want to hear. The friend who cares enough to confront.'
        },
        {
          reference: 'Proverbs 14:20',
          note: 'The poor are shunned even by their neighbors, but the rich have many friends. Sets up how transactional most relationships actually are before the correction arrives.'
        },
        {
          reference: 'Proverbs 19:4',
          note: 'Wealth attracts friends, but even the closest friend of the poor deserts them. Pairs with 14:20 to name the default before Proverbs 18:24 corrects it.'
        },
        {
          reference: 'Proverbs 18:24',
          note: 'There is a friend who sticks closer than a brother. Used twice, once for the mark of constancy, and again at the close in its other reading, that you have to show yourself friendly.'
        },
        {
          reference: 'Proverbs 27:6',
          note: 'The wounds of a friend are faithful, but an enemy multiplies kisses. The foundation for the keeps it real mark.'
        },
        {
          reference: 'Proverbs 29:5',
          note: 'Whoever flatters his neighbor spreads a net for his feet. Good for showing the group that flattery is not the same thing as kindness.'
        },
        {
          reference: 'Proverbs 28:23',
          note: 'Whoever rebukes a person will later find more favor than one who has a flattering tongue. A real friend risks being rejected for your good.'
        },
        {
          reference: 'Proverbs 27:9',
          note: 'Perfume and incense bring joy to the heart, and the sweetness of a friend comes from their earnest counsel. The foundation for the godly counsel mark.'
        },
        {
          reference: 'Proverbs 27:17',
          note: 'Iron sharpens iron. Pair it with the line that plastic does not sharpen iron when you talk about who your closest people are actually going after.'
        }
      ],

      closingScripture: {
        text: 'One who has unreliable friends soon comes to ruin, but there is a friend who sticks closer than a brother.',
        reference: 'Proverbs 18:24'
      }
    }
  ];

  /* ------------------------------------------------------------- reading plan */

  /* Seed only. The live plan is the is_current row in `reading_plans`.

     Nothing in here has to be bumped on a Sunday, which took two migrations to
     be true of both halves of the row. startsOn is the first day of week 1 and
     Home counts the weeks from it (0024); weeks is the whole schedule and Home
     takes the entry for the week it just counted (0032). currentWeek and
     thisWeek are what a plan missing either of those falls back to. */
  var readingPlan = {
    id: 'plan-david',
    title: 'The Life of David',
    subtitle: 'A twenty week walk through the whole story',
    totalWeeks: 20,
    startsOn: '2026-06-14',
    currentWeek: 8,
    thisWeek: '2 Samuel 11 and 12, plus Psalm 51',
    weeks: [
      '1 Samuel 16 and 17',
      '1 Samuel 18 to 20',
      '1 Samuel 21 to 24',
      '1 Samuel 25 to 27',
      '1 Samuel 28 to 31',
      '2 Samuel 1 to 5',
      '2 Samuel 6 to 10',
      '2 Samuel 11 and 12, plus Psalm 51',
      '2 Samuel 13',
      '2 Samuel 14 and 15',
      '2 Samuel 16 to 18',
      '2 Samuel 19 and 20',
      '2 Samuel 21 and 22, plus Psalm 18',
      '2 Samuel 23 and 24',
      '1 Kings 1 and 2',
      'Psalms 3 to 8',
      'Psalms 22 to 25',
      'Psalms 27, 30 and 31',
      'Psalms 32, 34 and 37',
      'Psalms 138 to 145'
    ],
    current: true,
    resources: [
      { label: 'The Bible Project, 2 Samuel', url: 'https://bibleproject.com/explore/video/2-samuel/' },
      { label: 'Robert Alter, The David Story', url: 'https://www.google.com/search?q=Robert+Alter+The+David+Story' }
    ]
  };

  /* ------------------------------------------------------------------ groups
     Seed only. The live list is the `groups` table, ordered by sort_order, and
     `openings` is edited there rather than here. */

  var groups = [
    {
      id: 'group-lakeview-thu',
      name: 'Lakeview Thursday',
      day: 'Thursday',
      time: '6:30 PM',
      neighborhood: 'Lakeview',
      host: 'Trey and Anna',
      lifeStage: 'Young families',
      openings: true,
      blurb: 'Dinner first, guide second, kids welcome and loud. We eat at 6:30 and start the guide around 7:15.'
    },
    {
      id: 'group-metairie-tue',
      name: 'Metairie Tuesday',
      day: 'Tuesday',
      time: '7:00 PM',
      neighborhood: 'Metairie',
      host: 'Marcus and Dee',
      lifeStage: 'Empty nesters',
      openings: true,
      blurb: 'Coffee, the week’s guide, and a group that has been doing this together for six years. New people fit in fast.'
    },
    {
      id: 'group-uptown-wed',
      name: 'Uptown Wednesday',
      day: 'Wednesday',
      time: '7:30 PM',
      neighborhood: 'Uptown',
      host: 'Jasmine',
      lifeStage: 'Young adults',
      openings: true,
      blurb: 'Mostly twenties, mostly transplants, all of us figuring out this city. We meet in the back room at the house on Freret.'
    },
    {
      id: 'group-westbank-sun',
      name: 'West Bank Sunday',
      day: 'Sunday',
      time: '5:00 PM',
      neighborhood: 'Algiers',
      host: 'Paul and Renee',
      lifeStage: 'All ages',
      openings: false,
      blurb: 'Sunday evening, big table, everybody brings something. Currently full, but tell us you are interested and we will start the next one.'
    }
  ];

  /* ------------------------------------------------------------------ events */

  var events = [
    {
      id: 'event-baptism',
      title: 'Baptism Sunday',
      date: '2026-08-23',
      time: 'All three services',
      location: '216 Giuffrias Ave',
      blurb: 'If you are ready, we would love to get in the water with you. Tell us by the Sunday before and we will handle the rest, towel included.'
    },
    {
      id: 'event-newcomers',
      title: 'Coffee with the Daigles',
      date: '2026-08-16',
      time: '12:30 PM',
      location: 'The Loft, upstairs',
      blurb: 'New here? Stephen and Laura keep an hour open after the last service. No pitch, just coffee and whatever you want to ask.'
    },
    {
      id: 'event-serve-day',
      title: 'City Serve Day',
      date: '2026-09-12',
      time: '8:00 AM to 1:00 PM',
      location: 'Meet at the church',
      blurb: 'One Saturday, four sites across the parish, everybody works. Bring gloves and a friend. Lunch is on us.'
    }
  ];

  /* -------------------------------------------------------------- serve teams */

  /* The church's own seven teams, in the church's own words, in the order
     homechurchnola.com/serve lists them. The four that used to be here were
     plausible inventions and only one of them was real.

     `requirement` is the condition a person has to clear before serving,
     printed on the site as an asterisked footnote. It is its own field rather
     than a sentence inside the blurb, so it reads as a condition. */
  var serveTeams = [
    {
      id: 'team-home-kids',
      name: 'Home Kids',
      commitment: '',
      requirement: 'Background check required',
      blurb: 'Our team invests in the lives of children through worship, Biblical teaching, videos, small groups, and games.'
    },
    {
      id: 'team-greeters',
      name: 'Greeters',
      commitment: '',
      requirement: '',
      blurb: 'Our team plays a vital role in creating a warm and inviting atmosphere for everyone who walks through our doors.'
    },
    {
      id: 'team-set-up',
      name: 'Set Up',
      commitment: 'Saturdays at 4:00 PM, weekly',
      requirement: '',
      blurb: 'Our team works behind the scenes to create a welcoming and functional space for worship and fellowship. This includes assembling the stage, curtains, and chairs.'
    },
    {
      id: 'team-tear-down',
      name: 'Tear Down',
      commitment: 'Sundays after service, weekly',
      requirement: '',
      blurb: 'Our team helps with the transition of our worship space by taking down the stage, curtains, and chairs after the Sunday Service.'
    },
    {
      id: 'team-parking',
      name: 'Parking',
      commitment: '',
      requirement: '',
      blurb: 'Our team serves as the first impression for those coming to Home Church by welcoming people on and off the property and by providing a safe and efficient parking experience.'
    },
    {
      id: 'team-prayer',
      name: 'Prayer Team',
      commitment: '',
      requirement: '',
      blurb: 'Our team provides prayer covering for services, teams and ministries at Home Church. We meet to pray in person and online via Zoom.'
    },
    {
      id: 'team-worship',
      name: 'Worship Team',
      commitment: '',
      requirement: 'Training process required',
      blurb: 'Our team facilitates a powerful worship experience through vocals, instruments, and audio engineering.'
    }
  ];

  /* ------------------------------------------------------------- next steps */

  /* url is what turns a step into an action. A step without one renders as a
     description and stops there, which is the honest shape for 'I'm new here'
     until the church picks a destination for it. */
  var nextSteps = [
    { id: 'step-new', title: 'I’m new here',
      blurb: 'Tell us a little about yourself and we will find you on Sunday.',
      url: null, ctaLabel: '' },
    { id: 'step-baptism', title: 'I want to be baptized',
      blurb: 'We will walk you through it, start to finish.',
      url: 'https://homechurchnola.churchcenter.com/people/forms/953766',
      ctaLabel: 'Sign up for baptism' },
    { id: 'step-prayer', title: 'I need prayer',
      blurb: 'Send it to us. A real person reads every one of these.',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSexkC8J_AhOtQUCH1lNaE5tIP5bXAjmB36iXubtWxQY0ymgGQ/viewform',
      ctaLabel: 'Tell us how to pray' },
    { id: 'step-alpha', title: 'I have questions about faith',
      blurb: 'Alpha is a few weeks of dinner, a short talk, and honest conversation. No question is too basic and nobody is going to put you on the spot.',
      url: 'https://homechurchnola.churchcenter.com/registrations/events/3798127',
      ctaLabel: 'Save your spot' },
    { id: 'step-group', title: 'I want to lead a group',
      blurb: 'We will train you and hand you a guide every week.',
      url: 'https://homechurchnola.groupvitals.com/leaderform',
      ctaLabel: 'Sign up to host' },
    { id: 'step-email', title: 'Keep me in the loop',
      blurb: 'The occasional email with what is coming up. Not many, and you can leave whenever you want.',
      url: 'https://lively-breeze-89532.myflodesk.com/g7ga3zf20y',
      ctaLabel: 'Join the email list' }
  ];

  /* ------------------------------------------------------- announcement */

  var announcements = [
    {
      // Same shape the Supabase mapper produces, so a bundled announcement and
      // a fetched one go through Home's window check identically. Both ends
      // open here: a bundled announcement cannot be retired without a build
      // anyway, which is the whole reason the table exists.
      id: 'ann-serve-day',
      // Home labels the card "Announcement 08/16/2026" from this. A fetched
      // row gets it from starts_on or created_at; a bundled one has to say it
      // outright, and a phone with no signal deserves the same card as
      // everyone else rather than a label with the date missing.
      publishedOn: '2026-08-16',
      title: 'City Serve Day, September 12',
      body: 'Four sites, one Saturday, every hand we can get. Sign up at the Welcome Desk or tell your group leader.',
      // No markup, so the announcement's own page draws `body` as paragraphs
      // the way it did before the editor existed. A bundled announcement is
      // the floor a phone with no signal stands on and it is one sentence:
      // there is nothing here worth a bold word.
      bodyHtml: null,
      startsOn: null,
      endsOn: null,
      priority: 0,
      // A bundled announcement has no picture, no video and no link. Every
      // field exists anyway so the shape matches the mapper in js/content.js
      // exactly, and no screen has to ask which kind of announcement it is
      // holding.
      imageUrl: null,
      videoUrl: null,
      images: [],
      linkUrl: null,
      linkTitle: null,
      linkImageUrl: null,
      // Never pinned. A bundled announcement is the floor a phone with no
      // signal stands on, and a strip across the top of every tab that no
      // admin chose and no admin can take down is not a floor, it is a fault.
      pinned: false,
      createdAt: '2026-08-16T12:00:00Z'
    }
  ];

  /* ------------------------------------------------- pages and settings

     Both empty, and both for the same reason the Instagram rail is: they hold
     what an admin has written from inside the app, and a copy frozen at build
     time would be a stale answer presented as the current one. The screens
     that read them fall back to the words in their own source file when the
     table has not been reached, which is a better floor than a snapshot.

     They exist here at all because js/content.js fills HC.data by mutating
     these arrays in place rather than replacing them, so the key has to be
     present before the first fetch lands. See the header of that file. */

  var contentPages = [];
  var appSettings = [];

  /* Sentences the church has rewritten from inside the app, one row per slot,
     filled from text_overrides. Empty here for the same reason as the two
     above, and more so: an override only means anything against the string it
     replaces, and that string is in the screen that draws it. No row means
     the app draws its own words, which is exactly what a phone that has never
     reached Supabase should do. See js/edit-mode.js and migration 0030. */
  var textOverrides = [];

  /* Instagram posts, for the rail at the top of Connect.

     Empty on purpose, and it is the one collection in this file that should
     stay empty. Everything else here is a floor: a real guide, a real event,
     something true enough to show a phone with no signal on its first launch.
     A frozen snapshot of "the latest posts" is a contradiction. By the time a
     build reaches the App Store it would be months old, and presenting a
     stale post as the newest thing the church has said is worse than showing
     no rail at all.

     Connect drops the whole section when this is empty, the same way it drops
     serve teams and events, so nothing renders until Supabase has real rows.
     See supabase/migrations/0015_instagram_posts.sql. */
  var instagramPosts = [];

  /* --------------------------------------------------------------- home media

     The carousel under the greeting on Home. Empty, on purpose: with nothing
     in here Home shows the latest Instagram post on its own, exactly as it did
     before that block could hold more than one thing.

     Put a video from the pastor in here and it becomes the first slide, with
     Instagram one swipe behind it. One object per slide:

       { id: 'video-2026-08-23',              // required, unique
         kind: 'video',                       // or 'photo', which is the default
         label: 'From Pastor Trey',           // the eyebrow over the frame
         videoUrl: 'https://.../update.mp4',  // kind video, plays where it sits
         posterUrl: 'https://.../still.jpg',  // the frame before it plays
         imageUrl: 'https://.../photo.jpg',   // kind photo
         url: 'https://...',                  // optional, makes a photo a tap
         aspect: '9x16',                      // the shape it was shot in
         caption: 'Two minutes on Sunday.' }  // optional, three lines on screen

     aspect is one of 4x3, 1x1, 4x5, 16x9, 9x16. A video defaults to 9x16, a
     phone held upright, and is shown whole rather than cropped, so this is
     the difference between a video with no bars around it and one with bars
     down both sides. A photo defaults to the 4x3 the block has always used.

     A file this size wants a real host behind it rather than the repo: an mp4
     in assets/ ships inside the App Store build, so a weekly video would mean
     a weekly release. Supabase Storage gives a URL that can change without one.

     This is the seed, the same as every list above it. When these start
     arriving weekly they belong in their own table, read the way the rest of
     this file's lists are: `/new-content-type home media` scaffolds the
     migration and the one line in content.js, and this array is what it fills.
     Nothing in js/screens/home.js changes when that happens. */
  var homeMedia = [];

  /* -------------------------------------------------------------- worship sets

     What the band played on Sunday, newest first, for the Worship screen
     behind •••. One entry per Sunday, and the songs inside it are in the order
     they were played, which is the order the screen draws them.

       { id: 'worship-2026-08-23',   // permanent, derived from the date
         servedOn: '2026-08-23',     // the Sunday
         sermonId: 'sermon-...',     // or null until the episode is published
         songs: [ { title, artist, artUrl, lyricsUrl, links: {...} } ] }

     NO SERMON TITLE IN HERE, and that is the point of the shape. The header
     on the screen reads through to the podcast row for the name, so
     /new-podcast renaming Sunday's message renames it here too and there is
     never a second copy to go stale. See migration 0034.

     Only `title` is load bearing on a song. Art, links and lyrics are each
     optional and a missing one draws nothing rather than a gap, which is what
     lets a set be published on the Sunday afternoon and filled in later.

     The seed, like everything above it. Supabase is where these are really
     published, by /new-worship. */
  var worshipSets = [
    {
      id: 'worship-2026-08-23',
      servedOn: '2026-08-23',
      sermonId: 'sermon-last-words',
      songs: [
        { title: 'So Much', artist: 'Life.Church Worship',
          artUrl: '', lyricsUrl: '', links: {} },
        { title: 'Holy Spirit', artist: 'Jesus Culture',
          artUrl: '', lyricsUrl: '', links: {} },
        { title: 'Lean Back', artist: 'Maverick City Music',
          artUrl: '', lyricsUrl: '', links: {} },
        { title: 'No Body', artist: 'Elevation Worship',
          artUrl: '', lyricsUrl: '', links: {} }
      ]
    }
  ];

  /* ------------------------------------------------------------------ export */

  HC.data = {
    church: church,
    podcast: podcast,
    series: series,
    sermons: sermons,
    guides: guides,
    readingPlan: readingPlan,
    groups: groups,
    events: events,
    serveTeams: serveTeams,
    nextSteps: nextSteps,
    announcements: announcements,
    instagramPosts: instagramPosts,
    homeMedia: homeMedia,
    worshipSets: worshipSets,
    contentPages: contentPages,
    appSettings: appSettings,
    textOverrides: textOverrides,

    /* ------------------------------------------------------------- helpers */

    getSeries: function (id) {
      return series.filter(function (s) { return s.id === id; })[0] || null;
    },

    /* A page by its permanent id, or null. Null is a real answer and every
       caller handles it: it is what a screen sees before the first content
       fetch lands, and what it sees forever on a project where nobody has
       written that page yet. Both cases want the same thing, the words still
       in the source file. */
    getPage: function (id) {
      return contentPages.filter(function (p) { return p.id === id; })[0] || null;
    },

    /* One app setting's value, or the fallback.

       The fallback is not decoration. These rows are read over the network
       like all other content, so every read has to work on a phone that has
       never reached Supabase, and the honest default for a feature flag is
       the behaviour the app had before the flag existed. Passing one is
       required rather than optional for that reason: `undefined` leaking into
       a switch is how a banner appears on every phone at once. */
    setting: function (key, fallback) {
      var row = appSettings.filter(function (s) { return s.key === key; })[0];
      return row ? row.value : fallback;
    },

    /* One sentence, either as the church last rewrote it or as it ships in
       the app. Every editable string in a screen is read through here.

       THE FALLBACK IS THE SENTENCE ITSELF, passed in by the screen that draws
       it, and it is required rather than optional. That is what keeps the
       words in the source file the real floor: a phone with no signal, a
       project with no 0030, and a slot nobody has ever edited all draw the
       same thing, and it is a real sentence rather than a gap.

       An empty override is honored and is not the same as no override. A row
       holding '' is an admin having deliberately taken a line off the screen,
       which is a thing people want on a week when a note under a button is no
       longer true, and falling back to the built-in words there would be the
       app arguing with them. See migration 0030 section 1. */
    copy: function (slot, fallback) {
      var row = textOverrides.filter(function (o) { return o.slot === slot; })[0];
      return row ? row.value : fallback;
    },

    getSermon: function (id) {
      return sermons.filter(function (s) { return s.id === id; })[0] || null;
    },

    getGuide: function (id) {
      return guides.filter(function (g) { return g.id === id; })[0] || null;
    },

    // Newest first, which is how every list in the app wants them. Two
    // messages can share a Sunday, a second service or a second campus, so
    // the comparator has to return 0 on a tie rather than guessing, which
    // would leave the pair in an arbitrary order. Ties fall back to the
    // publish date, then to the order they are written in this file.
    sermonsByDate: function () {
      return sermons.slice().sort(function (a, b) {
        if (a.preachedOn !== b.preachedOn) return a.preachedOn < b.preachedOn ? 1 : -1;
        if (a.publishedOn !== b.publishedOn) return a.publishedOn < b.publishedOn ? 1 : -1;
        return 0;
      });
    },

    latestSermon: function () {
      return this.sermonsByDate()[0];
    },

    sermonsInSeries: function (seriesId) {
      return this.sermonsByDate().filter(function (s) { return s.seriesId === seriesId; });
    },

    // Sorts on the resolved date, since a guide's own preachedOn is normally
    // null and the sermon is the one holding it.
    guidesByDate: function () {
      var self = this;
      return guides.slice().sort(function (a, b) {
        var x = self.guideMeta(a).preachedOn, y = self.guideMeta(b).preachedOn;
        return x === y ? 0 : (x < y ? 1 : -1);
      });
    },

    latestGuide: function () {
      return this.guidesByDate()[0];
    },

    guideForSermon: function (sermonId) {
      return guides.filter(function (g) { return g.sermonId === sermonId; })[0] || null;
    },

    /* A message has one name, and it lives on the sermon, because the podcast
       is what the church actually called it in public. Every guide inherits
       that name. themeTitle exists only for the rare guide that needs to be
       called something else, a two part message or a guide spanning a couple
       of Sundays, and is null the rest of the time. Never rename an id to
       follow a title, ids key a leader's checkmarks and journal entries in
       localStorage and renaming one orphans their notes. */
    guideTitle: function (guide) {
      return this.guideMeta(guide).title;
    },

    // Everything a guide says about its message, resolved. The guide's own
    // field wins when it is set, which is the override, and otherwise the
    // sermon answers. Nothing here is stored twice, so nothing can disagree.
    guideMeta: function (guide) {
      var s = guide ? this.getSermon(guide.sermonId) : null;
      function pick(a, b) { return a || b || ''; }
      return {
        title:         pick(guide && guide.themeTitle,     s && s.title),
        preacher:      pick(guide && guide.preacher,       s && s.preacher),
        preacherShort: pick(guide && guide.preacherShort,  s && s.preacherShort),
        preachedOn:    pick(guide && guide.preachedOn,     s && s.preachedOn),
        passage:       pick(guide && guide.primaryPassage, s && s.passage)
      };
    },

    // The Sunday a message was preached, given the date its episode posted.
    // Episodes land the Monday or Tuesday after, so the Sunday on or before
    // the publish date is the one, and anything further back than a week is
    // not a match at all.
    sermonForEpisodeDate: function (publishedOn) {
      var parts = String(publishedOn).split('-');
      var d = new Date(+parts[0], (+parts[1]) - 1, +parts[2]);
      d.setDate(d.getDate() - d.getDay());          // back up to that Sunday
      var iso = d.getFullYear() + '-' +
        ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
        ('0' + d.getDate()).slice(-2);
      return sermons.filter(function (s) { return s.preachedOn === iso; })[0] || null;
    },

    currentSeries: function () {
      return series.filter(function (s) { return s.current; })[0] || series[0];
    },

    /* ----------------------------------------------------------- worship

       The setlists, newest Sunday first. That order is the order the week
       carousel runs in, so the current week is the slide you land on and
       older weeks are to the right of it, which is the same direction the
       archive runs everywhere else in this app.

       Sorted here rather than trusted from the table, for the same reason
       announcements are: a cached payload written before the `order` on that
       table existed is not in any order at all. */
    worshipSetsByDate: function () {
      return worshipSets.slice().sort(function (a, b) {
        if (a.servedOn === b.servedOn) return 0;
        return a.servedOn < b.servedOn ? 1 : -1;
      });
    },

    getWorshipSet: function (id) {
      return worshipSets.filter(function (w) { return w.id === id; })[0] || null;
    },

    /* The message that was preached the morning a set was played, or null.

       TWO WAYS TO ASK, and the order matters. The id is exact and is what a
       set has once /new-podcast has run. Until then it is null, because the
       setlist goes up on the Sunday afternoon and the episode does not post
       until Monday, and the date is what answers meanwhile.

       Null is a real answer and the screen draws for it: a set published on
       Sunday shows its date and its songs, and grows the message's name when
       the episode lands, without anybody editing the set. */
    sermonForWorship: function (set) {
      if (!set) return null;
      if (set.sermonId) {
        var byId = this.getSermon(set.sermonId);
        if (byId) return byId;
      }
      /* By date, and only when it is unambiguous. The catalogue already has
         two messages preached on one Sunday, so a date with two answers has
         no answer: naming one of them would be a coin toss printed under a
         setlist, and the guide below still carries the week. */
      var sameDay = sermons.filter(function (s) {
        return s.preachedOn === set.servedOn;
      });
      return sameDay.length === 1 ? sameDay[0] : null;
    },

    /* The guide for that morning. Through the message when there is one, so a
       Sunday with two messages still finds nothing rather than guessing, and
       straight off the date when the episode has not landed yet. A guide is
       usually written days before the episode posts, so this is often the
       only thing on the header with a name on it. */
    guideForWorship: function (set) {
      if (!set) return null;
      var sermon = this.sermonForWorship(set);
      if (sermon) {
        var viaSermon = this.guideForSermon(sermon.id);
        if (viaSermon) return viaSermon;
      }
      var sameDay = guides.filter(function (g) {
        return g.preachedOn === set.servedOn;
      });
      return sameDay.length === 1 ? sameDay[0] : null;
    },

    /* What the header calls that Sunday. The message's own title, then the
       guide's, then nothing at all, which the screen draws as the date on its
       own rather than as an empty line.

       NEVER READ FROM THE WORSHIP ROW, which does not carry a title and must
       not grow one. This is the whole reason /new-podcast's rename reaches
       this screen for free. */
    worshipTitle: function (set) {
      var sermon = this.sermonForWorship(set);
      if (sermon && sermon.title) return sermon.title;
      var guide = this.guideForWorship(set);
      if (guide) return this.guideTitle(guide);
      return '';
    },

    // Where the Listen tab sends you. The episode when we have its link,
    // otherwise the show, which is never wrong, only less specific.
    episodeUrl: function (sermon) {
      return (sermon && sermon.episodeUrl) || podcast.showUrl;
    },

    /* Whether this message's own audio has posted. A different question from
       episodeUrl, which always answers with somewhere to go, and the two get
       confused because for a few days a week they disagree: the guide is
       published on the Thursday and the episode does not land until the
       Monday, so the row exists, the guide opens off it, and there is no
       audio behind it yet. /new-podcast filling in episode_url is what flips
       this, and nothing else needs touching when it does. */
    hasEpisode: function (sermon) {
      return !!(sermon && sermon.episodeUrl);
    },

    /* What the link to a message's audio calls itself.

       ONE ANSWER, because Listen and Worship both draw that link, and a
       Sunday where one screen offers the message and the other says it is
       coming is the app disagreeing with itself about the same episode.

       Before the episode posts the tap still goes somewhere useful, the show
       on Spotify, which is exactly where you would wait for it. What it must
       not do is promise a message that is not there, so the words change and
       the destination does not. After it posts the label follows the URL
       rather than assuming: the back catalogue links each episode on the
       podcast host and the newer ones link straight into Spotify, and a
       button naming the wrong app is a button that lies about where the tap
       lands. */
    episodeLabel: function (sermon) {
      if (!this.hasEpisode(sermon)) return 'Audio coming soon!';
      return sermon.episodeUrl.indexOf('spotify.com') !== -1
        ? 'Listen on ' + podcast.platform
        : 'Listen to this message';
    },

    // The episode notes, as an array of paragraphs. Falls back to the one
    // line description so every message reads as something, never as blank.
    episodeSummary: function (sermon) {
      if (!sermon) return [];
      if (sermon.summary && sermon.summary.length) return sermon.summary;
      return sermon.description ? [sermon.description] : [];
    },

    /* ------------------------------------------------------ announcements

       Which announcements the church is showing today, in the order they go
       on screen: priority first for the rare Sunday when something has to sit
       above a newer card, then newest, then the id so a tie is broken
       deliberately rather than by whatever order the rows arrived in.

       ONE DEFINITION, because two places read it and they must agree. Home
       draws this list as cards, and the shell draws the top pinned one of
       them as the strip under the top bar. While that was two copies of the
       same three date comparisons, "the announcement came down" and "its
       banner came down" were two facts that could quietly drift, and the one
       that drifts is the banner, because it is the one nobody is looking at.

       Dates are compared as 'YYYY-MM-DD' strings in the phone's own zone,
       which is exact: starts_on and ends_on are plain dates, not timestamps,
       so no timezone is involved. startsOn is the first day it shows, endsOn
       is the first day it does not, and either end null means that end is
       open. A Saturday event announced with endsOn on the Sunday is gone when
       people wake up Sunday.

       DISMISSALS ARE NOT APPLIED HERE, on purpose. Whether this phone has put
       something away lives in js/store.js, which loads after this file and
       knows nothing about content, and the two callers put away different
       things anyway: a card on Home and a strip in the shell are dismissed
       separately. So this answers what the church is saying today, and each
       caller decides what this phone has already been told. */
    liveAnnouncements: function () {
      var d = new Date();
      var today = d.getFullYear() + '-' +
        ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
        ('0' + d.getDate()).slice(-2);

      return (announcements || []).filter(function (a) {
        if (a.startsOn && today < a.startsOn) return false;
        if (a.endsOn && today >= a.endsOn) return false;
        return true;
      }).sort(function (x, y) {
        var px = x.priority || 0;
        var py = y.priority || 0;
        if (px !== py) return py - px;
        var cx = String(x.createdAt || x.publishedOn || '');
        var cy = String(y.createdAt || y.publishedOn || '');
        if (cx !== cy) return cx < cy ? 1 : -1;
        return String(x.id) < String(y.id) ? -1 : 1;
      });
    },

    /* The announcements an admin has pinned and that are on screen today, in
       the order they would take the strip under the top bar. Almost always
       none or one.

       A LIST RATHER THAN THE TOP ONE, which is the only reason this is not
       called pinnedAnnouncement(). More than one row can carry the flag, on
       purpose: migration 0028 says why a unique index is worse. The strip
       shows one at a time, and which one is a question this file cannot
       answer, because the answer depends on what this phone has already
       dismissed and dismissals live in js/store.js. So the order is decided
       here, where the order of announcements is decided, and the shell takes
       the first one still standing. See pinnedNow() in js/app.js. */
    pinnedAnnouncements: function () {
      return this.liveAnnouncements().filter(function (a) {
        return !!a.pinned;
      });
    },

    /* One announcement by its permanent id, or null.

       ASKED OF THE WHOLE LIST AND NOT OF THE LIVE ONE, which is the only
       interesting thing about it. An announcement's own page is a route with
       an id in it, so it is a real address: it is in the history stack, the
       back gesture returns to it, and a phone that was reading one when its
       dates ran out should see the words it was reading rather than a screen
       that empties itself mid-sentence. The card comes off Home at midnight,
       which is what the window is for; the page somebody navigated to does
       not, and the screen says how old it is instead. See
       js/screens/announcement.js.

       Null is a real answer. It is what a deleted announcement gives, and
       what an id from a history entry written by an older build gives, and
       the screen draws the warm version of "not here" for both. */
    getAnnouncement: function (id) {
      return announcements.filter(function (a) { return a.id === id; })[0] || null;
    }
  };

})(window.HC = window.HC || {});
