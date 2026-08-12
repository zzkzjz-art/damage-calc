const {
  calculate,
  Generations,
  Pokemon,
  Move
} = require('./calc');

const gen = Generations.get(0);

const attacker = new Pokemon(gen, 'Excadrill', {
  nature: 'Adamant',
  evs: {
    hp: 2,
    atk: 32,
    spe: 32
  },
  boosts: {
    atk: 2
  },
  item: 'Life Orb',
  ability: 'Sand Rush'
});

const defender = new Pokemon(gen, 'Clefable-Mega', {
  nature: 'Bold',
  evs: {
    hp: 32,
    def: 32
  },
  boosts: {
    def: 1
  }
});

const move = new Move(gen, 'Iron Head');

const result = calculate(
  gen,
  attacker,
  defender,
  move
);

console.log('공격자 능력치:', attacker.rawStats);
console.log('방어자 능력치:', defender.rawStats);
console.log('대미지 배열:', result.damage);
console.log('대미지 범위:', result.range());
console.log('상세:', result.fullDesc());