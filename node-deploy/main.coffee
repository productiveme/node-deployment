fs = require "fs"
util = require "util"
http = require "http"
querystring = require "querystring"
_ = require "underscore"
{exec} = require "child_process"

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

					exec "cd #{repo.local_path} && sudo /bin/sh .hooks/deploy.sh", (error, stdout, stderr) ->
						return log error if error
						return log stderr if stderr
						log stdout 
						return

			res.writeHead 200, "Content-type": "text/html"
			res.end()

server.listen port, ->

	try
		process.setgid "node"
		process.setuid "node"
		log "Downgraded to node user."
	catch e
		log "Unable to downgrade permissions."
	
	log "Listening on port #{port} ..."
