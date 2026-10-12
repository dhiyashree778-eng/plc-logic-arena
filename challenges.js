/* Challenge definitions: I/O map, automated test vectors, reference solution. */
(function (root) {
  const C = (t, a) => ({ t, a });
  const NO = a => C('NO', a), NC = a => C('NC', a);
  const coil = (a, t = 'COIL', preset = 0) => ({ t, a, preset });
  const rung = (branches, series, out) => ({ branches, series, out });

  const CHALLENGES = [
    {
      id: 'dol', tier: 'Beginner', title: 'DOL Motor Starter', viz: 'motor',
      desc: 'Start a motor with a momentary START button and keep it running (seal-in). STOP and OVERLOAD read 1 when active and must always win over START.',
      inputs: [
        { a: 'I0.0', n: 'START_PB', kind: 'pb' },
        { a: 'I0.1', n: 'STOP_PB', kind: 'pb' },
        { a: 'I0.2', n: 'OVERLOAD', kind: 'sw' }
      ],
      outputs: [{ a: 'Q0.0', n: 'MOTOR_RUN' }],
      tests: [
        { name: 'Resting state: motor is off', expect: { 'Q0.0': 0 } },
        { name: 'Press START: motor runs', set: { 'I0.0': 1 }, expect: { 'Q0.0': 1 } },
        { name: 'Release START: motor keeps running (seal-in)', set: { 'I0.0': 0 }, expect: { 'Q0.0': 1 } },
        { name: 'Press STOP: motor stops', set: { 'I0.1': 1 }, expect: { 'Q0.0': 0 } },
        { name: 'Release STOP: motor stays off', set: { 'I0.1': 0 }, expect: { 'Q0.0': 0 } },
        { name: 'START again: motor restarts', set: { 'I0.0': 1 }, expect: { 'Q0.0': 1 } },
        { name: 'Release START: still running', set: { 'I0.0': 0 }, expect: { 'Q0.0': 1 } },
        { name: 'Overload trips the motor', set: { 'I0.2': 1 }, expect: { 'Q0.0': 0 } },
        { name: 'Overload active: START is blocked', set: { 'I0.0': 1 }, expect: { 'Q0.0': 0 } },
        { name: 'Overload cleared, START released: stays off', set: { 'I0.0': 0, 'I0.2': 0 }, expect: { 'Q0.0': 0 } },
        { name: 'STOP has priority over START', set: { 'I0.0': 1, 'I0.1': 1 }, expect: { 'Q0.0': 0 } }
      ],
      solution: [rung([[NO('I0.0')], [NO('Q0.0')]], [NC('I0.1'), NC('I0.2')], coil('Q0.0'))]
    },
    {
      id: 'twohand', tier: 'Beginner', title: 'Two-Hand Safety Press', viz: 'press',
      desc: 'The press may only cycle while both palm buttons are held and the guard is closed. Releasing either button stops it immediately.',
      inputs: [
        { a: 'I0.0', n: 'LEFT_PB', kind: 'pb' },
        { a: 'I0.1', n: 'RIGHT_PB', kind: 'pb' },
        { a: 'I0.2', n: 'GUARD_CLOSED', kind: 'sw' }
      ],
      outputs: [{ a: 'Q0.0', n: 'PRESS_DOWN' }],
      tests: [
        { name: 'Resting state: press is up', expect: { 'Q0.0': 0 } },
        { name: 'Left button only: no motion', set: { 'I0.0': 1 }, expect: { 'Q0.0': 0 } },
        { name: 'Right button only: no motion', set: { 'I0.0': 0, 'I0.1': 1 }, expect: { 'Q0.0': 0 } },
        { name: 'Both buttons, guard open: no motion', set: { 'I0.0': 1 }, expect: { 'Q0.0': 0 } },
        { name: 'Both buttons, guard closed: press down', set: { 'I0.2': 1 }, expect: { 'Q0.0': 1 } },
        { name: 'Release right button: press stops', set: { 'I0.1': 0 }, expect: { 'Q0.0': 0 } },
        { name: 'Guard opens while both held: press stops', set: { 'I0.1': 1 }, expect: { 'Q0.0': 1 } },
        { name: 'Guard opened mid-stroke', set: { 'I0.2': 0 }, expect: { 'Q0.0': 0 } }
      ],
      solution: [rung([[]], [NO('I0.0'), NO('I0.1'), NO('I0.2')], coil('Q0.0'))]
    },
    {
      id: 'sump', tier: 'Intermediate', title: 'Sump Pump Hysteresis', viz: 'tank',
      desc: 'Start the pump when the water reaches the HIGH probe and keep it running until the level drops below the LOW probe. Probes read 1 when covered by water.',
      inputs: [
        { a: 'I0.0', n: 'LOW_LEVEL', kind: 'auto' },
        { a: 'I0.1', n: 'HIGH_LEVEL', kind: 'auto' }
      ],
      outputs: [{ a: 'Q0.0', n: 'PUMP' }],
      tests: [
        { name: 'Tank empty: pump off', expect: { 'Q0.0': 0 } },
        { name: 'Level reaches LOW probe: pump still off', set: { 'I0.0': 1 }, expect: { 'Q0.0': 0 } },
        { name: 'Level reaches HIGH probe: pump starts', set: { 'I0.1': 1 }, expect: { 'Q0.0': 1 } },
        { name: 'Level falls between probes: pump keeps running', set: { 'I0.1': 0 }, expect: { 'Q0.0': 1 } },
        { name: 'Level falls below LOW probe: pump stops', set: { 'I0.0': 0 }, expect: { 'Q0.0': 0 } },
        { name: 'Level rises between probes: pump stays off', set: { 'I0.0': 1 }, expect: { 'Q0.0': 0 } }
      ],
      solution: [rung([[NO('I0.1')], [NO('Q0.0')]], [NO('I0.0')], coil('Q0.0'))]
    },
    {
      id: 'reversing', tier: 'Intermediate', title: 'Reversible Motor Interlock', viz: 'revmotor',
      desc: 'Run a motor forward or in reverse. Each direction latches, STOP clears both, and the two contactors must never be on at the same time.',
      inputs: [
        { a: 'I0.0', n: 'FWD_PB', kind: 'pb' },
        { a: 'I0.1', n: 'REV_PB', kind: 'pb' },
        { a: 'I0.2', n: 'STOP_PB', kind: 'pb' }
      ],
      outputs: [{ a: 'Q0.0', n: 'FWD_CONTACTOR' }, { a: 'Q0.1', n: 'REV_CONTACTOR' }],
      tests: [
        { name: 'Resting state: both contactors off', expect: { 'Q0.0': 0, 'Q0.1': 0 } },
        { name: 'Press FWD: forward runs', set: { 'I0.0': 1 }, expect: { 'Q0.0': 1, 'Q0.1': 0 } },
        { name: 'Release FWD: forward stays latched', set: { 'I0.0': 0 }, expect: { 'Q0.0': 1, 'Q0.1': 0 } },
        { name: 'Press REV while forward runs: ignored', set: { 'I0.1': 1 }, expect: { 'Q0.0': 1, 'Q0.1': 0 } },
        { name: 'Release REV', set: { 'I0.1': 0 }, expect: { 'Q0.0': 1, 'Q0.1': 0 } },
        { name: 'Press STOP: both off', set: { 'I0.2': 1 }, expect: { 'Q0.0': 0, 'Q0.1': 0 } },
        { name: 'Release STOP', set: { 'I0.2': 0 }, expect: { 'Q0.0': 0, 'Q0.1': 0 } },
        { name: 'Press REV: reverse runs', set: { 'I0.1': 1 }, expect: { 'Q0.0': 0, 'Q0.1': 1 } },
        { name: 'Release REV: reverse stays latched', set: { 'I0.1': 0 }, expect: { 'Q0.1': 1 } },
        { name: 'Press FWD while reverse runs: ignored', set: { 'I0.0': 1 }, expect: { 'Q0.0': 0, 'Q0.1': 1 } },
        { name: 'STOP clears reverse', set: { 'I0.0': 0, 'I0.2': 1 }, expect: { 'Q0.0': 0, 'Q0.1': 0 } },
        { name: 'FWD and REV pressed together: never both on', set: { 'I0.2': 0, 'I0.0': 1, 'I0.1': 1 },
          check: g => !(g('Q0.0') && g('Q0.1')), checkMsg: 'Both contactors are on. This would short the supply.' }
      ],
      solution: [
        rung([[NO('I0.0')], [NO('Q0.0')]], [NC('I0.2'), NC('Q0.1')], coil('Q0.0')),
        rung([[NO('I0.1')], [NO('Q0.1')]], [NC('I0.2'), NC('Q0.0')], coil('Q0.1'))
      ]
    },
    {
      id: 'delay', tier: 'Advanced', title: 'Delayed Conveyor Start', viz: 'motor',
      desc: 'The conveyor motor must start only after the RUN switch has been on for 3 seconds (warning horn time) and stop immediately when RUN turns off. Use a TON timer.',
      inputs: [{ a: 'I0.0', n: 'RUN_SWITCH', kind: 'sw' }],
      outputs: [{ a: 'Q0.0', n: 'CONVEYOR' }],
      tests: [
        { name: 'Resting state: conveyor off', expect: { 'Q0.0': 0 } },
        { name: 'RUN on, after 1 s: still off', set: { 'I0.0': 1 }, run: 1000, expect: { 'Q0.0': 0 } },
        { name: 'After 2.9 s: still off', run: 1900, expect: { 'Q0.0': 0 } },
        { name: 'After 3.1 s: conveyor runs', run: 200, expect: { 'Q0.0': 1 } },
        { name: 'RUN off: conveyor stops immediately', set: { 'I0.0': 0 }, expect: { 'Q0.0': 0 } },
        { name: 'RUN on again, after 1 s: timer restarted, still off', set: { 'I0.0': 1 }, run: 1000, expect: { 'Q0.0': 0 } },
        { name: 'After 3.1 s again: conveyor runs', run: 2100, expect: { 'Q0.0': 1 } }
      ],
      solution: [
        rung([[]], [NO('I0.0')], coil('T0', 'TON', 3000)),
        rung([[]], [NO('T0')], coil('Q0.0'))
      ]
    }
  ];

  root.PLCChallenges = CHALLENGES;
  if (typeof module !== 'undefined' && module.exports) module.exports = CHALLENGES;
})(typeof window !== 'undefined' ? window : globalThis);
