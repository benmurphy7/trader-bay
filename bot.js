const tmi = require('tmi.js');

const XMLHttpRequest = require('xhr2');

const CoinbasePro = require('coinbase-pro');
const publicClient = new CoinbasePro.PublicClient();

const storePath = './store'
const localStorage = require('node-localstorage')
const localStore = new localStorage.LocalStorage(storePath);
//localStore.clear()
//print(localStore)

const admins = ['traderbaybot', 'traderbay']

const currency = 'pts';
const newUserBonus = 10000;
const tax = 100;

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
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);

  //Need to connect to client before running this, not sure how to hook the client connection to execute this
  //So just calling stuff at end of onConnectedHandler

  //rewardAll(100)
  //rewardAll(100)
  //setInterval(function(){
  //  rewardAll(100)}, 10000)
}

// Called every time a message comes in
async function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot

  if (channel == null) {
    channel = target
  }

  // Remove whitespace from chat message
  var line = msg.trim();
  if (line.charAt(0) != '!') {
    return;
  }
  
  line = line.substring(1);
  line = line.toLowerCase();
  const arr = line.split(' ');
  const cmd = arr[0];


// ====================================
//              COMMANDS
// ====================================
  var user = context.username

  if (getTrader(user) == null) {
    addNewUser(user);
  }

  if (cmd == 'buy')  {
    let cv = assignCoinValuePair(arr[1], arr[2])

    if (!valid(cv.value)) {
      return
    }

    buy(user, cv.coin, cv.value)
  }

  else if (cmd == 'sell') {
    let cv = assignCoinValuePair(arr[1], arr[2])

    if (!valid(cv.value)) {
      return
    }

    sell(user, cv.coin, cv.value)
  }

  else if (cmd == 'held' || cmd == 'hodl' || cmd == 'holding' || cmd == 'hold' || cmd == 'holds' || cmd == 'hld') {
    if (arr.length == 1) {
      holdingSummary(user);
    } else {
      var coin = arr[1].toUpperCase();
      hold(user, coin);
    }
  }

  else if (cmd == 'pts' || cmd == 'points' || cmd == 'bal' || cmd == 'balance') {
    // This looks better, but not sure how to keep it consistent for the 'give' command... too lazy to add user lookup to get the display name
    //var displayName = context['display-name'];
    var points = getBalance(user)
    say(`${user} has ${points} ${currency}`)
  }

  else if (cmd == 'net') {
    var net = await netWorth(user);
    say(`@${user} Balance: ${net.balance}, Holding: ${net.heldValue}, Net: ${net.balance + net.heldValue}`)
  }

  else if (cmd == 'give') {
    var taker = arr[1]
    var amount = arr[2]

    // Admins can give any amount
    if(isAdmin(user)) {
      if (grant(taker, amount)) {
        say(`${user} gave ${taker} ${amount}`);
      } else {
        say(`@${user} Unable to find '${taker}'`);
      }
      return
    }

    if (!valid(amount)) {
      return
    }
    if (taker == user) {
      grant(user, tax * -1);
      say(`${user} tried to give themself ${amount} and got taxed for unrealized gains (-${tax} ${currency})`)
      return
    }

    give(user, amount, taker);
  }

  else if (cmd == 'price') {
    if (arr.length != 2) {
      return;
    }
    var coin = arr[1].toUpperCase();
    var price = await getPrice(coin).catch((e) => {return -1})

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

    var taker = arr[1]
    var balance = arr[2]

    if (isNaN(balance)) {
      say(`@${user} '${balance} is NaN'`);
    }

    if (setBalance(taker, balance)) {
      say(`Set balance of ${taker} to ${balance}`)
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

  else {
    console.log(`* Unknown command ${cmd}`);
  }
}


// ====================================
//              FUNCTIONS
// ====================================

async function buy(user, coin, value) {
  var points = getBalance(user)

  if (value == 'ALL') {
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
  var price = await getPrice(coin).catch((e) => {return -1});
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

  var price = await getPrice(coin).catch((e) => {return -1});
  if (price == -1) {
    return
  }

  var heldAmount = holding['amount'];
  var heldValue = heldAmount * price;
  var sellValue = value;
  var sellAmount = 0;
  var remAmount = 0;

  if (value == 'ALL') {
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
    var price = await getPrice(coin);
    var value = price * holding['amount']
    totalValue += value;
  }
  return totalValue;
}

async function netWorth(user) {
  var balance = roundTo(2, getBalance(balance));
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
    var price = await getPrice(coin);
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

async function hold(user, coin) {
  var trader = getTrader(user);
  if (contains(Object.keys(trader.holdingMap), coin)) {
    holding = trader.holdingMap[coin]
  } else {
    say(`${user} does not hold any ${coin}`)
    return
  }

  var amount = holding['amount'];
  var price = await getPrice(coin);
  var value = price * amount;
  
  say(`${user} holds ${amount} ${coin} worth ${value} ${currency}`)
}

function say(msg) {
  print(`Saying: ${msg}`)
  client.say(channel, msg);
}

// Don't create new trader entries for non-existent users
function grant(user, amount) {
  var trader = getTrader(user);
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
  var takingTrader = getTrader(taker);
    if (takingTrader == null) {
      say(`Cannot find ${taker}`)
      return
    }

  var givingTrader = getTrader(giver);
  var balance = givingTrader.points;
  if (balance < amount) {
    say(`${giver} is unable to give ${amount}. Balance: ${balance}`)
    return
  }
  givingTrader.points -= parseInt(amount);
  setTrader(givingTrader);
  takingTrader.points += parseFloat(amount);
  setTrader(takingTrader);

  say(`${giver} gave ${taker} ${amount}`);
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
    if (trader == null) {
      trader = addNewUser(user);
    }
    trader.points += parseFloat(amount);
    setTrader(trader);
  }
}


// ====================================
//              GET/SET/NEW
// ====================================

function Trader(name) {
  this.name = name
  this.points = 0;
  this.holdingMap = new Map();
}

function Holding(amount) {
  this.amount = amount;
}

async function getUsers() {
  var data = await makeRequest("GET", 'https://tmi.twitch.tv/group/user/traderbay/chatters');
  var jsonResponse = JSON.parse(data);
  var chatters = getAllValues(jsonResponse["chatters"])
  print(`chatters: ${Array.from(chatters).sort()}`)
  return chatters
}

function setBalance(user, balance) {
  var trader = getTrader(user)
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

function setTrader(trader) {
  localStore.setItem(trader.name, JSON.stringify(trader))
}

function getTrader(user) {
  var trader = localStore.getItem(user);
  if (trader != null) {
    trader = JSON.parse(trader)
  }
  return trader;
}

async function getCoins() {
  return new Promise(function (resolve, reject) {
    const callback = (error, response, data) => {
      if (error) {
        print(`coinbase callback error: ${error}`)
        resolve(-1)
      } else {
        var coinSet = new Set();
        for (i in data) {
          var product = data[i].id
          if (product.endsWith('-USD')) {
            coinSet.add(product.split('-')[0])
          }
        }
        resolve(coinSet)
      }
    }
    publicClient.getProducts(callback);
  });
}

async function getPrice(coin) {
  return new Promise(function (resolve, reject) {
    const callback = (error, response, data) => {
      if (error) {
        say(`Unable to get price data for '${coin}'`)
        reject(-1)
      } else {
        resolve(data.price)
      }
    }
    var symbol = coin + '-USD';
    publicClient.getProductTicker(symbol, callback)
  });
}

function getHoldingValue(coin, amount) {
  var price = getPrice(coin).catch((e) => {return -1})
  if (price == -1) {
    return
  }
  return price * amount;
}

// ====================================
//              UTIL
// ====================================

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

function addNewUser(user) {
  var trader = getTrader(user)
  if (trader == null) {
    trader = new Trader(user)
    trader.points = parseFloat(newUserBonus);
  }
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
  return admins.indexOf(String(user)) > -1;
}

function contains(array, item) {
  return array.indexOf(String(item)) > -1;
}

function valid(value) {
  if (value < 0) {
    say(`Value ${value} is invalid.`)
    return false
  }
  return true;
}

function assignCoinValuePair(item1, item2) {
  var coin, value;
  item1 = item1.toUpperCase();
  item2 = item2.toUpperCase();

  if (item1 == 'ALL' || item2 == 'ALL') {
    if (item1 == 'ALL') {
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
  
  return {
    coin,
    value
  };
}

function roundTo(places, num) {    
  return +(Math.round(num + `e+${places}`)  + `e-${places}`);
}

function print(string) {
  console.log(string)
}