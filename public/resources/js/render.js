var _canvas = $('canvas');
var canvas = _canvas[0];
var ctx = canvas.getContext('2d');
var boardThings = [];
var radius = 4;
var size = Math.round((_canvas.height() < _canvas.width()) ? _canvas.height() : _canvas.width());
var minX = Math.round((_canvas.width() - size) / 2);
var maxX = minX + size;
var minY = Math.round((_canvas.height() - size) / 2);
var maxY = minY + size;
var m = size / 100;
var game = undefined;
var pieces = [];
var drawnPieces = [];
var pieceTargets = [];
var players = {};
var teams = {};
var socket = io();

socket.emit('status');
socket.on('status', function(data){
	game = data;
	game.forEach(function(v){
		players[v.name] = v;
		pieces = pieces.concat(v.pieces);
		if(teams[v.team] === undefined) teams[v.team] = [];
		teams[v.team].push(v.name);
	});

	pieces.forEach(function(v, k){
		drawnPieces[k] = {
			color: players[v.player].color,
			player: v.player,
			index: v.index,
			finished: v.finished,
			x: board[v.pos].x,
			y: board[v.pos].y
		};
	});

	pieceTargets = drawnPieces.slice();
});

function readBoard(){
	var visited = [];
	var iterate = function(i){
		var t = board[i];
		visited.push(i);
		boardThings.push(['c', t.x, t.y]);
		t.connected.forEach(function(v){
			boardThings.push(['l', t.x, t.y, board[v].x, board[v].y]);
			if(visited.indexOf(v) === -1) iterate(v);
		});
	};
	iterate(0);
}

function drawBoard(){
	ctx.lineWidth = 5;
	ctx.strokeStyle = "#fff";
	boardThings.forEach(function(v){
		if(v[0] === 'c'){
			ctx.beginPath();
			ctx.arc(minX + v[1] * m, minY + v[2] * m, radius * m, 0, Math.PI * 2);
			ctx.stroke();
			ctx.closePath();
		}else{
			ctx.beginPath();
			ctx.moveTo(minX + v[1] * m, minY + v[2] * m);
			ctx.lineTo(minX + v[3] * m, minY + v[4] * m);
			ctx.stroke();
			ctx.closePath();
		}
	});
}

function render(){
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawBoard();
}

function renderPieces(){
	var tile = {};
	drawnPieces.forEach(function(v){
		if(!tile[v.x]) tile[v.x] = {};
		if(!tile[v.x][v.y]) tile[v.x][v.y] = [];
		tile[v.x][v.y].push(v.index + v.player);
	});

	drawnPieces.forEach(function(v){
		ctx.fillStyle = v.color;
		ctx.beginPath();
		if(tile[v.x][v.y].length <= 1){
			ctx.arc(minX + v.x * m, minY + v.y * m, radius * m, 0, Math.PI * 2);
		}else{
			var amount = 360 / tile[v.x][v.y].length;
			var start = (tile[v.x][v.y].indexOf(v.index + v.player) * amount);
			ctx.moveTo(minX + v.x * m, minY + v.y * m);
			ctx.arc(minX + v.x * m, minY + v.y * m, radius * m, start * Math.PI / 180, (start + amount) * Math.PI / 180);
		}
		ctx.fill();
		ctx.closePath();
	});
}

canvas.width = _canvas.width();
canvas.height = _canvas.height();
readBoard();
render();
