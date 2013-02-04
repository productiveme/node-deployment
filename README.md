A tutorial / set of notes as well as sample scripts on how to configure an Amazon EC2 Ubuntu server for running a Wordpress Network together with custom Node / Meteor apps. Lots of credit to J Edwards for his node-deployment notes that kickstarted me. (Cloned from [https://github.com/jedrichards/node-deployment][0.1])

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

- Node 0.8.9 (server)
- Git 1.7.0.4 (server)
- Monit 5.0.3 (server)
- Upstart 0.6.5-8 (server)

### Remote directory structures and file locations

All Node stuff into `/var/node`, aping how Apache sites often all go into `/var/www`) and plumped for the following locations:

- Proxy Node app: `/var/node/http-proxy`
- Proxy Node app's log file: `/var/node/http-proxy/log`
- Proxy Node app's pidfile: `/var/node/http-proxy/pid`

Other salient locations include:

- The Upstart job config: `/etc/init/http-proxy.conf`
- Monit's config: `/etc/monit/monitrc`

### 1. Installing Apache/Wordpress
Launched a new Ubuntu Server 12.04.1 LTS 64-bit instance using the AWS Console.

Installed updates and upgrades
```
#!bash
$ sudo updatedb
$ sudo apt-get update && sudo apt-get upgrade -y
```
Installed Apache and the rewrite modules
```
#!bash
$ sudo apt-get install apache2
$ sudo a2enmod rewrite
```

Launched a MySQL RDS instance using the AWS console

Installed mysql-client tools
```
#!bash
$ sudo apt-get install mysql-client-5.5
```
Installed PHP and some recommended modules
```
#!bash
$ sudo apt-get install php5 libapache2-mod-php5 php5-suhosin php5-curl php-pear php5-mysql
```
Installed postfix to enable sending email
```
#!bash
$ sudo pear install mail
$ sudo pear install Net_SMTP
$ sudo pear install Auth_SASL
$ sudo pear install mail_mime
$ sudo apt-get install postfix
```
Configure PHP to use the correct sendmail
```
#!bash
$ sudo nano /etc/php5/apache2/php.ini
```
Changed the sendmail_path to
```
#!bash
sendmail_path = "/usr/sbin/sendmail -t -i"
```
** TODO: add configuration to setup AWS SES Email here **

Installed Wordpress
```
#!bash
$ wget http://wordpress.org/latest.tar.gz
$ tar -xzf latest.tar.gz
$ sudo cp -R wordpress/* /var/www/
```
Fixed the permissions
```
#!bash
$ sudo chown -R ubuntu:www-data /var/www
$ sudo find /var/www -type d -exec chmod 2770 {} \;
$ sudo find /var/www -type f -exec chmod 660 {} \;
$ sudo usermod -a -G www-data ubuntu
```
Enable wordpress to update directly to disk
```
#!bash
$ sudo nano /var/www/wp-config.php
```
and add the following
```
#!bash
define('FS_METHOD', 'direct');
```
To get permalinks working, had to set AllowOverride for host in apache config
```
#!bash
$ sudo nano /etc/apache2/sites-enabled/000-default
``` 
and change from AllowOverride none to
```
#!bash
AllowOverride FileInfo
```

Bounced Apache
```
#!bash
$ sudo service apache2 restart
```

### 2. Setup Wordpress Multisite / Network

Rename and update your wp-config.php as normal from wp-config-sample.php.

** TODO: Add special notes on how to setup MySQL RDS and connection strings **

First enable the option to install Network by adding the following line to the wp-config.php file just before "That's all, stop editing!" comment.
```
#!php
/* Multisite */
define('WP_ALLOW_MULTISITE', true);
```
Install Network from the Tools menu, selecting the `Sub-domains` option.

Note and apply the changes to the `wp-config.php` and `.htaccess` files.

Manually install the [Wordpress MU Domain Mapping][2.1]] plugin.

Copy the `sunrise.php` file from the plugin's folder to the `wp-content` folder.

** TODO: Explain changing Apache default port to 8000 and changes to .htaccess **

[2.1]: http://wordpress.org/extend/plugins/wordpress-mu-domain-mapping/

### 3. The Node Application

I've added the Node reverse proxy application code to this repo [here](https://github.com/jedrichards/node-deployment/tree/master/node-app) so you can look around the files. It uses nodejitsu's own [node-http-proxy](https://github.com/nodejitsu/node-http-proxy) under the hood, which apparently is a robust proxy that sees a good deal of testing and production usage.

The app reads a JSON file specifying a set of proxy rules and starts listening on port 80. For a example, an incoming request to `www.my-node-app.com` could be internally rerouted to a Node app running at `127.0.0.1:8022`, a request to `www.my-domain.com` could be proxied to an Apache vhost at `127.0.0.1:8000`, and a request to `www.my-domain.com/api` could be routed to a Node app sitting at `127.0.0.1:8023`, and so on. Since this is Node, web sockets and arbitrary TCP/IP traffic will be proxied (hopefully) flawlessly. I think node-http-proxy also supports proxying of HTTPS over SSL/TLS too although I don't have that set up in the example app. As I understand it at the time of writing (Sept 2012) nginx and Apache via `mod_proxy` still do not happily support web socket proxying out of the box.

The app is configured for server vs. dev environments via the environment variables `NODE_ENV` and `PORT`. Later on you'll see the environment variables being exported to the Node app's process in the Upstart job configuration.

The app exposes a special route `/ping` via custom middleware which we'll later see Monit use to periodically check the health of the proxy.

On the server we don't really want the app to run as root via `sudo` however we're not allowed to bind to port 80 unless this is the case. One remedy would be to reroute all port 80 traffic to a higher port by reconfiguring the way IP traffic is internally routed. Apparently a command such as this routes packets coming in on port 80 to port 8000:

	sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8000`

But that sounds like easily forgotten extra configuration steps though, so in this case we'll be invoking our app as root initially but then immediately having it downgrade itself to the non-privileged user once internal setup has completed. Apparently this is how Apache handles listening on port 80.

At this stage it might be handy to create the non-privileged `node` system user:

	sudo adduser --system --shell /bin/bash --gecos "Node apps" --group --disabled-password --home /home/node node

### 4. The post-recieve hook

At this stage I'll assume you have some application code added to a fully working remote Gitolite repo on the server and are able to `push` and `pull` to it with ease from your workstation.

The task of the Git `post-receive` hook is to invoke a generic deploy script which moves the Node app files out of the bare Gitolite repo and into whichever location we decide to store our active node apps on the server whenever new code is pushed. First you need to SSH into the server and become Gitolite's `git` user:

	ssh user@host
	sudo su git

Navigate to the hooks folder for the relevant repo and start to edit the `post-receive` file. It's important that this file is owned by and executable by the `git` user, since that's the user that'll be executing it.

	cd /home/git/repositories/proxy-node-app.git/hooks
	touch post-receive        # If required, may already exist
	chmod u+x post-receive    # If required, may already be executable
	nano post-receive

Make the contents look like (or similar to) the example `post-receive` hook in this repo [here](https://github.com/jedrichards/node-deployment/blob/master/post-receive).

In the hook we're attempting to invoke the `/var/node/node-deploy` generic deployment script via a `sudo`'ed `sh` command while passing down a configuration environment variable called `APP_NAME` (we'll go on to make that script in the next section). Since this `post-receive` hook will not be executing in an interactive shell it will bork at the `git` user's attempt to `sudo`, so the next thing we need to do is give the `git` user the right to invoke `/var/node/node-deploy` with the `sh` command without a password.

Start to edit the `/etc/sudoers` file:

	sudo visudo

And add the following line at the bottom:

	git ALL = (root) NOPASSWD: /bin/sh /var/node/node-deploy

(I think) this isn't as big a security concern as one might think since we're only giving the `git` user password-less `sudo` rights to this one particular script, which itself will only be editable and viewable by `root`.

We're not quite done with `/etc/sudoers` though, we need to stop `sudo` stripping out our `APP_NAME` environment variable. Add the following at the top just above the `Defaults env_reset` line:

	Defaults env_keep += "APP_NAME"

Again, this shouldn't be too much of a security concern because we'll be handling the contents of `APP_NAME` carefully in `node-deploy`.

You can see my version of sudoers [here](https://github.com/jedrichards/node-deployment/blob/master/sudoers). It just has the default contents and the changes mentioned above.

Save and exit `/etc/sudoers`. We now should be in a postion where we can push to our Gitolite repo and have the `post-receive` execute, and having granted the `git` user the right to invoke the deployment script as `root` without asking for a password we shoud have the power to do any kind of filesystem manipulation we like. Now we need to write that script.

### 5. The generic deployment script

I'm calling this a "generic" deployment script because I'm aiming for it to be useful for publishing any reasonably non-complex Node app. To this end we use the `APP_NAME` value passed in from the `post-receive` hook to tailor the behaviour of the script. It doesn't have to be executable since we're invoking it via the `sh` command. Go and ahead and create it:

	cd /var/node
	sudo touch node-deploy

An example of this script is in this repo [here](https://github.com/jedrichards/node-deployment/blob/master/node-deploy).

The script above is fairly well commented so I won't go into much detail but basically it's simply syncronising the contents of the node app directory (in this case `/var/node/proxy-node-app/app`) with the latest revision of the files in the bare Gitolite repo via `git checkout -f`. Once that's been done it's changing the ownership of the files to the `node` user and restarting the app via Monit.

You don't have to keep your node apps in `/var/node`, anywhere will likely do, but after some research it seemed like a reasonably sensible location.

### 5. Upstart

[Upstart](http://upstart.ubuntu.com) is an event driven daemon which handles the automatic starting of services at boot, as well as optionally respawning them if their associated process dies unexpectedly. Additionally it exposes a handy command line API for manipulating the services with commands like `sudo start servicename`, `sudo stop servicename`, `sudo restart servicename` and `sudo status servicename` etc.

A service can be added to Upstart by placing a valid Upstart job configuration file in the `/etc/init` directory, with configuration files having the naming format `servicename.conf`. It's important to note that the Upstart config files execute as `root` so `sudo` shouldn't be needed in an Upstart job config.

In the context of a Node app we can use Upstart to daemonize the app into a system service. In other words we can start the app with a command like `sudo start proxy-node-app` and have it run in the background without taking over our shell or quiting when we exit our SSH session. Upstart's `start on`, `stop on` and `respawn` directives allow us to have the app automatically restarted on reboot and when it quits unexpectedly. What's more, Upstart's start/stop API provides a useful control point for Monit to hook onto (more on that later).

Upstart is already on your box if you're running Ubuntu 10.04 like me, but if you don't have it I think it's installable via `apt-get`.

An example Upstart job configuration is in this repo [here](https://github.com/jedrichards/node-deployment/blob/master/proxy-node-app.conf).

Once you have your job config file in place run the following command to have Upstart list out all its valid jobs. If yours is *not* in the list it means you have some sort of basic syntax error:

	sudo initctl list

If all is well Upstart will now start and stop your Node app on shutdown and reboot, respawn it if it crashes, and allow you to manually control it via commands like `sudo start proxy-node-app`. If your `start` command fails to spin up the app as expected it means that some or all of the Upstart scripts are failing. One gotcha is that environment variables defined in an Upstart `env` stanza do not expand when concatenated.

### 6. Monit

[Monit](http://mmonit.com/monit) is a utility for managing and monitoring all sorts of UNIX system resources (processes, web services, files, directories  etc). We'll be using it to monitor the health of our proxy Node app, and indeed any other apps we decide to host on this box.

As mentioned above Upstart will automatically respawn services that bomb unexpectedly. However the system process that Upstart monitors could be alive and well but the underlying Node web app could be frozen and not responding to requests. Therefore a more reliable way of checking on our app's health is to actually make a HTTP request and this is where Monit comes in handy - we can set up Monit in such a way that unless it gets a `HTTP 200 OK` response code back from a request to our app it will alert us and then attempt to restart it. This is why we added the special `/ping` route to our app - it's a light weight response that Monit can hit that just returns the text `OK` and a `HTTP 200`.

So just to re-iterate: Upstart restarts the app on system reboot/crash and provides the start/stop command line API while Monit keeps tabs on its status while it's running and restarts it if it looks unhealthy. Monit is pretty powerful, and it can monitor all sorts of process metrics (uptime, cpu usage, memory usage etc.) but for our purposes we're just keeping it simple for now.

I installed Monit via `apt-get` on Ubuntu 10.04. Everything went more or less smoothly, and most of the information you need is in the docs. Monit is configured via the `/etc/monit/monitrc` file, and [here's](https://github.com/jedrichards/node-deployment/blob/master/monitrc) my example. The file is commented but broadly speaking my `monitrc` is doing the following things:

- Checking on the health of the `proxy-node-app` via its special `/ping` route.
- Exposes Monit's web-based front end on a specific port and controls access via a username and password.
- Sends email via Gmail's SMTP servers when there's an alert.

Once you've got Monit configured you can check the config file's syntax for errors like so:

	sudo monit -t

And the start Monit like this:

	sudo monit                # Starts the Monit daemon
	sudo monit start all      # Tells the Monit daemon to actually start monitoring things

If you've tweaked the config file and want Monit to reinitialise with the changes:

	sudo monit reload

Once Monit is properly up and running it exposes a similar command line API to Upstart. The benefit of using Monit's over Upstart's is that you'll get more accurate and verbose status updates and alerts from Monit. What's more if you stop the app via Upstart (`sudo stop proxy-node-app`) Monit will just go ahead and restart it soon after, but stopping via Monit will stop monitoring too. The Monit commnds look like this (and indeed we used one back in `/var/node/node-deploy`):

	sudo monit restart proxy-node-app
	sudo monit start proxy-node-app
	sudo monit stop proxy-node-app

### Future thoughts, improvements?

#### More complex setup

For more complex apps that have more involved steps for initialisation (database setup etc.) we would need to move beyond a generic deployment script. Checking such a build script into version control along with the app code would probably be a good idea, as would making use of tools like [Jake](https://github.com/mde/jake).

#### Rolling back failed deployments

By keeping a record of previous versions of the app (perhaps in directories with names like `proxy-node-app-v0.5`) and symlinking the most recently deployed version to the live app folder it'd make it much easier to rollback a broken version of the app.

#### More environments

At the moment there is a simple 1:1 relationship between the developer's workstation environment and the production server. It would probably be quite easy to set up different branches in the remote Git repo, for example to represent `production` and `staging` environments, and handle pushes to those branches differently in the `post-receive` hook.

#### Continuous integration

This deployment process has no concept of continuous integration or testing. While it probably wouldn't be hard to add some light-weight CI-like features I'm aware that it might be reinventing the wheel. Is this where [Jenkins](https://wiki.jenkins-ci.org/display/JENKINS/Home) comes in?

#### Server configuration

Although I tried to keep this as simple as possible I'm aware that it involves a fair number of steps and fairly fiddly server configuration. It'd probably take at least half day to a day to get this process up and running from a cold start. Is this where tools such as [Chef](http://www.opscode.com/chef) and [Puppet](http://puppetlabs.com) could help?

### References

- http://stackoverflow.com/questions/11211950/post-receive-hook-permission-denied-unable-to-create-file-error
- https://github.com/joyent/node/wiki/Resources
- http://clock.co.uk/tech-blogs/deploying-nodejs-apps
- http://caolanmcmahon.com/posts/deploying_node_js_with_upstart
- http://www.carbonsilk.com/node/deploying-nodejs-apps
- http://howtonode.org/deploying-node-upstart-monit
- http://dailyjs.com/2010/03/15/hosting-nodejs-apps
