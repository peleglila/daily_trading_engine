import type { ProcessGrade } from '../types/dayBook';

export type ProcessGradeMeta = {
  id: ProcessGrade;
  label: string;
  tag: string;
  blurb: string;
};

/** Process score for the session — attention and plan, not P&L. */
export const PROCESS_GRADES: ProcessGradeMeta[] = [
  {
    id: 'locked',
    label: 'Locked in',
    tag: 'Locked',
    blurb: 'Focused. The plan held.',
  },
  {
    id: 'steady',
    label: 'Steady',
    tag: 'Steady',
    blurb: 'Mostly followed the plan.',
  },
  {
    id: 'loose',
    label: 'Loose',
    tag: 'Loose',
    blurb: 'Focus slipped, or the plan bent.',
  },
  {
    id: 'off',
    label: 'Off plan',
    tag: 'Off',
    blurb: 'Did not follow the plan.',
  },
];

export function processGradeMeta(grade: ProcessGrade | null | undefined) {
  return PROCESS_GRADES.find((g) => g.id === grade) || null;
}
