# IB Stream server
Project creates a websocket server which streams realtime forex prices


## First start
Start IB Gateway on port 4001 and run:
```bash
# install deps 
npm i 
# create config
cp config-sample.json config.json
# instal watchdog for running server 
npm i -g forever

# run streaming server 
forever start -m 20 -a -l /var/log/ibStream.log --uid 'ibstream' app.js

# run example client
node client.js
```
