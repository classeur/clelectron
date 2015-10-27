var app = require('app');
var path = require('path');
var fs = require('fs');
var dialog = require('dialog');
var Menu = require('menu');
var shell = require('shell');
var BrowserWindow = require('browser-window');

app.on('window-all-closed', function() {
    if (process.platform != 'darwin') {
        app.quit();
    }
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

var windows = {};

function ClasseurCtx(webContents) {
    this.webContents = webContents;
}

ClasseurCtx.prototype.sendMsg = function(channel, msg) {
    checkUrl(this.webContents) && this.webContents.send(channel, msg);
};

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
                    self.sendMsg('error', err.toString());
                } else if (content !== undefined && watchCtx.content !== content) {
                    watchCtx.content = content;
                    self.sendMsg('file', {
                        path: path,
                        content: content
                    });
                }
            });
        },
        writeFile: function() {
            fs.writeFile(this.path, this.content, function(err) {
                err && self.sendMsg('error', err.toString());
            });
        },
        createWatcher: function() {
            this.watchListener = function(curr, prev) {
                curr.mtime.getTime() !== prev.mtime.getTime() && watchCtx.readFile();
            };
            fs.watchFile(this.path, this.watchListener);
        },
        removeWatcher: function() {
            this.watchListener && fs.unwatchFile(this.path, this.watchListener);
            this.watchListener = undefined;
        }
    };
    watchCtx.createWatcher();
    watchCtx.readFile();
    this.watchCtx && this.watchCtx.removeWatcher();
    this.watchCtx = watchCtx;
};

ClasseurCtx.prototype.clean = function() {
    this.watchCtx && this.watchCtx.removeWatcher();
};

var lastWindowOffset = 0;
function createWindow(cb) {
    var browserWindow = new BrowserWindow({
        width: 1050,
        height: 750,
        x: lastWindowOffset % 100 + 50,
        y: lastWindowOffset % 100 + 50,
        title: 'Classeur',
        'node-integration': false,
        preload: path.join(__dirname, 'preload.js')
    });
    lastWindowOffset += 20;
    var classeurCtx = new ClasseurCtx(browserWindow.webContents);
    browserWindow.webContents.classeurCtx = classeurCtx;

    windows[browserWindow.id] = browserWindow;
    browserWindow.loadUrl(appUri);
    browserWindow.openDevTools();
    browserWindow.on('closed', function() {
        classeurCtx.clean();
        delete windows[browserWindow.id];
    });
    browserWindow.webContents.on('will-navigate', function() {
        classeurCtx.clean();
        classeurCtx = new ClasseurCtx(browserWindow.webContents);
    });
    browserWindow.webContents.on('new-window', function(evt, url) {
        shell.openExternal(url);
        evt.preventDefault();
    });
    cb && browserWindow.webContents.on('classeur-ready', function() {
        cb(browserWindow);
    });

    return browserWindow;
}

function openFile(browserWindow, path) {
    browserWindow.webContents.classeurCtx.watchFile(path);
    browserWindow.focus();
    app.addRecentDocument(path);
}

function openFileDialog() {
    dialog.showOpenDialog({
        properties: ['openFile']
    }, function(paths) {
        if (paths && paths[0]) {
            createWindow(function(browserWindow) {
                openFile(browserWindow, paths[0]);
            });
        }
    });
}

function newFileDialog() {
    dialog.showSaveDialog(function(path) {
        if (path) {
            createWindow(function(browserWindow) {
                var classeurCtx = browserWindow.webContents.classeurCtx;
                fs.writeFile(path, '', function(err) {
                    if (err) {
                        return classeurCtx.sendMsg('error', err.toString());
                    }
                    app.addRecentDocument(path);
                    classeurCtx.watchFile(path);
                    browserWindow.focus();
                });
            });
        }
    });
}

var isReady, openWhenReady;
app.on('open-file', function(evt, path) {
    evt.preventDefault();
    if(isReady) {
        return createWindow(function(browserWindow) {
                openFile(browserWindow, path);
            });
    }
    openWhenReady = path;
});

app.on('activate-with-no-open-windows', function() {
    createWindow();
});

var ipc = require('ipc');
ipc.on('getVersion', checkOrigin(function(evt) {
    var classeurCtx = evt.sender.classeurCtx;
    classeurCtx.isClasseurReady = true;
    evt.sender.emit('classeur-ready');
    classeurCtx.sendMsg('version', app.getVersion());
}));

ipc.on('startWatching', checkOrigin(function(evt, path) {
    evt.sender.classeurCtx.watchFile(path);
}));

ipc.on('stopWatching', checkOrigin(function(evt, path) {
    var watchCtx = evt.sender.classeurCtx.watchCtx;
    watchCtx && watchCtx.path === path && watchCtx.removeWatcher();
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
    isReady = true;
}

app.on('ready', function() {
    onReady();
    createWindow(openWhenReady && function(browserWindow) {
        openFile(browserWindow, openWhenReady);
    });
});
