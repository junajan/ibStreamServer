const _ = require('lodash')
require('colors')
const ibClient = require('ib')
const moment = require('moment')
const socketIo = require('socket.io')
const server = require('http').createServer()
let config = null

try {
  config = _.cloneDeep(require('./config.json'))
} catch (e) {
  console.log(e.message)
  process.exit(1)
}

config = _.defaults(config, {
  port: 5522,
  ibPort: 4001,
  ibClientId: 2,
})

const port = process.env.PORT || config.port
const ibPort = process.env.IB_PORT || config.ibPort
const streamings = {}
let nextValidId = 0

const forexTickers = process.env.TICKERS
  ? process.env.TICKERS.split(',')
  : config.forex

// SocketIo config
const io = socketIo(server, {
  serveClient: false,
})

console.log("Connecting to IB on port %d and running server on port %s", ibPort, port)

io.on('connection', (socket) => {
  console.log('[USER]: connected user'.yellow)

  socket.emit('prices', _getAllPrices(streamings))
  socket.on('disconnect', () => {
    console.log('[USER]: disconnected user')
  })
})

// IB config
const ibConfig = {
  clientId: process.env.IB_CLIENT_ID || config.ibClientId,
  host: "127.0.0.1",
  port: ibPort
}

const ib = new ibClient(ibConfig)
  .on('error', (err) => {
    console.log(err)
    if (String(err).includes('Market data farm connection is OK'))
      console.log('[INFO]: %s', err.message.replace('Error: ', ''))
    else
      console.error('[ERROR]:', err)
  }).on('result', (event, args) => {
    const filter = [
      'tickPrice', // catch price in special event
      'tickSize', // ignore size
      'nextValidId',
      'tickGeneric',
    ]

    if (!_.includes(filter, event))
      console.log(event, args)
  })
  .on('nextValidId', (_nextValidId) => {
    console.log('[INFO]: IB Api connected')
    nextValidId = _nextValidId
    ib.emit('startProcessing')
  })
  .on('tickPrice', (tickerId, tickType, price, canAutoExecute) => {
    if (_.isUndefined(streamings[tickerId])) {
      console.error('[ERROR]: Unknown id %d', tickerId)
      ib.cancelMktData(parseInt(tickerId))
      return
    }

    streamings[tickerId].tickPrice(tickType, price)
  })
  .on('startProcessing', () => {
    console.log('[INFO]: Streaming ', forexTickers)
    forexTickers.forEach((ticker) => {
      ticker = ticker.split('/')
      _startStreaming(getStreamForexConfig(nextValidId++, ticker[1], ticker[0]))
    })

  })

function getStreamForexConfig(id, currency, symbol) {
  const conf = {
    currency,
    symbol,
    ticker: `${symbol}/${currency}`,
    exchange: 'IDEALPRO',
    secType: 'CASH',
  }

  return {
    type: 'FOREX',
    id,
    conf,
    prices: {},
    lastBid: null,
    lastAsk: null,
    process: function () {
      const decs = 4
      const time = moment().toISOString()
      const tickers = [this.conf.symbol, this.conf.currency]
      let emit = false

      if (this.lastBid !== null && this.lastBid !== -1) {
        const priceReverse = _.round(1 / this.lastBid, decs)
        const ticker = _.clone(tickers).reverse().join('/')

        if (!this.prices[ticker] || this.prices[ticker].price !== priceReverse) {
          emit = true
          this.prices[ticker] = {
            time,
            price: priceReverse
          }
        }
      }

      if (this.lastAsk !== null && this.lastBid !== -1) {
        const price = _.round(this.lastAsk, decs)
        const ticker = tickers.join('/')

        if (!this.prices[ticker] || this.prices[ticker].price !== price) {
          emit = true
          this.prices[ticker] = {
            time,
            price
          }
        }
      }

      if(emit) {
        if(config.debug)
          console.log('[DEBUG]: Emitting prices', this.prices)
        io.sockets.emit('prices', this.prices)
      }
    },
    tickPrice: function (tickType, price) {
      tickType = ib.util.tickTypeToString(tickType)
      if (tickType === 'ASK')
        this.lastAsk = price
      if (tickType === 'BID')
        this.lastBid = price

      if(config.debug)
        console.log('[DEBUG]: %s %s %f', tickType, this.conf.ticker, price)
      this.process()
    }
  }
}

function _startStreaming(config) {
  console.log(
    '[INFO]: Streaming(%d) %s %s/%s',
    config.id,
    config.type,
    config.conf.symbol,
    config.conf.currency
  )

  streamings[config.id] = config
  ib.reqMktData(config.id, config.conf, '', false, false)
}

function _getAllPrices () {
  return _(streamings)
    .values()
    .map('prices')
    .reduce((list, prices) => _.merge(list, prices), {}) // merge all prices together
}

ib.connect()
server.listen(port)

