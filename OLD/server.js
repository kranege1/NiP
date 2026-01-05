const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const ACTIVE_ROOM = 'Spiel 1'; // Fest fixiert
const rooms = {};

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substr(0, 19);
}

function log(message) {
    console.log(`[${getTimestamp()}] ${message}`);
}

io.on('connection', (socket) => {
    log(`Neue Verbindung: ${socket.id}`);

    // Heartbeat alle 5 Sekunden
    setInterval(() => {
        if (socket.connected) socket.emit('ping');
    }, 5000);

    // Admin verbindet sich (automatisch Host)
    socket.on('adminConnect', () => {
        if (!rooms[ACTIVE_ROOM]) {
            rooms[ACTIVE_ROOM] = {
                host: socket.id,
                players: {},
                answers: [],
                submitted: [],
                currentQuestion: '',
                realAnswer: '',
                roundActive: false
            };
            log(`Admin hat Spiel 1 geöffnet`);
        } else {
            rooms[ACTIVE_ROOM].host = socket.id;
        }

        joinRoom(socket, ACTIVE_ROOM, 'Admin', true);
        socket.emit('adminJoined');
    });

    // Spieler verbindet sich
    socket.on('playerJoin', ({ playerName }) => {
        if (!playerName.trim()) {
            socket.emit('error', 'Bitte einen Namen eingeben!');
            return;
        }
        if (!rooms[ACTIVE_ROOM]) {
            socket.emit('error', 'Der Admin hat das Spiel noch nicht geöffnet.');
            return;
        }

        joinRoom(socket, ACTIVE_ROOM, playerName.trim(), false);
        log(`${playerName} beigetreten`);
    });

    function joinRoom(socket, roomCode, playerName, isHost) {
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerName = playerName;
        socket.isHost = isHost;

        rooms[roomCode].players[socket.id] = { name: playerName };

        const playerList = Object.values(rooms[roomCode].players).map(p => p.name);
        io.to(roomCode).emit('updatePlayers', playerList);
        io.to(roomCode).emit('updateSubmitted', rooms[roomCode].submitted);
        socket.emit('joinedRoom', { isHost });

        if (rooms[roomCode].currentQuestion) {
            socket.emit('questionSent', rooms[roomCode].currentQuestion);
        }
    }

    // Admin sendet die Frage an alle
    socket.on('sendQuestion', (question) => {
        if (socket.isHost && rooms[ACTIVE_ROOM]) {
            rooms[ACTIVE_ROOM].currentQuestion = question.trim();
            rooms[ACTIVE_ROOM].answers = [];
            rooms[ACTIVE_ROOM].submitted = [];
            rooms[ACTIVE_ROOM].realAnswer = '';
            rooms[ACTIVE_ROOM].roundActive = true;

            io.to(ACTIVE_ROOM).emit('questionSent', question.trim());
            io.to(ACTIVE_ROOM).emit('updateSubmitted', []);
            log(`Frage gestellt: "${question.trim()}"`);
        }
    });

    // Spieler sendet (oder aktualisiert) Antwort – mehrfach erlaubt
    socket.on('submitAnswer', (answer) => {
        if (socket.isHost || !rooms[ACTIVE_ROOM]?.roundActive) return;

        const room = rooms[ACTIVE_ROOM];
        const trimmed = answer.trim();

        if (!trimmed) return;

        // Alte Antwort dieses Spielers entfernen
        room.answers = room.answers.filter(a => a.name !== socket.playerName);

        // Neue Antwort hinzufügen
        room.answers.push({ name: socket.playerName, text: trimmed });

        // Als geantwortet markieren
        if (!room.submitted.includes(socket.playerName)) {
            room.submitted.push(socket.playerName);
        }

        io.to(ACTIVE_ROOM).emit('updateSubmitted', room.submitted);

        // LIVE-MISCHEN: Nur an Admin senden (neu gemischt bei jeder Antwort)
        if (room.host) {
            const hostSocket = io.sockets.sockets.get(room.host);
            if (hostSocket) {
                let tempAnswers = [...room.answers];
                if (room.realAnswer) {
                    tempAnswers.push({ name: 'Echte Definition', text: room.realAnswer });
                }
                tempAnswers.sort(() => Math.random() - 0.5);
                const lettered = tempAnswers.map((a, i) => ({
                    letter: String.fromCharCode(65 + i),
                    text: a.text
                }));
                hostSocket.emit('showAllAnswers', lettered);
            }
        }

        log(`Antwort von ${socket.playerName} (aktualisiert): "${trimmed}"`);
    });

    // Admin sendet richtige Antwort → endgültig mischen
    socket.on('submitRealAnswer', (realAnswer) => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]?.roundActive) return;

        rooms[ACTIVE_ROOM].realAnswer = realAnswer.trim();

        let allAnswers = [...rooms[ACTIVE_ROOM].answers, { name: 'Echte Definition', text: realAnswer.trim() }];
        allAnswers.sort(() => Math.random() - 0.5);

        const lettered = allAnswers.map((a, i) => ({
            letter: String.fromCharCode(65 + i),
            text: a.text
        }));

        socket.emit('showAllAnswers', lettered);
        log(`Richtige Antwort eingereicht – endgültig gemischt`);
    });

    // Neue Runde
    socket.on('newRound', () => {
        if (socket.isHost && rooms[ACTIVE_ROOM]) {
            rooms[ACTIVE_ROOM].currentQuestion = '';
            rooms[ACTIVE_ROOM].realAnswer = '';
            rooms[ACTIVE_ROOM].answers = [];
            rooms[ACTIVE_ROOM].submitted = [];
            rooms[ACTIVE_ROOM].roundActive = false;
            io.to(ACTIVE_ROOM).emit('roundEnded');
            io.to(ACTIVE_ROOM).emit('updateSubmitted', []);
            log(`Neue Runde gestartet`);
        }
    });

    // Admin-Reset: Alle Spieler entfernen
    socket.on('adminReset', () => {
        if (socket.isHost && rooms[ACTIVE_ROOM]) {
            const room = rooms[ACTIVE_ROOM];
            for (const id in room.players) {
                if (id !== socket.id) {
                    delete room.players[id];
                }
            }
            room.answers = [];
            room.submitted = [];
            room.currentQuestion = '';
            room.realAnswer = '';
            room.roundActive = false;

            io.to(ACTIVE_ROOM).emit('updatePlayers', ['Admin']);
            io.to(ACTIVE_ROOM).emit('updateSubmitted', []);
            io.to(ACTIVE_ROOM).emit('roundEnded');
            log(`Spiel komplett zurückgesetzt durch Admin`);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            const room = rooms[socket.roomCode];
            delete room.players[socket.id];
            room.submitted = room.submitted.filter(n => n !== socket.playerName);

            const remaining = Object.values(room.players).map(p => p.name);
            io.to(socket.roomCode).emit('updatePlayers', remaining);
            io.to(socket.roomCode).emit('updateSubmitted', room.submitted);

            if (socket.isHost) {
                log(`Admin getrennt – Spiel pausiert`);
            }
            if (Object.keys(room.players).length === 0) {
                delete rooms[ACTIVE_ROOM];
                log(`Spiel 1 geleert und geschlossen`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => log(`Server läuft –  bereit auf Port ${PORT}`));