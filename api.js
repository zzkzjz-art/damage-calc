const express = require('express');

const {
  calculate,
  Generations,
  Pokemon,
  Move,
  Field
} = require('./calc');

const app = express();
app.set('trust proxy', true);
app.use(express.json());

const gen = Generations.get(0); // Pokemon Champions


function fillSP(stats = {}) {
  return {
    hp: 0,
    atk: 0,
    def: 0,
    spa: 0,
    spd: 0,
    spe: 0,
    ...stats
  };
}


function fillBoosts(stats = {}) {
  return {
    atk: 0,
    def: 0,
    spa: 0,
    spd: 0,
    spe: 0,
    ...stats
  };
}


function normalizeSpeciesName(name) {
  if (typeof name !== 'string') return name;

  const trimmed = name.trim();

  // "Mega Gengar" 형식도 "Gengar-Mega"로 변환
  const megaMatch = trimmed.match(/^Mega\s+(.+)$/i);

  if (megaMatch) {
    return `${megaMatch[1]}-Mega`;
  }

  return trimmed;
}


// =========================
// 데미지 계산
// =========================

function makePokemon(data) {
  return new Pokemon(
    gen,
    normalizeSpeciesName(data.species),
    {
      nature: data.nature || 'Serious',

      // Champions에서는 evs 자리가 SP로 사용됨
      evs: fillSP(data.sp),

      boosts: fillBoosts(data.boosts),

      item: data.item || undefined,
      ability: data.ability || undefined,
      status: data.status || ''
    }
  );
}


function calculateDamage(body) {
  const attacker = makePokemon(body.attacker);
  const defender = makePokemon(body.defender);

  const move = new Move(gen, body.move, {
    isCrit: body.isCrit || false
  });

  const field = new Field({
    gameType: 'Singles',
    weather: body.field?.weather || undefined,
    terrain: body.field?.terrain || undefined,
    attackerSide: body.field?.attackerSide || {},
    defenderSide: body.field?.defenderSide || {}
  });

  const result = calculate(
    gen,
    attacker,
    defender,
    move,
    field
  );

  const [minDamage, maxDamage] = result.range();

  const defenderHP = defender.maxHP();

// 타입 상성, 특성 등으로 완전 무효인 경우
if (maxDamage === 0) {
  return {
    attacker: attacker.name,
    defender: defender.name,
    move: move.name,

    attacker_stats: attacker.rawStats,
    defender_stats: defender.rawStats,

    damage: {
      min: 0,
      max: 0
    },

    percent: {
      min: 0,
      max: 0
    },

    defender_max_hp: defenderHP,

    immune: true,

    description:
      `${attacker.name} ${move.name} vs. ${defender.name}: 0 damage -- immune`
  };
}
  const minPercent =
    Math.floor((minDamage / defenderHP) * 1000) / 10;

  const maxPercent =
    Math.floor((maxDamage / defenderHP) * 1000) / 10;

  return {
    attacker: attacker.name,
    defender: defender.name,
    move: move.name,

    attacker_stats: attacker.rawStats,
    defender_stats: defender.rawStats,

    damage: {
      min: minDamage,
      max: maxDamage
    },

    percent: {
      min: minPercent,
      max: maxPercent
    },

    defender_max_hp: defenderHP,

    immune: false,

    description: result.fullDesc()
  };
}


// =========================
// 스피드 계산
// =========================

function speedNatureToNature(mode) {
  if (mode === 'up') return 'Jolly';
  if (mode === 'down') return 'Brave';

  return 'Serious';
}


function applySpeedStage(speed, stage) {
  if (stage > 0) {
    return Math.floor(
      speed * (2 + stage) / 2
    );
  }

  if (stage < 0) {
    return Math.floor(
      speed * 2 / (2 - stage)
    );
  }

  return speed;
}


function calculateSpeedPokemon(data) {

  if (!data || !data.species) {
    throw new Error('species is required');
  }

  const statPoints =
    Number(data.stat_points ?? 0);

  const stage =
    Number(data.stage ?? 0);

  const speedNature =
    data.speed_nature || 'neutral';


  if (
    !Number.isInteger(statPoints) ||
    statPoints < 0 ||
    statPoints > 32
  ) {
    throw new Error(
      'stat_points must be an integer from 0 to 32'
    );
  }


  if (
    !Number.isInteger(stage) ||
    stage < -6 ||
    stage > 6
  ) {
    throw new Error(
      'stage must be an integer from -6 to 6'
    );
  }


  if (
    !['up', 'neutral', 'down'].includes(speedNature)
  ) {
    throw new Error(
      'speed_nature must be up, neutral, or down'
    );
  }


  const pokemon = new Pokemon(
    gen,
    normalizeSpeciesName(data.species),
    {
      nature:
        speedNatureToNature(speedNature),

      evs: {
        spe: statPoints
      }
    }
  );


  // Champions SP + 성격이 적용된 실제 기본 스피드
  const speedBeforeModifiers =
    pokemon.rawStats.spe;


  // 랭크 반영
  const speedAfterStage =
    applySpeedStage(
      speedBeforeModifiers,
      stage
    );


  let finalSpeed =
    speedAfterStage;


  // 구애스카프
  if (data.choice_scarf) {
    finalSpeed =
      Math.floor(finalSpeed * 1.5);
  }


  // 모래헤치기 활성
  if (data.sand_rush) {
    finalSpeed =
      finalSpeed * 2;
  }


  return {

    label:
      data.label || pokemon.name,

    species:
      pokemon.name,

    stat_points:
      statPoints,

    speed_nature:
      speedNature,

    speed_before_modifiers:
      speedBeforeModifiers,

    stage:
      stage,

    speed_after_stage:
      speedAfterStage,

    choice_scarf:
      Boolean(data.choice_scarf),

    sand_rush:
      Boolean(data.sand_rush),

    final_speed:
      finalSpeed
  };
}


function compareSpeed(body) {

  const first =
    calculateSpeedPokemon(body.first);

  const second =
    calculateSpeedPokemon(body.second);


  if (
    first.final_speed >
    second.final_speed
  ) {
    return {
      first,
      second,
      faster: first.label,
      difference:
        first.final_speed -
        second.final_speed
    };
  }


  if (
    second.final_speed >
    first.final_speed
  ) {
    return {
      first,
      second,
      faster: second.label,
      difference:
        second.final_speed -
        first.final_speed
    };
  }


  return {
    first,
    second,
    faster: '동속',
    difference: 0
  };
}


// =========================
// API
// =========================

app.get('/', (req, res) => {

  res.json({
    status: 'ok',
    message:
      'Pokemon Champions Calculator API is running'
  });

});


app.post('/damage', (req, res) => {

  try {

    res.json(
      calculateDamage(req.body)
    );

  } catch (error) {

    res.status(400).json({
      error: error.message
    });

  }

});


app.post('/compare-speed', (req, res) => {

  try {

    res.json(
      compareSpeed(req.body)
    );

  } catch (error) {

    res.status(400).json({
      error: error.message
    });

  }

});


// =========================
// 브라우저 테스트
// =========================

app.get('/test-damage', (req, res) => {

  try {

    res.json(
      calculateDamage({

        attacker: {
          species: 'Excadrill',
          nature: 'Adamant',

          sp: {
            hp: 2,
            atk: 32,
            spe: 32
          },

          boosts: {
            atk: 2
          },

          item: 'Life Orb',
          ability: 'Sand Rush'
        },


        defender: {
          species: 'Clefable-Mega',
          nature: 'Bold',

          sp: {
            hp: 32,
            def: 32
          },

          boosts: {
            def: 1,
            spd: 1
          }
        },


        move: 'Iron Head',

        field: {
          weather: 'Sand'
        }

      })
    );

  } catch (error) {

    res.status(400).json({
      error: error.message
    });

  }

});


app.get('/test-speed', (req, res) => {

  try {

    res.json(
      compareSpeed({

        first: {
          label: '몰드류',
          species: 'Excadrill',
          stat_points: 32,
          speed_nature: 'neutral',
          stage: 0,
          choice_scarf: false,
          sand_rush: true
        },


        second: {
          label: '마스카나',
          species: 'Meowscarada',
          stat_points: 32,
          speed_nature: 'up',
          stage: 0,
          choice_scarf: true,
          sand_rush: false
        }

      })
    );

  } catch (error) {

    res.status(400).json({
      error: error.message
    });

  }

});


// =========================
// OpenAPI
// =========================

app.get('/openapi.json', (req, res) => {

  const baseUrl =
    `${req.protocol}://${req.get('host')}`;


  res.json({

    openapi: '3.1.0',


    info: {

      title:
        'Pokemon Champions Calculator API',

      version:
        '2.0.0',

      description:
        'Pokemon Champions speed and damage calculator using Smogon damage-calc'

    },


    servers: [
      {
        url: baseUrl
      }
    ],


    paths: {


      '/damage': {

        post: {

          operationId:
            'calculateDamage',

          summary:
            'Calculate Pokemon Champions damage',

          requestBody: {

            required: true,

            content: {

              'application/json': {

                schema: {
                  $ref:
                    '#/components/schemas/DamageRequest'
                }

              }

            }

          },


          responses: {

            '200': {

              description:
                'Damage calculation result',

              content: {

                'application/json': {

                  schema: {
                    $ref:
                      '#/components/schemas/DamageResponse'
                  }

                }

              }

            },


            '400': {
              description:
                'Invalid calculation request'
            }

          }

        }

      },


      '/compare-speed': {

        post: {

          operationId:
            'compareSpeed',

          summary:
            'Compare two Pokemon Champions Speed values',

          description:
            'Uses Champions SP, nature, stat stages, Choice Scarf and active Sand Rush. Species should use Smogon English names such as Excadrill, Meowscarada, Gengar-Mega, Tyranitar or Garchomp.',


          requestBody: {

            required: true,

            content: {

              'application/json': {

                schema: {
                  $ref:
                    '#/components/schemas/SpeedCompareRequest'
                }

              }

            }

          },


          responses: {

            '200': {

              description:
                'Speed comparison result',

              content: {

                'application/json': {

                  schema: {
                    $ref:
                      '#/components/schemas/SpeedCompareResponse'
                  }

                }

              }

            },


            '400': {
              description:
                'Invalid speed comparison request'
            }

          }

        }

      }

    },


    components: {

      schemas: {


        Pokemon: {

          type: 'object',

          properties: {

            species: {
              type: 'string'
            },

            nature: {
              type: 'string'
            },

            item: {
              type: 'string'
            },

            ability: {
              type: 'string'
            },

            status: {
              type: 'string'
            },


            sp: {

              type: 'object',

              properties: {

                hp: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 32
                },

                atk: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 32
                },

                def: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 32
                },

                spa: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 32
                },

                spd: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 32
                },

                spe: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 32
                }

              }

            },


            boosts: {

              type: 'object',

              properties: {

                atk: {
                  type: 'integer',
                  minimum: -6,
                  maximum: 6
                },

                def: {
                  type: 'integer',
                  minimum: -6,
                  maximum: 6
                },

                spa: {
                  type: 'integer',
                  minimum: -6,
                  maximum: 6
                },

                spd: {
                  type: 'integer',
                  minimum: -6,
                  maximum: 6
                },

                spe: {
                  type: 'integer',
                  minimum: -6,
                  maximum: 6
                }

              }

            }

          },

          required: [
            'species'
          ]

        },


        DamageRequest: {

          type: 'object',

          properties: {

            attacker: {
              $ref:
                '#/components/schemas/Pokemon'
            },

            defender: {
              $ref:
                '#/components/schemas/Pokemon'
            },

            move: {
              type: 'string'
            },

            isCrit: {
              type: 'boolean',
              default: false
            },

            field: {

              type: 'object',

              properties: {

                weather: {
                  type: 'string'
                },

                terrain: {
                  type: 'string'
                },

                attackerSide: {
                  type: 'object',
                  additionalProperties: true
                },

                defenderSide: {
                  type: 'object',
                  additionalProperties: true
                }

              }

            }

          },

          required: [
            'attacker',
            'defender',
            'move'
          ]

        },


        DamageResponse: {

          type: 'object',

          properties: {

            attacker: {
              type: 'string'
            },

            defender: {
              type: 'string'
            },

            move: {
              type: 'string'
            },


            damage: {

              type: 'object',

              properties: {

                min: {
                  type: 'integer'
                },

                max: {
                  type: 'integer'
                }

              },

              required: [
                'min',
                'max'
              ]

            },


            percent: {

              type: 'object',

              properties: {

                min: {
                  type: 'number'
                },

                max: {
                  type: 'number'
                }

              },

              required: [
                'min',
                'max'
              ]

            },


            defender_max_hp: {
              type: 'integer'
            },

immune: {
  type: 'boolean',
  description:
    'True when the move does zero damage because the target is immune.'
},
 
           description: {
              type: 'string'
            }

          },


required: [
  'attacker',
  'defender',
  'move',
  'damage',
  'percent',
  'defender_max_hp',
  'immune',
  'description'
]

        },


        SpeedPokemon: {

          type: 'object',

          properties: {

            label: {
              type: 'string'
            },

            species: {
              type: 'string',
              description:
                'Smogon English species name'
            },

            stat_points: {
              type: 'integer',
              minimum: 0,
              maximum: 32,
              default: 0
            },

            speed_nature: {
              type: 'string',
              enum: [
                'up',
                'neutral',
                'down'
              ],
              default:
                'neutral'
            },

            stage: {
              type: 'integer',
              minimum: -6,
              maximum: 6,
              default: 0
            },

            choice_scarf: {
              type: 'boolean',
              default: false
            },

            sand_rush: {
              type: 'boolean',
              default: false
            }

          },

          required: [
            'species'
          ]

        },


        CalculatedSpeed: {

          type: 'object',

          properties: {

            label: {
              type: 'string'
            },

            species: {
              type: 'string'
            },

            stat_points: {
              type: 'integer'
            },

            speed_nature: {
              type: 'string'
            },

            speed_before_modifiers: {
              type: 'integer'
            },

            stage: {
              type: 'integer'
            },

            speed_after_stage: {
              type: 'integer'
            },

            choice_scarf: {
              type: 'boolean'
            },

            sand_rush: {
              type: 'boolean'
            },

            final_speed: {
              type: 'integer'
            }

          },


          required: [
            'label',
            'species',
            'stat_points',
            'speed_nature',
            'speed_before_modifiers',
            'stage',
            'speed_after_stage',
            'choice_scarf',
            'sand_rush',
            'final_speed'
          ]

        },


        SpeedCompareRequest: {

          type: 'object',

          properties: {

            first: {
              $ref:
                '#/components/schemas/SpeedPokemon'
            },

            second: {
              $ref:
                '#/components/schemas/SpeedPokemon'
            }

          },

          required: [
            'first',
            'second'
          ]

        },


        SpeedCompareResponse: {

          type: 'object',

          properties: {

            first: {
              $ref:
                '#/components/schemas/CalculatedSpeed'
            },

            second: {
              $ref:
                '#/components/schemas/CalculatedSpeed'
            },

            faster: {
              type: 'string'
            },

            difference: {
              type: 'integer',
              minimum: 0
            }

          },

          required: [
            'first',
            'second',
            'faster',
            'difference'
          ]

        }

      }

    }

  });

});


const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Pokemon Champions Calculator API running on port ${PORT}`
  );

});