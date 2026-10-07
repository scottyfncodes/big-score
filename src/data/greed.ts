import type { StageOutcome } from '../game/types';

/**
 * Going back in.
 *
 * The objective is done and the bags are full. These are the lines for the
 * moment somebody on the crew says the thing every crew says once — there is
 * more in there — and the player decides whether the night is over. `{who}`
 * is whoever would do the work.
 */

/** What the crew sees, per trip. Per target where the building has a story. */
export const GREED_OFFERS: Record<string, [string, string]> = {
  _default: [
    '{who} has seen a second cage behind the first. “Four minutes. Maybe five.”',
    '{who} is already looking at the back room. “Everything they really care about is in there.”',
  ],
  argent_vine: [
    '{who} has found the repair drawer — commissions, not stock. “Nobody counts these.”',
    'There is a second safe under the workbench. {who} is already kneeling.',
  ],
  kestrel_gallery: [
    'The touring catalogue lists two pieces that are not on the floor. {who} knows which crate.',
    '{who} is looking up at the private viewing room. “That is where they keep the ones they don’t show.”',
  ],
  port_argent_savings: [
    'The deposit boxes are right there. {who} has a list of the six worth opening.',
    '{who} has found the night cage. “That’s tomorrow’s float. All of it.”',
  ],
  vantel_payroll: [
    '{who} has found a second drawer safe two offices down. Same lock.',
    'The finance director keeps something in his desk he does not declare. {who} knows which desk.',
  ],
  meridian_run: [
    'There is a second strongbox bolted behind the cab seat. {who} has the tools out already.',
    '{who} has spotted the driver’s own lockbox. “Petty cash for a crew of nine. Every week.”',
  ],
  bellweather_cage: [
    'The cage has a second bay, and nobody has signed for what is in it. {who} wants it.',
    '{who} is staring at the bullion trolley. “It is on wheels. It is practically asking.”',
  ],
  aeolia: [
    'The owner’s cabin has a safe nobody put in the file. {who} has seen it.',
    '{who} is pointing at the wine cellar. “Forty bottles. You have any idea what those go for?”',
  ],
};

/** The button. */
export const GREED_LABELS: [string, string] = ['Go back for more', 'One more drawer'];

/** How the trip went, by band. */
export const GREED_RESULTS: Record<StageOutcome, string[]> = {
  critical: [
    '{who} comes back with both arms full and the expression of somebody who will be telling this story for years.',
    'It opens like it was waiting for {who}. More than anybody thought was in there.',
  ],
  success: [
    '{who} is back in four minutes flat with another bag.',
    'In, open, out. {who} does not even look pleased about it, which is how you know it was easy.',
  ],
  partial: [
    '{who} gets some of it. The rest stays behind a lock that would not be rushed.',
    'Half a bag and a lot more noise than anyone liked. {who} calls it.',
  ],
  complication: [
    '{who} gets something, and the building gets a good look at {who}.',
    'Something falls. Something rings. {who} comes back with a little and a lot of adrenaline.',
  ],
  failure: [
    'The second lock is wired to something the first was not. {who} comes back empty-handed to the sound of it.',
    'It was a bad idea, and the building says so, loudly. {who} runs.',
  ],
};
