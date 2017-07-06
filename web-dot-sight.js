
var serialport = require("serialport"),
	fs = require('fs'), 
	websocket = require("nodejs-websocket"), 
	connect = require('connect'),
	serveStatic = require('serve-static'),
	connections = {},
	Datastore = require('nedb'),
	fork = require('child_process').fork;

function padNum(num,len)
{
	if( !len ) len = 2;
	num = ""+num;
	while(num.length < len) num = "0"+num;
	return num;
}
function valency(rec)
{
	var s1 = rec.shots[0].ring || 0, 
		s2 = rec.shots[1]?rec.shots[1].ring:0, 
		s3 = rec.shots[2]?rec.shots[2].ring:0, 
		avg = Math.round(((rec.shots[0].divider||0) + (rec.shots[1]?rec.shots[1].divider:0)  + (rec.shots[2]?rec.shots[2].divider:0) ) / 3),
		d = 10000-avg,
		val = padNum((1000*(s1+s2+s3))+(s3-s1),5); // currently without trend
	rec.total = s1+s2+s3;
	rec.trend = s3-s1;
	rec.avg_divider = avg;
	rec.rings = [s1,s2,s3].join(",");
	return val+"."+padNum(s3)+padNum(s2)+padNum(s1)+"."+padNum(d,5);
}
function set(prop,value)
{
	settings[prop] = value;
	fs.writeFileSync('settings.db',JSON.stringify(settings));
	return value;
}
function dateVal(datestr)
{
	datestr = datestr.replace(/(\d\d).(\d\d).(\d\d\d\d)/,"$3-$2-$1");
	return new Date(datestr);
}
function changeDate(from,to)
{
	if( typeof(from) != 'object' ) from = new Date(from);
	if( typeof(to) != 'object' ) to = new Date(to);
	from.setFullYear(to.getFullYear());
	from.setMonth(to.getMonth());
	from.setDate(to.getDate());
	return from.getTime();
}

var settings = {shots_per_record: 3, bullet_radius: 22.5, ring_width: 25, currentUser: {}, currentContest: {}, latestShot:false};
try{
	settings = JSON.parse(fs.readFileSync('settings.db'));
}catch(ignore){}

db = {};
db.sectors = ['rm','ru','mu','lu','lm','ld','md','rd','mm'];

db.devices = new Datastore({filename: 'devices.db', autoload: true});
db.contests = new Datastore({filename: 'contests.db', autoload: true});
db.users = new Datastore({filename: 'users.db', autoload: true});
db.shots = new Datastore({filename: 'shots.db', autoload: true});
db.records = new Datastore({filename: 'records.db', autoload: true});
db.records.current = function(cb)
{
	var q = 
	{
		user_id: settings.currentUser._id?settings.currentUser._id:{$exists:false},
		contest_id: settings.currentContest._id?settings.currentContest._id:{$exists:false}
	};
	db.records.findOne(q).sort({created:-1}).limit(1).exec(function(err,record)
	{
		if( record )
		{
			var now = new Date();
			if( now.toLocaleDateString() != new Date(record.created).toLocaleDateString() )
			{
				if( record.shots.length < settings.shots_per_record )
				{
					now = now.getTime();
					while( record.shots.length < settings.shots_per_record )
						record.shots.push({created: now});
					db.records.update({_id:record._id},record,function(e,o){ cb(false); });
					return;
				}
			}
		}
		cb(record);
	});
};

db.devices.persistence.setAutocompactionInterval(60*1000);
db.contests.persistence.setAutocompactionInterval(60*1000);
db.users.persistence.setAutocompactionInterval(60*1000);
db.shots.persistence.setAutocompactionInterval(60*1000);
db.records.persistence.setAutocompactionInterval(60*1000);

var packets = [], webSocketPacket = function(type, data, webdotsight_id)
{
	var raw = 
	{
		index: packets.length,
		ready: false,
		type: type,
		webdotsight_id: webdotsight_id,
		json: "",
		data: function(d){ this.json = JSON.stringify({type:this.type,data:d}); return this; },
		send: function()
		{
			this.ready = true;
			if( this.index > 0 )
				return;

			var me = packets.shift();
			webSocketServer.connections.forEach(function(conn){ if( !me.webdotsight_id || me.webdotsight_id == conn.webdotsight_id ) conn.send(me.json); });
			while( packets.length > 0 && packets[0].ready )
			{
				var p = packets.shift();
				webSocketServer.connections.forEach(function(conn){ if( !p.webdotsight_id || p.webdotsight_id == conn.webdotsight_id ) conn.send(p.json); });
			}
			for(var i=0; i<packets.length; i++)
				packets[i].index = i;
		}
	};
	if( typeof data !== 'undefined' )
	{
		raw.data(data);
		packets.push(raw);
		raw.send();
	}
	else
	{
		packets.push(raw);
	}
	return raw;
	
};
var controller = 
{
	initialize: function(date)
	{
		if( date )
		{
			date = new Date(date);
			if( date.toDateString() != new Date().toDateString() )
			{
				var exec = require('child_process').exec;
				exec('sudo date -s "'+date.toISOString()+'"',{shell: '/bin/bash'}, function(err, stdout, stderr)
				{
					if( err == null )
					{
						console.log('Updated date to    '+date);
						console.log('System date is now '+new Date());
						restartAllSearials();
					}
					else
						console.log('Unsable to set date',err);
				})
			}
		}
		
		controller.listContests();
		controller.listUsers();
		controller.listShots();
		controller.listRecords();
		webSocketPacket('currentUser',settings.currentUser);
		webSocketPacket('currentContest',settings.currentContest);
		
		for(var i in connections)
		{
			if( !connections[i].connected )
				continue;
			controller.comstate(connections[i].port,'connected');
			break;
		}
		
	},
	comstate: function(port,state)
	{
		console.log("["+port+"] "+state);
		webSocketPacket('comstate',{port:port,state:state});
	},
	listShots: function()
	{
		var q = 
		{
			user_id: settings.currentUser._id?settings.currentUser._id:{$exists:false},
			contest_id: settings.currentContest._id?settings.currentContest._id:{$exists:false}
		};
		var packet = webSocketPacket('shots');
		db.shots.find(q).sort({created:-1}).limit(10).exec(function(err,shots)
		{
			packet.data({shots:shots,latestShot:settings.latestShot}).send();
		});
	},
	listUsers: function(search)
	{
		var packet = webSocketPacket('users');
		db.users.find(search||{}).sort({name:1}).exec(function (err, users)
		{
			packet.data(users).send();
		});
	},
	listContests: function(search)
	{
		var packet = webSocketPacket('contests');
		db.contests.find(search||{}).sort({name:1}).exec(function (err, contests)
		{
			packet.data(contests).send();
		});
	},
	listRecords: function()
	{
		var q = 
		{
			user_id: settings.currentUser._id?settings.currentUser._id:{$exists:false},
			contest_id: settings.currentContest._id?settings.currentContest._id:{$exists:false}
		};
		var packet = webSocketPacket('records');
		db.records.find(q).sort({created:-1}).limit(1000).exec(function(err,records)
		{
			packet.data(records).send();
		});
		controller.notifyRanking();
	},
	listDevices: function()
	{
		var packet = webSocketPacket('devices');
		db.devices.find({}).limit(1000).exec(function(err,records)
		{
			for(var i in records)
			{
				records[i].online = false;
				webSocketServer.connections.forEach(function(conn){ if( conn.webdotsight_id == records[i].webdotsight_id ) records[i].online = true; });
			}
			packet.data(records).send();
		});
	},
	saveUser: function(user)
	{
		if( user['_id'] == '' )
			delete(user['_id']);
		db.users.findOne({_id:user._id}, function (err, doc)
		{
			if( !doc )
				db.users.insert(user,function(err,newdoc){ controller.setCurrentUser(newdoc._id); });
			else
			{
				db.users.update(doc,user);
				controller.setCurrentUser(user._id);
			}
		});
	},
	saveContest: function(contest)
	{
		console.log("saveContest",contest);
		if( contest['_id'] == '' )
			delete(contest['_id']);
		db.contests.findOne({_id:contest._id}, function (err, doc)
		{
			if( !doc )
				db.contests.insert(contest,function(err,newdoc){ controller.setCurrentContest(newdoc._id); });
			else
			{
				if( doc.date != contest.date )
				{
					var newdate = dateVal(contest.date);
					console.log("Changing contests records date to "+newdate);
					db.records.find({contest_id:contest._id}).exec(function(err,records)
					{
						for(var i in records)
						{
							var rec = JSON.parse(JSON.stringify(records[i]));
							rec.created = changeDate(rec.created,newdate);
							for( var j in rec.shots )
								rec.shots[j].created = changeDate(rec.shots[j].created,newdate);
							db.records.update(records[i],rec);
						}
					});
					console.log("Changing contests shots date to "+newdate);
					db.shots.find({contest_id:contest._id}).exec(function(err,shots)
					{
						for(var i in shots)
						{
							var shot = JSON.parse(JSON.stringify(shots[i]));
							shot.created = changeDate(shot.created,newdate);
							db.shots.update(shots[i],shot);
						}
					});
				}
				db.contests.update(doc,contest);
				controller.setCurrentContest(contest._id);
			}
		});
	},
	saveShot: function(shot)
	{
		if( !shot.created )
			shot.created = new Date().getTime();
		if( settings.currentUser._id )
			shot.user_id = settings.currentUser._id;
		if( settings.currentContest._id )
			shot.contest_id = settings.currentContest._id;
		
		// divider to ring
		shot.ring = 10 - (((shot.divider / 10)-settings.bullet_radius) / settings.ring_width);
		if( shot.ring < 0 )       shot.ring = 0;
		else if( shot.ring > 10 ) shot.ring = 10;
		else shot.ring = Math.floor(shot.ring);
		
		// direction
		var dir = Math.atan2(shot.y,shot.x),
			pw = (Math.PI*2/8), start = 0 - pw/2, i=0;
		if( dir < 0 ) 
			dir = Math.PI + (Math.PI + dir);
		for(i=0; i<8; i++) 
		{
			var end = start + pw;
			if( dir >= start && dir < end )
				break;
			start = end;
		}
		dir = i==8?0:i;
		if( shot.divider/10 < settings.bullet_radius/2 )
			dir = 8;
		shot.dir = db.sectors[dir];
		
		set('latestShot',shot);
		
		console.log(JSON.stringify(shot));
		db.shots.insert(shot,function(err,doc){ controller.listShots(); controller.addShot(doc); });
		
	},
	addShot: function(shot)
	{	
		if( !shot.created )
			shot.created = new Date().getTime();
		
		if( shot._id ) delete(shot._id);
		if( shot.user_id ) delete(shot.user_id);
		if( shot.contest_id ) delete(shot.contest_id);
		
		db.records.current(function(record)
		{
			if( !record || record.shots.length == settings.shots_per_record )
			{
				record = {created:new Date().getTime(),shots:[shot]};
				if( settings.currentUser._id )
					record.user_id = settings.currentUser._id;
				if( settings.currentContest._id )
					record.contest_id = settings.currentContest._id;
				
				db.records.insert(record,controller.listRecords);
			}	
			else
			{
				record.shots.push(shot);
				db.records.update({_id:record._id},record,controller.listRecords);
			}
		});
		
	},
	removeShot: function(id)
	{
		db.shots.findOne({_id:id}, function (err, shot)
		{
			if( !shot )
				return;
			
			db.shots.remove(shot);
			controller.listShots();
			db.records.current(function(record)
			{
				if( !record )
					return;
				
				var shots = [], skips = 0;
				for(var i=0; i<record.shots.length; i++)
				{
					if( !record.shots[i].divider )
						skips++;
					if( record.shots[i].created != shot.created || record.shots[i].divider != shot.divider )
						shots.push(record.shots[i]);
				}	
				if( shots.length == 0 || shots.length == skips )
				{
					db.records.remove(record);
					controller.listRecords();
					return;
				}
				if( shots.length == record.shots.length )
					return;
				record.shots = shots;
				db.records.update({_id:record._id},record,controller.listRecords);
			});
			controller.listRecords();
		});
	},
	setCurrentUser: function(user_id)
	{
		set('currentUser',{});
		db.users.findOne({_id:user_id}, function (err, doc)
		{
			if( doc )
				set('currentUser', doc);
			controller.listUsers();
			webSocketPacket('currentUser',settings.currentUser);
			controller.listShots();
			controller.listRecords();
		});
	},
	setCurrentContest: function(contest_id)
	{
		set('currentContest',{});
		db.contests.findOne({_id:contest_id}, function (err, doc)
		{
			if( doc )
				set('currentContest',doc);
			controller.listContests();
			webSocketPacket('currentContest',settings.currentContest);
			controller.listShots();
			controller.listRecords();
		});
	},
	randomShot: function()
	{
		var shot = {created: new Date().getTime()};
		shot.x = Math.floor((Math.random() * 4000) - 2000);
		shot.y = Math.floor((Math.random() * 4000) - 2000);
		shot.divider = Math.round(Math.sqrt( shot.x*shot.x + shot.y*shot.y ),1);
		console.log("RANDOM SHOT");
		controller.saveShot(shot);
	},
	miss: function()
	{
		var shot = {created: new Date().getTime()};
		shot.x = 8000;
		shot.y = 8000;
		shot.divider = Math.round(Math.sqrt( shot.x*shot.x + shot.y*shot.y ),1);
		console.log("MISS");
		controller.saveShot(shot);
	},
	finishRecord: function()
	{
		db.records.current(function(record)
		{
			if( !record || record.shots.length == settings.shots_per_record )
				return;
			
			var now = new Date().getTime();
			while( record.shots.length < settings.shots_per_record )
				record.shots.push({created: now});
			db.records.update({_id:record._id},record,controller.listRecords);
		});
	},
	notifyRanking: function()
	{
		db.records.current(function(record)
		{
//			if( !record || record.shots.length < settings.shots_per_record )
//				return;
			
			var args = {stats:'records_best',contest:[settings.currentContest?settings.currentContest._id:'']};
			controller.getStats(args,'ranking');
		});
	},
	getStats: function(args,packetname)
	{
		if( !packetname )
			packetname = 'stats';
		if( !args.contest )
			return;
		var p = args.stats.split('_'), series = p[0], sort = p[1], 
			contests = (args.contest.length)?{$in:args.contest}:args.contest,
			userquery = {},
			packet = {contest:args.contest,series:series,sort:sort};
			
		if( args.gender )
		{
			userquery.gender = args.gender;
			packet.gender = args.gender;
		}
			
		db.users.find(userquery,function(err,users)
		{
			var usermap = {};
			users.forEach(function(u){ usermap[u._id] = u; });
			var uids = Object.keys(usermap), q = {contest_id:contests,user_id:{$in:uids}}
				sort_func = function(series,prop)
				{
					if( series == "shots" && prop == 'best' )
						return function(a,b){ return (a[prop] > b[prop])?1:-1; };
					return function(a,b){ return (a[prop] < b[prop])?1:-1; };
				},
				rankify = function(items,prop)
				{
					if( prop == 'best' ) prop += "_ring";
					var r = 0, last = false;
					items.forEach(function(item)
					{
						if( last === false || item[prop] != last )
							r++;
						last = item[prop];
						item.rank = r;
					});
				};
		
			if( series == 'shots' )
			{
				var res = {},distinct_shot = function(shot)
					{
						if( !res[shot.user_id] )
							res[shot.user_id] = {name: usermap[shot.user_id].name,sum:0,cnt:0};
						res[shot.user_id].sum += shot.ring;
						res[shot.user_id].cnt++;
						if( !res[shot.user_id].best || shot.divider < res[shot.user_id].best )
						{
							res[shot.user_id].best = shot.divider;
							res[shot.user_id].best_ring = shot.ring;
						}
					};
				db.shots.find(q).sort({divider:1}).exec(function(err,shots)
				{
					shots.forEach(distinct_shot);
					for(var uid in res)
						res[uid].avg = Math.round(res[uid].sum/res[uid].cnt*100)/100;
					var sorted = Object.keys(res).map(function(key){return res[key]});
					sorted.sort(sort_func(series,sort));
					rankify(sorted,sort);
					packet.items = sorted;
					webSocketPacket(packetname,packet);
				});
			}
			else
			{
				var res = {},distinct_record = function(rec)
					{
						if( !res[rec.user_id] )
							res[rec.user_id] = {name: usermap[rec.user_id].name,sum:0,cnt:0};
						
						var best = valency(rec);
						res[rec.user_id].sum += rec.total;
						res[rec.user_id].cnt++;
						if( !res[rec.user_id].best || best > res[rec.user_id].best )
						{
							res[rec.user_id].best = best;
							res[rec.user_id].best_ring = rec.total;
							res[rec.user_id].rings = rec.rings;
						}
					};
				db.records.find(q).exec(function(err,records)
				{
					if( !records )
						console.log(q,err);
					records.forEach(distinct_record);
					for(var uid in res)
						res[uid].avg = Math.round(res[uid].sum/res[uid].cnt*100)/100;

					var sorted = Object.keys(res).map(function(key){return res[key];});
					sorted.sort(sort_func(series,sort));
					rankify(sorted,sort);
					sorted.forEach(function(item){ item.best = item.rings; });
					packet.items = sorted;
					webSocketPacket(packetname,packet);
				});
			}
		});
	},
	getUserDetails: function(user_id)
	{
		db.users.findOne({_id:user_id}, function (err, user)
		{
			if( !user )
				return;
			
			db.records.find({user_id:user_id}).sort({created:-1}).exec(function(err,records)
			{
				user.records = records;
				webSocketPacket('userDetails',user);
			});
		});
	},
	identify: function(id)
	{
		webSocketPacket('identify',false,id);
	},
	saveDevice: function(device)
	{
		if( device['_id'] == '' )
			delete(device['_id']);
		device.webdotsight_id = ""+device.webdotsight_id;
		db.devices.findOne({webdotsight_id:device.webdotsight_id}, function (err, doc)
		{
			if( !doc )
				db.devices.insert(device,function(err,newdoc){ controller.setCurrentUser(newdoc._id); });
			else
			{
				for(var n in device)
					doc[n] = device[n];
				db.devices.update({_id:doc._id},doc);
				controller.listDevices();
				webSocketPacket('reload',false,device.webdotsight_id);
			}
		});
	}
};

function SerialChildProcess(port)
{
	var self = this;
	self.port = port;
	self.connected = false;
	self.proc = fork(__dirname+'/serial.js',[port]);

	self.proc.on('message', function(data)
	{
		if( data == 'CONNECTED')
		{
			controller.comstate(self.port,'connected');
			self.connected = true;
		}
		else if( data.divider )
		{
			console.log("["+self.port+"] SHOT");
			controller.saveShot(data);
		}
		else
			console.log("["+self.port+"] Message:",data);
	});
	self.proc.on('exit', function(code)
	{
		if( self.connected )
			controller.comstate(self.port,'disconnected');
		try{ delete(connections[self.port]); }catch(e){}
	});
};

function restartAllSearials()
{
	connections.forEach(function(con)
	{
		con.proc.kill();
	});
}
var listports = function()
{
	serialport.list(function (err, ports)
	{
		if( err )
			console.log("LIST ",err);
		if( ports.length == 0 )
			console.log("No serial ports found");
		ports.forEach(function(port)
		{
			if( connections[port.comName] )
				return;
			connections[port.comName] = new SerialChildProcess(port.comName);
		});
		setTimeout(listports,5000);
	});
};
listports();

var web = connect(), port = 8080;
web.use("/",function(req, res, next)
{
	if( !req.headers.cookie )
		req.webdotsight_id = false;
	else
	{
		var m = req.headers.cookie.match(/webdotsight_id=(\d+)/);
		req.webdotsight_id = m?m[1]:false;
	}
	next();
});
web.use("/initialize.me",function(req, res, next)
{
	if( req.webdotsight_id )
	{
		db.devices.findOne({webdotsight_id:req.webdotsight_id}, function (err, device)
		{
			var m = req.url.match(/browser=(.*)/);
			if( !device )
			{
				device = {
					webdotsight_id:req.webdotsight_id,
					browser: m?m[1]:'question',
					show_comstate:false,
					show_aim:true,
					show_shots:true,
					show_ranking:false
				};
				db.devices.insert(device);
			}
			else if( m && m[1] != device.browser )
			{
				device.browser = m?m[1]:'question';
				db.devices.update({_id:device._id},device);
			}
			
			var scripts = [];
			if( device.show_comstate )
				scripts.push("$('#hidecomstate').remove()");
			if( device.show_aim )
				scripts.push("$('#hideaim').remove()");
			if( device.show_shots )
				scripts.push("$('#hideshots').remove()");
			if( device.show_ranking )
				scripts.push("$('#hideranking').remove()");
			res.end("<script>"+scripts.join(';')+"</script>");
		});
	}
	else
		res.end("<script>location.reload();</script>");
});
web.use("/common",serveStatic(__dirname+'/common'));
web.use(serveStatic(__dirname+'/target'));
web.use("/admin",serveStatic(__dirname+'/admin'));
web.use("/admin/backup.zip",function(req, res, next)
{
	var archiver = require('archiver'),
		archive = archiver('zip', {zlib: { level: 9 }});
	archive.pipe(res);
	archive.glob('*.db');
	archive.finalize();
});
web.listen(port,'0.0.0.0', function()
{
    console.log('WebInterface: http://'+require('os').hostname()+':'+port);
});

webSocketServer = websocket.createServer(function(conn)
{
	if( !conn.headers.cookie )
		conn.webdotsight_id = false;
	else
	{
		var m = conn.headers.cookie.match(/webdotsight_id=(\d+)/);
		conn.webdotsight_id = m?m[1]:false;
	}	
	conn.on("text", function(raw)
	{
		var event = JSON.parse(raw);
		console.log("Received "+raw);
		
		if( typeof controller[event.cmd] === 'function' )
		{
			controller[event.cmd](event.data);
			return;
		}
		console.log("UNHANDLED");
	});
	conn.on('close', function(){ controller.listDevices(); });
	conn.on('error', function(e){ /* abnormal termination would crash complete web-dot-sight.js */ });
	
	controller.listDevices();
}).on("error", function(str)
{
	console.error("WebSocket Server error",str);
	process.exit();
}).listen(9876);
