const { client } = require('./ApolloClient')
const gql = require('graphql-tag').default

const MASTER_QUERY = gql`
  subscription games {
    games(where: {_and: {started: {_eq: true}, finished: {_eq: false}}}) {
      id
      started
      finished
    }
  }
`

client.subscribe({ query: MASTER_QUERY })
  .subscribe(
    data => {
      // paranoia
      const games = (data && data.data && data.data.games) || []

      games.forEach(game => console.log(game.id))
    },
    err => console.error(err)
  )
