
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
	var s1 = rec.shots[0].ring, 
		s2 = rec.shots[1].ring, 
		s3 = rec.shots[2].ring, 
		avg = Math.round((rec.shots[0].divider + rec.shots[1].divider + rec.shots[2].divider) / 3),
		d = 10000-avg,
		val = padNum((1000*(s1+s2+s3))+(s3-s1),5); // currently without trend
	rec.total = s1+s2+s3;
	rec.trend = s3-s1;
	rec.avg_divider = avg;
	rec.rings = [s1,s2,s3].join(",");
	return val+"."+padNum(s3)+padNum(s2)+padNum(s1)+"."+padNum(d,5);
}
	
db = {};
db.shots_per_record = 3;
db.bullet_radius = 22.5,
db.ring_width = 25;
db.sectors = ['rm','ru','mu','lu','lm','ld','md','rd','mm'];
db.currentUser = {};
db.currentContest = {};
db.contests = new Datastore({filename: 'contests.db', autoload: true});
db.users = new Datastore({filename: 'users.db', autoload: true});
db.shots = new Datastore({filename: 'shots.db', autoload: true});
db.records = new Datastore({filename: 'records.db', autoload: true});
db.records.current = function(cb)
{
	var q = 
	{
		user_id: db.currentUser._id?db.currentUser._id:{$exists:false},
		contest_id: db.currentContest._id?db.currentContest._id:{$exists:false}
	};
	db.records.findOne(q).sort({created:-1}).limit(1).exec(function(err,record)
	{
		if( record )
		{
			var now = new Date();
			if( now.toLocaleDateString() != new Date(record.created).toLocaleDateString() )
			{
				if( record.shots.length < db.shots_per_record )
				{
					now = now.getTime();
					while( record.shots.length < db.shots_per_record )
						record.shots.push({created: now});
					db.records.update({_id:record._id},record,function(e,o){ cb(false); });
					return;
				}
			}
		}
		cb(record);
	});
};

var packets = [], webSocketPacket = function(type, data)
{
	var raw = 
	{
		index: packets.length,
		ready: false,
		type: type,
		json: "",
		data: function(d){ this.json = JSON.stringify({type:this.type,data:d}); return this; },
		send: function()
		{
			this.ready = true;
			if( this.index > 0 )
				return;

			var me = packets.shift();
			webSocketServer.connections.forEach(function(conn){ conn.send(me.json); });
			while( packets.length > 0 && packets[0].ready )
			{
				var p = packets.shift();
				webSocketServer.connections.forEach(function(conn){ conn.send(p.json); });
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
	initialize: function()
	{
		controller.listContests();
		controller.listUsers();
		controller.listShots();
		controller.listRecords();
		webSocketPacket('currentUser',db.currentUser);
		webSocketPacket('currentContest',db.currentContest);
		
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
			user_id: db.currentUser._id?db.currentUser._id:{$exists:false},
			contest_id: db.currentContest._id?db.currentContest._id:{$exists:false}
		};
		var packet = webSocketPacket('shots');
		db.shots.find(q).sort({created:-1}).limit(10).exec(function(err,shots)
		{
			packet.data(shots).send();
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
			user_id: db.currentUser._id?db.currentUser._id:{$exists:false},
			contest_id: db.currentContest._id?db.currentContest._id:{$exists:false}
		};
		var packet = webSocketPacket('records');
		db.records.find(q).sort({created:-1}).limit(1000).exec(function(err,records)
		{
			packet.data(records).send();
		});
	},
	saveUser: function(user)
	{
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
		db.contests.findOne({_id:contest._id}, function (err, doc)
		{
			if( !doc )
				db.contests.insert(contest,function(err,newdoc){ controller.setCurrentContest(newdoc._id); });
			else
			{
				db.contests.update(doc,contest);
				controller.setCurrentContest(contest._id);
			}
		});
	},
	saveShot: function(shot)
	{
		if( !shot.created )
			shot.created = new Date().getTime();
		if( db.currentUser._id )
			shot.user_id = db.currentUser._id;
		if( db.currentContest._id )
			shot.contest_id = db.currentContest._id;
		
		// divider to ring
		shot.ring = 10 - (((shot.divider / 10)-db.bullet_radius) / db.ring_width);
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
		if( shot.divider/10 < db.bullet_radius/2 )
			dir = 8;
		shot.dir = db.sectors[dir];
		
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
			if( !record || record.shots.length == db.shots_per_record )
			{
				record = {created:new Date().getTime(),shots:[shot]};
				if( db.currentUser._id )
					record.user_id = db.currentUser._id;
				if( db.currentContest._id )
					record.contest_id = db.currentContest._id;
				
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
		db.currentUser = {};
		db.users.findOne({_id:user_id}, function (err, doc)
		{
			if( doc )
				db.currentUser = doc;
			controller.listUsers();
			webSocketPacket('currentUser',db.currentUser);
			controller.listShots();
			controller.listRecords();
		});
	},
	setCurrentContest: function(contest_id)
	{
		db.currentContest = {};
		db.contests.findOne({_id:contest_id}, function (err, doc)
		{
			if( doc )
				db.currentContest = doc;
			controller.listContests();
			webSocketPacket('currentContest',db.currentContest);
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
			if( !record || record.shots.length == db.shots_per_record )
				return;
			
			var now = new Date().getTime();
			while( record.shots.length < db.shots_per_record )
				record.shots.push({created: now});
			db.records.update({_id:record._id},record,controller.listRecords);
		});
	},
	getStats: function(args)
	{
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
						return function(a,b){ return a[prop] > b[prop]; };
					return function(a,b){ return a[prop] < b[prop]; };
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
					webSocketPacket('stats',packet);
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
					records.forEach(distinct_record);
					for(var uid in res)
						res[uid].avg = Math.round(res[uid].sum/res[uid].cnt*100)/100;

					var sorted = Object.keys(res).map(function(key){return res[key];});
					sorted.sort(sort_func(series,sort));
					rankify(sorted,sort);
					sorted.forEach(function(item){ item.best = item.rings; });
					packet.items = sorted;
					webSocketPacket('stats',packet);
				});
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

connect().use(serveStatic(__dirname+'/wi')).listen(88,'0.0.0.0', function()
{
    console.log('WebInterface: http://'+require('os').hostname()+':88/');
});

webSocketServer = websocket.createServer(function(conn)
{
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
}).on("error", function(str)
{
	console.error(str);
	process.exit();
}).listen(9876);
