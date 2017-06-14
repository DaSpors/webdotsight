
function websocket_create(url)
{
	ws = new WebSocket(url);
	ws.callbacks = {};
	ws.onopen = function(event)
	{
		this.initialize();
	};
	ws.onclose = function(event)
	{
		if( event.wasClean )
			return;
		setTimeout(reconnect_websocket,1000);
	};
	ws.onmessage = function(raw)
	{
		var event = JSON.parse(raw.data);
		console.log("TYPE",event.type,"DATA",event.data);
		
		if( typeof ws.callbacks[event.type] == 'function' )
		{
			ws.callbacks[event.type](event.data);
			delete(ws.callbacks[event.type]);
			return;
		}
		
		switch( event.type )
		{
			case 'comstate':
				// todo: handle multiple COM devices
				if( event.data.state == 'connected' )
					$('.comstate').removeClass('no').addClass('yes');
				else
					$('.comstate').removeClass('yes').addClass('no');
				break;
			case 'shots':
				latestShot = event.data.latestShot;
				currentShots = event.data.shots;
				drawShots();
				break;
			case 'records':
				currentRecords = event.data;
				updateShotListing();
				drawShots();
				break;
			case 'stats':
				drawStats(event.data);
				break;
			case 'users':
				updateUserSelect(event.data);
				break;
			case 'contests':
				updateContestSelect(event.data);
				break;
			case 'currentContest':
				currentContest = event.data;
				$('#selContests').val(currentContest._id);
				drawShots();
				break;
			case 'currentUser':
				currentUser = event.data;
				if( !$('#selUsers').is('.chooser') )
					$('#selUsers').val(currentUser._id);
				$('#selUserNotes').empty().text(currentUser.notes);
				drawShots();
				break;
			case 'ranking':
				currentRanking = event.data.items;
				drawRanking(event.data);
				drawShots();
				break;
		}
	};
	ws.request = function(cmd, data)
	{
		ws.send(JSON.stringify({cmd:cmd,data:data}));
	};
	ws.initialize = function()
	{
		ws.request('initialize', new Date());
	};
	ws.randomShot = function()
	{
		ws.request('randomShot');
	};
	ws.miss = function()
	{
		ws.request('miss');
	};
	ws.listUsers = function()
	{
		ws.request('listUsers');
	};
	ws.listContests = function()
	{
		ws.request('listContests');
	};
	ws.listShots = function()
	{
		ws.request('listShots');
	};
	ws.saveUser = function(user)
	{
		ws.request('saveUser',user);
	};
	ws.saveContest = function(contest)
	{
		ws.request('saveContest',contest);
	};
	ws.setCurrentUser = function(user)
	{
		ws.request('setCurrentUser',user);
	};
	ws.setCurrentContest = function(contest)
	{
		ws.request('setCurrentContest',contest);
	};
	ws.removeShot = function(id)
	{
		ws.request('removeShot',id);
	};
	ws.finishRecord = function()
	{
		ws.request('finishRecord');
	};
	ws.getStats = function(args)
	{
		ws.request('getStats',args);
	};
	ws.getUserDetails = function(id,cb)
	{
		ws.callbacks['userDetails'] = cb;
		ws.request('getUserDetails',id);
	};
	return ws;
}