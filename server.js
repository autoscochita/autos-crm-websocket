/**
 * SERVIDOR WEBSOCKET - AUTOS CRM
 * Servidor Node.js con Socket.io para comunicación en tiempo real
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

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Autos CRM WebSocket Server',
        version: '1.0.0',
        connectedUsers: connectedUsers.size
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

app.post('/emit', (req, res) => {
    const { event, data, room } = req.body;
    
    if (!event) {
        return res.status(400).json({ error: 'Event name required' });
    }
    
    console.log(`📡 Emitiendo evento: ${event}`);
    
    if (room) {
        io.to(room).emit(event, data);
    } else {
        io.emit(event, data);
    }
    
    res.json({ success: true, message: `Event '${event}' emitted` });
});

io.on('connection', (socket) => {
    console.log(`✅ Cliente conectado: ${socket.id}`);
    
    socket.on('authenticate', (data) => {
        const { userId, userName, userRole } = data;
        connectedUsers.set(socket.id, { userId, userName, userRole });
        console.log(`👤 Usuario autenticado: ${userName}`);
        socket.emit('authenticated', { socketId: socket.id });
    });
    
    socket.on('join:presupuesto', (presupuestoId) => {
        socket.join(`presupuesto:${presupuestoId}`);
        console.log(`📂 Usuario se unió a presupuesto:${presupuestoId}`);
    });
    
    socket.on('leave:presupuesto', (presupuestoId) => {
        socket.leave(`presupuesto:${presupuestoId}`);
    });
    
    socket.on('tasacion:updated', (data) => {
        const { tasacionId, presupuestoId } = data;
        console.log(`🔄 Tasación ${tasacionId} actualizada`);
        
        if (presupuestoId) {
            socket.to(`presupuesto:${presupuestoId}`).emit('tasacion:changed', data);
        } else {
            socket.broadcast.emit('tasacion:changed', data);
        }
    });
    
    socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
    });
    
    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            console.log(`❌ Usuario desconectado: ${user.userName}`);
            connectedUsers.delete(socket.id);
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor WebSocket iniciado en puerto ${PORT}`);
});
