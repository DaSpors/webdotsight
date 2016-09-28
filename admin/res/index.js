
function drawAim()
{
	var $aim = $('#aim'), 
		canvas = $aim.get(0), 
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
}

function drawShot(shot,opacity,fromList)
{
	var shade = function(color, percent)
	{
		var f=parseInt(color.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
		return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
	}
		
	var $aim = $('#aim'), 
		canvas = $aim.get(0), 
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

function drawShots()
{
	drawAim();
	var op = [], len = Math.min(currentShots.length,10);
	for(var i = 0, opacity=1; i<len; i++, opacity-=0.1)
		op.push(opacity);
	for(var i = len-1; i>=0; i--)
		drawShot(currentShots[i],op[i],true);
}

function drawStats()
{
	
}

function updateShotListing(highlight)
{
	$('.shots').remove();
	loadTemplate('list_dayshots',function(tpl)
	{
		var data = {};//, tpl = $.templates("#tplShotsTable");
		for(var i=0; i<currentRecords.length; i++)
		{
			var c = new Date(currentRecords[i].created), 
				date = c.toLocaleDateString('de-DE');
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
