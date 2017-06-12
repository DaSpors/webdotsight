Setup
=====
baud=9600
wordlength=8
stopbits=1
parity=none

control flow
============
simple: when [05] is sent the reddot responds with the latest shot. It will always be the same
shot until you send an ack [06]. Then the next [05] will be responded with the next shot, if any present.
If not shot present [15] is responded. You can send [05] in 250ms intervals without problems, but we use 500ms 
which is fast enough.

datagram
=========
this is a sample datagram (HEX in []):     
```
[02]00000000[0D]00000000[0D]LG[0D]01[0D]1.0[0D]01[0D]00.0[0D]3556.0[0D]+2613[0D]+2412[0D][17]
header------------------------------------------------------|value----------------------|footer
```

header
------
The header is not always 100% the same but for our use-case it's not important. We ignore it completely.      
```
[02]00000000[0D]00000000[0D]
LG[0D]
01[0D]
1.0[0D]
01[0D]
00.0[0D]
```

value
-----
this is a sample of a shot in the top-right of the aim:     
```
3556.0[0D]  # x / 10 = divider (in 10th of mm from the aim center)
+2613[0D]   # x / 10 = x-coord
+2412[0D]   # x / 10 = y-coord
```
Note that the divider could also e calculated fro the coords like this: divider²=x²+y²

sample of a top left shot
```
3120.0[0D]
-2346[0D]
+2057[0D]
```

sample of a bottom left shot
```
3841.0[0D]
-2268[0D]
-3100[0D]
```

sample of a bottom right shot
```
3779.3[0D]
+3604[0D]
-1138[0D]
```

footer
------
Footer in fact contains some more bytes, but we only need the [17] to terminate our datagram.
```
[17]
```
