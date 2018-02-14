const io = require('socket.io-client')

const ip = process.env.IP || '127.0.0.1'
const port = process.env.PORT || 5522
const config = {
  reconnectionAttempts: Infinity,
  reconnectionDelay: 10
}
console.log(port, ip)

const url = `http://${ip}:${port}`

console.log("Connecting to URL", url)
const socket = io(url, config);

socket.on('connect', () => {
  console.log("Connected")
});
socket.on('error', (err) => {
  console.error(err)
});
socket.on('disconnect', () => {
  console.log("EVENT - disconnect")
});
socket.on('prices', (prices) => {
  console.log(prices)
});

socket.on('event', (prices) => {
  console.log(prices)
});
