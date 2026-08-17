import type { StageId, StageOutcome } from '../game/types';

/**
 * Sixty lines of stage narration: six stages, five outcomes, two variants.
 *
 * This table exists because the first playable build used one line per outcome
 * across all six stages, and a single run printed "hits something the plan did
 * not have on it" twice. Prose that repeats inside one night reads as a
 * template even when the underlying simulation is doing something interesting.
 * `{who}` is the crew member the engine picked to lead that stage.
 */
export const NARRATION: Record<StageId, Record<StageOutcome, string[]>> = {
  approach: {
    critical: [
      '{who} is at the door before the camera on the corner finishes its sweep.',
      'Nobody on that street will be able to say anything useful about {who}.',
    ],
    success: [
      '{who} takes the long way round and arrives on time.',
      '{who} walks it once, looks at nothing in particular, and goes in.',
    ],
    partial: [
      '{who} has to double back past a lit window. Twice.',
      '{who} arrives late and out of position, but arrives.',
    ],
    complication: [
      '{who} stops dead at the corner. Something on this street is wrong.',
      '{who} has walked into something that was not in the file.',
    ],
    failure: [
      '{who} is seen. Properly seen, by somebody who looked twice.',
      '{who} sets a dog off two doors down, and then the whole street.',
    ],
  },
  entry: {
    critical: [
      'The door is open in eleven seconds and {who} is holding it for everyone.',
      '{who} goes in through the service entrance like they pay rent on it.',
    ],
    success: [
      '{who} has the door.',
      '{who} works the lock and it gives without argument.',
    ],
    partial: [
      'The door takes {who} four times as long as it should, and complains throughout.',
      '{who} gets in through the wrong door, which is now a broken door.',
    ],
    complication: [
      '{who} is inside, and something inside is already wrong.',
      'The door opens onto something nobody told {who} about.',
    ],
    failure: [
      '{who} puts the frame in. The whole building hears it.',
      'The lock beats {who} outright, and the noise of trying was worse than the lock.',
    ],
  },
  security: {
    critical: [
      '{who} owns every camera in the building and gives them a very boring evening to watch.',
      'The system does exactly what {who} tells it, for as long as {who} likes.',
    ],
    success: [
      '{who} puts the cameras on a loop.',
      '{who} finds the panel, and the panel behaves.',
    ],
    partial: [
      '{who} gets most of it. Two feeds stay live and everyone works around them.',
      '{who} kills the sensors slowly, and the clock notices.',
    ],
    complication: [
      '{who} is looking at a system that is not the one in the file.',
      'Something on {who}’s screen is watching back.',
    ],
    failure: [
      '{who} trips it. Somewhere quiet, a light has come on.',
      '{who} loses the panel entirely, and the building starts talking to somebody.',
    ],
  },
  objective: {
    critical: [
      '{who} has it open in half the time, and there is more in there than anyone costed.',
      'The safe gives {who} everything, quietly, first time.',
    ],
    success: [
      '{who} opens it.',
      '{who} works the door and it comes.',
    ],
    partial: [
      '{who} gets it open eventually, and eventually is expensive.',
      '{who} takes what will come out and leaves what will not.',
    ],
    complication: [
      '{who} has found something behind the door that changes the arithmetic.',
      '{who} stops, and the sound of {who} stopping is the loudest thing in the room.',
    ],
    failure: [
      'It beats {who}. It beats everyone. The bags go out half empty.',
      '{who} takes the wrong angle on it, and now nothing is coming out of there tonight.',
    ],
  },
  extraction: {
    critical: [
      '{who} walks the bags out past three people, one of whom holds the door.',
      '{who} is out with all of it and nobody in the building has moved.',
    ],
    success: [
      '{who} gets the bags to the street.',
      '{who} carries it out the way it was drawn.',
    ],
    partial: [
      '{who} makes two trips. The second one is watched.',
      '{who} sends half of it out clean, then sends the rest out fast.',
    ],
    complication: [
      '{who} is holding the bags and looking at a problem.',
      'Between {who} and the street there is now a person.',
    ],
    failure: [
      '{who} drops a bag in the doorway and the street looks up.',
      '{who} is seen carrying it, by somebody who will describe it well.',
    ],
  },
  escape: {
    critical: [
      '{who} is three streets away before the first car turns in.',
      '{who} drives it like a delivery round and vanishes onto the harbour road.',
    ],
    success: [
      '{who} gets everyone out.',
      '{who} takes the planned route and it holds.',
    ],
    partial: [
      '{who} takes a bad line at the bridge and has to go the long way.',
      '{who} loses four minutes and a wing mirror.',
    ],
    complication: [
      '{who} has run into something on the road out.',
      'The route {who} rehearsed is not the route available.',
    ],
    failure: [
      '{who} is boxed in on the wrong street with the engine still running.',
      '{who} loses the road entirely, and the night with it.',
    ],
  },
};
