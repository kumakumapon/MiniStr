import type { GameCommand } from '../game/session';

/** v1.5.5 seed15411/hard:easy: complete recorded T3 defeat, without recomputing CPU choices. */
export const escortScreenCommands: GameCommand[] = [
  {
    type: 'produce',
    factory: {
      x: 0,
      y: 8,
    },
    kind: 'engineer',
  },
  {
    type: 'move',
    unitId: 'r2',
    destination: {
      x: 5,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r3',
    destination: {
      x: 5,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r5',
    destination: {
      x: 2,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r4',
    destination: {
      x: 3,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r6',
    destination: {
      x: 2,
      y: 6,
    },
  },
  {
    type: 'wait',
    unitId: 'r1',
  },
  {
    type: 'endTurn',
  },
  {
    type: 'produce',
    factory: {
      x: 11,
      y: 1,
    },
    kind: 'engineer',
  },
  {
    type: 'move',
    unitId: 'b1',
    destination: {
      x: 10,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'b2',
    destination: {
      x: 11,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'b5',
    destination: {
      x: 11,
      y: 3,
    },
  },
  {
    type: 'move',
    unitId: 'b3',
    destination: {
      x: 11,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'b4',
    destination: {
      x: 9,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'b6',
    destination: {
      x: 10,
      y: 6,
    },
  },
  {
    type: 'endTurn',
  },
  {
    type: 'recon',
    center: {
      x: 6,
      y: 3,
    },
  },
  {
    type: 'recon',
    center: {
      x: 11,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r2',
    destination: {
      x: 8,
      y: 4,
    },
  },
  {
    type: 'attack',
    unitId: 'r2',
    targetId: 'b4',
  },
  {
    type: 'move',
    unitId: 'r3',
    destination: {
      x: 9,
      y: 5,
    },
  },
  {
    type: 'attack',
    unitId: 'r3',
    targetId: 'b4',
  },
  {
    type: 'move',
    unitId: 'r5',
    destination: {
      x: 5,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'u1',
    destination: {
      x: 0,
      y: 5,
    },
  },
  {
    type: 'produce',
    factory: {
      x: 0,
      y: 8,
    },
    kind: 'mech',
  },
  {
    type: 'move',
    unitId: 'r4',
    destination: {
      x: 6,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r6',
    destination: {
      x: 4,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r1',
    destination: {
      x: 5,
      y: 6,
    },
  },
  {
    type: 'endTurn',
  },
  {
    type: 'recon',
    center: {
      x: 4,
      y: 4,
    },
  },
  {
    type: 'recon',
    center: {
      x: 6,
      y: 3,
    },
  },
  {
    type: 'attack',
    unitId: 'b3',
    targetId: 'r3',
  },
  {
    type: 'move',
    unitId: 'b1',
    destination: {
      x: 7,
      y: 2,
    },
  },
  {
    type: 'move',
    unitId: 'b2',
    destination: {
      x: 10,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'b5',
    destination: {
      x: 6,
      y: 1,
    },
  },
  {
    type: 'move',
    unitId: 'u2',
    destination: {
      x: 11,
      y: 4,
    },
  },
  {
    type: 'produce',
    factory: {
      x: 11,
      y: 1,
    },
    kind: 'mech',
  },
  {
    type: 'move',
    unitId: 'b6',
    destination: {
      x: 7,
      y: 6,
    },
  },
  {
    type: 'attack',
    unitId: 'b6',
    targetId: 'r4',
  },
  {
    type: 'endTurn',
  },
  {
    type: 'move',
    unitId: 'r2',
    destination: {
      x: 7,
      y: 5,
    },
  },
  {
    type: 'attack',
    unitId: 'r2',
    targetId: 'b6',
  },
  {
    type: 'attack',
    unitId: 'r4',
    targetId: 'b6',
  },
  {
    type: 'move',
    unitId: 'r3',
    destination: {
      x: 8,
      y: 6,
    },
  },
  {
    type: 'attack',
    unitId: 'r3',
    targetId: 'b6',
  },
  {
    type: 'move',
    unitId: 'r5',
    destination: {
      x: 7,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'r6',
    destination: {
      x: 6,
      y: 5,
    },
  },
  {
    type: 'attack',
    unitId: 'r6',
    targetId: 'b6',
  },
  {
    type: 'move',
    unitId: 'u1',
    destination: {
      x: 3,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'u3',
    destination: {
      x: 0,
      y: 6,
    },
  },
  {
    type: 'produce',
    factory: {
      x: 0,
      y: 8,
    },
    kind: 'mech',
  },
  {
    type: 'move',
    unitId: 'r1',
    destination: {
      x: 7,
      y: 3,
    },
  },
  {
    type: 'endTurn',
  },
  {
    type: 'attack',
    unitId: 'b1',
    targetId: 'r1',
  },
  {
    type: 'attack',
    unitId: 'b3',
    targetId: 'r3',
  },
  {
    type: 'move',
    unitId: 'b2',
    destination: {
      x: 8,
      y: 3,
    },
  },
  {
    type: 'attack',
    unitId: 'b2',
    targetId: 'r1',
  },
];

/** v1.5.5 seed15511 prefix before a known-threat escape; this previously successful route is preserved. */
export const escortEscapeCommands: GameCommand[] = [
  {
    type: 'produce',
    factory: {
      x: 0,
      y: 8,
    },
    kind: 'engineer',
  },
  {
    type: 'move',
    unitId: 'r2',
    destination: {
      x: 5,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r3',
    destination: {
      x: 5,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r5',
    destination: {
      x: 2,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r4',
    destination: {
      x: 3,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r6',
    destination: {
      x: 2,
      y: 6,
    },
  },
  {
    type: 'wait',
    unitId: 'r1',
  },
  {
    type: 'endTurn',
  },
  {
    type: 'produce',
    factory: {
      x: 11,
      y: 1,
    },
    kind: 'engineer',
  },
  {
    type: 'move',
    unitId: 'b1',
    destination: {
      x: 10,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'b2',
    destination: {
      x: 11,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'b5',
    destination: {
      x: 11,
      y: 3,
    },
  },
  {
    type: 'move',
    unitId: 'b3',
    destination: {
      x: 11,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'b4',
    destination: {
      x: 9,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'b6',
    destination: {
      x: 10,
      y: 6,
    },
  },
  {
    type: 'endTurn',
  },
  {
    type: 'recon',
    center: {
      x: 6,
      y: 3,
    },
  },
  {
    type: 'recon',
    center: {
      x: 11,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r2',
    destination: {
      x: 8,
      y: 4,
    },
  },
  {
    type: 'attack',
    unitId: 'r2',
    targetId: 'b4',
  },
  {
    type: 'move',
    unitId: 'r3',
    destination: {
      x: 9,
      y: 5,
    },
  },
  {
    type: 'attack',
    unitId: 'r3',
    targetId: 'b4',
  },
  {
    type: 'move',
    unitId: 'r5',
    destination: {
      x: 5,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'u1',
    destination: {
      x: 0,
      y: 5,
    },
  },
  {
    type: 'produce',
    factory: {
      x: 0,
      y: 8,
    },
    kind: 'mech',
  },
  {
    type: 'move',
    unitId: 'r4',
    destination: {
      x: 6,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r6',
    destination: {
      x: 4,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'r1',
    destination: {
      x: 5,
      y: 6,
    },
  },
  {
    type: 'endTurn',
  },
  {
    type: 'recon',
    center: {
      x: 4,
      y: 4,
    },
  },
  {
    type: 'recon',
    center: {
      x: 6,
      y: 3,
    },
  },
  {
    type: 'attack',
    unitId: 'b3',
    targetId: 'r3',
  },
  {
    type: 'move',
    unitId: 'b1',
    destination: {
      x: 7,
      y: 2,
    },
  },
  {
    type: 'move',
    unitId: 'b2',
    destination: {
      x: 10,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'b5',
    destination: {
      x: 6,
      y: 1,
    },
  },
  {
    type: 'move',
    unitId: 'u2',
    destination: {
      x: 11,
      y: 4,
    },
  },
  {
    type: 'produce',
    factory: {
      x: 11,
      y: 1,
    },
    kind: 'mech',
  },
  {
    type: 'move',
    unitId: 'b6',
    destination: {
      x: 7,
      y: 6,
    },
  },
  {
    type: 'attack',
    unitId: 'b6',
    targetId: 'r4',
  },
  {
    type: 'endTurn',
  },
  {
    type: 'move',
    unitId: 'r2',
    destination: {
      x: 7,
      y: 5,
    },
  },
  {
    type: 'attack',
    unitId: 'r2',
    targetId: 'b6',
  },
  {
    type: 'attack',
    unitId: 'r4',
    targetId: 'b6',
  },
  {
    type: 'move',
    unitId: 'r3',
    destination: {
      x: 8,
      y: 6,
    },
  },
  {
    type: 'attack',
    unitId: 'r3',
    targetId: 'b6',
  },
  {
    type: 'move',
    unitId: 'r5',
    destination: {
      x: 7,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'r6',
    destination: {
      x: 6,
      y: 5,
    },
  },
  {
    type: 'attack',
    unitId: 'r6',
    targetId: 'b6',
  },
  {
    type: 'move',
    unitId: 'u1',
    destination: {
      x: 3,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'u3',
    destination: {
      x: 0,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r1',
    destination: {
      x: 7,
      y: 7,
    },
  },
  {
    type: 'attack',
    unitId: 'r1',
    targetId: 'b6',
  },
  {
    type: 'produce',
    factory: {
      x: 0,
      y: 8,
    },
    kind: 'mech',
  },
  {
    type: 'endTurn',
  },
  {
    type: 'attack',
    unitId: 'b3',
    targetId: 'r3',
  },
  {
    type: 'move',
    unitId: 'b1',
    destination: {
      x: 9,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'b2',
    destination: {
      x: 10,
      y: 7,
    },
  },
  {
    type: 'move',
    unitId: 'b5',
    destination: {
      x: 9,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'u2',
    destination: {
      x: 10,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'u4',
    destination: {
      x: 11,
      y: 3,
    },
  },
  {
    type: 'produce',
    factory: {
      x: 11,
      y: 1,
    },
    kind: 'mech',
  },
  {
    type: 'endTurn',
  },
  {
    type: 'move',
    unitId: 'r2',
    destination: {
      x: 7,
      y: 6,
    },
  },
  {
    type: 'move',
    unitId: 'r5',
    destination: {
      x: 9,
      y: 4,
    },
  },
  {
    type: 'attack',
    unitId: 'r5',
    targetId: 'b5',
  },
  {
    type: 'move',
    unitId: 'r6',
    destination: {
      x: 7,
      y: 4,
    },
  },
  {
    type: 'attack',
    unitId: 'r6',
    targetId: 'b5',
  },
  {
    type: 'move',
    unitId: 'u1',
    destination: {
      x: 5,
      y: 4,
    },
  },
  {
    type: 'move',
    unitId: 'u3',
    destination: {
      x: 1,
      y: 5,
    },
  },
  {
    type: 'move',
    unitId: 'u5',
    destination: {
      x: 0,
      y: 6,
    },
  },
  {
    type: 'produce',
    factory: {
      x: 0,
      y: 8,
    },
    kind: 'infantry',
  },
  {
    type: 'move',
    unitId: 'r4',
    destination: {
      x: 8,
      y: 5,
    },
  },
];
