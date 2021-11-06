const tmi = require('tmi.js');
const XMLHttpRequest = require('xhr2');
const CoinGecko = require('coingecko-api');
//const {CoinbasePro} = require('coinbase-pro-node');
const CoinbasePro = require('coinbase-pro');
const publicClient = new CoinbasePro.PublicClient();

//publicClient.getProducts(coinbaseCallback)

//publicClient.getProducts(coinbaseCallback);

// Old coinbase-pro-node code
/*
const auth = {
  apiKey: '55fac4010940668c4275a829b22f3697',
  apiSecret: 'NIhtS3PSWgTgE7kLDuM5fBzxmLuEiL+ykBeIes/IussaSluNWX7omoDC9Wd2o3i6PX0JST4dU4abbJAImJdDuA==',
  passphrase: 'eltoumi',
  // The Sandbox is for testing only and offers a subset of the products/assets:
  // https://docs.pro.coinbase.com/#sandbox
  useSandbox: true,
};


const coinbaseProClient = new CoinbasePro(auth);

coinbaseProClient.rest.account.listAccounts().then(accounts => {
  const message = `You can trade "${accounts.length}" different pairs.`;
  console.log(message);
});
*/



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

const geckoClient = new CoinGecko();

//Need to connect to client before running this, not sure how to hook the client connection to executing this
//So just calling stuff at end of onConnectedHandler


// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);

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

  // ========================
//            COMMANDS
  // ========================

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
    var coin = arr[1];
    var price = await getPrice(coin)
    print(price)
    if (price != -1)
      say(`Price of ${coin}: ${price}`)
    else
      say(`Unable to fetch price for ${coin}`)
  }
  else {
    console.log(`* Unknown command ${cmd}`);
  }
}

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
  print(`saying: ${msg}`)
  client.say(channel, msg);
}

function print(string) {
  console.log(string)
}

// CoinGecko prices (why are the ids not the ticker symbol?) (oh, they support so many coins there are tons of duplicate symbols)
/*
let data = await geckoClient.exchanges.fetchTickers('bitfinex', {
    coin_ids: ['bitcoin', 'ethereum', 'ripple', 'litecoin', 'stellar']
  });
  var _coinList = {};
  var _datacc = data.data.tickers.filter(t => t.target == 'USD');
  [
    'BTC',
    'ETH',
    'XRP',
    'LTC',
    'XLM'
  ].forEach((i) => {
    var _temp = _datacc.filter(t => t.base == i);
    var _res = _temp.length == 0 ? [] : _temp[0];
    _coinList[i] = _res.last;
  })
  console.log(_coinList);
*/

// Uses cryptonator price API... which is TERRIBLE... DO NOT USE!!!!!!!!!
// THE PRICES ARE ALL WRONG!!!!
function getCryptonatorPrice(coin) {
  return new Promise(function (resolve, reject) {
    price.getCryptoPrice('USD', coin).then(obj => {
      console.log(obj)
      resolve(obj.price)
    }).catch(e => {
      console.log(e);
      resolve(-1)
    })
  });
}

async function getPrice(coin) {
  return new Promise(function (resolve, reject) {
    const coinbaseCallback = (error, response, data) => {
      if (error) {
        print(`coinbase callback error: ${error}`)
        reject(error)
      } else {
        resolve(data.price)
      }
    }
    var symbol = coin.toUpperCase() + '-USD';
    publicClient.getProductTicker(symbol, coinbaseCallback)
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