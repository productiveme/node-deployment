fs = require "fs"
https = require "https"
httpProxy = require "http-proxy"
crypto = require "crypto"
util = require "util"

env = process.env.NODE_ENV or "development"
port = process.env.PORT or 1337

options =
	
	https:
		SNICallback: (hostname) -> getCredentialsContext hostname
		cert: myCert
		key: myKey
		ca: [myCa]

	router: JSON.parse fs.readFileSync "#{__dirname}/proxytable.json"

server = httpProxy.createServer options, status

server.listen port, ->

# Attempt to downgrade to the node system user. This will error in an
# environment that doesn't have that user (i.e. development) hence the
# try/catch blocks.

	try
		process.setgid "node"
		process.setuid "node"
		log "Downgraded to node user."
	catch error
		log "Unable to downgrade permissions."

	log "Listening ..."

# Upstart should politely stop the app via a SIGTERM before the SIGKILL, so
# we listen for it here and log it just to make the logs more descriptive.

process.on "SIGTERM", -> log "Stopped."

### 
Status middleware. Exposes a light-weight route for checking that the 
proxy is still responding to requests. Used by Monit.
###
status = (req, res, next) ->
	if req.url is "/ping"
		res.end "ok"
	else
		next()

### Outputs information to stdout while prefixing an ISO 8601 date. ###
log = (item) ->
	output = new Date().toISOString() + " " + util.format.apply( null, arguments )
	util.puts 

### Generic function to load the credentials context from disk ###
getCredentialsContext = (cer) ->
	crypto.createCredentials
		key: fs.readFileSync "#{__dirname}/certs/#{cer}.key"
		cert: fs.readFileSync "#{__dirname}/certs/#{cer}.crt"
	.context

