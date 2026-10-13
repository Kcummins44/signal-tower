// Legend: . empty   H house   # wall   ^ hill (tower range +1)
const LEVELS = [
  {
    name: 'First Signal',
    hint: 'Click an empty tile to place a tower. Click it again to remove it.',
    towers: 1, radius: 2,
    map: [
      '..H..',
      '.....',
      'H...H',
      '.....',
      '..H..',
    ],
  },
  {
    name: 'The Wall',
    hint: 'Walls block signal. Find a way around them.',
    towers: 2, radius: 2,
    map: [
      '.H.#.H.',
      '...#...',
      '.......',
      '...#...',
      '.H.#.H.',
    ],
  },
  {
    name: 'High Ground',
    hint: 'A tower on a hill reaches one tile further.',
    towers: 1, radius: 2,
    map: [
      '.H...H.',
      '.......',
      '...^...',
      '.......',
      '.H...H.',
    ],
  },
  {
    name: 'Corridors',
    hint: 'Walls split the map into pockets. Look for the high ground.',
    towers: 3, radius: 2,
    map: [
      '.H.....#',
      '.......#',
      '...^H#..',
      '.....#.H',
      '..#.H#..',
      '###.###.',
      '.H#...H.',
      '..#..^..',
    ],
  },
  {
    name: 'Signal Tower',
    hint: 'Four towers, eight houses. Every placement counts.',
    towers: 4, radius: 2,
    map: [
      '...H..H..',
      '.....^...',
      '...H.....',
      '...^...##',
      '.......##',
      '^.......#',
      'H...##..#',
      '..HH.#.#.',
      '.....#H#H',
    ],
  },
];
if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
