(function () {

	"use strict";

	var fs = require("fs");
	var util = require("util");

	/**
	* Outputs information to stdout while prefixing an ISO 8601 date.
	*/
	function log(item) {

		var output = new Date().toISOString()+" "+util.format.apply(null,arguments);

		util.puts(output);
	}


	var options = JSON.parse(fs.readFileSync(__dirname+"/config.json"));

	var port = options.port || 9001;

	// Listen on specified port or 9001
	var gith = require('gith').create( port );

	log( "Listening on port " + port + " ..." );

	// Import execFile, to run our bash script
	var execFile = require('child_process').execFile;

	var repo, _i, _len, _ref;

	_ref = options.repositories;
	for (_i = 0, _len = _ref.length; _i < _len; _i++) {
		repo = _ref[_i];

		gith({
			repo: repo.repo
		}).on( 'all', function( payload ) {

			if(payload.branch === 'master') {

				log( payload.repo + " POST received..." )
				
				// Exec a shell script
				execFile(options.command, function(error, stdout, stderr) {
					// Log success in some manner
					log( stdout );
				});

			}
		
		});
	}


})();