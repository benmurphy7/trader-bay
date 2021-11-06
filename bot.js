var tmi = require('tmi.js');
var XMLHttpRequest = require('xhr2');

const userMap = {};

// Define configuration options
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

// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch:
client.connect();

//Need to connect to client before running this, not sure how to hook the client connection to executing this
//So just calling stuff at end of onConnectedHandler


// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);

  rewardAll(100)
  setInterval(function(){
    rewardAll(100)}, 10000)
}

// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {
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
  const arr = line.split(' ');
  const cmd = arr[0];

  // If the command is known, let's execute it
  if (cmd === 'dice') {
    const num = rollDice(cmd);
    client.say(target, `You rolled a ${num}.`);
    console.log(`* Executed ${cmd} command`);
  } 
  else if (cmd == 'buy')  {
    print('buy cmd');
    buy(arr[1], arr[2])
  }
  else if (cmd == 'sell') {
    print('sell cmd');
    sell(arr[1], arr[2])
  }
  else if (cmd == 'pts' || cmd == 'points') {
    var user = context.username
    print(context)
    var points = getUserBalance(user)
    print(points)
    say(`${context['display-name']} has ${points} points`)
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
  print("This worked?")
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


async function rewardAll(amount) {
  var users = await getChatters();
  // I will NOT remember this for looping over values...
  for (var it = users.values(), user = null; user=it.next().value;) {
    print(user)
    var balance = 0;
    if (user in userMap) {
      print('user has it')
      balance = userMap[user]
      print(`current user balance ${balance}`)
    }
    balance += amount
    userMap[user] = balance
  }
  say(`Giving all chatters ${amount} points`)
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