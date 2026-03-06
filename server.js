const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Health check endpoint for deployment platforms (like Render, Heroku)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data stores
// users: socket.id -> { nickname, socketId }
const users = new Map();
// nicknames: nickname -> socket.id (for faster lookup)
const nicknames = new Map();
// friends: nickname -> Set of friend nicknames
const friends = new Map();
// groups: groupId -> { name, members: Set of nicknames }
const groups = new Map();
let nextGroupId = 1;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle Login
    socket.on('login', (nickname, callback) => {
        if (!nickname || typeof nickname !== 'string') {
            return callback({ success: false, error: 'Invalid nickname' });
        }
        nickname = nickname.trim();
        if (nickname.length === 0) {
            return callback({ success: false, error: 'Nickname cannot be empty' });
        }
        if (nicknames.has(nickname)) {
            return callback({ success: false, error: 'Nickname already taken' });
        }

        // Register user
        users.set(socket.id, { nickname, socketId: socket.id });
        nicknames.set(nickname, socket.id);
        if (!friends.has(nickname)) {
            friends.set(nickname, new Set());
        }

        // Broadcast to others that a user joined (optional, or just keep silent)
        // io.emit('user_joined', nickname);

        callback({ success: true, nickname });
    });

    // Handle Friend Search
    socket.on('search_friend', (searchNickname, callback) => {
        const user = users.get(socket.id);
        if (!user) return callback({ success: false, error: 'Not logged in' });

        searchNickname = searchNickname.trim();
        if (searchNickname === user.nickname) {
            return callback({ success: false, error: 'Cannot add yourself' });
        }

        if (nicknames.has(searchNickname)) {
            const userFriends = friends.get(user.nickname);
            const isFriend = userFriends.has(searchNickname);
            callback({ success: true, found: true, nickname: searchNickname, isFriend });
        } else {
            callback({ success: true, found: false });
        }
    });

    // Handle Add Friend
    socket.on('add_friend', (friendNickname, callback) => {
        const user = users.get(socket.id);
        if (!user) return callback({ success: false, error: 'Not logged in' });

        if (!nicknames.has(friendNickname)) {
            return callback({ success: false, error: 'User not found' });
        }

        const userFriends = friends.get(user.nickname);
        if (userFriends.has(friendNickname)) {
            return callback({ success: false, error: 'Already friends' });
        }

        userFriends.add(friendNickname);
        // Bi-directional friendship for simplicity
        friends.get(friendNickname).add(user.nickname);

        // Notify the friend if they are online
        const friendSocketId = nicknames.get(friendNickname);
        if (friendSocketId) {
            io.to(friendSocketId).emit('friend_added', user.nickname);
        }

        callback({ success: true, friend: friendNickname });
    });

    // Handle Get Friends List
    socket.on('get_friends', (callback) => {
        const user = users.get(socket.id);
        if (!user) return callback({ success: false, error: 'Not logged in' });

        const userFriends = Array.from(friends.get(user.nickname) || []);
        callback({ success: true, friends: userFriends });
    });

    // Handle Private Message
    socket.on('send_private_message', (data, callback) => {
        const user = users.get(socket.id);
        if (!user) return callback({ success: false, error: 'Not logged in' });

        const { to, message } = data;
        if (!to || !message) return callback({ success: false, error: 'Invalid data' });

        const targetSocketId = nicknames.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('private_message', {
                from: user.nickname,
                message: message,
                timestamp: new Date().toISOString()
            });
            callback({ success: true });
        } else {
            callback({ success: false, error: 'User is offline or does not exist' });
        }
    });

    // Handle Create Group
    socket.on('create_group', (data, callback) => {
        const user = users.get(socket.id);
        if (!user) return callback({ success: false, error: 'Not logged in' });

        const { name, members } = data; // members is an array of nicknames
        if (!name || !members || !Array.isArray(members)) {
            return callback({ success: false, error: 'Invalid group data' });
        }

        const groupId = `group_${nextGroupId++}`;
        const groupMembers = new Set([user.nickname, ...members]);
        
        groups.set(groupId, { id: groupId, name, members: groupMembers });

        // Join socket room and notify others
        socket.join(groupId);
        
        members.forEach(memberNickname => {
            const memberSocketId = nicknames.get(memberNickname);
            if (memberSocketId) {
                const memberSocket = io.sockets.sockets.get(memberSocketId);
                if (memberSocket) {
                    memberSocket.join(groupId);
                    memberSocket.emit('group_created', { id: groupId, name, members: Array.from(groupMembers) });
                }
            }
        });

        callback({ success: true, group: { id: groupId, name, members: Array.from(groupMembers) } });
    });
    
    // Handle Get Groups
    socket.on('get_groups', (callback) => {
        const user = users.get(socket.id);
        if (!user) return callback({ success: false, error: 'Not logged in' });

        const userGroups = [];
        for (const [groupId, group] of groups.entries()) {
            if (group.members.has(user.nickname)) {
                userGroups.push({ id: groupId, name: group.name, members: Array.from(group.members) });
            }
        }
        callback({ success: true, groups: userGroups });
    });

    // Handle Group Message
    socket.on('send_group_message', (data, callback) => {
        const user = users.get(socket.id);
        if (!user) return callback({ success: false, error: 'Not logged in' });

        const { groupId, message } = data;
        const group = groups.get(groupId);
        
        if (!group) return callback({ success: false, error: 'Group not found' });
        if (!group.members.has(user.nickname)) return callback({ success: false, error: 'Not a member of this group' });

        socket.to(groupId).emit('group_message', {
            groupId,
            from: user.nickname,
            message,
            timestamp: new Date().toISOString()
        });
        callback({ success: true });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const user = users.get(socket.id);
        if (user) {
            nicknames.delete(user.nickname);
            users.delete(socket.id);
            // We keep friends in the friends Map to persist across sessions
            // (since it's an in-memory db, it resets on server restart anyway, but good to keep if user reconnects)
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
