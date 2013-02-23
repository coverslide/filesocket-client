'use strict'

var msgpack = require('./msgpack-js')

require('mkee')(FileSocketClient)
require('mkee')(FileSocketReadStream)

module.exports = FileSocketClient

var S   = 1
, DIR   = S++
, FILE  = S++

function FileSocketClient(url){
  var _this = Object.create(FileSocketClient.prototype)

  if(!url) url = 'ws://' + window.location.host
  var sock = new WebSocket(url)
  var requests = {}

  sock.onmessage = messageHandler

  sock.onerror = function(err){
    _this.emit('error', err)
  }

  sock.onopen = function(e){
    _this.emit('connect', e)
  }

  sock.onclose = function(e){
    _this.emit('disconnect', e)
  }

  _this.requestFile = function(path, cb){
    send({type:FILE, path:path}, cb)
  }

  _this.requestDirectory = function(path, cb){
    send({type:DIR, path:path}, cb)
  }

  return _this

  function messageHandler(message){
    blobToArrayBuffer(message.data, function(err, ab){
      if(err) return _this.emit('error', err)
      var msg = msgpack.decode(ab)
      var id = msg.id
      var request = requests[id]

      if(request){
        var type = request.type
        if(msg.error){
          requests[id] = null
          _this.emit('error', new Error(msg.error))
        } else if(type == DIR){
          requests[id] = null
          _this.emit('dir', request.path, msg.stat)
        } else if(type == FILE){
          if(msg.stat){
            request.stream = new FileSocketReadStream()
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
          _this.emit('error', new Error('Unknown type: ' + request.type + ' encountered'))
        }
      } else {
        _this.emit('error', new Error('ID ' + id + ' Not found'))
      }
    })
  }
  
  function send(obj, cb){
    obj.id = genid()
    requests[obj.id] = obj
    sock.send(msgpack.encode(obj))
    obj.cb = cb
  }
}

var MAX_INT = Math.pow(2,32)

function genid(){
  return Math.random() * MAX_INT
}

function FileSocketReadStream(){}

function blobToArrayBuffer(blob, cb){
  var fr = new FileReader();
  fr.onloadend = function(){
    if(fr.error) return cb(fr.error)
    else return cb(null, fr.result)
  }
  fr.readAsArrayBuffer(blob)
}
