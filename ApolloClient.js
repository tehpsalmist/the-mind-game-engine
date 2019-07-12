const fetch = require('cross-fetch/polyfill').default
const { HttpLink } = require('apollo-link-http')
const { WebSocketLink } = require('apollo-link-ws')
const { getMainDefinition } = require('apollo-utilities')
const { split } = require('apollo-link')
const { InMemoryCache } = require('apollo-cache-inmemory')
const { ApolloClient } = require('apollo-client')
const gql = require('graphql-tag')

const ws = require('ws')

const { X_HASURA_ADMIN_SECRET_THE_MIND } = process.env

const httpLink = new HttpLink({
  uri: 'https://the-mind.herokuapp.com/v1/graphql',
  headers: {
    'x-hasura-admin-secret': X_HASURA_ADMIN_SECRET_THE_MIND
  },
  fetch
})

// Create a WebSocket link:
const wsLink = new WebSocketLink({
  uri: `wss://the-mind.herokuapp.com/v1/graphql`,
  options: {
    reconnect: true,
    connectionParams: {
      headers: {
        'x-hasura-admin-secret': X_HASURA_ADMIN_SECRET_THE_MIND
      }
    },
    lazy: true
  },
  webSocketImpl: ws
})

const link = split(
  ({ query }) => {
    const definition = getMainDefinition(query)

    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    )
  },
  wsLink,
  httpLink
)

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  resolvers: {}
})

const MASTER_QUERY = gql`
  subscription games {
    games(where: {_and: {started: {_eq: true}, finished: {_eq: false}}}) {
      id
      started
      finished
    }
  }
`

const GAME = gql`
  subscription game($gameId: Int!) {
    games_by_pk(id: $gameId) {
      id
      name
      player_count
      players {
        id
        name
        user_id
        cards
      }
      lives
      is_full
      stars
      created_at
      finished_at
      round {
        number_of_cards
        is_blind
        reward
      }
      finished
      owner_id
      plays(order_by: {round_id: asc}) {
        id
        out_of_order
        penalized
        round_id
        timestamp
        value
      }
      ready
      started
    }
  }
`

module.exports = {
  client,
  gql,
  MASTER_QUERY,
  GAME
}
