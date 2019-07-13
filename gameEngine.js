const {
  client,
  gql,
  GAME_IS_READY,
  GAME_NOT_READY,
  CONFLICTED_GAME,
  UNCONFLICTED_GAME,
  TRANSITIONING_ROUND,
  UNTRANSITIONING_ROUND,
  GET_ROUND
} = require('./ApolloClient')

const deck = Array(100).fill(1).map((n, i) => n + i)

exports.gameEngine = async queryData => {
  if (!queryData || !queryData.data || !queryData.data.games_by_pk) return 'wut'

  const { games_by_pk: game } = queryData.data

  console.log(`game ${game.id}: ${new Date().toISOString()}`)

  // Start Round 1
  if (!game.round) {
    return startRound(game)
  }

  // All Players Are Ready
  if (!game.ready && !game.in_conflict && game.players.every(player => player.ready)) {
    return gameIsReady(game.id)
  }

  // A Player Declared Concentration
  if (game.ready && !game.in_conflict && game.players.some(player => !player.ready)) {
    return gameNotReady(game)
  }

  // Card Out Of Order!
  if (game.ready && !game.in_conflict && isGameConflicted(game)) {
    const conflictedGame = await setGameInConflict(game)

    if (!conflictedGame) {
      return 'Issue evaluating conflicted game'
    }

    const problemCards = getAllProblemCards(conflictedGame)

    const livesToLose = problemCards.length

    const { newPlays, oldPlays } = problemCards
      .map(({ unreconciled }) => unreconciled)
      .reduce((list, group) => [...list, ...group], [])
      .reduce(({ newPlays, oldPlays }, play) => {
        if (play.played) {
          oldPlays.push(play.id)
        } else {
          newPlays.push(play)
        }

        return { newPlays, oldPlays }
      }, { newPlays: [], oldPlays: [] })

    console.log('livestolose', livesToLose)
    console.log('newplays', newPlays)
    console.log('oldplays', oldPlays)
  }

  // A Round Has Finished
  if (!game.in_conflict && !game.transitioning_round && game.players.every(player => player.cards.length === 0)) {
    const [transitioningGame, nextRound] = await setGameInTransition(game)

    if (!transitioningGame) {
      return 'Issue transitioning round'
    }

    await dealOutRewards(transitioningGame)

    return startRound(transitioningGame, nextRound)
  }
}

async function startRound (game, round = { number_of_cards: 1, id: 1 }) {
  shuffleAndDeal(game.players, round.number_of_cards)

  const variables = game.players.reduce((vars, { id, cards }) => ({
    ...vars,
    [`player${id}Id`]: id,
    [`player${id}`]: { ready: false, cards: `{${cards.join(',')}}` }
  }), { gameId: game.id, roundId: round.id })

  const DEAL_CARDS = gql`
    mutation start_round($gameId: Int, $roundId: Int, ${game.players.map(({ id }) => `$player${id}Id: Int, $player${id}: players_set_input`).join(', ')}) {
      update_games(where: {id: {_eq: $gameId}}, _set: {round_id: $roundId, transitioning_round: false}) {
        affected_rows
      }
      ${game.players.map(({ id }) => `
        player${id}: update_players(where: {id: {_eq: $player${id}Id}}, _set: $player${id}) {
          affected_rows
        }
      `).join('\n')}
    }
  `

  const startedGame = await client.mutate({ mutation: DEAL_CARDS, variables })
    .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (startedGame instanceof Error) {
    console.error('error starting game:', startedGame.message)
    return null
  }

  return startedGame
}

function shuffleAndDeal (players, round) {
  const newDeck = [...deck]

  while (round-- > 0) {
    players.forEach(player => {
      const [nextCard] = newDeck.splice(Math.floor(Math.random() * newDeck.length), 1)
      player.cards.push(nextCard)
    })
  }

  players.forEach(({ cards }) => cards.sort((a, b) => a - b))
}

async function gameIsReady (gameId) {
  const readyGame = await client.mutate({ mutation: GAME_IS_READY, variables: { gameId } })
    .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (readyGame instanceof Error) {
    console.error('error setting game ready state:', readyGame.message)
    return null
  }

  return readyGame
}

async function gameNotReady (game) {
  const variables = {
    playerIds: game.players.map(({ id }) => id),
    gameId: game.id
  }

  const notReady = await client.mutate({ mutation: GAME_NOT_READY, variables })
    .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (notReady instanceof Error) {
    console.error('error setting game ready state:', notReady.message)
    return null
  }

  return notReady
}

function isGameConflicted (game) {
  let lowestUnplayedCard = game.players
    .reduce((lowest, player) => Math.min(lowest, player.cards[0] || 101), 101)

  console.log('lowestUnplayedCard', lowestUnplayedCard)

  return game.plays
    .filter(play => play.round_id === game.round.id)
    .some(play => {
      if (play.value < lowestUnplayedCard || play.reconciled) {
        lowestUnplayedCard = play.value

        return false
      }

      return true
    })
}

async function setGameInConflict (game) {
  const variables = {
    gameId: game.id,
    playerIds: game.players.map(({ id }) => id)
  }

  const cData = await client
    .mutate({ mutation: CONFLICTED_GAME, variables })
    .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

  if (cData instanceof Error ||
    !cData ||
    !cData.data ||
    !cData.data.update_games ||
    !cData.data.update_games.returning ||
    !cData.data.update_games.returning[0]
  ) {
    await client.mutate({ mutation: UNCONFLICTED_GAME, variables: { gameId: game.id } })
      .catch(err => console.error('Can\'t even unstick it...', err))

    console.error(cData instanceof Error ? cData.message : `no conflict data: ${cData}`)
    return null
  }

  return cData.data.update_games.returning[0]
}

function getAllProblemCards (game) {
  console.log('conflicted game', game)
  const playsThisRound = game.plays.filter(play => play.round_id === game.round.id)

  const highestPlayedCard = playsThisRound.reduce((highest, play) => Math.max(highest, play.value || 0), 0)

  const recentPlays = playsThisRound
    .map(({ value, reconciled, id }) => ({ value, reconciled, id, played: true }))
    .reverse()

  const missedCards = game.players
    .reduce((list, player) => [
      ...list,
      ...player.cards.filter(c => c < highestPlayedCard).map((value) => ({ playerId: player.id, value }))
    ], [])
    .sort((a, b) => a - b)

  console.log('recentPlays', recentPlays)
  console.log('missedCards', missedCards)
  const conflictList = mergeCardLists(recentPlays, missedCards)
  console.log('conflictList', conflictList)

  return conflictList.reduce((list, play, index, plays) => {
    if (
      !play.played ||
      (
        !play.reconciled &&
        (
          play.value < (plays[index - 1] || { value: 0 }).value ||
          !(plays[index - 1] || { played: true }).played
        )
      )
    ) {
      if (!list[0] || (plays[index - 1].played && !play.played)) {
        list.push({ currentHighest: play.value, unreconciled: [play] })

        return list
      }

      const currentGroup = list[list.length - 1]

      currentGroup.currentHighest = Math.max(currentGroup.currentHighest, play.value)
      currentGroup.unreconciled.push(play)
    }

    return list
  }, [])
}

function mergeCardLists (staticList, sortedList) {
  const finalList = [...staticList]

  let staticIndex = 0
  let sortedIndex = 0

  while (sortedIndex < sortedList.length) {
    if (
      (finalList[staticIndex - 1] || { value: 0 }).value < sortedList[sortedIndex].value &&
      finalList[staticIndex].value > sortedList[sortedIndex].value
    ) {
      finalList.splice(staticIndex, 0, sortedList[sortedIndex])
      sortedIndex++
    }

    staticIndex++
  }

  return finalList
}

async function setGameInTransition (game) {
  const variables = {
    gameId: game.id,
    playerIds: game.players.map(({ id }) => id)
  }

  const [tData, nextRound] = await Promise.all([
    client.mutate({ mutation: TRANSITIONING_ROUND, variables })
      .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err))),
    client.query({ query: GET_ROUND, variables: { roundId: game.round.id + 1 } })
      .catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))
  ])

  if (tData instanceof Error ||
    !tData ||
    !tData.data ||
    !tData.data.update_games ||
    !tData.data.update_games.returning ||
    !tData.data.update_games.returning[0]
  ) {
    await client.mutate({ mutation: UNTRANSITIONING_ROUND, variables: { gameId: game.id } })
      .catch(err => console.error('Can\'t even unstick it...', err))

    console.error(tData instanceof Error ? tData.message : `no conflict data: ${tData}`)
    return null
  }

  return [tData.data.update_games.returning[0], nextRound.data.rounds_by_pk]
}

async function dealOutRewards (game) {
  const reward = game.round.reward === 'star' ? 'stars' : game.round.reward === 'life' ? 'lives' : null

  if (reward) {
    const rewarded = await client.mutate({
      mutation: gql`
        mutation grant_reward($${reward}: Int, $gameId: Int) {
          update_games(where: {id: {_eq: $gameId}}, _set: {${reward}: $${reward}}) {
            affected_rows
          }
        }
      `,
      variables: {
        [reward]: game[reward] + 1
      }
    }).catch(err => err instanceof Error ? err : new Error(JSON.stringify(err)))

    if (rewarded instanceof Error) {
      console.error('error granting rewards:', rewarded.message)
      return null
    }

    return rewarded
  }
}
