const tmi = require('tmi.js');
const XMLHttpRequest = require('xhr2');
const CoinbasePro = require('coinbase-pro');
const publicClient = new CoinbasePro.PublicClient();

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

  //Need to connect to client before running this, not sure how to hook the client connection to executing this
  //So just calling stuff at end of onConnectedHandler

  rewardAll(100)
//  setInterval(function(){
//    rewardAll(100)}, 10000)
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
  
if (cmd === 'dice') {
    const num = rollDice(cmd);
    client.say(target, `You rolled a ${num}.`);
    console.log(`* Executed ${cmd} command`);
  } 

  else if (cmd == 'buy')  {
    buy(arr[1], arr[2])
  }
  else if (cmd == 'sell') {
    sell(arr[1], arr[2])
  }

  else if (cmd == 'pts' || cmd == 'points') {
    var user = context.username
    // This looks better, but not sure how to keep it consistent for the 'give' command... too lazy to add user lookup to get the display name
    var displayName = context['display-name'];
    var points = getUserBalance(user)
    say(`${user} has ${points} points`)
  }

  else if (cmd == 'give') {
    var user = arr[1]
    var amount = arr[2]
    if (give(user, amount)) {
      say(`Giving ${arr[1]} ${arr[2]} points`)
    } else {
      say(`User ${user} not found`)
    }
  }

  else if (cmd == 'price') {
    var coin = arr[1].toUpperCase();
    var price = await getPrice(coin)

    if (price != -1)
      say(`Price of ${coin}: ${price} USD`)
    else
      say(`Unable to fetch price for ${coin}`)
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

  else {
    console.log(`* Unknown command ${cmd}`);
  }
}


// ====================================
//              FUNCTIONS
// ====================================

// Function called when the "dice" command is issued
function rollDice () {
  const sides = 20;
  return Math.floor(Math.random() * sides) + 1;
}

function buy(ticker, amount) {
  say(`Buying ${amount} of ${ticker}`);
}

function sell(ticker, amount) {
  say(`Selling ${amount} of ${ticker}`);
}

function say(msg) {
  print(`Saying: ${msg}`)
  client.say(channel, msg);
}

function print(string) {
  console.log(string)
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
        print(`coinbase callback error: ${error}`)
        resolve(-1)
      } else {
        resolve(data.price)
      }
    }
    var symbol = coin + '-USD';
    publicClient.getProductTicker(symbol, callback)
  });
}

function give(user, amount) {
  print(userMap)
  print(user)
  if (user in userMap) {
    balance = userMap[user]
    balance += parseFloat(amount)
    userMap[user] = balance
    return true
  }
  return false
}

async function rewardAll(amount) {
  var users = await getChatters();
  // I will NOT remember this for looping over values...
  for (var it = users.values(), user = null; user=it.next().value;) {
    var balance = 0;
    if (user in userMap) {
      balance = userMap[user]
    }
    balance += parseFloat(amount)
    userMap[user] = balance
  }
  //say(`Giving all chatters ${amount} points`)
  print(`Giving all ${amount} points`)
}

function getUserBalance(user) {
  var balance = 0;
  if (user in userMap) {
    balance = userMap[user]
  }
  return balance
}

async function getChatters() {
  var data = await makeRequest("GET", 'https://tmi.twitch.tv/group/user/traderbay/chatters');
  var jsonResponse = JSON.parse(data);
  var chatters = getAllValues(jsonResponse["chatters"])
  return chatters
}

function makeRequest(method, url) {
  return new Promise(function (resolve, reject) {
      let xhr = new XMLHttpRequest();
      xhr.open(method, url);
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