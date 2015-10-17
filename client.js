

var io = require('socket.io-client');
var listOfFiles = [];
var readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
var fs = require('fs');
if (process.argv.length < 4) {
	console.log("Usage: node client.js <serverIP> <serverPORT>");
	process.exit(1);
};
var socket = io.connect('http://'+process.argv[2]+':'+process.argv[3]);

socket.on('connect', function () { 
	console.log("Connected to server..."); 
	prompt();
});

/*
Server returns 1 if a new file is created in its local directory on the behalf of user’s request. Filename can
be upto 30 characters. Server returns -1 if a local copy of same filename already exists or there is some
other problem
*/
function CreateFile () {
	readline.question("Usage: <Name of File>", function(input) {
		socket.emit("create", input);
	});
}

socket.on('returnFromCreateFile', function (result) {
	if (result == "-1") {
		console.log("File already exists");
	};
	if (result == "1") {
		console.log("File created!");
	};
	prompt();
});

/*
Opening a file means creating a local copy of the file at client’s end and client performs read and write
operations on it. Mode can be “read” i.e. 0 or “write” i.e. 1. The system only allows 1 client to open a file
in write mode at a given time. If call is successful, the call returns a positive value i.e. file descriptor. This
file descriptor is subsequently used to perform read/write operations.
Server returns -1 if file doesn’t exist or -2 if file has already been opened in write mode by any other
client. 
*/
function OpenFile () {
	readline.question("Enter name of File", function(name) {

		for (var i = 0; i < listOfFiles.length; ++i) {
			if (listOfFiles[i].name == name) {
				console.log("File already open");
				prompt();
				return;
			};
		}
		readline.question("Enter Mode: 0 for read and 1 for write", function(mode) {
			if (mode == '0') {
				socket.emit('open0', name);
			} else if (mode == '1') {
				socket.emit('open1', name);
			} else {
				console.log('wrong mode');
				prompt();
			}
		})
	});
}

socket.on('returnFromOpenFile', function (result) {
	if (result.code == "-1") {
		console.log("File doesn’t exist");
	} else if (result.code == "-2") {
		console.log("File already opened by another user in write mode");
	} else {
		console.log("FileDescriptor = "+result.code);
		file = {fd : result.code, name: result.name, mode:result.mode};
		listOfFiles.push(file);

		fs.writeFile(result.name, result.data, function(error) {
		    if(error) {
		        console.log(error);
		    }
		}); 
	}
	prompt();
});

/*
This call reads the contents of file described by its file descriptor and fills the buffer with it. The contents
should be printed on client’s screen. 
*/
function ReadFile () {
	readline.question("Usage: <FileDescriptor>", function(input) {
		var filename = "";
		for (var i = 0; i < listOfFiles.length; ++i) {
			if (listOfFiles[i].fd == input) {
				filename = listOfFiles[i].name;
				break;
			};
		}
		if (filename == "") {
			console.log("File not opened");
			prompt();
		} else {
			fs.readFile(filename,{encoding:"utf8"} , function (error, data) {
				if(error) {
					console.log(error);
				} 
				console.log(data);
				prompt();
			});
		}
	});
}
/*
i. Blocking:
In this mode, file will be written to server and the write update is sent to all the clients who
have opened this file in read mode. We call such clients as active replicas. Once the server
and all replicas have been updated, call to this function returns with 1.

ii. Non-Blocking:
In this mode, file will be written to the server and it returns with a value = 1. That means,
only the server has been updated and all the subsequent replicas are yet to be updated who
have opened the file in read mode.

iii. Disconnected:
In this mode, the file is written on the local directory of the client. This is suitable for a mobile
client who may not be connected to the server all the time. The server and replicas are only
updated when the client closes the file. 
*/
function WriteFile () {
	readline.question("Put FileDescriptor: ", function(FileDescriptor) {
		var filename = "";
		for (var i = 0; i < listOfFiles.length; ++i) {
			if (listOfFiles[i].fd == FileDescriptor) {
				if (listOfFiles[i].mode == '0') {
					console.log('file opened in read mode');
					prompt();
					return;
				}
				filename = listOfFiles[i].name;
				break;
			};
		}
		if (filename == "") {
			console.log("No such file");
			prompt();
			return;
		}
		readline.question("Put mode. 1 for Blocking, 2 for Non-Blocking, 3 for Disconnected", function(mode) {
			if (mode != '1' && mode != '2' && mode != '3') {
				console.log("Bad Mode");
				prompt();
				return;
			};
			
			readline.question("Put data to write: ", function(data) {
				fs.appendFileSync(filename, data);
				if (mode == '1' || mode == '2') {
					socket.emit("writefileappend"+mode, {name:filename, dataToAppend:data});
				} else {
					prompt();
				}
			});

		});
	});
}

socket.on('returnFromWrite', function (result) {
	prompt();
});

socket.on('propogateWriteBlock', function (result) {
	fs.appendFileSync(result.name, result.dataToAppend);
	socket.emit("propogateWriteBlockACK", result.indexOfSocket);
});

socket.on('propogateWrite', function (result) {
	fs.appendFileSync(result.name, result.dataToAppend);
});

socket.on('someoneClosedaFile', function (result) {
	fs.writeFile(result.name, result.data, function(error) {
	    if(error) {
	        console.log(error);
	    }
	});
});

/*
As a result of this call, the reader/writer will close the file. In case of a reader, this will mean that future
writes would not be communicated to the replica hosted at the client. So if the same user opens the file
subsequently, then the file needs to be fetched again from the server (of course, you can
implement optimizations where this overhead is minimized).
In case of a write user, if the client has a pending write (due to using disconnected mode earlier)
then the write will first be made to the server and all the active replicas and only then the file close
operation will take place.
*/
function CloseFile () {
	readline.question("Usage: <FileDescriptor>", function(FileDescriptor) {
		var file = '';
		for (var i = 0; i < listOfFiles.length; ++i) {
			if (listOfFiles[i].fd == FileDescriptor) {
				file = listOfFiles[i];
				listOfFiles.splice(i, 1);
				break;
			};
		}
		if (file == "") {
			console.log("No such file");
			prompt();
			return;
		} else if (file.mode == '1'){
			fs.readFile(file.name,function(error, filedata){
				if (error) {
					console.log(error);
				} else {
					socket.emit("close&writefile", {name:file.name, data:filedata.toString()});
					prompt();
				}
		    });
		} else if (file.mode == '0'){
			socket.emit("close", file.name);
			prompt();
		}
	});
}
process.on('SIGINT', function() {


	if (listOfFiles.length == 0) {
	    process.exit();
	} else {
	    console.log("Closing all files Press Ctrl+C again to exit");
	}

    for (var i = 0; i < listOfFiles.length; ++i) {
		var file = listOfFiles[i];
		fs.readFile(file.name,function(error, filedata){
			if (error) {
				console.log(error);
			} else {
				socket.emit("close&writefile", {name:file.name, data:filedata.toString()});
				socket.emit('removeSocket','m leaving!');
			}
	    });
	}

	listOfFiles = [];
});
// socket.on('returnFromWrite', function (result) {
	// prompt();
// });
function prompt () {
	console.log("========================================================");
	console.log("What do you want to do?"); 
	console.log("1. CreateFile (char *filename)"); 
	console.log("2. OpenFile (char *filename, int mode)"); 
	console.log("3. ReadFile (int fd, char *buffer)"); 
	console.log("4. WriteFile(int fd, char *buffer, int length, int mode)"); 
	console.log("5. CloseFile (int fd)"); 
	console.log("");
			
	readline.question("Enter a number from 1 to 5: ", function(input) {
		// readline.close();
		if (input == '1') {
			CreateFile();
		} else if (input == '2') {
			OpenFile();
		} else if (input == '3') {
			ReadFile();
		} else if (input == '4') {
			WriteFile();
		} else if (input == '5') {
			CloseFile();
		} else {
			prompt();
		};
	});
}















