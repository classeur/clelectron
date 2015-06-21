var app = require('app');
var path = require('path');
var fs = require('fs');
var dialog = require('dialog');
var Menu = require('menu');
var shell = require('shell');
var BrowserWindow = require('browser-window');

// Report crashes to our server.
require('crash-reporter').start();

app.on('window-all-closed', function() {
    if (process.platform != 'darwin') {
        app.quit();
    }
});

app.on('open-file', function(evt) {
    console.log('open-file', evt)
});

var appUri = 'http://localhost:11583';

function checkUrl(url) {
    url = typeof url === 'string' ? url : url.getUrl();
    return url.slice(0, appUri.length) === appUri;
}

function checkOrigin(cb) {
    return function(evt) {
        checkUrl(evt.sender) && cb.apply(null, arguments);
    };
}

function sendMsg(webContents, channel, msg) {
    checkUrl(webContents) && webContents.send(channel, msg);
}

var windows = {};

function ClasseurCtx(webContents) {
    this.webContents = webContents;
}

ClasseurCtx.prototype.watchFile = function(path) {
    var self = this;
    var watchCtx = {
        path: path,
        readFile: function() {
            fs.readFile(this.path, {
                encoding: 'UTF-8'
            }, function(err, content) {
                if (content && content.match(/\uFFFD/)) {
                    err = 'Can not open binary file.';
                }
                if (err) {
                    sendMsg(self.webContents, 'error', err.toString());
                } else if (content !== undefined && watchCtx.content !== content) {
                    watchCtx.content = content;
                    sendMsg(self.webContents, 'file', {
                        path: path,
                        content: content
                    });
                }
            });
        },
        writeFile: function() {
            fs.writeFile(this.path, this.content, function(err) {
                err && sendMsg(self.webContents, 'error', err.toString());
            });
        },
        createWatcher: function() {
            this.watcher = fs.watch(this.path);
            this.watcher.on('change', function() {
                watchCtx.readFile();
            });
            this.watcher.on('error', function() {
                setTimeout(function() {
                    watchCtx.createWatcher();
                }, 10000);
            });
        }
    };
    watchCtx.createWatcher();
    watchCtx.readFile();
    this.watchCtx && this.watchCtx.watcher.close();
    this.watchCtx = watchCtx;
};

ClasseurCtx.prototype.clean = function() {
    this.watchCtx && this.watchCtx.watcher.close();
};

function createWindow() {
    var browserWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        'node-integration': false,
        preload: path.join(__dirname, 'preload.js')
    });
    windows[browserWindow.id] = browserWindow;
    browserWindow.loadUrl(appUri);
    browserWindow.openDevTools();
    browserWindow.lastFocus = Date.now();
    browserWindow.on('focus', function() {
        browserWindow.lastFocus = Date.now();
    });
    browserWindow.on('closed', function() {
        delete windows[browserWindow.id];
    });

    var classeurCtx = new ClasseurCtx(browserWindow.webContents);
    browserWindow.webContents.classeurCtx = classeurCtx;
    browserWindow.webContents.on('will-navigate', function() {
        classeurCtx.clean();
        classeurCtx = new ClasseurCtx(browserWindow.webContents);
    });

    browserWindow.webContents.on('new-window', function(evt, url) {
        shell.openExternal(url);
        evt.preventDefault();
    });

    return browserWindow;
}

function getWindow(browserWindow, cb) {
    browserWindow = browserWindow && windows[browserWindow.id];
    var maxLastFocus = 0;
    browserWindow || Object.keys(windows).forEach(function(id) {
        var lastFocus = windows[id].lastFocus;
        if (lastFocus > maxLastFocus) {
            browserWindow = windows[id];
            maxLastFocus = lastFocus;
        }
    });
    browserWindow = browserWindow || createWindow();
    if (browserWindow.webContents.classeurCtx.isClasseurReady) {
        cb(browserWindow);
    } else {
        browserWindow.webContents.on('classeur-ready', function() {
            cb(browserWindow);
        });
    }
}

function openFileDialog(browserWindow) {
    dialog.showOpenDialog({
        properties: ['openFile']
    }, function(paths) {
        if (paths && paths[0]) {
            getWindow(browserWindow, function(browserWindow) {
                browserWindow.webContents.classeurCtx.watchFile(paths[0]);
                browserWindow.focus();
            });
        }
    });
}

function newFileDialog(browserWindow) {
    dialog.showSaveDialog(function(path) {
        if (path) {
            getWindow(browserWindow, function(browserWindow) {
                fs.writeFile(path, '', function(err) {
                    if (err) {
                        return sendMsg(browserWindow.webContents, 'error', err.toString());
                    }
                    browserWindow.webContents.classeurCtx.watchFile(path);
                    browserWindow.focus();
                });
            });
        }
    });
}

app.on('activate-with-no-open-windows', createWindow);

var ipc = require('ipc');
ipc.on('getVersion', checkOrigin(function(evt) {
    evt.sender.classeurCtx.isClasseurReady = true;
    evt.sender.emit('classeur-ready');
    sendMsg(evt.sender, 'version', app.getVersion());
}));

ipc.on('startWatching', checkOrigin(function(evt, path) {
    evt.sender.classeurCtx.watchFile(path);
}));

ipc.on('stopWatching', checkOrigin(function(evt, path) {
    var watchCtx = evt.sender.classeurCtx.watchCtx;
    watchCtx && watchCtx.path === path && watchCtx.watchCtx.watcher.close();
}));

ipc.on('saveFile', checkOrigin(function(evt, file) {
    var watchCtx = evt.sender.classeurCtx.watchCtx;
    if (watchCtx && file.path === watchCtx.path && file.content !== watchCtx.content) {
        watchCtx.content = file.content;
        watchCtx.writeFile();
    }
}));

function onReady() {
    var template = [{
        label: 'Classeur',
        submenu: [{
            label: 'New local file',
            click: newFileDialog
        }, {
            label: 'Open local file',
            click: openFileDialog
        }, {
            type: 'separator'
        }, {
            label: 'Hide Classeur',
            accelerator: 'Command+H',
            selector: 'hide:'
        }, {
            label: 'Hide Others',
            accelerator: 'Command+Shift+H',
            selector: 'hideOtherApplications:'
        }, {
            label: 'Show All',
            selector: 'unhideAllApplications:'
        }, {
            type: 'separator'
        }, {
            label: 'Quit',
            accelerator: 'Command+Q',
            selector: 'terminate:'
        }, ]
    }, {
        label: 'Edit',
        submenu: [{
            label: 'Undo',
            accelerator: 'Command+Z',
            selector: 'undo:'
        }, {
            label: 'Redo',
            accelerator: 'Shift+Command+Z',
            selector: 'redo:'
        }, {
            type: 'separator'
        }, {
            label: 'Cut',
            accelerator: 'Command+X',
            selector: 'cut:'
        }, {
            label: 'Copy',
            accelerator: 'Command+C',
            selector: 'copy:'
        }, {
            label: 'Paste',
            accelerator: 'Command+V',
            selector: 'paste:'
        }, {
            label: 'Select All',
            accelerator: 'Command+A',
            selector: 'selectAll:'
        }, ]
    }, {
        label: 'Window',
        submenu: [{
            label: 'Minimize',
            accelerator: 'Command+M',
            selector: 'performMiniaturize:'
        }, {
            label: 'Close',
            accelerator: 'Command+W',
            selector: 'performClose:'
        }, {
            type: 'separator'
        }, {
            label: 'Bring All to Front',
            selector: 'arrangeInFront:'
        }]
    }, {
        label: 'Help',
        submenu: [{
            label: 'Learn More',
            click: function() {
                shell.openExternal('http://classeur.io');
            }
        }, {
            label: 'Search Issues',
            click: function() {
                shell.openExternal('https://github.com/classeur/classeur/issues');
            }
        }]
    }];

    var menu = Menu.buildFromTemplate(template);

    Menu.setApplicationMenu(menu);

    var dockMenu = Menu.buildFromTemplate([{
        label: 'New Window',
        click: function() {
            createWindow();
        }
    }, ]);
    app.dock && app.dock.setMenu(dockMenu);
}

app.on('ready', function() {
    onReady();
    createWindow();
});
