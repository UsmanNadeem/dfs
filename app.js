
var request = require('request');
var host = "lums.edu.pk";
var mainURL = "http://" + host;
var searchQuery = ''; 
var limit = 10;
var visitedURLs = [];
var io = require('socket.io')(12345);

io.on('connection', function(socket){
  console.log('Client connected...');
  socket.on('request', function (query) {
  	searchQuery = query;
    console.log("Search started for: "+searchQuery);
	crawl(mainURL, 1, socket);
  });
});

function crawl (_link, currentLevel, socket) { 
	visitedURLs.push(_link);
	request(_link, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			
			if (body.indexOf(searchQuery) > -1) {  // Search Query found
			    socket.emit("result", "Level: "+currentLevel+" Query: "+searchQuery+ " found in: "+response.request.href);
			    // console.log(body.substring(body.indexOf(searchQuery)-5, body.indexOf(searchQuery)+searchQuery.length+9));
			}

			var links = body.match(/<a href="(.*?)">/g);  // <a href="xyz">
			if (links == null) { return; }

			for (var i = links.length - 1; i >= 0; i--) {
				var link = links[i].substring(9, links[i].indexOf('"',9));  // Extract link from href tag
				if (link != '#' && (link[0] == '/' || (link.indexOf(host) > -1 && link.indexOf(host) <= 8))) {  // check non-lums links & those begining with /
					if (link[0] == '/') { link = mainURL + link; };
					if (currentLevel < limit && visitedURLs.indexOf(link) < 0) { 
						crawl(link, currentLevel+1, socket) 
					}
				}
			}
		}
	});
}
