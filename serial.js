
var SerialPort = require("serialport"), com = new DisagRedDot(process.argv[2]);
	
function DisagRedDot(port)
{
	var self = this;
	
	self.port = port;
	self.disposeAt = new Date().getTime()+10000;
	self.disposed = false;
	self.connected = false;
	self.received = [];
	self.rePacket = /\[02\]00000000\[0D\]00000000\[0D\]LG\[0D\]01\[0D\]1\.0\[0D\]01\[0D\]09\.9\[0D\]([\d\.]+)\[0D\]([\d\+]+)\[0D\]([\d\+]+)\[0D\]\[17\]/;
	self.rePacket = /\[02\](.*)\[17\]/;
	self.parser = function(emitter, buffer)
	{
		for(var i=0; i<buffer.length; i++)
			self.received[self.received.length] = buffer[i];
		if( self.received.length < 1 )
			return;
		self.pong();
		if( self.received[0] != 0x02 )
		{
			var i = self.received.indexOf(0x02);
			self.received.splice(0,i);
		}
		while( self.received.length > 56 && !self.disposed )
		{
			var packet = self.received.slice(0,57);
			self.received.splice(0,57);
			
			if( packet[packet.length-1] != 0x17 )
				continue;
		
			var str = new Buffer(packet).toString("ascii").replace(/\x02/gi,"[02]").replace(/\x0D/gi,"[0D]").replace(/\x17/gi,"[17]");
			var m = self.rePacket.exec(str);
			if( !m )
				continue;
			var parts = m[1].split('[0D]');
			var data = {created: new Date().getTime(), divider: parseFloat(parts[7]), x: parseInt(parts[8]), y:parseInt(parts[9])};
			emitter.emit('data',data);
		}
	};
	self.resetPing = function()
	{
		clearTimeout(self.pinger);
		if( !process.connected )
			return self.dispose("parent process died");
		self.pinger = setTimeout(self.request,1000);
	};
	self.pong = function()
	{
		if( !self.connected )
		{
			self.connected = true;
			process.send("CONNECTED");
		}
		self.disposeAt = new Date().getTime()+5000;
	};
	self.write = function(bytes)
	{
		self.com.write(bytes,function (err)
		{
			if( err )
				process.send("req "+err);
			else
				self.com.drain(function (de) { if(de) process.send("drain "+err); });
		});

	};
	self.request = function()
	{
		if( self.disposed )
			return;
		if( new Date().getTime() > self.disposeAt )
			return self.dispose("timeout");
		self.resetPing();
		self.write([0x05]);
	};
	self.ack = function()
	{
		if( self.disposed )
			return;
		self.resetPing();
		self.write([0x06]);
	};
	self.dispose = function(err)
	{
		if( self.disposed )
			return;
		clearTimeout(self.pinger);
		self.disposed = true;
		try{ if( self.com.isOpen() ) self.com.close(); }catch(e){}
		if( err != 'timeout' )
			process.send("dispose "+err);
	};
	self.com = new SerialPort(port,{baudrate: 9600, parser: self.parser},function(err)
	{
		if( err )
		{
			process.send("construct "+err);
			process.exit();
			return;
		}
		self.resetPing();
	});
	self.com.on('error',self.dispose);
	self.com.on('disconnect',self.dispose);
	self.com.on('data',function(shot)
	{
		process.send(shot);
		self.ack();
	});
};
