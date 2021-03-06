'use strict';

/*
16←15←14←13←12←６
↓↘　　　　　　　↙↑
21　17　　　　　７　５
↓　　↘　　　↙　　↑
22　　　18　８　　　４
↓　　　　９　　　　↑
23　　　10　19　　　３
↓　　↙　　　↘　　↑
24　11　　　　　20　２
↓↙　　　　　　　↘↑
25→26→27→28→29→１
　　　　　　　　　　↑
　　　　　　　　　　０
┏─┐
│ｘ│
│ｘ│
│ｘ│
└─┘
: back

┏─┐
│　│
│　│
│　│
└─┘
: front
*/

var Fiber = require('fibers');
var sleep = require('./fiber-sleep');

class Tile{
	constructor(id, back, connect, pass){
		this.id = id;
		this.connect = connect;
		this.pass = pass || connect;
		this.back = back;
	}

	getConnected(from){
		return this.connect;
	}

	getPass(from){
		return this.pass;
	}

	getId(){
		return this.id;
	}

	getBack(){
		return this.back;
	}
}

class CenterTile extends Tile{
	constructor(){
		super(7);
	}

	getPass(from){
		if(from.getId() === 8) return 10;
		return 20;
	}

	getConnected(from){
		if(from.getId() === 8) return 20;
		return 10;
	}

	getBack(from){
		if(from === 18 || from === 8) return from;
		if(from === 20) return 18;
		if(from === 10) return 8;
	}
}

class Player{
	constructor(name, teamIndex, color){
		this.name = name;
		this.color = color;
		this.teamIndex = teamIndex;
		this.pieces = [new Piece(this, 0), new Piece(this, 1)];
		this.socket = undefined;
		this.yutStatus = undefined;
		this.selectedPiece = undefined;
		this.lastMovement = 0;
	}

	getAvailablePieces(){
		return this.pieces.filter((v) => !v.finished);
	}
}

class Piece{
	constructor(player, pieceIndex){
		this.pos = 0;
		this.player = player;
		this.finished = false;
		this.pieceIndex = pieceIndex;
		this.movementStack = [0];
	}
}
var colors = {
	0: "#f44336",
	1: "#ffc107",
	2: "#009688",
	3: "#03a9f4"
};

class Game{
	constructor(){
		this.map = {};
		this.map[0] = new Tile(0, 0, 1); //시작부터 뒷도일 경우 출발하지 않음
		this.map[1] = new Tile(1, 0, 2);
		this.map[2] = new Tile(2, 1, 3);
		this.map[3] = new Tile(3, 2, 4);
		this.map[4] = new Tile(4, 3, 5);
		this.map[5] = new Tile(5, 4, 6);
		this.map[6] = new Tile(6, 5, 7, 12);
		this.map[7] = new Tile(7, 6, 8);
		this.map[8] = new Tile(8, 7, 9);
		this.map[9] = new CenterTile();
		this.map[10] = new Tile(10, 9, 11);
		this.map[11] = new Tile(11, 10, 26);
		this.map[12] = new Tile(12, 6, 13);
		this.map[13] = new Tile(13, 12, 14);
		this.map[14] = new Tile(14, 13, 15);
		this.map[15] = new Tile(15, 14, 16);
		this.map[16] = new Tile(16, 15, 17, 22);
		this.map[17] = new Tile(17, 16, 18);
		this.map[18] = new Tile(18, 17, 9);
		this.map[19] = new Tile(19, 9, 20);
		this.map[20] = new Tile(20, 19, 1);
		this.map[21] = new Tile(21, 16, 22);
		this.map[22] = new Tile(22, 21, 23);
		this.map[23] = new Tile(23, 22, 24);
		this.map[24] = new Tile(24, 23, 25);
		this.map[25] = new Tile(25, 24, 26);
		this.map[26] = new Tile(26, 25, 27);
		this.map[27] = new Tile(27, 26, 28);
		this.map[28] = new Tile(28, 27, 29);
		this.map[29] = new Tile(29, 28, 1);

		var registeredPlayers = Object.keys(config.registered);

		this.players = {};
		for(var i = 0; i < 4; i++){
			var playerName = registeredPlayers.shift();
			this.players[playerName] = new Player(playerName, i % 2, colors[i]);
		}
		this.turn = 0;
		this.gameLog = ["NEW GAME!"];
		this.teamLog = {
			0: [],
			1: []
		};
		this.sockets = {};
		this.status = 'wait-for-player';
		this.processTurn();
	}

	attachPlayerAndSocket(playerName, socket){
		this.players[playerName].socket = socket;
		if(this.status === 'wait-for-player') return;
		if(typeof this.status === 'string') socket.emit(this.status);
		else{
			if(this.status.name !== undefined && this.status.name !== playerName) return;
			socket.emit(this.status.content, this.status.data);
		}
	}

	detachPlayerAndSocket(playerName, socket){
		this.players[playerName].socket = undefined;
	}

	addSocket(socket){
		var id = Object.keys(this.sockets).length;
		this.sockets[id] = socket;
		return id;
	}

	removeSocket(id){
		this.sockets[id] = undefined;
	}

	getPieceInTile(piecePosition){
		return Object.keys(this.players).map((v) => this.players[v].pieces).map((v) => {
			return v.filter((v) => {
				return !v.finished && v.pos === piecePosition;
			});
		}).reduce((prev, curr) => {
			return prev.concat(curr);
		}, []);
	}

	broadcastPacket(...args){
		this.broadcastPacketToObservers(...args);
		this.broadcastPacketToPlayers(...args);
	}

	broadcastPacketToObservers(...args){
		Object.keys(this.sockets).forEach((k) => {
			if(this.sockets[k] !== undefined) this.sockets[k].emit(...args);
		});
	}

	broadcastPacketToPlayers(...args){
		Object.keys(this.players).forEach((k) => {
			if(this.players[k].socket !== undefined) this.players[k].socket.emit(...args);
		});
	}

	chatToTeam(playerName, data){
		var player = this.players[playerName];
		data = playerName + ': ' + data;
		if(player === undefined) return;
		var p2 = this.getAnotherTeamPlayer(player);
		if(p2.socket !== undefined) p2.socket.emit('chat team', data);
		if(player.socket !== undefined) player.socket.emit('chat team', data);
		this.teamLog[player.teamIndex].push(data);
	}

	chatToAll(username, data){
		data = username + ': ' + data;
		this.broadcastPacket('chat all', data);
		this.gameLog.push(data);
	}

	allAttached(){
		return Object.keys(this.players).every((k) => {
			return this.players[k].socket !== undefined;
		});
	}

	allThrowed(){
		return Object.keys(this.players).every((k) => {
			return this.players[k].yutStatus !== undefined;
		});
	}

	handleThrow(playerName, isFront){
		this.players[playerName].yutStatus = isFront;
	}

	handleSelect(playerName, which){
		this.players[playerName].selectedPiece = which;
	}

	processTurn(){
		Fiber(() => {
			while(!this.allAttached()){
				sleep(500);
			}
			var movementPoint = 1;
			while(movementPoint >= 1){
				this.requestThrowYut();

				var frontStatus = 0;

				Object.keys(this.players).forEach((k) => {
					if(this.players[k].yutStatus){
						frontStatus++;
					}
				});

				var movementAmount = 0;
				switch(frontStatus){
					case 0: movementAmount = 5; break; //모
					case 1: movementAmount = -1; break; //뒷도(백도)
					case 2: movementAmount = 2; break; //개
					case 3: movementAmount = 3; break; //걸
					case 4: movementAmount = 4; break; //윷
				}

				if(movementAmount === 4 || movementAmount === 5) movementPoint++;

				this.broadcastPacket('yut result', {
					amount: movementAmount,
					players: Object.keys(this.players).map((k) => this.players[k].yutStatus)
				});

				Object.keys(this.players).forEach((k) => {
					this.players[k].yutStatus = undefined;
				});

				var turnPlayer = this.players[Object.keys(this.players)[this.turn]];
				var groupnizable = (turnPlayer.getAvailablePieces().length === 2) && (turnPlayer.pieces[0].pos === turnPlayer.pieces[1].pos) && turnPlayer.pieces[0].pos !== 0;

				var waitAmount = 0;

				if(turnPlayer.getAvailablePieces().length <= 0){
					this.handleWin(turnPlayer);
					return;
				}else if(turnPlayer.getAvailablePieces().length === 1){
					turnPlayer.selectedPiece = turnPlayer.getAvailablePieces()[0].pieceIndex;
				}

				this.status = {
					name: turnPlayer,
					content: 'select piece',
					data: {
						data: turnPlayer.getAvailablePieces().map((v) => {
							return {
								id: v.pieceIndex,
								pos: v.pos
							};
						}),
						groupnizable: groupnizable
					}
				};

				if(turnPlayer.socket !== undefined) turnPlayer.socket.emit('select piece', {
					data: turnPlayer.getAvailablePieces().map((v) => {
						return {
							id: v.pieceIndex,
							pos: v.pos
						};
					}),
					groupnizable: groupnizable
				});

				var selectWait = 0;
				while(turnPlayer.selectedPiece === undefined){
					sleep(500);
					selectWait++;
					if(selectWait > 40){
						turnPlayer.selectedPiece = Math.round(Math.random());
						break;
					}
				}

				this.status = 'wait-for-player';

				if(!(turnPlayer.selectedPiece === 2 && groupnizable) && turnPlayer.pieces[turnPlayer.selectedPiece] === undefined){
					turnPlayer.selectedPiece = turnPlayer.getAvailablePieces()[0].pieceIndex;
				}

				var group = (turnPlayer.selectedPiece === 2);

				var piece = turnPlayer.pieces[turnPlayer.selectedPiece];
				if(group) piece = turnPlayer.pieces[(turnPlayer.lastMovement === 0) ? 1 : 0];
				var anotherPiece = turnPlayer.pieces.filter((v) => {
					return v.pieceIndex !== piece.pieceIndex;
				})[0];

				var handleMovement = (nextTile, piece) => {
					var beforePiece = piece.pos;
					piece.pos = nextTile;
					nextTile = this.map[nextTile];
					piece.movementStack.push(piece.pos);
					this.broadcastPacket('piece move', {
						player: turnPlayer.name,
						id: piece.pieceIndex,
						pos: piece.pos
					});

					if(piece.pos === 1 && beforePiece !== 1 && beforePiece !== 0){
						piece.finished = true;
						this.broadcastPacket('finished piece', {
							id: piece.pieceIndex,
							player: turnPlayer.name
						});
						return true;
					}
					return false;
				};

				var currTile = this.map[piece.pos];
				if(movementAmount >= 1){
					handleMovement(currTile.getConnected(piece.movementStack.slice(-1).pop()), piece);
					if(group) handleMovement(currTile.getBack(piece.movementStack.slice(-1).pop()), anotherPiece);
				}

				while(movementAmount > 0){
					let currTile = this.map[piece.pos];
					if(group) handleMovement(currTile.getPass(piece.movementStack.slice(-1).pop()), anotherPiece);
					if(handleMovement(currTile.getPass(piece.movementStack.slice(-1).pop()), piece)) break;
					movementAmount--;
					sleep(1000);
				}

				if(movementAmount === -1){
					handleMovement(currTile.getBack(piece.movementStack.slice(-1).pop()), piece);
					if(group) handleMovement(currTile.getBack(piece.movementStack.slice(-1).pop()), anotherPiece);
				}

				if(piece.pos !== 0){
					var piecesInTile = this.getPieceInTile(piece.pos);
					if(piecesInTile.length >= 1){
						piecesInTile.forEach((v) => {
							v.pos = 0;
						});
						movementPoint++;
						//잡을 경우
					}
				}

				if(turnPlayer.getAvailablePieces().length <= 0){
					this.handleWin(turnPlayer);
					return;
				}

				if(!group) turnPlayer.lastMovement = piece.pieceIndex;
				movementPoint--;
			}

			this.turn++;
			setTimeout(this.processTurn, 0);
		}).run();
	}

	getAnotherTeamPlayer(player){
		return Object.keys(this.players).map((v) => this.players[v]).filter((v) => {
			return v.teamIndex === player.teamIndex && v.name !== player.name;
		})[0];
	}

	handleWin(player){
		var anotherPlayer = this.getAnotherTeamPlayer(player);
		this.broadcastPacket('chat all', '게임이 끝났습니다 : ' + player.name + '와 ' + anotherPlayer.name + '가 이겼습니다! 축하드립니다!');
		this.gameLog.push('게임이 끝났습니다 : ' + player.name + '와 ' + anotherPlayer.name + '가 이겼습니다! 축하드립니다!');
		this.broadcastPacket('game win', [player.name, anotherPlayer.name]);
	}

	requestThrowYut(){
		this.status = 'throw yut';
		this.broadcastPacketToPlayers('throw yut');
		while(!this.allThrowed()){
			sleep(500);
		}
	}

	save(){
		var saveData = {};
		var sockets = {};
		Object.keys(this.players).forEach((k) => {
			var v = this.players[k];
			v.pieces.forEach((v) => {
				v.player = undefined;
			});
			sockets[k] = this.players[k].socket;
			this.players[k].socket = undefined;
		});

		saveData.players = JSON.stringify(this.players);
		Object.keys(this.players).forEach((k) => {
			var v = this.players[k];
			this.players[k].socket = sockets[k];
			v.pieces.forEach((v2) => {
				v2.player = v;
			});
		});

		saveData.turn = this.turn;
		saveData.gameLog = JSON.stringify(this.gameLog);
		saveData.teamLog = JSON.stringify(this.teamLog);
		return saveData;
	}
}

Game.Tile = Tile;
Game.CenterTile = CenterTile;
Game.Player = Player;
Game.Piece = Piece;

module.exports = Game;
