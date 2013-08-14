(function() {
  var execFile, fs, http, log, options, port, querystring, server, util, _;

  fs = require("fs");

  util = require("util");

  http = require("http");

  querystring = require("querystring");

  _ = require("underscore");

  execFile = require("child_process").execFile;

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
        var branchOk, commit, payload, repo, repoOk, _i, _j, _len, _len1, _ref, _ref1;

        payload = JSON.parse(querystring.unescape(data.replace(/(^payload=)|(\+)/ig, "")));
        _ref = options.repositories;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          repo = _ref[_i];
          repoOk = repo.repo.match(new RegExp("" + payload.repository.owner + "/" + payload.repository.name)).length > 0;
          branchOk = false;
          _ref1 = payload.commits;
          for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
            commit = _ref1[_j];
            if (_.contains(commit.branches || [], repo.branch) || commit.branch === repo.branch) {
              branchOk = true;
            }
            if (branchOk) {
              break;
            }
          }
          if (repoOk && branchOk) {
            log("POST received for " + repo.repo + " ... ");
            execFile(repo.command, function(error, stdout, stderr) {
              log(stdout);
            });
          }
        }
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