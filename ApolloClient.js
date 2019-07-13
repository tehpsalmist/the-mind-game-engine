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
      is_full
      lives
      stars
      started
      ready
      in_conflict
      transitioning_round
      finished
      player_count
      players {
        id
        name
        user_id
        cards
        ready
      }
      round {
        id
        number_of_cards
        is_blind
        reward
      }
      plays(order_by: {timestamp: desc, round_id: desc}) {
        id
        player_id
        reconciled
        round_id
        timestamp
        value
      }
      finished_at
      created_at
      owner_id
    }
  }
`

const GAME_IS_READY = gql`
  mutation game_ready($gameId: Int) {
    update_games(where: {id: {_eq: $gameId}}, _set: {in_conflict: false, ready: true}) {
      affected_rows
    }
  }
`

const GAME_NOT_READY = gql`
  mutation game_not_ready($playerIds: [Int], $gameId: Int) {
    update_games(where: {id: {_eq: $gameId}}, _set: {ready: false}) {
      affected_rows
    }
    update_players(where: {id: {_in: $playerIds}}, _set: {ready: false}) {
      affected_rows
    }
  }
`

const CONFLICTED_GAME = gql`
  mutation conflicted_game($gameId: Int, $playerIds: [Int]) {
    update_players(where: {id: {_in: $playerIds}}, _set: {ready: false}) {
      affected_rows
    }
    update_games(where: {id: {_eq: $gameId}}, _set: {in_conflict: true, ready: false}) {
      returning {
        id
        name
        is_full
        lives
        stars
        started
        ready
        in_conflict
        transitioning_round
        finished
        player_count
        players {
          id
          name
          user_id
          cards
          ready
        }
        round {
          id
          number_of_cards
          is_blind
          reward
        }
        plays(order_by: {timestamp: desc, round_id: desc}) {
          id
          player_id
          reconciled
          round_id
          timestamp
          value
        }
        finished_at
        created_at
        owner_id
      }
    }
  }
`

const UNCONFLICTED_GAME = gql`
  mutation unconflicted_game($gameId: Int) {
    update_games(where: {id: {_eq: $gameId}}, _set: {in_conflict: false}) {
      affected_rows
    }
  }
`

const TRANSITIONING_ROUND = gql`
  mutation transitioning_round($gameId: Int, $playerIds: [Int]) {
    update_players(where: {id: {_in: $playerIds}}, _set: {ready: false}) {
      affected_rows
    }
    update_games(where: {id: {_eq: $gameId}}, _set: {transitioning_round: true, ready: false}) {
      returning {
        id
        name
        is_full
        lives
        stars
        started
        ready
        in_conflict
        transitioning_round
        finished
        player_count
        players {
          id
          name
          user_id
          cards
          ready
        }
        round {
          id
          number_of_cards
          is_blind
          reward
        }
        plays(order_by: {timestamp: desc, round_id: desc}) {
          id
          player_id
          reconciled
          round_id
          timestamp
          value
        }
        finished_at
        created_at
        owner_id
      }
    }
  }
`

const UNTRANSITIONING_ROUND = gql`
  mutation untransitioning_round($gameId: Int) {
    update_games(where: {id: {_eq: $gameId}}, _set: {transitioning_round: false}) {
      affected_rows
    }
  }
`

const GET_ROUND = gql`
  query get_round($roundId: Int!) {
    rounds_by_pk(id: $roundId) {
      id
      reward
      number_of_cards
      is_blind
    }
  }
`

module.exports = {
  client,
  gql,
  MASTER_QUERY,
  GAME,
  GAME_IS_READY,
  GAME_NOT_READY,
  CONFLICTED_GAME,
  UNCONFLICTED_GAME,
  TRANSITIONING_ROUND,
  UNTRANSITIONING_ROUND,
  GET_ROUND
}
