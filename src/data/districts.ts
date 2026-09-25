import type { DemandProfile } from './types';

// The spawner reads a DemandProfile. V1 ships one district. Future: suburbs, downtown,
// university, beach, mall, night market, airport — each just another profile.
export const DISTRICTS: DemandProfile[] = [
  {
    id: 'starterStreet',
    name: 'Starter Street',
    recipeWeights: {},
    patienceMult: 1,
    tipMult: 1,
    // Gentle waves of foot traffic so the street breathes.
    trafficCurve: [[0, 1], [120, 1.05], [240, 0.95], [360, 1.1], [480, 1.0], [600, 1.12], [900, 1.05], [1200, 1.15]],
  },
];
