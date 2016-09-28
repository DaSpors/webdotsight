Web Dot Sight
=============
Once upon a time in a village nearby ... no really: We used a german software to control
a dot sight based air rifle target, but that was crap:    
http://www.disag.de/downloads/software/reddotview/
    
So this project is a usable implementation. Protocol was trivial to read so I assume it 
is meant to be public.     
Note that this is a really early state of work and only available in german.
No plans to translate so far.

Installation
============
Install nodejs, git clone this, install node modules:
```bash
npm install serialport nedb nodejs-websocket connect serve-static
```
done.
Run it with node `node web-dot-sight.js` and it will automatically connect to each RedDot 
the computer knows (they are connected via bluetooth).
The WebInterface is accessible at localhost:88.

Raspberry Pi 3
==============
I tested install on a RPi3 and there i needed to
```bash
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
sudo apt-get install nodejs 
```
before the actual module installation.    
My RPI runs headless so i use forever and a crontab-trick to start web-dot.sight.
```bash
sudo npm install -g forever
```
Then create a script (/home/pi/startup.sh) like this
```bash
#/bin/bash
forever start /home/pi/webdotsight/web-dot-sight.js
```
and add it to the crontab (crontab -e)
```bash
# ... add this at the end of the file
@reboot /home/pi/startup.sh
```

Raspberry Pi 3 onboard BT
=========================
I spent quite some days trying to get the onboard bluetooth device working but that seems to be total crap.    
Nearly got crazy but suddenly I remembered that old Serial-USB converter cable in one of my treasure chests (aka trashcan).    
Works out of the box with that thingy so stopping BT experiments for now.