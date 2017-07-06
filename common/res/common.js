
var bullet_radius = 22.5,
	ring_width = 25,
	currentUser = {}, currentContest = {}, currentShots = [], currentRecords = [], latestShot = false, currentUsers = [], currentRanking = [], knownDevices = [],
	ws = false,
	dlgUserDetails = false,
	dlgContestDetails = false;

$(function()
{
	$(window).resize(function()
	{
		var $aim = $('#aim');
		if( $aim.length == 0 )
			return;
		// first set width to max 700px
		var w = $(document).width();
		w = Math.max(Math.min(w,700),460);
		var h = $aim.attr('width',w).attr('height',w).height();

		// then check if that's too tall and use height instead
		// (see https://andylangton.co.uk/blog/development/get-viewportwindow-size-width-and-height-javascript)
		var w=window,d=document,e=d.documentElement,g=d.getElementsByTagName('body')[0],x=w.innerWidth||e.clientWidth||g.clientWidth,y=w.innerHeight||e.clientHeight||g.clientHeight;
		y -= 20; // substract margin
		if( h > y )
			$aim.attr('width',y).attr('height',y);
		drawShots();
	});
	
	$(document).on('click','[data-shot]',function(e)
	{
		drawShots();
		drawShot($(this).data('shot'),1);
	});
	
	$('button, input[type="button"]').button();
	
	if( !Cookies.get('webdotsight_id') )
	{
		var client = new ClientJS();
		var wdsid = client.getFingerprint();
		Cookies.set('webdotsight_id',wdsid);
	}
	
	ws = websocket_create('ws://'+location.hostname+':9876');
	
	$.get('/initialize.me',{browser:detectBrowser()},function(d){ $('body').append(d); });
});

function detectBrowser()
{
	//see https://stackoverflow.com/a/38373427
	var isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
		// Firefox 1.0+
	var isFirefox = typeof InstallTrigger !== 'undefined';
		// At least Safari 3+: "[object HTMLElementConstructor]"
	var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
		// Internet Explorer 6-11
	var isIE = /*@cc_on!@*/false || !!document.documentMode;
		// Edge 20+
	var isEdge = !isIE && !!window.StyleMedia;
		// Chrome 1+
	var isChrome = !!window.chrome && !!window.chrome.webstore;
		// Blink engine detection
	var isBlink = (isChrome || isOpera) && !!window.CSS;
	
	var res =
	{
		opera: isOpera, firefox: isFirefox, safari: isSafari,
		'internet-explorer': isIE, edge: isEdge, chrome: isChrome, question: isBlink
	};
	for(var i in res)
		if(res[i])
			return i;
	return '';
}
	
function loadTemplate(name,cb)
{
	if( $.templates[name] )
		cb($.templates[name]);
	else
		$.get('/common/tpl/'+name+'.html',function(tpl){ $.templates(name,tpl); if(cb) cb($.templates[name]); });
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

function drawAim()
{
	var $aim = $('#aim');
	if( $aim.length == 0 )
		return;
	var canvas = $aim.get(0), 
		context = canvas.getContext('2d'),
		centerX = canvas.width / 2,
		centerY = canvas.height / 2;
	
	context.clearRect(0,0,canvas.width,canvas.height);
	context.font = '12px Courier';
	for(var r=9; r>=0; r--)
	{
		var radius = Math.max(r * ring_width,1);
		context.beginPath();
		context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
		context.fillStyle = (r>6)?'white':'black';
		context.fill();
		context.lineWidth = 1;
		context.strokeStyle = (r>6)?'#000000':'#FFFFFF';
		context.stroke();
		if( r > 1 )
		{
			context.fillStyle = (r>6)?'black':'white';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText(10-r, centerX - radius + (ring_width/2), centerY);
			context.fillText(10-r, centerX + radius - (ring_width/2), centerY);
		}
	}
	
	context.font = 'bold 18px Courier';
	context.fillStyle = '#909090';
	context.textAlign = 'left';
	context.textBaseline = 'alphabetic';
	
	if( currentContest && currentContest.name )
		context.fillText(currentContest.name, 20, 25);
	
	context.textAlign = 'right';
	if( currentUser && currentUser.name )
		context.fillText(currentUser.name, canvas.width-20, 25);
	
	if( currentContest && currentUser && currentRanking && currentRanking.length>0 )
	{
		for( var i in currentRanking )
		{
			var u = currentRanking[i];
			if( u.name == currentUser.name )
			{
				context.fillText("Platz "+u.rank, canvas.width-20, 50);
				break;
			}
		}
	}
}

function drawShot(shot,opacity,fromList)
{
	var shade = function(color, percent)
	{
		var f=parseInt(color.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
		return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
	}
		
	var $aim = $('#aim');
	if( $aim.length == 0 )
		return;
	var canvas = $aim.get(0), 
		context = canvas.getContext('2d'),
		centerX = canvas.width / 2,
		centerY = canvas.height / 2
		x = shot.x / 10, y = shot.y / 10,
		result = dividerToRing(shot.divider),
		shotBaseColor = fromList?'#F0F0F0':'#8080F0',
		color = opacity<1?shotBaseColor:((latestShot && latestShot.created == shot.created)?(result==10?'#FF0000':'#219421'):shotBaseColor),
		bordercolor = shade(color,-0.2),
		textcolor = shade(color,-0.4);
	
	context.globalAlpha = opacity;
	
	context.beginPath();
	context.arc(centerX+x, centerY-y, bullet_radius, 0, 2 * Math.PI, false);
	context.fillStyle = color;
	context.fill();
	context.lineWidth = 1;
	context.strokeStyle = bordercolor;
	context.stroke();
	
	context.font = 'bold 24px Courier';
	context.fillStyle = textcolor;
	context.textAlign = 'center';
	context.textBaseline = 'alphabetic';
	context.fillText(result, centerX+x+1, centerY-y+8);
	
	context.globalAlpha = 1;	
}

function drawStats(args)
{
	if( $('#statContainer').length == 0 )
		return;
	loadTemplate('list_stats',function(tpl)
	{
		var tags = [];
		
		for(var i in args.contest)
			tags.push($('option[value="'+args.contest[i]+'"]').html());
		
		args.title = $('option[value="'+args.series+'_'+args.sort+'"]').html();
		
		if( args.gender )
			args.title += " ("+ (args.gender=='f'?'Mächen':'Jungs') +")";
		args.tagline = tags.join(", ");	
		$('#statContainer').empty().append(tpl.render(args,{toFixed:function(val){ return (val||0).toFixed(2); }}));
	});
}

function drawRanking(args)
{
	if( $('#rankingContainer').length == 0 )
		return;
	loadTemplate('list_ranking',function(tpl)
	{
		var tmp = [];
		for(var i=0; i<args.items.length; i++ )
		{
			if( args.items[i].rank > 10 )
				break;
			tmp.push(args.items[i]);
		}
		args.items = tmp;
		args.title = "Top 10 '"+(currentContest.name||'(freies Schießen)')+"'";
		$('#rankingContainer').empty().append(tpl.render(args));
	});
}

function drawUsers(mode,male,female)
{
	if( $('#statContainer').length == 0 )
		return;
	loadTemplate('list_users',function(tpl)
	{
		var args = {}, tags = [];
		if( male ) tags.push("Jungs");
		if( female ) tags.push("Mädchen");
		tags.push($('option[value="'+mode+'"]').html());
		
		args.title = "Schützenliste";
		args.tagline = tags.join(" ");	
		args.items = [];
		
		var cloneUser = function(root)
		{
			var res = JSON.parse(JSON.stringify(root));
			if( res.birth )
			{
				var birthday = new Date(res.birth.replace(/(\d\d).(\d\d).(\d\d\d\d)/,'$3-$2-$1'));
				var ageDifMs = Date.now() - birthday.getTime();
				var ageDate = new Date(ageDifMs); // miliseconds from epoch
				res.age = Math.abs(ageDate.getUTCFullYear() - 1970);
			}
			else 
				res.age = '';
			return res;
		};
		
		
		for( var i in currentUsers )
		{
			if( !currentUsers[i].gender )
				args.items.push(cloneUser(currentUsers[i]));
			else if( male && currentUsers[i].gender =='m' )
				args.items.push(cloneUser(currentUsers[i]));
			else if( female && currentUsers[i].gender =='f' )
				args.items.push(cloneUser(currentUsers[i]));
		}
		if( mode != 'name' )
			args.items.sort(function(a,b){ return a.age < b.age; });
		
		$('#statContainer').empty().append(tpl.render(args));
	});
}

function dateToString(dateobj)
{
	function pad(n) {return n < 10 ? "0"+n : n;}
	return pad(dateobj.getDate())+"."+pad(dateobj.getMonth()+1)+"."+dateobj.getFullYear();
}

function updateShotListing(highlight)
{
	$('.shots').remove();
	if( $('#aim').length == 0 )
		return;
	loadTemplate('list_dayshots',function(tpl)
	{
		var data = {};//, tpl = $.templates("#tplShotsTable");
		for(var i=0; i<currentRecords.length; i++)
		{
			var c = new Date(currentRecords[i].created), 
				date = dateToString(c);
			if( !data[date] )
				data[date] = {date:date,records:[],cnts:0,sum:0};
			
			var rec = {res0:'', res1:'',res2:'',dir0:'', dir1:'',dir2:'',total:0};
			for(var j=0; j<currentRecords[i].shots.length; j++)
			{
				if( !currentRecords[i].shots[j].divider )
				{
					rec['shot'+j] = '';
					rec['res'+j] = '';
					rec['dir'+j] = 'dir skip';
				}
				else if( currentRecords[i].shots[j].divider == 11314 ) 
				{
					rec['shot'+j] = JSON.stringify(currentRecords[i].shots[j]);
					rec['res'+j] = '';
					rec['dir'+j] = 'dir miss';
					data[date].cnts++;
				}
				else
				{
					var ring = dividerToRing(currentRecords[i].shots[j].divider);
					rec['shot'+j] = JSON.stringify(currentRecords[i].shots[j]);
					rec['res'+j] = ring;
					rec['dir'+j] = direction(currentRecords[i].shots[j]);
					rec.total += ring;
					data[date].sum += ring;
					data[date].cnts++;
				}
			}
			data[date].records.push(rec);		
			data[date].cntr = data[date].records.length;
			data[date].avgs = Math.round(data[date].sum / data[date].cnts);
			data[date].avgr = Math.round(data[date].sum / data[date].cntr);
		}
		var $last = $('#aim');
		for( var d in data )
			$last = $last.after(tpl.render(data[d])).next();
		if( highlight )
			$('td:empty:first','.shots:first').prev().effect('highlight',1000);
	});
}

function updateUserSelect(users)
{
	currentUsers = users;
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
			user = {name:'',gender:'',birth:'',city:'',notes:'',_id:''};
		$('#tbUserName',dlgUserDetails).val(user.name);
		$('#selGender',dlgUserDetails).val(user.gender);
		$('#dpBirthdate',dlgUserDetails).val(user.birth);
		$('#tbOrt',dlgUserDetails).val(user.city);
		$('#taNotes',dlgUserDetails).val(user.notes);
		$('#userId',dlgUserDetails).val(user._id);
		dlgUserDetails.dialog('option',{title:title,width:400}).dialog('open');
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
						notes: $('#taNotes',dlgUserDetails).val(),
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
			contest = {name:'',_id:'',date:''};
		$('#tbContestName',dlgContestDetails).val(contest.name);
		$('#dpDate',dlgContestDetails).val(contest.date||'');
		$('#contestId',dlgContestDetails).val(contest._id);
		dlgContestDetails.dialog('option',{title:title,width:400}).dialog('open');
	};
	if( dlgContestDetails )
		return show();
	
	loadTemplate('dlg_contestdetails',function(tpl)
	{
		dlgContestDetails = $(tpl.render()).appendTo('body');
		$('#dpDate',dlgContestDetails).datepicker();
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
						date: $('#dpDate',dlgContestDetails).val(),
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