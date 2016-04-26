var ipcRenderer = require('electron').ipcRenderer
var webFrame = require('web-frame')
var spellChecker = require('spellchecker')
webFrame.setSpellCheckProvider('en-US', false, {
  spellCheck: function (text) {
    return !spellChecker.isMisspelled(text)
  }
})

var remote = require('remote')
var Menu = remote.require('menu')
var MenuItem = remote.require('menu-item')

global.clElectron = {
  addEventListener: function (name, listener) {
    ipcRenderer.on(name, function () {
      var args = Array.prototype.slice.call(arguments)
      args.shift() // First arg is event
      listener.apply(null, args)
    })
  },
  getVersion: function () {
    return ipcRenderer.send('getVersion')
  },
  startWatching: function (path) {
    return ipcRenderer.send('startWatching', path)
  },
  stopWatching: function (path) {
    return ipcRenderer.send('stopWatching', path)
  },
  saveFile: function (file) {
    return ipcRenderer.send('saveFile', file)
  },
  showContextMenu: function (items, text, onCorrection) {
    var menu = new Menu()
    if (text && !text.match(/\s/) && spellChecker.isMisspelled(text)) {
      var corrections = spellChecker.getCorrectionsForMisspelling(text)
      corrections.forEach(function (correction) {
        menu.append(new MenuItem({
          label: correction,
          click: function () {
            onCorrection(correction)
          }
        }))
      })
      corrections.length && menu.append(new MenuItem({
        type: 'separator'
      }))
    }
    items.forEach(function (item) {
      menu.append(new MenuItem({
        type: typeof item.type === 'string' ? item.type : undefined,
        label: typeof item.label === 'string' ? item.label : undefined,
        click: typeof item.click === 'function' ? item.click : undefined
      }))
    })
    menu.popup(remote.getCurrentWindow())
  }
}
