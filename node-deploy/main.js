(function () {

	"use strict";

	var fs = require("fs");

	var options = JSON.parse(fs.readFileSync(__dirname+"/config.json"));

	// Listen on specified port or 9001
	var gith = require('gith').create( options.port || 9001 );

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

				// Exec a shell script
				execFile(options.command, function(error, stdout, stderr) {
					// Log success in some manner
					console.log( stdout );
				});

			}
		
		});
	}

})();