const fetch = require('cross-fetch/polyfill')
const { HttpLink } = require('apollo-link-http')
const { WebSocketLink } = require('apollo-link-ws')
const { getMainDefinition } = require('apollo-utilities')
const { split } = require('apollo-link')
const { InMemoryCache } = require('apollo-cache-inmemory')
const { ApolloClient } = require('apollo-client')
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

module.exports = {
  client
}
