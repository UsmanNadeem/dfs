
var fs = require('fs');
if (process.argv.length < 3) {
	console.log("Usage: node server.js <serverPORT>");
	process.exit(1);
};
var currentfd = 0;
var records = [];  // {sock: socket, openfiles: []}    file mode 
var files = [];  // {name fd}

var io = require('socket.io')(parseInt(process.argv[2], 10));

io.on('connection', function(socket){
	console.log('Client connected...');
	records.push({sock: socket, openfiles: []});

	socket.on('create', function (nameOfFile) {
	    console.log('request to create file ' + nameOfFile);
	  	for (var i = 0; i < files.length; i++) {
	  		if (files[i].name == nameOfFile) {
	  			socket.emit('returnFromCreateFile', '-1')
	  			return;
	  		}
	  	};
	  	fs.writeFile(nameOfFile, '', function(err) {
		    if(err) {
				console.log(err);
			}
			files.push({name:nameOfFile, fd: (currentfd++)+''})
			socket.emit('returnFromCreateFile', '1');
		});
	});

	socket.on('open0', function (nameOfFile) {
		for (var i = 0; i < files.length; i++) {
	  		if (files[i].name == nameOfFile) {
	  			fs.readFile(nameOfFile,{encoding:"utf8"} , function (error, fdata) {
					if(error) {
						console.log(error);
					} else {
						for (var j = 0; j < records.length; j++) {
							if (records[j].sock == socket) {
								records[j].openfiles.push({file:files[i], mode:'0'});
								break;
							};
						}
			  			socket.emit('returnFromOpenFile', {code:files[i].fd ,name:files[i].name, mode: '0', data:fdata})
					}
				});
	  			return;
	  		}
	  	};
		socket.emit('returnFromOpenFile', {code:'-1'});
	});
	socket.on('open1', function (nameOfFile) {
		console.log('open1');
		for (var i = 0; i < records.length; i++) {
			for (var j = 0; j < records[i].openfiles.length; j++) {
				if (records[i].openfiles[j].file.name == nameOfFile && records[i].openfiles[j].mode == '1') {
		  			socket.emit('returnFromOpenFile', {code:'-2'});
		  			return;
				}
			};
		};
		for (var i = 0; i < files.length; i++) {
	  		if (files[i].name == nameOfFile) {
				console.log('File present '+nameOfFile + 'fd = '+files[i].fd);
				// var records = [];  // {sock: socket, openfiles: []}    file mode 
				// var files = [];  // {name fd}
				for (var j = 0; j < records.length; j++) {
					if (records[j].sock == socket) {
						console.log('file marked as open in write mode');
						records[j].openfiles.push({file:files[i], mode:'1'});
						break;
					};
				}
	  			fs.readFile(nameOfFile,{encoding:"utf8"} , function (error, fdata) {
					if(error) {
						console.log(error);
					} else {
			  			socket.emit('returnFromOpenFile', {code:files[i].fd ,name:files[i].name, mode: '1', data:fdata});
					}
				});
	  			return;
	  		}
	  	};
		socket.emit('returnFromOpenFile', {code:'-1'});
	});

	socket.on('writefileappend1', function (namePlusFile) {  // blocking
		fs.appendFileSync(namePlusFile.name, namePlusFile.dataToAppend);
		var indexOfSocket;
		for (var i = 0; i < records.length; i++) {
			if (records[i].sock == socket) {
				records[i].numACKSsent = 0;
				indexOfSocket = i;
				break;
			}
		};

		namePlusFile.indexOfSocket = indexOfSocket;
		for (var i = 0; i < records.length; i++) {
			for (var j = 0; j < records[i].openfiles.length; j++) {
				if (records[i].openfiles[j].file.name == namePlusFile.name && records[i].openfiles[j].mode == '0') {
		  			records[indexOfSocket].numACKSsent++;
		  			records[i].sock.emit('propogateWriteBlock', namePlusFile);
		  			break;
				}
			};
		};
		if (records[indexOfSocket].numACKSsent == 0) {records[indexOfSocket].sock.emit("returnFromWrite", "ACK");};
	});
	socket.on("propogateWriteBlockACK", function (indexOfSock) {
		var i = parseInt(indexOfSock, 10);

		console.log('Got ACK from blocking write client WriteBlockACK');
		records[i].numACKSsent--;
		console.log('numACKs remaining = '+records[i].numACKSsent);

		if (records[i].numACKSsent == 0) {
			records[i].sock.emit("returnFromWrite", "ACK");
		};
	});

	socket.on('writefileappend2', function (namePlusFile) {  // non-blocking
		fs.appendFileSync(namePlusFile.name, namePlusFile.dataToAppend);
		socket.emit("returnFromWrite", "ACK");
		for (var i = 0; i < records.length; i++) {
			for (var j = 0; j < records[i].openfiles.length; j++) {
				if (records[i].openfiles[j].file.name == namePlusFile.name && records[i].openfiles[j].mode == '0') {
		  			records[i].sock.emit('propogateWrite', namePlusFile);
		  			break;
				}
			};
		};
	});
	// socket.emit("close", file.name);
	// socket.emit("close&writefile", {name:file.name, data:filedata.toString()});

	socket.on("close&writefile", function (file) {
		for (var i = 0; i < records.length; i++) {
			if (records[i].sock == socket) {
				for (var j = 0; j < records[i].openfiles.length; j++) {
					if (records[i].openfiles[j].file.name == file.name) {
						console.log('closing file');
						records[i].openfiles.splice(j, 1);
						break;
					}
				};
			}
		}
		fs.writeFile(file.name, file.data, function(error) {
		    if(error) {
		        console.log(error);
		    }
		});
		for (var i = 0; i < records.length; i++) {
			for (var j = 0; j < records[i].openfiles.length; j++) {
				if (records[i].openfiles[j].file.name == file.name && records[i].openfiles[j].mode == '0') {
					records[i].sock.emit('someoneClosedaFile', file);
		  			break;
				}
			};
		};
	});

	socket.on("close", function (name) {
		for (var i = 0; i < records.length; i++) {
			if (records[i].sock == socket) {
				for (var j = 0; j < records[i].openfiles.length; j++) {
					if (records[i].openfiles[j].file.name == name) {
						console.log('closing file');
						records[i].openfiles.splice(j, 1);
						break;
					}
				};
			}
		}
	});
	// socket.emit('removeSocket','m leaving!');
	socket.on('removeSocket', function (argument) {
		for (var i = 0; i < records.length; i++) {
			if (records[i].sock == socket) {
				console.log('closing file');
				records[i].splice(i, 1);
				break;
			};
		}
	});
});

