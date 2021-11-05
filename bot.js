const tmi = require('tmi.js');

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

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
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
  const commandName = arr[0];

  // If the command is known, let's execute it
  if (commandName === 'dice') {
    const num = rollDice(commandName);
    client.say(target, `You rolled a ${num}.`);
    console.log(`* Executed ${commandName} command`);
  } 
  else if (commandName == 'buy')  {
    print('buy cmd');
    buy(arr[1], arr[2])
  }
  else if (commandName == 'sell') {
    print('sell cmd');
    sell(arr[1], arr[2])
  }
  else {
    console.log(`* Unknown command ${commandName}`);
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
  print(`saying ${msg}`)
  client.say(channel, msg);
}

function print(string) {
  console.log(string)
}