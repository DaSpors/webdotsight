
var currentUser = {}, currentContest = {}, currentShots = [], currentRecords = [], latestShot = false,
	ws = websocket_create('ws://'+location.hostname+':9876'),
	dlgUserDetails = false,
	dlgContestDetails = false;

function loadTemplate(name,cb)
{
	if( $.templates[name] )
		cb($.templates[name]);
	else
		$.get('tpl/'+name+'.html',function(tpl){ $.templates(name,tpl); if(cb) cb($.templates[name]); });
}

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
	var $sel = $('#selUsers').empty(), 
		none = $sel.data('none')||'(kein Schütze)';
	$('<option/>').attr('value','').text(none).appendTo($sel);
	for(var i in users)
		$('<option/>').attr('value',users[i]._id).text(users[i].name).appendTo($sel);
	
	if( !$sel.is('.chooser') && currentUser._id )
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

function userDetails(user)
{
	var show = function()
	{
		var title = user?"Schütze bearbeiten":"Neuer Schütze";
		if( !user )
			user = {name:'',gender:'',birth:'',city:'',_id:''};
		$('#tbUserName',dlgUserDetails).val(user.name);
		$('#selGender',dlgUserDetails).val(user.gender);
		$('#dpBirthdate',dlgUserDetails).val(user.birth);
		$('#tbOrt',dlgUserDetails).val(user.city);
		$('#userId',dlgUserDetails).val(user._id);
		dlgUserDetails.dialog('option',{title:title}).dialog('open');
	};
	if( dlgUserDetails )
		return show();
	
	loadTemplate('dlg_userdetails',function(tpl)
	{
		dlgUserDetails = $(tpl.render()).appendTo('body');
		$('#dpBirthdate',dlgUserDetails).datepicker({changeYear: true,changeMonth: true});
		$('input, textarea, select',dlgUserDetails).keypress(function(e)
		{
			if( e.keyCode == 13 )
				dlgUserDetails.closest('.ui-dialog').find('.ui-dialog-buttonpane button:first').click();
		});
		
		dlgUserDetails.dialog(
		{
			autoOpen:false,
			modal: true,
			buttons:
			{
				"Speichern": function()
				{
					var user =
					{
						name: $('#tbUserName',dlgUserDetails).val(),
						gender: $('#selGender',dlgUserDetails).val(),
						birth: $('#dpBirthdate',dlgUserDetails).val(),
						city: $('#tbOrt',dlgUserDetails).val(),
						_id:  $('#userId',dlgUserDetails).val()
					};
					ws.saveUser(user);
					$(this).dialog("close");
				},
				"Abbruch": function(){ $(this).dialog("close"); },
			}
		});
		show();
	});
}

function contestDetails(contest)
{
	var show = function()
	{
		var title = contest?"Wettkampf bearbeiten":"Neuer Wettkampf";
		if( !contest )
			contest = {name:'',_id:''};
		$('#tbContestName',dlgContestDetails).val(contest.name);
		$('#contestId',dlgContestDetails).val(contest._id);
		dlgContestDetails.dialog('option',{title:title}).dialog('open');
	};
	if( dlgContestDetails )
		return show();
	
	loadTemplate('dlg_contestdetails',function(tpl)
	{
		dlgContestDetails = $(tpl.render()).appendTo('body');
		$('#dpBirthdate',dlgContestDetails).datepicker({changeYear: true,changeMonth: true});
		$('input, textarea, select',dlgContestDetails).keypress(function(e)
		{
			if( e.keyCode == 13 )
				dlgContestDetails.closest('.ui-dialog').find('.ui-dialog-buttonpane button:first').click();
		});
		
		dlgContestDetails.dialog(
		{
			autoOpen:false,
			modal: true,
			buttons:
			{
				"Speichern": function()
				{
					var contest = { 
						name: $('#tbContestName',dlgContestDetails).val(),
						_id: $('#contestId',dlgContestDetails).val()
					};
					ws.saveContest(contest);
					$(this).dialog("close");
				},
				"Abbruch": function(){ $(this).dialog("close"); },
			}
		});
		show();
	});
}