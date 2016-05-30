
function drawAim()
{
	
}

function drawShot(shot,opacity)
{
	
}

function updateShotListing(highlight)
{
	
}

function drawShots()
{
	updateListing();
}

function drawStats(args)
{
	var tpl = $.templates("#tplStatsTable"), tags = [];
	
	for(var i in args.contest)
		tags.push($('option[value="'+args.contest[i]+'"]').html());
	
	args.title = $('option[value="'+args.series+'_'+args.sort+'"]').html();
	
	if( args.gender )
		args.title += " ("+ (args.gender=='f'?'Mächen':'Jungs') +")";
	args.tagline = tags.join(", ");	
	$('#statContainer').empty().append(tpl.render(args,{toFixed:function(val){ return val.toFixed(2); }}));
}