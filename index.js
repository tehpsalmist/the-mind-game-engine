const { client, MASTER_QUERY } = require('./ApolloClient')
const { evaluateSubscriptionStatus, setupSubscription } = require('./Subscriptions')

client.subscribe({ query: MASTER_QUERY })
  .subscribe(
    data => {
      // paranoia
      const games = (data && data.data && data.data.games) || []

      games.forEach(game => {
        const isRunning = evaluateSubscriptionStatus(game.id)

        if (!isRunning) {
          setupSubscription(game.id)
        }
      })
    },
    err => console.error(err)
  )
