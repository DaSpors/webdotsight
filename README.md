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