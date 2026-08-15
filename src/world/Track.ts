import { TRACK } from '../config';

export type Lane = -1 | 0 | 1;

const LANE_X_BY_INDEX: readonly [number, number, number] = TRACK.LANE_XS;
const LANES: readonly Lane[] = [-1, 0, 1];

function laneToIndex(lane: Lane): 0 | 1 | 2 {
  return (lane + 1) as 0 | 1 | 2;
}

export const Track = {
  lanes: LANES,

  laneToX(lane: Lane): number {
    return LANE_X_BY_INDEX[laneToIndex(lane)];
  },

  clampLane(lane: number): Lane {
    if (lane <= -1) return -1;
    if (lane >= 1) return 1;
    return 0;
  },
};
