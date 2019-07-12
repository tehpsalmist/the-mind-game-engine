const { client, gql } = require('./ApolloClient')

const deck = Array(100).fill(1).map((n, i) => n + i)

exports.gameEngine = async queryData => {
  if (!queryData || !queryData.data) return

  const { games_by_pk: game } = queryData.data

  console.log(game)

  if (!game.round) {
    return startRound(game, 1)
  }

  if (game.ready && !game.conflict) {
    // concat available cards
    // filter plays by round
    // check each play for conflict
    // if conflict, send conflict: true
  }
}

function shuffleAndDeal (players, round) {
  const newDeck = [...deck]

  while (round-- > 0) {
    players.forEach(player => {
      const [nextCard] = newDeck.splice(Math.floor(Math.random() * newDeck.length), 1)
      player.cards.push(nextCard)
    })
  }
}

function startRound (game, round) {
  shuffleAndDeal(game.players, round)

  const playerVariables = game.players.reduce((vars, { id, cards }) => ({
    ...vars,
    [`player${id}Id`]: id,
    [`player${id}`]: { cards: cards.join(' ') }
  }), { gameId: game.id, roundId: round })

  const DEAL_CARDS = gql`
      mutation start_first_round($gameId: Int, $roundId: Int, ${game.players.map(({ id }) => `$player${id}Id: Int, $player${id}: players_set_input`).join(', ')}) {
        update_games(where: {id: {_eq: $gameId}}, _set: {round_id: $roundId}) {
          affected_rows
        }
      ${game.players.map(({ id }) => `
        player${id}: update_players(where: {id: {_eq: $player${id}Id}}, _set: $player${id}) {
          affected_rows
        }
      `).join('\n')}
      }
    `

  client.mutate({ mutation: DEAL_CARDS, variables: playerVariables }).catch(err => console.error(err.message))
}
