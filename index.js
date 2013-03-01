'use strict'

var msgpack = require('msgpack-js-browser')

require('mkee')(FileSocketClient)
require('mkstream')(FileSocketReadStream)

module.exports = FileSocketClient

var S   = 1
, DIR   = S++
, FILE  = S++

function FileSocketClient(url, options){
  var _this = Object.create(FileSocketClient.prototype)

  if(!url) url = 'ws://' + window.location.host
  var sock, requests = {}, cmdBuffer = []

  _this.requestFile = function(path, options, cb){
    if(typeof options == 'function'){
      cb = options
      options = null
    }
    send({type:FILE, path:path, options:options}, cb)
  }

  _this.requestDirectory = function(path, cb){
    send({type:DIR, path:path}, cb)
  }
  
  connect()

  return _this

  function messageHandler(message){
    var msg = msgpack.decode(message.data)
    var id = msg.id
    var request = requests[id]

    if(request){
      var cb = request.cb
      var type = request.type
      if(msg.error){
        requests[id] = null
        if(cb) cb(new Error(msg.error))
        else _this.emit('error', new Error(msg.error))
      } else if(type == DIR){
        requests[id] = null
        if(cb) cb(null, msg.stats)
        _this.emit('dir', request.path, msg.stats)
      } else if(type == FILE){
        if(msg.stat){
          request.stream = new FileSocketReadStream()
          if(cb) cb(null, msg.stat, request.stream)
          _this.emit('file', request.path, msg.stat, request.stream)
        } else if(msg.data){
          request.stream.emit('data', msg.data)
        }
        if(msg.eof){
          requests[id] = null
          request.stream.emit('end')
        }
      } else {
        requests[id] = null
        var error = new Error('Unknown type: ' + request.type + ' encountered')
        if(cb) cb(error)
        else _this.emit('error', error)

      }
    } else {
      _this.emit('error', new Error('ID ' + id + ' Not found'))
    }
  }

  function connect(){
    sock = new WebSocket(url)
    sock.binaryType = 'arraybuffer'

    sock.onmessage = messageHandler

    sock.onerror = function(err){
      _this.emit('error', err)
    }

    sock.onopen = function(e){
      _this.emit('connect', e) //should this go before or after?
      cmdBuffer.forEach(function(cmd){
        sock.send(cmd)
      })
      cmdBuffer = []
    }

    sock.onclose = function(e){
      _this.emit('disconnect', e)
      if(options.reconnect)
        connect()
    }
  }
  
  function send(obj, cb){
    obj.id = genid()
    requests[obj.id] = obj
    if(sock.readyState == 1)
      sock.send(msgpack.encode(obj))
    else
      cmdBuffer.push(msgpack.encode(obj))
    obj.cb = cb
  }
}

var MAX_INT = Math.pow(2,32)

function genid(){
  return Math.random() * MAX_INT
}

function FileSocketReadStream(){
}
