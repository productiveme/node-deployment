A tutorial / set of notes as well as sample scripts on how to configure an Amazon EC2 Ubuntu server for running a Wordpress Network together with custom NodeJS / Meteor apps. Lots of credit to Jed Richards for his node-deployment notes that kick-started me. (Forked from [https://github.com/jedrichards/node-deployment][0.1])

[0.1]: https://github.com/jedrichards/node-deployment

## EC2 server setup for Node / Meteor / Wordpress Network

This repo contains the scripts and config files to configure an Amazon EC2 Ubuntu server for hosting a wordpress network, and some additional node or meteor apps.

An example Node app is included to be deployed as a reverse proxy listening on port 80, which will be useful to direct traffic between the node / meteor apps and the wordpress network sites on clean URIs (e.g. `www.myapp.com` as opposed to `www.myserver.com:8000` etc.)

### Deployment overview

- [Upstart](http://upstart.ubuntu.com) and [Monit](http://mmonit.com/monit) are used to manage the Node application on the server, both for restarting on deployment and reboot and for displaying and reporting on status.
- Node apps will run under the `node` system user. The deployment script will be invoked as `root`.
- Apache and Wordpress Multisite (or Network) will be installed to listen on port 8000
- Node / Meteor apps will listen from port 8001 onwards

### Software used

- Node 0.8.18 (server) (Installed with the [rock-solid nodejs installation script generator](http://apptob.org/))

- Git 1.7.9.5 (server)
- Monit 5.3.2 (server)
- Upstart 1.5 (server)

### Remote directory structures and file locations

All Node stuff into `/var/node`, aping how Apache sites often all go into `/var/www`) and plumped for the following locations:

- Proxy Node app: `/var/node/node-proxy`
- Proxy Node app's log file: `/var/node/node-proxy/log`
- Proxy Node app's pidfile: `/var/node/node-proxy/pid`

Other salient locations include:

- The Upstart job config: `/etc/init/node-proxy.conf`
- Monit's config: `/etc/monit/monitrc`

### 1. Installing Apache/Wordpress
Launched a new Ubuntu Server 12.04.1 LTS 64-bit instance using the AWS Console.

Fix locale issue by adding this line to /etc/environment; then reboot

	LC_ALL="en_US.UTF-8"
	
Install updates and upgrades

	$ sudo updatedb
	$ sudo apt-get update && sudo apt-get upgrade -y

Install Apache and the rewrite modules

	$ sudo apt-get install apache2
	$ sudo a2enmod rewrite

Launch a MySQL RDS instance using the AWS console

Install mysql-client tools

	$ sudo apt-get install mysql-client-5.5

Install PHP and some recommended modules
	
	$ sudo apt-get install php5 libapache2-mod-php5 php5-suhosin php5-curl php-pear php5-mysql php5-gd

Install postfix to enable sending email
	
	$ sudo pear install mail
	$ sudo pear install Net_SMTP
	$ sudo pear install Auth_SASL
	$ sudo pear install mail_mime
	$ sudo apt-get install postfix

Configure PHP to use the correct sendmail

	$ sudo nano /etc/php5/apache2/php.ini

Change the sendmail_path to

	sendmail_path = "/usr/sbin/sendmail -t -i"

#### Setup Amazon SES for relaying email

Follow the guide on Amazon for [Integrating Amazon SES with Postfix][1.1]

[1.1]: http://docs.aws.amazon.com/ses/latest/DeveloperGuide/postfix.html

To enable sending on port 587

	$ sudo nano /etc/postfix/master.cf

and ensure the following:

	submission inet n      -       n       -       -       smtpd
		-o smtpd_sasl_auth_enable=yes
		-o smtpd_client_restrictions=permit_sasl_authenticated,permit_mynetworks,check_relay_domains,reject

then restart postfix

	$ sudo /etc/init.d/postfix restart

To only send from verified senders/domains, replace the line `relayhost = email-smtp.us-east-1.amazonaws.com:25`

	$ sudo nano /etc/postfix/main.cf

with

	sender_dependent_relayhost_maps = hash:/etc/postfix/relayhost_maps

then add your verified senders/domains

	$ sudo nano /etc/postfix/relayhost_maps

in the following format

	verified@example.com    email-smtp.us-east-1.amazonaws.com:587
	@example.net            email-smtp.us-east-1.amazonaws.com:587

and finally

	$ sudo postmap /etc/postfix/relayhost_maps
	$ sudo postfix reload

- - -

Install Wordpress
	
	$ wget http://wordpress.org/latest.tar.gz
	$ tar -xzf latest.tar.gz
	$ sudo cp -R wordpress/* /var/www/

Fix the permissions

	$ sudo chown -R ubuntu:www-data /var/www
	$ sudo find /var/www -type d -exec chmod 2770 {} \;
	$ sudo find /var/www -type f -exec chmod 660 {} \;
	$ sudo usermod -a -G www-data ubuntu

Rename and update `wp-config.php` as normal from `wp-config-sample.php`.

Enable wordpress to update directly to disk

	$ sudo nano /var/www/wp-config.php

and add the following

	define('FS_METHOD', 'direct');

To get permalinks working, set AllowOverride for host in apache config

	$ sudo nano /etc/apache2/sites-enabled/000-default

and change from AllowOverride none to

	AllowOverride FileInfo

Bounce Apache
	
	$ sudo service apache2 restart





### 2. Setup Wordpress Multisite / Network

Remember to generate and apply new random authentication keys and salts from https://api.wordpress.org/secret-key/1.1/salt/ 

	$ sudo nano /var/www/wp-config.php

**TODO:** Add extra notes on how to setup MySQL RDS and connection strings

Enable the option to install Network by adding the following line to the `wp-config.php` file just before "That's all, stop editing!" comment.

	/* Multisite */
	define('WP_ALLOW_MULTISITE', true);

Install Network from the Tools menu, selecting the `Sub-domains` option.

Note and apply the changes to the `wp-config.php` and `.htaccess` files.

Manually install the [Wordpress MU Domain Mapping][2.1] plugin.

Copy the `sunrise.php` file from the plugin's folder to the `wp-content` folder.

We'll want our apache to listen on port 8000 so the reverse proxy can listen on port 80 and direct traffic correctly.

	$ sudo nano /etc/apache2/ports.conf

Change the ports to 8000

	NameVirtualHost *:8000
	Listen 8000

Change the default site's port

	$ sudo nano /etc/apache2/sites-enabled/000-default

Change port 80 to 8000

	<VirtualHost *:8000>

Fix the broken RewriteRule in the .htaccess when on a different port than 80

	$ sudo nano /var/www/.htaccess

Replace the RewriteRule for `^wp-admin$`

	# add a trailing slash to /wp-admin
	RewriteRule ^wp-admin$ http://%{SERVER_NAME}/wp-admin/ [R=302,L]

[2.1]: http://wordpress.org/extend/plugins/wordpress-mu-domain-mapping/




### 3. The Node Application

I've added the Node reverse proxy application code to this repo [here](https://github.com/productiveme/node-deployment/tree/master/node-proxy) so you can look around the files. It uses nodejitsu's own [node-http-proxy](https://github.com/nodejitsu/node-http-proxy) under the hood, which apparently is a robust proxy that sees a good deal of testing and production usage.

The app reads a JSON file specifying a set of proxy rules and starts listening on port 80. For a example, an incoming request to `www.my-node-app.com` could be internally rerouted to a Node app running at `127.0.0.1:8003`, a request to `www.my-domain.com` could be proxied to an Apache vhost at `127.0.0.1:8000`, and a request to `www.my-domain.com/api` could be routed to a Node app sitting at `127.0.0.1:8002`, and so on. Since this is Node, web sockets and arbitrary TCP/IP traffic will be proxied (hopefully) flawlessly. I think node-http-proxy also supports proxying of HTTPS over SSL/TLS too although I don't have that set up in the example app. As I understand it at the time of writing (Sept 2012) nginx and Apache via `mod_proxy` still do not happily support web socket proxying out of the box.

The app is configured for server vs. dev environments via the environment variables `NODE_ENV` and `PORT`. Later on you'll see the environment variables being exported to the Node app's process in the Upstart job configuration.

The app exposes a special route `/ping` via custom middleware which we'll later see Monit use to periodically check the health of the proxy.

On the server we don't really want the app to run as root via `sudo` however we're not allowed to bind to port 80 unless this is the case. One remedy would be to reroute all port 80 traffic to a higher port by reconfiguring the way IP traffic is internally routed. Apparently a command such as this routes packets coming in on port 80 to port 8000:

	$ sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8000`

But that sounds like easily forgotten extra configuration steps though, so in this case we'll be invoking our app as root initially but then immediately having it downgrade itself to the non-privileged user once internal setup has completed. Apparently this is how Apache handles listening on port 80.

At this stage it might be handy to create the non-privileged `node` system user:

	$ sudo adduser --system --shell /bin/bash --gecos "Node apps" --group --disabled-password --home /home/node node




### 4. The continuous deploy web-hook

At this stage I'll assume you have some application code added to a fully working remote Git repo on the server and are able to `push` and `pull` to it with ease from your workstation.

The task of the web-hook is to receive a POST from github.com or bitbucket.org to indicate a code change to the repository, and to execute an installation script when the 'master' branch was updated.

I've added the Node deploy application code to this repo [here](https://github.com/productiveme/node-deployment/tree/master/node-deploy) so you can look around the files.

The app reads a JSON file specifying the repositories to listen for and port to listen on. A typical configuration file looks like this:

	{
		"port": 9001,
		"repositories" : [
			{
				"repo": "productiveme/node-deployment",
				"branch": "master",
				"local_path": "/home/ubuntu/node-deployment"
			}
		]
	}

Where `repositories` contains an array of repositories to listen for. And each repository is defined by `repo` set to owner/repo_name, `branch` set to the branch to deploy and watch for and `local_path` set to the local location of the repo on the deployment server.

The script will assume a `.hooks/deploy.sh` script file exists in the root of `local_path` and will execute it **from the root of the repo** to deploy the latest code.

To successfully execute such a deploy script, the node user will require root permissions, so we will set that up in the sudoers.

	$ sudo visudo

Append the following line and save:

	node ALL = (root) NOPASSWD: /bin/sh .hooks/deploy.sh

Once configured, you'll need to add the app to the reverse proxy and setup your webhook on your git repository provider to match. Further, I suggest you create a ssh public key as the root user and add this as a deploy key to your git repository provider. Then the first task in the script could be a pull or reset to get the latest code.




### 5. Upstart

[Upstart](http://upstart.ubuntu.com) is an event driven daemon which handles the automatic starting of services at boot, as well as optionally respawning them if their associated process dies unexpectedly. Additionally it exposes a handy command line API for manipulating the services with commands like `sudo start servicename`, `sudo stop servicename`, `sudo restart servicename` and `sudo status servicename` etc.

A service can be added to Upstart by placing a valid Upstart job configuration file in the `/etc/init` directory, with configuration files having the naming format `servicename.conf`. It's important to note that the Upstart config files execute as `root` so `sudo` shouldn't be needed in an Upstart job config.

In the context of a Node app we can use Upstart to daemonize the app into a system service. In other words we can start the app with a command like `sudo start node-proxy` and have it run in the background without taking over our shell or quiting when we exit our SSH session. Upstart's `start on`, `stop on` and `respawn` directives allow us to have the app automatically restarted on reboot and when it quits unexpectedly. What's more, Upstart's start/stop API provides a useful control point for Monit to hook onto (more on that later).

Upstart is already on your box if you're running Ubuntu 10.04 or later, but if you don't have it I think it's installable via `apt-get`.

An example Upstart job configuration is in this repo [here](https://github.com/productiveme/node-deployment/blob/master/node-proxy.conf) and [here](https://github.com/productiveme/node-deployment/blob/master/node-deploy.conf).

Once you have your job config file in place run the following command to have Upstart list out all its valid jobs. If yours is *not* in the list it means you have some sort of basic syntax error:

	$ sudo initctl list

If all is well Upstart will now start and stop your Node app on shutdown and reboot, respawn it if it crashes, and allow you to manually control it via commands like `sudo start node-proxy`. If your `start` command fails to spin up the app as expected it means that some or all of the Upstart scripts are failing. One gotcha is that environment variables defined in an Upstart `env` stanza do not expand when concatenated.





### 6. Monit

[Monit](http://mmonit.com/monit) is a utility for managing and monitoring all sorts of UNIX system resources (processes, web services, files, directories  etc). We'll be using it to monitor the health of our proxy Node app, and indeed any other apps we decide to host on this box.

As mentioned above Upstart will automatically respawn services that bomb unexpectedly. However the system process that Upstart monitors could be alive and well but the underlying Node web app could be frozen and not responding to requests. Therefore a more reliable way of checking on our app's health is to actually make a HTTP request and this is where Monit comes in handy - we can set up Monit in such a way that unless it gets a `HTTP 200 OK` response code back from a request to our app it will alert us and then attempt to restart it. This is why we added the special `/ping` route to our app - it's a light weight response that Monit can hit that just returns the text `OK` and a `HTTP 200`.

So just to re-iterate: Upstart restarts the app on system reboot/crash and provides the start/stop command line API while Monit keeps tabs on its status while it's running and restarts it if it looks unhealthy. Monit is pretty powerful, and it can monitor all sorts of process metrics (uptime, cpu usage, memory usage etc.) but for our purposes we're just keeping it simple for now.

I installed Monit via `apt-get` on Ubuntu 12.04. Everything went more or less smoothly, and most of the information you need is in the docs. Monit is configured via the `/etc/monit/monitrc` file, and [here's](https://github.com/productiveme/node-deployment/blob/master/monitrc) my example. The file is commented but broadly speaking my `monitrc` is doing the following things:

- Checking on the health of the `node-proxy` via its special `/ping` route.
- Exposes Monit's web-based front end on a specific port and controls access via a username and password.
- Sends email via Gmail's SMTP servers when there's an alert.

Once you've got Monit configured you can check the config file's syntax for errors like so:

	$ sudo monit -t

And the start Monit like this:

	$ sudo monit                # Starts the Monit daemon
	$ sudo monit start all      # Tells the Monit daemon to actually start monitoring things

If you've tweaked the config file and want Monit to reinitialise with the changes:

	$ sudo monit reload

Once Monit is properly up and running it exposes a similar command line API to Upstart. The benefit of using Monit's over Upstart's is that you'll get more accurate and verbose status updates and alerts from Monit. What's more if you stop the app via Upstart (`sudo stop node-proxy`) Monit will just go ahead and restart it soon after, but stopping via Monit will stop monitoring too. The Monit commnds look like this (and indeed we used one back in `/var/node/node-deploy`):

	$ sudo monit restart node-proxy
	$ sudo monit start node-proxy
	$ sudo monit stop node-proxy

**TODO:** Change monitrc config file to email via AWS SES

### References

- [https://github.com/jedrichards/node-deployment](https://github.com/jedrichards/node-deployment)
- [http://stackoverflow.com/questions/11211950/post-receive-hook-permission-denied-unable-to-create-file-error](http://stackoverflow.com/questions/11211950/post-receive-hook-permission-denied-unable-to-create-file-error)
- [https://github.com/joyent/node/wiki/Resources](https://github.com/joyent/node/wiki/Resources)
- [http://clock.co.uk/tech-blogs/deploying-nodejs-apps](http://clock.co.uk/tech-blogs/deploying-nodejs-apps)
- [http://caolanmcmahon.com/posts/deploying_node_js_with_upstart](http://caolanmcmahon.com/posts/deploying_node_js_with_upstart)
- [http://www.carbonsilk.com/node/deploying-nodejs-apps](http://www.carbonsilk.com/node/deploying-nodejs-apps)
- [http://howtonode.org/deploying-node-upstart-monit](http://howtonode.org/deploying-node-upstart-monit)
- [http://dailyjs.com/2010/03/15/hosting-nodejs-apps](http://dailyjs.com/2010/03/15/hosting-nodejs-apps)
- [http://mark.stanton.org.au/2011/12/setting-up-ubuntuwordpress-on-amazon-ec2-part-2/](http://mark.stanton.org.au/2011/12/setting-up-ubuntuwordpress-on-amazon-ec2-part-2/)
- [http://wp.tutsplus.com/tutorials/wordpress-multisite-beyond-basics-essentials-and-domain-mapping/](http://wp.tutsplus.com/tutorials/wordpress-multisite-beyond-basics-essentials-and-domain-mapping/)
- [http://docs.aws.amazon.com/ses/latest/DeveloperGuide/postfix.html](http://docs.aws.amazon.com/ses/latest/DeveloperGuide/postfix.html)
