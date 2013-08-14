fs = require "fs"
util = require "util"
http = require "http"
querystring = require "querystring"
_ = require "underscore"
{exec} = require "child_process"
path = require "path"

# Outputs information to stdout while prefixing an ISO 8601 date.
log = (item) ->
	output = new Date().toISOString() + " " + util.format.apply( null,arguments )
	util.puts output

options = JSON.parse fs.readFileSync "#{__dirname}/config.json"

port = options.port || 9001

server = http.createServer (req,res) ->
	if req.method is "POST"
		data = ""
		req.on "data", (chunk) ->
			data += chunk

		req.on "end", ->
			payload = JSON.parse querystring.unescape data.replace /(^payload=)|(\+)/ig, ""
			
			for repo in options.repositories

				# log repo

				repoOk = repo.repo.match( new RegExp "#{payload.repository.owner?.name or payload.repository.owner}/#{payload.repository.name}" ).length > 0

				# log repoOk: repoOk, payload: payload.repository

				branchOk = new RegExp( "refs\/heads\/#{repo.branch}" ).test( payload.ref or payload.base_ref or "" )
				unless branchOk
					for commit in payload.commits

						# log commit

						branchOk = true if _.contains( commit.branches or [], repo.branch ) or commit.branch is repo.branch
						break if branchOk

				# log branchOk: branchOk

				if repoOk and branchOk

					log "POST received for #{repo.repo} ... "

					exec "cd #{ path.join repo.local_path, '.hooks' } && sudo deploy.sh", (error, stdout, stderr) ->
						return log error if error
						return log stderr if stderr
						log stdout 
						return

			res.writeHead 200, "Content-type": "text/html"
			res.end()

server.listen port

log "Listening on port #{port} ..."

# // Import execFile, to run our bash script
# var execFile = require('child_process').execFile;

# var repo, _i, _len, _ref;

# _ref = options.repositories;
# for (_i = 0, _len = _ref.length; _i < _len; _i++) {
# 	repo = _ref[_i];

# 	gith({
# 		repo: repo.repo
# 	}).on( 'all', function( payload ) {

# 		if(payload.branch === 'master') {

# 			log( payload.repo + " POST received..." )
			
# 			// Exec a shell script
# 			execFile(options.command, function(error, stdout, stderr) {
# 				// Log success in some manner
# 				log( stdout );
# 			});

# 		}
	
# 	});
# }
