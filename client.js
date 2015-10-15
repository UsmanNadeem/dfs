

var io = require('socket.io-client');
var socket = io.connect('http://localhost:12345');

socket.on('connect', function () { 
	var readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
	console.log("Connected to server..."); 
	readline.question("What do you want to search for?", function(input) {
		socket.emit("request", input);
		readline.close();
	});
});

socket.on('result', function (result) {
	console.log(result);
})