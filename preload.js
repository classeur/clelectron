var ipc = require('ipc');

global.myApi = {
    ping: function() {
        ipc.sendSync('synchronous-message', 'ping');
    }
};

ipc.on('asynchronous-reply', function(arg) {
    console.log(arg); // prints "pong"
});
