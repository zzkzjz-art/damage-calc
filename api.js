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

function makePokemon(data) {
  return new Pokemon(gen, data.species, {
    nature: data.nature || 'Serious',

    // Champions에서는 evs 자리가 SP로 사용됨
    evs: fillSP(data.sp),

    boosts: fillBoosts(data.boosts),

    item: data.item || undefined,
    ability: data.ability || undefined,
    status: data.status || ''
  });
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

    description: result.fullDesc()
  };
}


// 서버 상태 확인
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Pokemon Champions Damage API is running'
  });
});


// 실제 GPT가 사용할 대미지 계산 API
app.post('/damage', (req, res) => {
  try {
    const result = calculateDamage(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});


// 브라우저 테스트용
app.get('/test-damage', (req, res) => {
  try {
    const result = calculateDamage({
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
          def: 1
        }
      },

      move: 'Iron Head',

      field: {
        weather: 'Sand'
      }
    });

    res.json(result);

  } catch (error) {

    res.status(400).json({
      error: error.message
    });
  }
});


// Custom GPT용 OpenAPI 스키마
app.get('/openapi.json', (req, res) => {

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    openapi: '3.1.0',

    info: {
      title: 'Pokemon Champions Damage Calculator API',
      version: '1.0.0',
      description: 'Pokemon Champions damage calculator using Smogon damage-calc'
    },

    servers: [
      {
        url: baseUrl
      }
    ],

    paths: {

      '/damage': {

        post: {

          operationId: 'calculateDamage',

          summary: 'Calculate Pokemon Champions damage',

          description:
            'Calculate damage between two Pokemon using Pokemon Champions rules.',

          requestBody: {

            required: true,

            content: {

              'application/json': {

                schema: {

                  type: 'object',

                  properties: {

                    attacker: {
                      $ref: '#/components/schemas/Pokemon'
                    },

                    defender: {
                      $ref: '#/components/schemas/Pokemon'
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
                }
              }
            }
          },

       responses: {

  '200': {
    description: 'Damage calculation result',

    content: {
      'application/json': {

        schema: {
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
            'description'
          ]
        }
      }
    }
  },

  '400': {
    description: 'Invalid calculation request'
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
                hp: { type: 'integer', minimum: 0, maximum: 32 },
                atk: { type: 'integer', minimum: 0, maximum: 32 },
                def: { type: 'integer', minimum: 0, maximum: 32 },
                spa: { type: 'integer', minimum: 0, maximum: 32 },
                spd: { type: 'integer', minimum: 0, maximum: 32 },
                spe: { type: 'integer', minimum: 0, maximum: 32 }
              }
            },

            boosts: {
              type: 'object',
              properties: {
                atk: { type: 'integer', minimum: -6, maximum: 6 },
                def: { type: 'integer', minimum: -6, maximum: 6 },
                spa: { type: 'integer', minimum: -6, maximum: 6 },
                spd: { type: 'integer', minimum: -6, maximum: 6 },
                spe: { type: 'integer', minimum: -6, maximum: 6 }
              }
            }
          },

          required: [
            'species'
          ]
        }
      }
    }
  });
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Pokemon Champions Damage API running on port ${PORT}`
  );
});