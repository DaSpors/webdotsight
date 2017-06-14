
function drawShots()
{
	drawAim();
	var op = [], len = Math.min(currentShots.length,10);
	for(var i = 0, opacity=1; i<len; i++, opacity-=0.1)
		op.push(opacity);
	for(var i = len-1; i>=0; i--)
		drawShot(currentShots[i],op[i],true);
}
