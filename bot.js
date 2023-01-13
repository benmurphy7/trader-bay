const tmi = require('tmi.js');
const XMLHttpRequest = require('xhr2');
const CoinbasePro = require('coinbase-pro');
const localStorage = require('node-localstorage')
const puppeteer = require('puppeteer-extra')
const fs = require('fs').promises;
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
const kmeans = require('./1d_kmeans.js');


class TokenBucketRateLimiter {
  constructor (maxRequests, maxRequestWindowMS) {
    this.maxRequests = maxRequests
    this.maxRequestWindowMS = maxRequestWindowMS
    this.reset()
  }

  reset () {
    this.count = 0
    this.resetTimeout = null
  }

  scheduleReset () {
    // Only the first token in the set triggers the resetTimeout
    if (!this.resetTimeout) {
      this.resetTimeout = setTimeout(() => (
        this.reset()
      ), this.maxRequestWindowMS)
    }
  }

  async acquireToken (fn) {
    this.scheduleReset()

    if (this.count >= this.maxRequests) {
      await sleep(this.maxRequestWindowMS)
      return this.acquireToken(fn)
    }

    this.count += 1
    var result = await fn()
    return result
  }
}
const retryAfter = 1000;
const rateLimiter = new TokenBucketRateLimiter(6, retryAfter);

const publicClient = new CoinbasePro.PublicClient();
var websocket;
var productIds;

setupWebSocket();

async function setupWebSocket() {
  productIds = await getProductIds();
  websocket = new CoinbasePro.WebsocketClient(
    productIds,
    "wss://ws-feed.pro.coinbase.com",
    {
      key: '081c9708ec2297e050733c1e57d8da11',
      secret: 'v3ywKk0Ltkg3SuJxu8P2Wn8s75GX/Oq8wRmeB5Y+4USQtB2GRVR4i4VBvYNbmAaGZEmw/LW8SfzFtf1SKUBCRA==',
      passphrase: 'traderbay',
    },
    {
      channels: ['ticker']
    }
  );
  // This data stream is insane
  websocket.on('message', data => {
    if (data.type == 'ticker') {
      updatePrice(data);
    }
  });
}

const storePath = './store'
const localStore = new localStorage.LocalStorage(storePath);
//localStore.clear()
//print(localStore)

const admins = ['traderbaybot', 'traderbay', 'hostilebot']

const currency = 'pts';
const priceHistoryItem = 'price_history';
const maxPriceHistoryAge = 3600;
const priceHistoryTimeInterval = 60;
const priceDataTimes = [0, 30, 60, 120, 180, 240, 300];
const newUserBonus = 10000;
const tax = 100;
const maxHistory = 5;
var checkingPrices = false;
var currentCoin = null;

var topMovers = []

var coinSet;

// Define configuration options for Twitch Bot
const opts = {
  identity: {
    username: 'traderbaybot',
    password: 'oauth:4lwpm9pw3hgfqhxkz5vbjfvrddi8i9'
  },
  channels: [
    'traderbay'
  ]
};

var page;

launchChrome();

async function launchChrome() {
  puppeteer.use(AdblockerPlugin())
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--kiosk', '--window-size=1920,1080', '--window-position=1921,0', '--disable-infobars', '--disable-web-security', '--allow-running-insecure-content', '--user-data-dir=C:/Users/benmu/userdata'], //'--user-data-dir=C:/Users/benmu/AppData/Local/Google/Chrome/User Data'
    ignoreDefaultArgs: ["--enable-automation"],
  });
    const url = 'https://www.tradingview.com/'
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080});
    //const cookiesString = await fs.readFile('./cookies.json');
   // const cookies = JSON.parse(cookiesString);
    //await page.setCookie(...cookies);
    await page.goto(url);
    selectInitialChart();
}

// Create a client with our options
const client = new tmi.client(opts);

var channel;
const userMap = {};

// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch:
client.connect();

// Called every time the bot connects to Twitch chat
async function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);

  //Need to connect to client before running this, not sure how to hook the client connection to execute this
  //So just calling stuff at end of onConnectedHandler

  //rewardAll(100)
  //rewardAll(100)
  //setInterval(function(){rewardAll(100)}, 10000)
  initializePriceHistory();
  setInterval(function(){listMovers(60, null)}, 60000)
}

// Called every time a message comes in
async function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot

  if (channel == null) {
    channel = target
  }

  var user = context['display-name']

  if (isNewUser(user)) {
    say(`Welcome @${user}!`)
    helpMessage()
  }

  // Remove whitespace from chat message
  var input = msg.trim();
  if (input.charAt(0) != '!' && input.charAt(0) != '$' && input.charAt(0) != '&') {
    return;
  }
  
  input = input.substring(1);
  line = input.toLowerCase();
  const arr = line.split(' ');
  const cmd = arr[0];


// ====================================
//              COMMANDS
// ====================================

  if (cmd == 'help' || cmd == 'commands' || cmd == "cmds") {
    say(`!pts, !coins, !show <coin>, !price <coin>, !buy <coin> <value>, !sell <coin> <value>, !wallet, !history, !net, !give <user> <value>, !prices, !movers <seconds> (Command symbols: !, $, &)`);
  }

  if (cmd == 'buy' || cmd == 'b')  {
    let cv = assignCoinValuePair(arr[1], arr[2])

    if (!valid(cv.value)) {
      return
    }

    if (await validCoin(cv.coin)) {
      buy(user, cv.coin, cv.value)
    }
  }

  else if (cmd == 'sell' || cmd == 's') {
    let cv = assignCoinValuePair(arr[1], arr[2])

    if (!valid(cv.value)) {
      return
    }

    if (await validCoin(cv.coin)) {
      sell(user, cv.coin, cv.value)
    }
  }

  else if (cmd == 'held' || cmd == 'hodl' || cmd == 'holding' || cmd == 'hold' || cmd == 'holds' || cmd == 'hld' || cmd == 'wallet' || cmd == 'wlt' || cmd == 'wal') {
    if (arr.length == 1) {
      holdingSummary(user);
    } else {
      var coin = arr[1].toUpperCase();
      wallet(user, coin);
    }
  }

  else if (cmd == 'history' || cmd == 'hist' || cmd == 'hst' || cmd == 'his') {
    var coin = null;
    if (arr.length == 2) {
      coin = arr[1].toUpperCase();
    }
    say(`@${user} ${getOrderHistory(user, coin)}`)
  }

  else if (cmd == 'pts' || cmd == 'points' || cmd == 'bal' || cmd == 'balance') {
    // This looks better, but not sure how to keep it consistent for the 'give' command... too lazy to add user lookup to get the display name
    //var displayName = context['display-name'];
    var points = getBalance(user)
    say(`${user} has ${points} ${currency}`)
  }

  else if (cmd == 'net') {
    var net = await netWorth(user);
    say(`@${user} Balance: ${net.balance} ${currency}, Wallet: ${net.heldValue} ${currency}, Net: ${net.balance + net.heldValue} ${currency}`)
  }

  else if (cmd == 'give') {
    const inArr = input.split(' ');
    var taker = getDisplayName(inArr[1])
    var amount = inArr[2]

    if (isNaN(amount)) {
      say(`@${user} amount ${amount} is invalid`); 
      return
    }

    // Admins can give any amount
    if(isAdmin(user)) {
      if (grant(taker, amount)) {
        say(`${user} gave ${taker} ${amount} ${currency}`);
      } else {
        say(`@${user} Unable to find '${taker}'`);
      }
      return
    }

    if (!valid(amount)) {
      return
    }

    give(user, amount, taker);
  }

  else if (cmd == 'price') {
    if (arr.length != 2) {
      return;
    }
    var coin = arr[1].toUpperCase();
    var price = await getPrice(coin, null).catch((e) => {return -1})

    if (price != -1)
      say(`Price of ${coin}: ${price} ${currency}`)
  }

  else if (cmd == 'prices') {
    say(('Get all prices here: https://pro.coinbase.com/trade'))
  }

  else if (cmd == 'coins') {
    var coinSet = await getCoins()
    var coins = Array.from(coinSet).sort();

    if (coins == -1)
      say(`Unable to fetch supported coins`)
    else
    // break list into chunks
    var chunkCount = 2;
    var chunkSize = Math.ceil(coins.length / chunkCount);
    var chunkPos = 0;
    for (let i = 1; i <= chunkCount; i++) {
      var msg = `(${i}/${chunkCount}) ${arrayString(coins.slice(chunkPos, chunkPos + chunkSize))}`
      say(msg);
      chunkPos += chunkSize;
    }
  }

  else if (cmd == 'set') {
    if (!isAdmin(user)) {
      return;
    }
    if (arr.length != 3) {
      say(`@${user} Invalid set command arguments`);
    }

    // Use the provided casing for username (mainly for setting non-existing users [bot])
    const inArr = input.split(' ');
    var taker = getDisplayName(inArr[1])
    var balance = inArr[2]

    if (isNaN(balance)) {
      say(`@${user} amount ${balance} is invalid`);
      return
    }

    if (setBalance(taker, balance)) {
      say(`Set balance of ${taker} to ${balance} ${currency}`)
    } else {
      say(`Unable to set balance of '${taker}'`);
    }
  }

  else if (cmd == 'topoff') {
    var taker = arr[1]
    if (isAdmin(user)) {
      topoff(taker);
    }
  }

  else if (cmd == 'show' || cmd == 'shw' || cmd == 'sh' || cmd == 'chart') {
    if (arr.length < 2) {
      return
    }

    coin = arr[1].toUpperCase();

    if (coin == 'ALL' && isAdmin(user)) {
      await showCoins(Array.from(await getCoins()).sort());
    } else {
      if (await validCoin(coin)) {
        showCoin(coin);
        currentCoin = coin;
      }
    }
  }

  else if (cmd == 'viewers') {
    say(`Viewers: ${arrayString(Array.from(await getUsers()).sort())}`);
  }

  else if (cmd == 'movers' || cmd == 'moves' || cmd == 'mvs' || cmd == 'check') {
    var interval = null;
    var group = null;
    if (arr.length > 1) {
      interval = arr[1];
      if (isNaN(interval)) {
        say(`@${user} invalid interval: '${interval}'`);
        return
      } else if (interval > maxPriceHistoryAge || interval < 0) {
        say(`@${user} interval ${interval} out of range (0, 3600)`);
        return
      }
    }
    if (arr.length > 2) {
      group = arr[2].toUpperCase();
    }
    listMovers(interval, group);
  }

  else if (cmd == 'stats') {
    if (arr.length > 1) {
      coin = arr[1].toUpperCase();
      getHistoricRates(coin);
    }
  }

  else if (cmd == 'time') {
    var time = new Date();
    say(`Current time: ${time} (${time.getTime() / 1000} secs)`)
  }

  else {
    console.log(`* Unknown command ${cmd}`);
  }
}


// ====================================
//              FUNCTIONS
// ====================================

async function initializePriceHistory() {
  var coins = await getCoins();

  var end = new Date();
  var start = new Date();
  start.setSeconds(end.getSeconds() - (maxPriceHistoryAge + priceHistoryTimeInterval));

  for (coin of coins) {
    getHistoricRates(coin, start, end, priceHistoryTimeInterval).then(historicData => {
      //Update poduct price history with historic rates
      updatePriceHistory(historicData, end.getTime() / 1000);
    });
  }
}

async function getHistoricRates(coin, start, end, interval) {
  const productId = getProductId(coin);
  return new Promise(function (resolve, reject) {
    const callback = (error, response, data) => {
      if (error) {
        resolve(-1)
      } else {
        resolve(new HistoricData(productId, data))
      }
    }

    if (start && end && interval) {
      rateLimitedRequest(() => {
        publicClient.getProductHistoricRates(
          productId,
          { start: start,
            end: end,
            granularity: interval },
          callback)});
    } else {
      rateLimitedRequest(() => {
        publicClient.getProductHistoricRates(
          productId,
          callback)});
    }
  });
}

async function updatePriceHistory(historicData, time) {
  var productId = historicData.product;
  var historicRates = historicData.data;

  if (historicRates == -1) {
    print('HistoricRates resolved with -1')
  } else {
    var priceDataMap = getPriceDataMap(productId);
    var key = 0;
    //[time, low, high, open, close, volume]
    for (rate of historicRates) {
      var rateTime = rate[0];
      var price = rate[3];
      key = Math.floor((time - rateTime) / priceHistoryTimeInterval) * priceHistoryTimeInterval;
      //Don't update latest price
      if (key != 0) {
        var priceData = readPriceDataMap(key);
        if (priceData == null) {
          priceData = new PriceData(-1, -1);
        }
        priceData.time = rateTime;
        priceData.price = price;
        updatePriceDataMap(priceDataMap, key, priceData);
      }
    }
    storePriceDataMap(productId, priceDataMap);
  }
}

function readPriceDataMap(priceDataMap, key) {
  var priceData = null;
  try {
    priceData = JSON.parse(priceDataMap[key]);
  } catch {}

  return priceData;
}

function updatePriceDataMap(priceDataMap, key, priceData) {
  priceDataMap[key.toString()] = JSON.stringify(priceData);
}

//Shift all existing times over (need to handle holes)
//If current shifting price needs to move x spaces, all future exisiting prices will need to shift at least x (could be more if collection stopped multiple times)
//Second pass (async), fill all holes with price history data from API (or just fetch the price history data from the API when needed if not in stored data, then always store this fetched data)
//Should preemptively store priceData (trickle in) to avoid flood of requests for analysis

async function shiftStoredPrices(productId, priceDataMap, firstPriceData, currentTime) {
  // TODO: Fill all holes with data fetched from product history API
  // OR wait to fetch until needed, then store and shift accordingly in future
  var shiftedPriceDataMap = {};
  var shiftingPriceData = firstPriceData;

  getKey = 0;
  putKey = priceHistoryTimeInterval;

  while (getKey <= maxPriceHistoryAge) {
    if (getKey != 0) {
      shiftingPriceData = readPriceDataMap(priceDataMap, getKey);
    }
    if (shiftingPriceData) {
      if (currentTime - shiftingPriceData.time > getKey) {
        var placed = false;
        while (putKey <= maxPriceHistoryAge && !placed) {
          
          if (shiftingPriceData != null) {
            if (currentTime - shiftingPriceData.time <= putKey) {
              updatePriceDataMap(shiftedPriceDataMap, putKey, shiftingPriceData);
              placed = true;
            }
          }
          putKey += priceHistoryTimeInterval;
        }

        if (placed == false) {
          updatePriceDataMap(shiftedPriceDataMap, getKey, null);
        }
      } else {
        updatePriceDataMap(shiftedPriceDataMap, getKey, shiftingPriceData);
      }
    }

    getKey += priceHistoryTimeInterval;
  }

  // Update shiftedPriceDataMap[0] to latest from store (may have been updated since shifting began)
  var latestPriceDataMap = getPriceDataMap(productId);
  var latestPriceData = readPriceDataMap(latestPriceDataMap, 0);

  if (latestPriceData != null) {
    updatePriceDataMap(shiftedPriceDataMap, 0, latestPriceData)
  }
  
  storePriceDataMap(productId, shiftedPriceDataMap);
}

function getPriceDataMap(productId) {
  priceDataMap = localStore.getItem(productId);

  if (priceDataMap != null) {
    priceDataMap =  JSON.parse(priceDataMap);
  } else {
    priceDataMap = {};
  }
 
  return priceDataMap;
}

function storePriceDataMap(productId, priceDataMap) {
  localStore.setItem(productId, JSON.stringify(priceDataMap));
}

function updatePrice(data) {
  const productId = data.product_id;
  if (productId) {
    const currentTime = new Date().getTime() / 1000;

    var newPriceData = new PriceData(data.price, currentTime);

    var priceDataMap = getPriceDataMap(productId);
    var latestPriceData = readPriceDataMap(priceDataMap, 0);

    updatePriceDataMap(priceDataMap, 0, newPriceData);
    storePriceDataMap(productId, priceDataMap);

    if (latestPriceData != null) {
      if (currentTime - latestPriceData.time >= priceHistoryTimeInterval) {
        shiftStoredPrices(productId, priceDataMap, latestPriceData, currentTime);
      }
    }
  }
}

async function listMovers(interval, group) {
  if (checkingPrices) {
    say(`Price check already in progress.`);
    return
  }
  try {
    checkingPrices = true;
    var status = '';
    var processChanges = true; //false;

    var startTime = new Date().getTime() / 1000;
    var timeDiff = 0;
    if (interval) {
      interval = Math.floor(interval / priceHistoryTimeInterval) * priceHistoryTimeInterval;
      timeDiff = interval;
    }

    // If calling without set interval, use previously saved 'checkpoint' and update.
    /*
    priceHistory = getPriceHistory();
    if (priceHistory == null) {
      status += ' No previous price data recorded.'
    } else {
      priceKeys = Object.keys(priceHistory);

      if (priceKeys.length > 0) {
        var lastChecked = priceHistory['time_checked']
        timeDiff = startTime - lastChecked;

        //status += ` Last checked ${roundTo(2, timeDiff)} seconds ago.`
        processChanges = true;
      }
    }
    */

    if (status != '') {
      say(status);
    }

    var groupTitle = '';

    var coins = await getCoins();
    var historicPriceMap;
    if (interval) {
      historicPriceMap = await getPrices(coins, interval).catch((e) => {return -1})
    } else {
      historicPriceMap = getPriceHistory();
      if (historicPriceMap == null) {
        historicPriceMap = await getPrices(coins).catch((e) => {return -1})
      } else {
        try {
          var lastChecked = historicPriceMap['time_checked']
          timeDiff = startTime - lastChecked;
        } catch {}
      }
    }

    var priceMap = await getPrices(coins).catch((e) => {return -1})

    var endTime = new Date().getTime() / 1000;
    var completeTime = endTime - startTime;

    status = '';

    if (processChanges) {
      changeMap = {}

      // Get map of percent changes
      for (coin of coins) {
        var lastPrice = historicPriceMap[coin];
        var currentPrice = priceMap[coin];

        if (!isNaN(lastPrice) && !isNaN(currentPrice)) {
          var priceChange = currentPrice - lastPrice;
          var percentChange = priceChange / lastPrice;
          changeMap[coin] = percentChange;
        } else {
          //print('value is nan');
        }
      }

      // Sort by value
      var sorted = Object.entries(changeMap).sort((a,b) => b[1]-a[1])
      var pairs = [];
      if (group == null) {
        const amount = 10;
        pairs = await sliceArray(amount, sorted);
        groupTitle = `TOP ${amount}`;
      }
      else {
        var rates = [];

        for (pair of sorted) {
          rates.push(pair[1]);
        }
  
        var clusters = kmeans.kmeans_1d(rates, 3);
        // Sort clusters by their mean value (highest first)
        clusters.sort((a, b) => (a.mean < b.mean) ? 1 : -1)

        var groupPairs = []
        if (group == 'MID' || group == '2') {
          groupTitle = 'MID';
          groupPairs = clusters[1].data;
        }
        else if(group == 'BOT' || group == '3') {
          groupTitle = 'BOT';
          groupPairs = clusters[2].data;
        }
        else {
          groupTitle = 'TOP';
          groupPairs = clusters[0].data;
        }
  
        // In order to get the pairs clustered, need to search the clustered values.
        // If multiple pairs share the same value, then they should be part of the same cluster, so exact pairing doesn't really matter
        for (pair of sorted) {
          if (groupPairs.indexOf(pair[1]) > -1) {
            pairs.push(pair);
          }
        }
      }

      status += ` [${groupTitle}] Movers (Last ${roundTo(0, timeDiff)} seconds): ${printPairs(pairs)} `;
    }
    //status += `Price check completed in ${roundTo(2, completeTime)} seconds.`;
    say(status);

    if (!interval) {
      historicPriceMap['time_checked'] = endTime;
      setPriceHistory(historicPriceMap);
    }

  } catch {}
  finally {
    checkingPrices = false;
  }
}

function helpMessage() {
  say(`Type '!commands' for a list of options`);
}

async function buy(user, coin, value) {
  var points = getBalance(user)

  if (value == 'ALL' || value == 'A') {
    value = points;
  } else if (isNaN(value)) {
    say(` @${user} Invalid buy command.`)
    return
  }
  if (points < value) {
    say(`@${user} Not enough ${currency}. Balance: ${points} ${currency}`);
    return
  }

  // Not sure how to return from within catch
  var price = await getPrice(coin, null).catch((e) => {return -1});
  if (price == -1) {
    return
  }

  var amount = value / price;
  var trader = getTrader(user);
  var holding = null;

  if (contains(Object.keys(trader.holdingMap), coin)) {
    holding = trader.holdingMap[coin]
  } else {
    holding = new Holding(0)
  }

  holding['amount'] = holding['amount'] + amount;
  trader.holdingMap[coin] = holding;
  trader.points = roundTo(2, trader.points - parseFloat(value));
  var order = new Order('BUY', coin, amount, price);
  updateOrderHistory(trader, order);
  setTrader(trader)

  say(`${user} bought ${amount} ${coin} @ ${price} for ${value} ${currency}. New balance: ${trader.points} ${currency}`)
}

async function sell(user, coin, value) {
  var trader = getTrader(user);
  var holding = null;

  if (contains(Object.keys(trader.holdingMap), coin)) {
    holding = trader.holdingMap[coin]
  } else {
    say(`${user} does not hold any ${coin}`)
    return
  }

  var price = await getPrice(coin, null).catch((e) => {return -1});
  if (price == -1) {
    return
  }

  var heldAmount = holding['amount'];
  var heldValue = heldAmount * price;
  var sellValue = value;
  var sellAmount = 0;
  var remAmount = 0;

  if (value == 'ALL' || value == 'A') {
    sellValue = heldValue;
    sellAmount = heldAmount;
  }
  else if (heldValue < value) {
    sellValue = heldValue;
    sellAmount = heldAmount;
  } else {
    sellAmount = sellValue / price;
    remAmount = heldAmount - sellAmount;
  }

  if (remAmount == 0) {
    delete trader.holdingMap[coin]
  } else {
    holding['amount'] = remAmount;
    trader.holdingMap[coin] = holding
  }

  var order = new Order('SELL', coin, sellAmount, price)
  updateOrderHistory(trader, order)

  trader.points = roundTo(2, trader.points + parseFloat(sellValue));
  setTrader(trader)

  say(`${user} sold ${sellAmount} ${coin} @ ${price} for ${roundTo(2,sellValue)} ${currency}. Remaining: ${remAmount} ${coin}. New balance: ${trader.points} `);
}

async function holdingValue(user) {
  var trader = getTrader(user);
  var coins = Object.keys(trader.holdingMap);
  var totalValue = 0;

  // If a group of coins need prices fetched, how to async this and collect at end?
  for(const coin of coins) {
    var holding = trader.holdingMap[coin]
    var price = await getPrice(coin, null).catch((e) => {return -1})
    var value = price * holding['amount']
    totalValue += value;
  }
  return totalValue;
}

async function netWorth(user) {
  var balance = roundTo(2, getBalance(user));
  var heldValue = roundTo(2, await holdingValue(user));

  return {
    balance,
    heldValue
  };
}

async function holdingSummary(user) {
  var trader = getTrader(user);
  var coins = heldCoins(user);

  var holdingArray = [];

  for (const coin of coins) {
    var holding = trader.holdingMap[coin]
    var price = await getPrice(coin, null).catch((e) => {return -1})
    var value = price * holding['amount']
    value = roundTo(2, value);
    holdingArray.push(`${coin} (~${value} ${currency})`)
  }

  var summary = "no coins"
  if (holdingArray.length > 0) {
    summary = arrayString(holdingArray);
  }
  say(`${user} holds ${summary}`);
}

function heldCoins(user) {
  var trader = getTrader(user);
  var coinArray = Object.keys(trader.holdingMap);
  return coinArray.sort();
}

async function wallet(user, coin) {
  var trader = getTrader(user);
  if (contains(Object.keys(trader.holdingMap), coin)) {
    holding = trader.holdingMap[coin]
  } else {
    say(`${user} does not hold any ${coin}`)
    return
  }

  var amount = holding['amount'];
  var price = await getPrice(coin, null).catch((e) => {return -1})
  var value = price * amount;
  
  say(`${user} holds ${amount} ${coin} worth ${roundTo(2, value)} ${currency}`)
}

function say(msg) {
  print(`Saying: ${msg}`)
  client.say(channel, msg);
}

// Don't create new trader entries for non-existent users
function grant(user, amount) {
  var trader = getTrader(user, false);
  if (trader != null) {
    trader.points += parseFloat(amount);
    if (trader.points < 0) {
      trader.points = 0;
    }
    setTrader(trader)
    return true
  }
  return false
}

function give(giver, amount, taker) {
  var takingTrader = getTrader(taker, false);
    if (takingTrader == null) {
      say(`@${getDisplayName(giver)} Cannot find '${taker}'`)
      return
    }

  var givingTrader = getTrader(giver);
  var balance = givingTrader.points;
  if (balance < amount) {
    say(`${getDisplayName(giver)} is unable to give ${amount}. Balance: ${balance}`)
    return
  }

  if (taker.toLowerCase() == giver.toLowerCase()) {
    grant(giver, tax * -1);
    say(`${giver} tried to give themself ${amount} and got taxed for unrealized gains (-${tax} ${currency})`)
    return
  }

  givingTrader.points -= parseInt(amount);
  setTrader(givingTrader);
  takingTrader.points += parseFloat(amount);
  setTrader(takingTrader);

  say(`${getDisplayName(giver)} gave ${getDisplayName(taker)} ${amount} ${currency}`);
}

function topoff(user) {
  var trader = getTrader(user) 
  if (trader != null) {
    var flat = parseInt(trader.points);
    var debt = 1 - (trader.points - flat);
    trader.points = flat + 1;
    setTrader(trader);
    say(`${user} had their balance topped off and are now in debt ${debt} ${currency}`);
  }
}

async function rewardAll(amount) {
  print(`Giving all ${amount} ${currency}`)

  var users = await getUsers();
  // I will NOT remember this for looping over values...
  for (var it = users.values(), user = null; user=it.next().value;) {
    var trader = getTrader(user);
    trader.points += parseFloat(amount);
    setTrader(trader);
  }
}


// ====================================
//              GET/SET/NEW
// ====================================

function Trader(name) {
  this.name = name.toLowerCase();
  this.displayName = name;
  this.points = 0;
  this.holdingMap = new Map();
  this.orderMap = new Map();
  this.latestOrders = [];
}

function Holding(amount) {
  this.amount = amount;
}

function Order(type, coin, amount, price) {
  this.type = type
  this.coin = coin
  this.amount = amount
  this.price = price
}

function PriceData(price, time) {
  this.price = price
  this.time = time
}

function HistoricData(product, data) {
  this.product = product;
  this.data = data;
}

async function getUsers() {
  var data = await makeRequest("GET", 'https://tmi.twitch.tv/group/user/traderbay/chatters');
  var jsonResponse = JSON.parse(data);
  var chatters = getAllValues(jsonResponse["chatters"])
  return chatters
}

function setBalance(user, balance) {
  var trader = getTrader(user, false)
  if (trader != null) {
    trader.points = parseFloat(balance);
    setTrader(trader);
    return true;
  }
  return false;
}

function getBalance(user) {
  var balance = 0;
  var trader = getTrader(user)
  if (trader != null) {
    balance = roundTo(2, trader.points);
  }
  return balance
}

function getDisplayName(user) {
  trader = getTrader(user, false);
  if (trader != null) {
    var displayName = trader.displayName;
    if (displayName != null) {
      return displayName;
    }
  }
  return user;
}

function isNewUser(userName) {
  var trader = null
  try {
    trader = localStore.getItem(userName.toLowerCase());
  } catch {
    //NOP
  }
  if (trader == null) {
    addNewUser(userName);
    return true
  }
  return false;
}

function setTrader(trader) {
  localStore.setItem(trader.name, JSON.stringify(trader))
}

function getTrader(userName, addNew) {
  var trader = null;
  try {
    trader = localStore.getItem(userName.toLowerCase());
  } catch {
    //NOP
  }
  if (trader != null) {
    trader = JSON.parse(trader)
  } else if (addNew != false) {
    return addNewUser(userName);
  } else {
    return null
  }

  // Set default values if missing from JSON (updated object)
  if (trader.latestOrders == null) {
    trader.latestOrders = [];
  }
  if (trader.orderMap == null) {
    trader.orderMap = new Map();
  }
  if (addNew == null && trader.displayName != userName) {
    trader.displayName = userName;
  }

  return trader;
}

function setPriceHistory(priceHistory) {
  localStore.setItem(priceHistoryItem, JSON.stringify(priceHistory))
}

function getPriceHistory() {
  var priceHistory = null;
  try {
    priceHistory = localStore.getItem(priceHistoryItem);
  } catch {
    //NOP
  }
  if (priceHistory != null) {
    priceHistory = JSON.parse(priceHistory)
  } 
  return priceHistory;
}

async function getCoins() {
  return new Promise(function (resolve, reject) {
    if (coinSet == null) {
      const callback = (error, response, data) => {
        if (error) {
          print(`coinbase callback error: ${error}`)
          resolve(-1)
        } else {
          coinSet = new Set();
          for (i in data) {
            var product = data[i].id
            if (product.endsWith('-USD')) {
              // Why is this being returned by getProducts if it is not a product...?
              if (product != "XRP-USD" && product != "WLUNA-USD" && product != "UST-USD") {
                coinSet.add(product.split('-')[0])
              }
            }
          }
          resolve(coinSet)
        }
      }
      rateLimitedRequest(() => {publicClient.getProducts(callback)});
    }
    else {
      resolve(coinSet);
    }
  });
}

async function getProductIds() {
  var ids = Array.from(await getCoins());
  for (var i = 0; i < ids.length; i++) {
    ids[i] = getProductId(ids[i]);
  }
  return ids;
}

async function validCoin(coin) {
  var coins = await getCoins();
  if(coins.has(coin.toUpperCase())) {
    return true;
  } else {
    say(`'${coin}' is not a valid coin.`)
    return false;
  }
}

async function getPrice(coin, age) {
  var key = 0;
  if (age) {
    key = age;
  }
  key = key.toString();

  var poll = false;
  var price;
  const productId = getProductId(coin);
  var priceDataMap = getPriceDataMap(productId);
  if (priceDataMap != null) {
    if (key in priceDataMap) {
      var priceData = JSON.parse(priceDataMap[key]);
      price = priceData.price;
    }
  } else {
    poll = true;
  }

  if (poll) {
    var end = new Date();
    var start = new Date(end - age);
    return await getCoinPrice(coin, start, end, priceHistoryTimeInterval).catch((e) => {return -1});
  }

  return price;
}

async function getCoinPrice(coin, muteError) {
  return new Promise(function (resolve, reject) {
    const callback = (error, response, data) => {
      if (error) {
        print(error)
        if (muteError == null) {
          say(`Unable to get price data for '${coin}'`)
        }
        resolve(-1)
      } else {
        resolve(data.price)
      }
    }
    var productId = getProductId(coin);
    rateLimitedRequest(() => {publicClient.getProductTicker(symbol, callback)});
  });
}

function getHoldingValue(coin, amount) {
  var price = getPrice(coin, null).catch((e) => {return -1})
  if (price == -1) {
    return
  }
  return price * amount;
}

function updateOrderHistory(trader, order) {
  trader.latestOrders = addToHistory(order, trader.latestOrders);
  if (trader.orderMap[order.coin] == null) {
    trader.orderMap[order.coin] = [];
  }
  trader.orderMap[order.coin] = addToHistory(order, trader.orderMap[order.coin])
}

function getOrderHistory(user, coin) {
  var trader = getTrader(user);
  var history = [];
  if (coin == null) {
    history = trader.latestOrders
  } else {
    if (trader.orderMap[coin] != null) {
      history = trader.orderMap[coin]
    }
  }
  return historyString(history, coin);
}

async function getPrices(coins, age) {
  var priceMap = {}

  for (coin of coins) {
    priceMap[coin] = getPrice(coin, age).catch((e) => {return -1})
  }

  var promiseArray = Object.values(priceMap);

  await Promise.all(promiseArray);
  // Even though all promises are completed, their values are still wrapped..?
  for (key of Object.keys(priceMap)) {
    // Extract value from promise
    priceMap[key] = await priceMap[key];
  }

  return priceMap;
}

async function showCoins(coins) {
  for (coin of coins) {
    showCoin(coin);
    await sleep(1500)
  }
  return;
}

async function showCoin(coin) {
  say(`Loading ${coin} chart...`)
      const buttonSelector = '#header-toolbar-symbol-search';
      await page.waitForSelector(buttonSelector)
      await page.click(buttonSelector)
  
      const searchSelector = 'input[type="text"]'
      await page.waitForSelector(searchSelector)
      await page.focus(searchSelector)
      setTimeout(async function(){
        await page.keyboard.type(` ${coin}USD`);
        await sleep(100);
        await page.keyboard.press('ArrowDown');
        await sleep(100);
        await page.keyboard.press('\n');
      }, 200);
}

 // Broken
async function selectInitialChart() {
  // const buttonSelector = 
  //   '#tv-main-page-promo > div > div.contentContainer-n3cPtofU > div.content-n3cPtofU > div > button > span';
  // await page.waitForSelector(buttonSelector)
  // await page.click(buttonSelector)
  // setTimeout(async function(){
  //   await sleep(400);
  //   await page.keyboard.press('ArrowDown');
  //   await sleep(400);
  //   await page.keyboard.press('\n');
  // }, 200);
}

// ====================================
//              UTIL
// ====================================

//TODO: Fix
async function fetchAndRetryIfNecessary (callAPIFn) {
  const response = await callAPIFn()
  if (response) {
    if (response.status === 429 || response == -1) {
      await sleep(retryAfter)
      return fetchAndRetryIfNecessary(callAPIFn)
    }
    return response
  }
}

function rateLimitedRequest(request) {
  fetchAndRetryIfNecessary(() => (
    rateLimiter.acquireToken(() => request())
  ));
}

function makeRequest(method, url) {
  return new Promise(function (resolve, reject) {
      let xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.onload = function () {
          if (this.status >= 200 && this.status < 300) {
              resolve(xhr.response);
          } else {
              reject({
                  status: this.status,
                  statusText: xhr.statusText
              });
          }
      };
      xhr.onerror = function () {
          reject({
              status: this.status,
              statusText: xhr.statusText
          });
      };
      xhr.send();
  });
}

function addNewUser(userName) {
  trader = new Trader(userName)
  trader.points = parseFloat(newUserBonus);
  setTrader(trader);
  return trader;
}

// Gets all values in object tree
function getAllValues(jsonObject) {
  var valueSet = new Set()
  for (var key in jsonObject) {
    var valueArray = jsonObject[key];
    valueArray.forEach(value => valueSet.add(value))
  }

  return valueSet;
}

function arrayString(array) {
  return Array.from(array).join(', ')
}

function isAdmin(user) {
  return admins.indexOf(String(user.toLowerCase())) > -1;
}

function contains(array, item) {
  return array.indexOf(String(item)) > -1;
}

function valid(value) {
  if (value == null) {
    say('Value is undefined or missing.')
    return false
  }
  if (value < 0) {
    say(`Value ${value} is invalid.`)
    return false
  }
  return true;
}

function getProductId(coin) {
  return coin.toUpperCase() + '-USD';
}

function assignCoinValuePair(item1, item2) {
  var coin, value;
 
  if (item1 != null && item2 != null) {
    item1 = item1.toUpperCase();
    item2 = item2.toUpperCase();

    if (item1 == 'ALL' || item2 == 'ALL' || item1 == 'A' || item2 == 'A') {
      if (item1 == 'ALL' || item1 == 'A') {
        value = item1;
        coin = item2;
      } else {
        coin = item1;
        value = item2;
      }
    }
    else if (isNaN(item1)) {
      coin = item1
      value = item2
    } 
    else {
      value = item1
      coin = item2
    }
  }
  
  return {
    coin,
    value
  };
}

function historyString(history, coin) {
  var string = '';
  history.forEach(function (order, i) {
    string += `(${i+1}) - ${order.type} ${order.coin} @ ${order.price} x ${order.amount} (${roundTo(2, order.price * order.amount)} ${currency}). `
});
  if (string == '') {
    var coinName = ''
    if (coin != null) {
      coinName = coin;
    }
    string = `has no recorded ${coinName} trades`
  }
return string;
}

function sliceArray(max, list) {
  var n = Math.min(max, list.length);
  return list.slice(0, n);
}

function printPairs(list) {
  var string = '';
  list.forEach(function (pair, i) {
    string += `(${i+1}) - ${pair[0]}: ${percentString(pair[1])}. `
});
 return string;
}

function percentString(percent) {
  var percentString = `${roundTo(4, percent * 100)}%`;
  return percentString
}

function addToHistory(order, history) {
  history.unshift(order);
  if (history.length > maxHistory) {
    history.pop();
  }
  return history;
}

function roundTo(places, num) {    
  return +(Math.round(num + `e+${places}`)  + `e-${places}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function print(string) {
  console.log(string)
}