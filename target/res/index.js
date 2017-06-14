
function drawShots()
{
	drawAim();
	if( currentRecords.length == 0 )
		return;
	
	var shots = currentRecords[0].shots,
		max_len = 3;
	
	var op = 1, len = Math.min(shots.length,max_len);
	for(var i = len-1; i>=0; i--,op-=0.1)
		drawShot(shots[i],op,true);
}

