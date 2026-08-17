import type { EventContext, GameEvent } from '../game/types';

/**
 * Eighteen events, and not one of them fires at random into a vacuum.
 *
 * Two rules hold this file together. Every event names a specific member of
 * the crew — `actor` decides who, and the body says their name — and every
 * event is conditioned on something the player did: a trait they hired, kit
 * they bought or skipped, intel they didn't buy, noise they've already made.
 * An event that could fire on any run with any crew is a slot machine, and
 * gets deleted rather than balanced.
 *
 * Choices resolve against a check where a check makes sense. A choice with no
 * check is a certainty with a cost, which is often the more interesting option
 * at three in the morning.
 */

const first = (ctx: EventContext) => ctx.actor.name.split(' ')[0];

export const EVENTS: GameEvent[] = [
  {
    id: 'supervisor_returns',
    stages: ['entry', 'security'],
    weight: 10,
    actor: { any: true },
    title: 'The supervisor came back',
    body: 'The night security supervisor has returned early for a bag he left behind. {actor} can see him through the glass, patting his pockets.',
    choices: [
      {
        id: 'bluff',
        label: 'Bluff him',
        hint: 'Somebody walks out and talks to the man.',
        check: { attr: 'social', dc: 55 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} meets him at the door, complains about the contract cleaners, and holds it open for him. He leaves apologising.`,
                time: 40,
                composure: 4,
              }
            : {
                text: 'He listens to about nine words of it, then goes very still and reaches for his radio.',
                time: 60,
                noise: 18,
                alarm: true,
                composure: -14,
              },
      },
      {
        id: 'reroute',
        label: 'Change the exit',
        hint: 'Give up the route you rehearsed and take the loading side.',
        resolve: (ctx) => ({
          text: `${first(ctx)} pulls everyone back through the service corridor. It costs time and nobody likes the new door.`,
          time: 110,
          noise: 4,
          takeMul: -0.04,
        }),
      },
      {
        id: 'cameras',
        label: 'Take the cameras for forty-five seconds',
        hint: 'Your hacker says forty-five. Your hacker has said forty-five before.',
        when: (ctx) => ctx.has('hacker'),
        check: { attr: 'technical', dc: 60 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `The feeds hold a still frame of an empty corridor. He walks through it past ${first(ctx)} and sees nothing worth remembering.`,
                time: 45,
                noise: 3,
              }
            : {
                text: 'The loop stutters. Whatever he saw on that monitor, he saw it twice.',
                time: 50,
                noise: 22,
                alarm: true,
              },
      },
      {
        id: 'abort',
        label: 'Call it off',
        hint: 'Walk away with nothing and no record of having been here.',
        resolve: () => ({
          text: 'Everyone goes home. It is the correct decision and it feels terrible.',
          abort: true,
        }),
      },
    ],
  },
  {
    id: 'hothead_escalates',
    stages: ['entry', 'objective', 'extraction'],
    weight: 8,
    actor: { trait: 'hothead' },
    title: 'It is getting loud',
    body: '{actor} has stopped asking the man on the floor to be quiet and started telling him.',
    choices: [
      {
        id: 'pull_back',
        label: 'Pull them off',
        hint: 'Somebody has to physically move them.',
        check: { attr: 'nerve', dc: 50 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} is walked away from it. The room breathes again.`,
                time: 30,
                noise: 6,
                composure: -6,
              }
            : {
                text: 'It takes three attempts, and by the third everyone in the building has heard it.',
                time: 55,
                noise: 26,
                composure: -12,
              },
      },
      {
        id: 'let_it_ride',
        label: 'Let them work',
        hint: 'Fear is fast. Fear is also remembered.',
        resolve: (ctx) => ({
          text: `Nobody moves for a full minute after ${first(ctx)} finishes. It is quick, and it is the part the papers will lead with.`,
          time: -30,
          noise: 18,
          heat: 4,
          takeMul: 0.05,
        }),
      },
    ],
  },
  {
    id: 'professional_pace',
    stages: ['objective', 'extraction'],
    weight: 7,
    actor: { trait: 'professional' },
    when: (ctx) => ctx.run.clock > 420 || ctx.run.noise > 25,
    title: 'We are over',
    body: '{actor} has stopped working and is looking at a watch. The plan said eleven minutes. It has been rather longer than eleven minutes, and they would like everyone to know that.',
    choices: [
      {
        id: 'reset',
        label: 'Do it their way',
        hint: 'Stop, reset, and work the plan from where it actually is.',
        resolve: (ctx) => ({
          text: `${first(ctx)} walks the room through it once, out loud, and the pace comes back down to something survivable.`,
          time: 55,
          noise: -14,
          composure: 8,
        }),
      },
      {
        id: 'push',
        label: 'Overrule them',
        hint: 'You are not paying for opinions about the schedule.',
        check: { attr: 'nerve', dc: 52 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} does not agree and does it anyway, faster, correctly, and without saying another word all night.`,
                time: -70,
                noise: 6,
                loyalty: { [ctx.actor.id]: -5 },
              }
            : {
                text: `${first(ctx)} was right about the schedule. Everyone finds this out at the same time, which is the worst way to find it out.`,
                time: 45,
                noise: 20,
                takeMul: -0.08,
                loyalty: { [ctx.actor.id]: -8 },
              },
      },
    ],
  },
  {
    id: 'reckless_shortcut',
    stages: ['approach', 'entry', 'escape'],
    weight: 8,
    actor: { trait: 'reckless' },
    title: 'A better idea',
    body: '{actor} has found a way that is faster than the one you planned, and is already halfway into it.',
    choices: [
      {
        id: 'follow',
        label: 'Go with it',
        hint: 'They are usually right. Usually.',
        check: { attr: 'driving', dc: 55 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `It works. ${first(ctx)} does not say anything, which is somehow worse.`,
                time: -80,
                noise: 4,
              }
            : {
                text: 'It does not work. It makes a noise like a skip being dropped and puts a light on in a window.',
                time: 40,
                noise: 24,
                composure: -8,
              },
      },
      {
        id: 'haul_back',
        label: 'Stick to the plan',
        hint: 'The plan is the plan.',
        resolve: (ctx) => ({
          text: `${first(ctx)} comes back sulking. Two minutes gone and a mood in the van.`,
          time: 60,
          composure: -10,
        }),
      },
    ],
  },
  {
    id: 'paranoid_stall',
    stages: ['entry', 'objective'],
    weight: 7,
    actor: { trait: 'paranoid' },
    title: 'Something is wrong',
    body: '{actor} has stopped dead and will not say why. Just: the building is wrong, and they want everyone out.',
    choices: [
      {
        id: 'listen',
        label: 'Listen to them',
        hint: 'Back out to the last clean position and wait.',
        resolve: (ctx) => ({
          text: `Four minutes in a stairwell. Then nothing happens, and ${first(ctx)} shrugs. Probably nothing. Probably.`,
          time: 150,
          noise: -8,
        }),
      },
      {
        id: 'push_on',
        label: 'Push on',
        hint: 'They said the same thing on the last job.',
        check: { attr: 'stealth', dc: 50 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: 'Nothing was wrong. Everyone tells them so, at length, afterwards.',
                composure: -4,
              }
            : {
                text: `Something was wrong. A second contact on the inner door that nobody had drawn, and ${first(ctx)} is now the only person in the room not panicking.`,
                noise: 20,
                alarm: true,
                composure: -8,
              },
      },
    ],
  },
  {
    id: 'greedy_extra',
    stages: ['objective', 'extraction'],
    weight: 9,
    actor: { trait: 'greedy' },
    title: 'One more drawer',
    body: '{actor} has found the deposit drawers and is not leaving them. It is real money and it is ninety seconds you do not have.',
    choices: [
      {
        id: 'take_it',
        label: 'Take it',
        hint: 'Ninety seconds, on a clock that is already running.',
        resolve: (ctx) => ({
          text: `${first(ctx)} works the drawers with both hands and does not once look at the door.`,
          time: 95,
          noise: 10,
          bonusTake: Math.round(ctx.target.value * 0.14),
          composure: 5,
        }),
      },
      {
        id: 'drag_out',
        label: 'Drag them out',
        hint: 'You will hear about this in the car.',
        resolve: (ctx) => ({
          text: `${first(ctx)} is removed from the room still holding two of them.`,
          time: 25,
          composure: -12,
          loyalty: { [ctx.actor.id]: -4 },
        }),
      },
    ],
  },
  {
    id: 'calm_holds',
    stages: ['security', 'extraction', 'escape'],
    weight: 6,
    actor: { trait: 'calm' },
    when: (ctx) => ctx.run.noise > 25,
    title: 'Somebody has to be the adult',
    body: 'The room has gone loud and fast. {actor} has not raised their voice and is telling everyone, one at a time, what they are doing next.',
    choices: [
      {
        id: 'let_them',
        label: 'Let them run it',
        hint: 'Hand the room over for a minute.',
        resolve: (ctx) => ({
          text: `It works. ${first(ctx)} talks the crew down to something like a pace.`,
          noise: -18,
          composure: 10,
          time: 25,
        }),
      },
      {
        id: 'keep_moving',
        label: 'Keep moving',
        hint: 'No time. Out now.',
        resolve: () => ({
          text: 'Everyone moves. Nobody is calm. It is faster and it is worse.',
          time: -40,
          noise: 8,
        }),
      },
    ],
  },
  {
    id: 'excop_radio',
    stages: ['security', 'extraction', 'escape'],
    weight: 7,
    actor: { trait: 'excop' },
    title: 'That call was about us',
    body: '{actor} has been listening to the band all night and has just gone quiet. A unit has been given this address and a reason.',
    choices: [
      {
        id: 'go_now',
        label: 'Leave now, with what you have',
        hint: 'Every second from here is worse than the last.',
        resolve: () => ({
          text: 'The bags are half full and everyone is already walking.',
          time: -70,
          takeMul: -0.12,
          noise: -5,
        }),
      },
      {
        id: 'reroute_out',
        label: 'Take the route they will not cover',
        hint: 'They know how the response is drawn. They used to draw it.',
        check: { attr: 'security', dc: 55 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} calls the streets in order, and the crew are two blocks clear before the first car arrives.`,
                time: 30,
                heat: -3,
              }
            : {
                text: 'The response has changed since they left the job. The road is already shut.',
                time: 80,
                noise: 15,
              },
      },
    ],
  },
  {
    id: 'charmer_witness',
    stages: ['approach', 'extraction'],
    weight: 7,
    actor: { trait: 'charmer' },
    title: 'A witness, being friendly',
    body: 'A woman walking a dog has stopped to talk to {actor}, who is standing next to a van that should not be there, holding something they should not be holding.',
    choices: [
      {
        id: 'charm',
        label: 'Talk to her',
        hint: 'Be the most boring man alive for ninety seconds.',
        check: { attr: 'social', dc: 45 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `She hears a long, dull story about a broken boiler and leaves ${first(ctx)} with a description she will not be able to reproduce.`,
                time: 60,
                heat: -2,
              }
            : {
                text: 'She is not interested in the boiler. She is interested in the van, and she reads plates for a living.',
                time: 40,
                heat: 5,
              },
      },
      {
        id: 'ignore',
        label: 'Get in the van',
        hint: 'Say nothing. Be a shape in a coat.',
        resolve: () => ({
          text: 'The door shuts. She stands there a moment longer than anyone would like.',
          heat: 3,
          time: -10,
        }),
      },
    ],
  },
  {
    id: 'jammer_fails',
    stages: ['security'],
    weight: 9,
    actor: { role: 'hacker' },
    when: (ctx) => ctx.hasKit('jammer'),
    title: 'The jammer is doing nothing',
    body: '{actor} is holding a very expensive box with a green light on it. The cameras are still talking to something.',
    choices: [
      {
        id: 'physical',
        label: 'Do it by hand',
        hint: 'Find the cable. Cut the cable.',
        check: { attr: 'technical', dc: 58 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} finds the run above the ceiling tile and takes the whole floor's coverage out at once.`,
                time: 90,
                noise: 6,
              }
            : {
                text: 'Wrong cable. Something else has stopped working and it is the kind of thing people notice from an office.',
                time: 100,
                noise: 20,
                alarm: true,
              },
      },
      {
        id: 'blind_spots',
        label: 'Work the blind spots',
        hint: 'Accept the cameras and move where they are not.',
        when: (ctx) => ctx.knows('cameras'),
        resolve: () => ({
          text: 'The coverage map earns its money. Everyone moves in short, stupid-looking hops and nothing is recorded.',
          time: 70,
          noise: -4,
        }),
      },
      {
        id: 'risk_it',
        label: 'Work in front of them',
        hint: 'Faces covered, heads down, and hope.',
        resolve: () => ({
          text: 'Eleven minutes of everyone on tape. Not identifiable. Not nothing, either.',
          heat: 7,
          time: -20,
        }),
      },
    ],
  },
  {
    id: 'wrong_safe',
    stages: ['objective'],
    weight: 10,
    actor: { role: 'safecracker' },
    when: (ctx) => !ctx.knows('vault'),
    title: 'That is not the safe you were told about',
    body: '{actor} is looking at a door that is nine years newer than the one described, with a keypad nobody mentioned.',
    choices: [
      {
        id: 'work_it',
        label: 'Work it anyway',
        hint: 'Slower, harder, and entirely on their nerve.',
        check: { attr: 'security', dc: 68 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `It takes ${first(ctx)} four times as long as it should have, and it opens.`,
                time: 190,
                noise: 8,
                composure: 8,
              }
            : {
                text: 'It does not open. It will not open tonight, for anyone, with this kit.',
                time: 210,
                noise: 12,
                takeMul: -0.45,
                composure: -15,
              },
      },
      {
        id: 'cut',
        label: 'Cut it',
        hint: 'Loud, hot, certain.',
        when: (ctx) => ctx.hasKit('torch') || ctx.hasKit('drill'),
        resolve: () => ({
          text: 'The room fills with the smell of it. The door comes off in one piece and lands badly.',
          time: 120,
          noise: 30,
          takeMul: -0.05,
        }),
      },
      {
        id: 'leave_it',
        label: 'Take what is outside it',
        hint: 'The counter, the drawers, the display. Not the safe.',
        resolve: () => ({
          text: 'Everything that was not behind a door goes into the bags. It is not what you came for.',
          time: -60,
          takeMul: -0.35,
          noise: -6,
        }),
      },
    ],
  },
  {
    id: 'second_vault',
    stages: ['objective'],
    weight: 3,
    actor: { any: true },
    when: (ctx) => ctx.run.noise < 40 && !ctx.run.alarm,
    title: 'There is a second room',
    body: 'Behind the racking, {actor} has found a door that is not on any plan you bought. It is older than the rest of the building and it is not locked with anything modern.',
    choices: [
      {
        id: 'open_it',
        label: 'Open it',
        hint: 'You have no idea what is in there. That is the point.',
        check: { attr: 'security', dc: 50 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `It is the overflow room. Nobody has counted what is in here in a long time, and ${first(ctx)} is laughing in a way you have not heard before.`,
                time: 130,
                bonusTake: Math.round(ctx.target.value * 0.4),
                composure: 12,
              }
            : {
                text: 'Empty. Boxes of paper, a dead phone line and eight minutes you will not get back.',
                time: 150,
                noise: 6,
                composure: -6,
              },
      },
      {
        id: 'walk_past',
        label: 'Leave it',
        hint: 'You came for a thing. You have the thing.',
        resolve: () => ({
          text: 'The door stays shut. Somebody will wonder about it for years.',
          time: -15,
        }),
      },
    ],
  },
  {
    id: 'night_cleaner',
    stages: ['entry', 'security'],
    weight: 8,
    actor: { any: true },
    when: (ctx) => !ctx.knows('rotation'),
    title: 'There is someone still in the building',
    body: 'A radio is playing two floors up. Nobody bought the rotation, so nobody — {actor} included — knows who that is or when they go home.',
    choices: [
      {
        id: 'wait',
        label: 'Wait them out',
        hint: 'Time is the only currency you have left.',
        resolve: () => ({
          text: 'Nineteen minutes in a stairwell listening to a phone-in show. Then a door, and a lift, and quiet.',
          time: 240,
          noise: -10,
        }),
      },
      {
        id: 'avoid',
        label: 'Work around them',
        hint: 'Two floors is two floors.',
        check: { attr: 'stealth', dc: 52 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} maps the noise and everyone moves in the gaps between songs.`,
                time: 50,
                noise: 4,
              }
            : {
                text: 'The radio stops. Somebody upstairs is standing very still, listening, exactly as you are.',
                time: 70,
                noise: 22,
              },
      },
      {
        id: 'contain',
        label: 'Go and get them',
        hint: 'Fast, quiet, and a person who has seen you.',
        when: (ctx) => ctx.has('muscle'),
        resolve: () => ({
          text: 'It takes forty seconds and no one is hurt. There is now a witness who has been in a room with your crew.',
          time: 45,
          heat: 8,
          noise: 8,
        }),
      },
    ],
  },
  {
    id: 'silent_alarm',
    stages: ['security', 'objective'],
    weight: 7,
    actor: { role: 'hacker' },
    when: (ctx) => !ctx.run.alarm && ctx.run.clock > 200,
    title: 'It has been quiet for too long',
    body: '{actor} cannot find the alarm circuit, because there is nothing to find. It has been reporting to a monitoring company since the moment the door opened.',
    choices: [
      {
        id: 'sprint',
        label: 'Everything you can carry, now',
        hint: 'Assume the clock has been running the whole time.',
        resolve: () => ({
          text: 'The plan is over. What follows is four people running with bags.',
          time: -110,
          takeMul: -0.15,
          alarm: true,
          noise: 12,
        }),
      },
      {
        id: 'call_it_bluff',
        label: 'Finish the job',
        hint: 'If they were coming they would be here.',
        check: { attr: 'nerve', dc: 60 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `Nothing comes. ${first(ctx)} was wrong about the circuit and everyone is very polite about it afterwards.`,
                time: 40,
                composure: -4,
              }
            : {
                text: 'They were coming. They were just being quiet about it, the way you were.',
                alarm: true,
                time: 60,
                noise: 25,
              },
      },
    ],
  },
  {
    id: 'blocked_road',
    stages: ['escape'],
    weight: 9,
    actor: { role: 'driver' },
    title: 'The road is shut',
    body: 'Roadworks that were not there on the scout. {actor} has about four seconds to choose something.',
    choices: [
      {
        id: 'improvise',
        label: 'Let them improvise',
        hint: 'They know these streets better than the plan does.',
        check: { attr: 'driving', dc: 58 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} takes the van through the industrial estate, over a kerb, and out onto the harbour road going the wrong way. It is the best driving you have ever seen.`,
                time: -60,
                heat: -3,
                composure: 10,
              }
            : {
                text: 'It is a dead end with a fence at the end of it. Reversing out takes a long, loud minute.',
                time: 90,
                noise: 20,
              },
      },
      {
        id: 'ditch',
        label: 'Ditch the van and split up',
        hint: 'Slower, safer, and the take goes in four directions.',
        resolve: () => ({
          text: 'The van is left in a car park with the doors open. Everyone walks, separately, carrying too much.',
          time: 140,
          takeMul: -0.08,
          heat: -6,
        }),
      },
    ],
  },
  {
    id: 'crowd_outside',
    stages: ['extraction'],
    weight: 7,
    actor: { role: 'face' },
    when: (ctx) => ctx.approach.id === 'social' || ctx.approach.id === 'inside',
    title: 'The doors are full of people',
    body: 'Somebody has pulled the fire alarm two units down and the street is full. {actor} is holding a bag and wearing a uniform that half these people can read.',
    choices: [
      {
        id: 'walk_through',
        label: 'Walk straight through it',
        hint: 'Confidence, a clipboard and a firm sense of direction.',
        check: { attr: 'social', dc: 55 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} directs four members of the public to a muster point that does not exist, and is thanked for it.`,
                time: -30,
                heat: -2,
                composure: 8,
              }
            : {
                text: 'Somebody asks which company they are with. Somebody else takes a photograph of the answer.',
                time: 50,
                heat: 9,
              },
      },
      {
        id: 'back_out',
        label: 'Go back in and wait',
        hint: 'The crowd will thin. The clock will not.',
        resolve: () => ({
          text: 'Eight minutes in a store cupboard with the bags between everyone’s feet.',
          time: 180,
          noise: -6,
        }),
      },
    ],
  },
  {
    id: 'insider_wobbles',
    stages: ['entry', 'security', 'objective'],
    weight: 9,
    actor: { any: true },
    when: (ctx) => ctx.approach.id === 'inside',
    title: 'Your inside man has stopped answering',
    body: 'The door that was supposed to be unlocked is not, and the phone rings out. {actor} says they saw him on the floor twenty minutes ago and he would not make eye contact.',
    choices: [
      {
        id: 'wait_him_out',
        label: 'Give him two more minutes',
        hint: 'He has more to lose than you do.',
        check: { attr: 'nerve', dc: 50 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: 'The lock clicks. He does not come to the door and he does not look up.',
                time: 120,
              }
            : {
                text: `He has gone home. ${first(ctx)} finds the door still shut and the corridor now on a camera that is definitely working.`,
                time: 140,
                noise: 16,
                takeMul: -0.1,
              },
      },
      {
        id: 'force_it',
        label: 'Do it without him',
        hint: 'The plan assumed a man who is not here.',
        check: { attr: 'technical', dc: 62 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} takes the door off its own hinges, quietly, in about four minutes.`,
                time: 200,
                noise: 10,
              }
            : {
                text: 'The door wins. The frame does not, and the noise it makes is architectural.',
                time: 160,
                noise: 32,
                alarm: true,
              },
      },
    ],
  },
  {
    id: 'panic_split',
    stages: ['extraction', 'escape'],
    weight: 8,
    actor: { any: true },
    when: (ctx) => ctx.run.policeOnSite || ctx.run.noise > 55,
    title: 'Somebody has run',
    body: 'When the second siren started, {actor} went out through a different door and is now somewhere in the building or somewhere in the city.',
    choices: [
      {
        id: 'go_back',
        label: 'Go back for them',
        hint: 'You do not leave people. It is expensive.',
        check: { attr: 'nerve', dc: 55 },
        resolve: (ctx, passed) =>
          passed
            ? {
                text: `${first(ctx)} is found in a service corridor, and will remember who came back.`,
                time: 100,
                composure: 15,
                loyalty: { [ctx.actor.id]: 12 },
              }
            : {
                text: 'Two minutes of shouting into a stairwell, and then no choice at all.',
                time: 120,
                separate: true,
                noise: 14,
                loyalty: { [ctx.actor.id]: -10 },
              },
      },
      {
        id: 'leave_them',
        label: 'Leave without them',
        hint: 'They know the fallback. They might use it.',
        resolve: (ctx) => ({
          text: `The van goes. ${first(ctx)} is on foot, in a city with its lights on.`,
          separate: true,
          time: -50,
          loyalty: { [ctx.actor.id]: -18 },
        }),
      },
    ],
  },
  {
    id: 'deposit_boxes',
    stages: ['objective'],
    weight: 6,
    actor: { any: true },
    when: (ctx) => ctx.approach.id === 'aggressive' && ctx.run.clock < 300,
    title: 'You are ahead of the clock',
    body: 'The bags are full and there are still minutes on the board. {actor} is looking at the boxes on the far wall.',
    choices: [
      {
        id: 'boxes',
        label: 'Do the boxes',
        hint: 'Two minutes of noise for an unknown amount of money.',
        resolve: (ctx) => ({
          text: 'They come off the wall in rows. Half of them hold paperwork and jewellery nobody insured.',
          time: 130,
          noise: 22,
          bonusTake: Math.round(ctx.target.value * 0.22),
        }),
      },
      {
        id: 'go',
        label: 'Leave early',
        hint: 'Being gone before you are expected is worth money.',
        resolve: () => ({
          text: 'The crew are in the vehicle a full two minutes before the plan said they would be.',
          time: -60,
          heat: -5,
          noise: -10,
        }),
      },
    ],
  },
];

export function eventById(id: string): GameEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}
