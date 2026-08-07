/* ==========================================================================
   Home Church, seed content
   Shaped like a future API payload. When a real backend exists, replace the
   body of HC.data.load() with a fetch and nothing else in the app changes.

   Loaded as a classic script, not an ES module, so the app opens straight
   from the file system and inside a Capacitor web view without a build step.
   ========================================================================== */

(function (HC) {
  'use strict';

  /* ------------------------------------------------------------------ church */

  var church = {
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
    // TODO confirm the live Overflow URL with whoever owns giving before launch.
    givingUrl: 'https://overflow.co/give/homechurchnola',
    websiteUrl: 'https://www.homechurchnola.com',
    social: [
      { label: 'Instagram', url: 'https://www.instagram.com/homechurchnola' },
      { label: 'Facebook', url: 'https://www.facebook.com/homechurchnola' },
      { label: 'YouTube', url: 'https://www.youtube.com/@homechurchnola' }
    ]
  };

  /* ------------------------------------------------------------------ series */

  var series = [
    {
      id: 'series-david',
      title: 'The Life of David',
      subtitle: 'A shepherd, a king, a mess, a promise.',
      artLabel: 'The Life of David',
      startedOn: '2026-03-01',
      current: true,
      blurb: 'Twenty weeks through the whole story, the giant and the cave and the throne and the ruin and the road back. We are not skipping the hard parts.'
    },
    {
      id: 'series-city',
      title: 'Built for This City',
      subtitle: 'What it looks like to love the place you actually live.',
      artLabel: 'Built for This City',
      startedOn: '2026-06-14',
      current: false,
      blurb: 'Three weeks on New Orleans, our neighbors, and the difference between living in a city and belonging to one.'
    }
  ];

  /* ----------------------------------------------------------------- sermons */

  var sermons = [
    {
      id: 'sermon-slow-burn',
      seriesId: 'series-david',
      title: 'The Slow Burn',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-08-02',
      duration: '41 min',
      passage: '2 Samuel 11 & 12',
      guideId: 'guide-slow-burn',
      artLabel: 'The Slow Burn',
      description: 'Nobody wakes up and decides to blow up their life. It happens by degrees, in the ordinary hours, long before anyone notices.'
    },
    {
      id: 'sermon-seat-table',
      seriesId: 'series-david',
      title: 'A Seat at the Table',
      preacher: 'Alan Boudreaux',
      preacherShort: 'Alan',
      preachedOn: '2026-07-26',
      duration: '38 min',
      passage: '2 Samuel 9',
      guideId: 'guide-seat-table',
      artLabel: 'A Seat at the Table',
      description: 'A forgotten grandson of a dead king, hiding in a town called nowhere, gets sent for by the one man he was sure wanted him gone.'
    },
    {
      id: 'sermon-cave-days',
      seriesId: 'series-david',
      title: 'Cave Days',
      preacher: 'Laura Daigle',
      preacherShort: 'Laura',
      preachedOn: '2026-07-19',
      duration: '36 min',
      passage: '1 Samuel 22',
      guideId: null,
      artLabel: 'Cave Days',
      description: 'Before the throne there was a cave, and everybody in it was in debt, in distress, or bitter. That is who God builds with.'
    },
    {
      id: 'sermon-neighbors',
      seriesId: 'series-city',
      title: 'Neighbors, Not Projects',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-06-28',
      duration: '39 min',
      passage: 'Luke 10:25-37',
      guideId: null,
      artLabel: 'Neighbors, Not Projects',
      description: 'The lawyer wanted a category. Jesus gave him a Samaritan, a ditch, and a bill he paid himself.'
    },
    {
      id: 'sermon-family-table',
      seriesId: 'series-city',
      title: 'The Family Table',
      preacher: 'Laura Daigle',
      preacherShort: 'Laura',
      preachedOn: '2026-06-21',
      duration: '34 min',
      passage: 'Acts 2:42-47',
      guideId: null,
      occasion: 'Father’s Day',
      artLabel: 'The Family Table',
      description: 'The first church did not have a building. It had a room, a meal, and an open door, and the city noticed.'
    },
    {
      id: 'sermon-city-church',
      seriesId: 'series-city',
      title: 'A Church of the City',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-06-14',
      duration: '37 min',
      passage: 'Jeremiah 29:4-7',
      guideId: null,
      artLabel: 'A Church of the City',
      description: 'God tells exiles to plant gardens and build houses in the city they never chose. Seek its good, and you will find your own.'
    }
  ];

  /* ------------------------------------------------------------------ guides */

  var guides = [
    {
      id: 'guide-seat-table',
      sermonId: 'sermon-seat-table',
      seriesId: 'series-david',
      themeTitle: 'A Seat at the Table',
      subtitle: 'What a forgotten grandson of a dead king teaches us about grace',
      primaryPassage: '2 Samuel 9',
      preacher: 'Alan Boudreaux',
      preacherShort: 'Alan',
      preachedOn: '2026-07-26',

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
      sermonId: 'sermon-slow-burn',
      seriesId: 'series-david',
      themeTitle: 'The Slow Burn',
      subtitle: 'How a good man ends up somewhere he never planned to go',
      primaryPassage: '2 Samuel 11 & 12',
      preacher: 'Stephen Daigle',
      preacherShort: 'Stephen',
      preachedOn: '2026-08-02',

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
    }
  ];

  /* ------------------------------------------------------------- reading plan */

  var readingPlan = {
    id: 'plan-david',
    title: 'The Life of David',
    subtitle: 'A twenty week walk through the whole story',
    totalWeeks: 20,
    currentWeek: 8,
    thisWeek: '2 Samuel 11 and 12, plus Psalm 51',
    resources: [
      { label: 'The Bible Project, 2 Samuel', url: 'https://bibleproject.com/explore/video/2-samuel/' },
      { label: 'Robert Alter, The David Story', url: 'https://www.google.com/search?q=Robert+Alter+The+David+Story' }
    ]
  };

  /* ------------------------------------------------------------------ groups */

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

  var serveTeams = [
    {
      id: 'team-kids',
      name: 'Home Kids',
      commitment: 'Two Sundays a month',
      blurb: 'Birth through fifth grade. Loud, joyful, and the most important room in the building.'
    },
    {
      id: 'team-welcome',
      name: 'Welcome Team',
      commitment: 'One Sunday a month',
      blurb: 'Doors, coffee, and being the first face somebody sees. If you are good at remembering names, this is you.'
    },
    {
      id: 'team-worship',
      name: 'Worship and Production',
      commitment: 'Weekly rehearsal, two Sundays a month',
      blurb: 'Band, vocals, sound, lights, and cameras. Auditions are casual and we will train you on the technical side.'
    },
    {
      id: 'team-care',
      name: 'Care Team',
      commitment: 'As needed',
      blurb: 'Meals after a baby, rides to appointments, showing up when a family is in the hardest week of their year.'
    }
  ];

  /* ------------------------------------------------------------- next steps */

  var nextSteps = [
    { id: 'step-new', title: 'I’m new here', blurb: 'Tell us a little about yourself and we will find you on Sunday.' },
    { id: 'step-baptism', title: 'I want to be baptized', blurb: 'The next one is August 23. We will walk you through it.' },
    { id: 'step-prayer', title: 'I need prayer', blurb: 'Send it to us. A real person reads every one of these.' },
    { id: 'step-group', title: 'I want to lead a group', blurb: 'We will train you and hand you a guide every week.' }
  ];

  /* ------------------------------------------------------- announcement */

  var announcements = [
    {
      id: 'ann-serve-day',
      eyebrow: 'One thing',
      title: 'City Serve Day, September 12',
      body: 'Four sites, one Saturday, every hand we can get. Sign up at the Welcome Desk or tell your group leader.'
    }
  ];

  /* ------------------------------------------------------------------ export */

  HC.data = {
    church: church,
    series: series,
    sermons: sermons,
    guides: guides,
    readingPlan: readingPlan,
    groups: groups,
    events: events,
    serveTeams: serveTeams,
    nextSteps: nextSteps,
    announcements: announcements,

    /* ------------------------------------------------------------- helpers */

    getSeries: function (id) {
      return series.filter(function (s) { return s.id === id; })[0] || null;
    },

    getSermon: function (id) {
      return sermons.filter(function (s) { return s.id === id; })[0] || null;
    },

    getGuide: function (id) {
      return guides.filter(function (g) { return g.id === id; })[0] || null;
    },

    // Newest first, which is how every list in the app wants them.
    sermonsByDate: function () {
      return sermons.slice().sort(function (a, b) {
        return a.preachedOn < b.preachedOn ? 1 : -1;
      });
    },

    latestSermon: function () {
      return this.sermonsByDate()[0];
    },

    sermonsInSeries: function (seriesId) {
      return this.sermonsByDate().filter(function (s) { return s.seriesId === seriesId; });
    },

    guidesByDate: function () {
      return guides.slice().sort(function (a, b) {
        return a.preachedOn < b.preachedOn ? 1 : -1;
      });
    },

    latestGuide: function () {
      return this.guidesByDate()[0];
    },

    guideForSermon: function (sermonId) {
      return guides.filter(function (g) { return g.sermonId === sermonId; })[0] || null;
    },

    currentSeries: function () {
      return series.filter(function (s) { return s.current; })[0] || series[0];
    }
  };

})(window.HC = window.HC || {});
