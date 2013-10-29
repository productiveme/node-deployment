var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    httpProxy = require('http-proxy'),
    express = require( "express" );
    
var httpRedir = express();

httpRedir.all('*', function(req, res) {
    res.redirect("https://" + req.headers["host"] + req.url);
});

var options = {
  https: {
    key: fs.readFileSync('/etc/ssl/certs/server.key', 'utf8'),
    cert: fs.readFileSync('/etc/ssl/certs/server.crt', 'utf8')
  }
};

//
// Create a standalone HTTPS proxy server
//
httpProxy.createServer(8002, '127.0.0.1', options).listen(443);
httpRedir.listen(80);
