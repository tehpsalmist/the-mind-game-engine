const { client, GAME } = require('./ApolloClient')
const Observable = require('zen-observable')
const Subscription = new Observable(() => {}).subscribe(() => {}).constructor
const { gameEngine } = require('./gameEngine')

const liveGames = {}

const evaluateSubscriptionStatus = id => {
  const exists = liveGames[id] instanceof Subscription

  return exists && !liveGames[id].closed
}

const setupSubscription = id => {
  const variables = { gameId: id }

  liveGames[id] = client
    .subscribe({ query: GAME, variables })
    .subscribe(data => {
      gameEngine(data)
    }, err => {
      console.log('gotta decide what to do here:', err)
    })
}

module.exports = {
  liveGames,
  evaluateSubscriptionStatus,
  setupSubscription
}
