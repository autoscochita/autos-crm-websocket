/**
 * SERVIDOR WEBSOCKET - AUTOS CRM
 * Servidor Node.js con Socket.io para comunicación en tiempo real
 * v1.1.0 — Añadido soporte de rooms para chat interno
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = [
    'https://micro-coches.com',
    'https://www.micro-coches.com',
    'http://localhost'
];

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

const io = socketIo(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

const connectedUsers = new Map();

// ─── Helper: nombre normalizado del room de chat directo ─────────────────────
// Garantiza que room(A→B) === room(B→A) ordenando los IDs
function chatDirectoRoom(idA, idB) {
    const [min, max] = [parseInt(idA), parseInt(idB)].sort((a, b) => a - b);
    return `chat:directo:${min}:${max}`;
}

// ─── Endpoints HTTP ──────────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Autos CRM WebSocket Server',
        version: '1.1.0',
        connectedUsers: connectedUsers.size
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Endpoint genérico para que PHP emita eventos (tasaciones, chat, etc.)
app.post('/emit', (req, res) => {
    const { event, data, room } = req.body;

    if (!event) {
        return res.status(400).json({ error: 'Event name required' });
    }

    console.log(`📡 Emitiendo evento: ${event}${room ? ' → room: ' + room : ''}`);

    if (room) {
        io.to(room).emit(event, data);
    } else {
        io.emit(event, data);
    }

    res.json({ success: true, message: `Event '${event}' emitted` });
});

// ─── Socket.io — conexiones ──────────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log(`✅ Cliente conectado: ${socket.id}`);

    // Autenticación del usuario
    socket.on('authenticate', (data) => {
        const { userId, userName, userRole } = data;
        connectedUsers.set(socket.id, { userId, userName, userRole });
        console.log(`👤 Autenticado: ${userName} (id=${userId})`);

        // Unirse al room personal — garantiza recepción de mensajes sin importar
        // qué conversación tenga abierta el usuario
        socket.join(`user:${userId}`);
        console.log(`📬 Usuario ${userName} unido a room: user:${userId}`);

        socket.emit('authenticated', { socketId: socket.id });

        // Avisar al resto que este usuario se conectó
        socket.broadcast.emit('user:connected', { userId, userName });
    });

    // ── Presupuestos / Tasaciones ────────────────────────────────────────────

    socket.on('join:presupuesto', (presupuestoId) => {
        socket.join(`presupuesto:${presupuestoId}`);
        console.log(`📂 join presupuesto:${presupuestoId}`);
    });

    socket.on('leave:presupuesto', (presupuestoId) => {
        socket.leave(`presupuesto:${presupuestoId}`);
    });

    socket.on('tasacion:updated', (data) => {
        const { tasacionId, presupuestoId } = data;
        console.log(`🔄 Tasación ${tasacionId} actualizada`);
        const room = presupuestoId ? `presupuesto:${presupuestoId}` : null;
        if (room) {
            socket.to(room).emit('tasacion:changed', data);
        } else {
            socket.broadcast.emit('tasacion:changed', data);
        }
    });

    // ── Chat Interno — rooms ─────────────────────────────────────────────────

    // Unirse a chat directo entre dos usuarios
    socket.on('join:chat:directo', ({ miUserId, otroUserId }) => {
        const room = chatDirectoRoom(miUserId, otroUserId);
        socket.join(room);
        console.log(`💬 join ${room}`);
    });

    // Salir de chat directo
    socket.on('leave:chat:directo', ({ miUserId, otroUserId }) => {
        socket.leave(chatDirectoRoom(miUserId, otroUserId));
    });

    // Unirse a grupo de chat
    socket.on('join:chat:grupo', ({ grupoId }) => {
        const room = `chat:grupo:${grupoId}`;
        socket.join(room);
        console.log(`💬 join ${room}`);
    });

    // Salir de grupo de chat
    socket.on('leave:chat:grupo', ({ grupoId }) => {
        socket.leave(`chat:grupo:${grupoId}`);
    });

    // ── Ping / keepalive ─────────────────────────────────────────────────────

    socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
    });

    // ── Desconexión ──────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            console.log(`❌ Desconectado: ${user.userName}`);
            socket.broadcast.emit('user:disconnected', {
                userId: user.userId,
                userName: user.userName
            });
            connectedUsers.delete(socket.id);
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor WebSocket v1.1.0 iniciado en puerto ${PORT}`);
});
