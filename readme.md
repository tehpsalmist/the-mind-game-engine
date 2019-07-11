# The Mind

This is a hobby project that attempts to bring The Mind Card Game to the Web using Hasura's GraphQL Engine, serverless functions, and websockets.

### The Game Engine

This component of the system listens for events signifying a game has started, then subscribes to that game and maintains that subscription until the corresponding "finished" event takes place.

While subscribed to a game, the engine runs logic that determines, after each card is played, whether or not the card was played out of order, and if so, it pauses the game and deals out the consequence for the faulty card(s). The engine also handles the shuffling, dealing, and reward reconciliation at the end of each hand.