var ipc = require('ipc');

global.clElectron = {
	addEventListener: function(name, listener) {
		ipc.on(name, listener);
	},
	getVersion: function() {
		return ipc.send('getVersion');
	},
	startWatching: function(path) {
		return ipc.send('startWatching', path);
	},
	stopWatching: function(path) {
		return ipc.send('stopWatching', path);
	},
	saveFile: function(file) {
		return ipc.send('saveFile', file);
	}
};
