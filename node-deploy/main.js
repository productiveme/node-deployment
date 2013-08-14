(function() {
  var fs, http, log, options, port, querystring, server, util;

  fs = require("fs");

  util = require("util");

  http = require("http");

  querystring = require("querystring");

  log = function(item) {
    var output;

    output = new Date().toISOString() + " " + util.format.apply(null, arguments);
    return util.puts(output);
  };

  options = JSON.parse(fs.readFileSync("" + __dirname + "/config.json"));

  port = options.port || 9001;

  server = http.createServer(function(req, res) {
    var data;

    if (req.method === "POST") {
      data = "";
      req.on("data", function(chunk) {
        return data += chunk;
      });
      return req.on("end", function() {
        var payload;

        payload = JSON.parse(querystring.unescape(data.slice(8)));
        console.log(payload);
        res.writeHead(200, {
          "Content-type": "text/html"
        });
        return res.end();
      });
    }
  });

  server.listen(port);

  log("Listening on port " + port + " ...");

}).call(this);