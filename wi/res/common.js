
var currentUser = {}, currentContest = {}, currentShots = [], currentRecords = [],
	ws = websocket_create('ws://'+location.hostname+':9876');

function reconnect_websocket()
{
	$('.comstate').removeClass('yes').addClass('no');
	ws = websocket_create('ws://'+location.hostname+':9876');
}
	
function dividerToRing(divider)
{
	var r = 10 - (((divider / 10)-bullet_radius) / ring_width);
	if( r < 0 )
		return 0;
	if( r > 10 )
		return 10;
	return Math.floor(r);
}

function direction(shot)
{
	var sectors = ['rm','ru','mu','lu','lm','ld','md','rd','mm'],
		dir = Math.atan2(shot.y,shot.x),
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
	if( shot.divider/10 < bullet_radius/2 )
		dir = 8;
	return "dir "+sectors[dir];
}

function updateUserSelect(users)
{
	var $sel = $('#selUsers').empty();
	$('<option/>').attr('value','').text('(keiner)').appendTo($sel);
	for(var i in users)
		$('<option/>').attr('value',users[i]._id).text(users[i].name).appendTo($sel);
	
	if( currentUser._id )
		$sel.val(currentUser._id);
}

function updateContestSelect(contests)
{
	var $sel = $('#selContests').empty();
	$('<option/>').attr('value','').text('(freies Schießen)').appendTo($sel);
	for(var i in contests)
		$('<option/>').attr('value',contests[i]._id).text(contests[i].name).appendTo($sel);
	
	if( currentContest._id )
		$sel.val(currentContest._id);
}
