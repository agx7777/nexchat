document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginView = document.getElementById('login-view');
    const mainView = document.getElementById('main-view');
    
    // Login
    const nicknameInput = document.getElementById('nickname-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    
    // Sidebar Top
    const myNicknameDisplay = document.getElementById('my-nickname-display');
    const myAvatar = document.getElementById('my-avatar');
    
    // Search
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResultContainer = document.getElementById('search-result-container');
    const resultAvatar = document.getElementById('result-avatar');
    const resultNickname = document.getElementById('result-nickname');
    const addFriendBtn = document.getElementById('add-friend-btn');
    const closeSearchBtn = document.getElementById('close-search-btn');
    
    // Navigation & Lists
    const navBtns = document.querySelectorAll('.nav-btn');
    const friendsListContainer = document.getElementById('friends-list-container');
    const groupsListContainer = document.getElementById('groups-list-container');
    const friendsList = document.getElementById('friends-list');
    const groupsList = document.getElementById('groups-list');
    
    // Chat Area
    const welcomeScreen = document.getElementById('welcome-screen');
    const activeChatScreen = document.getElementById('active-chat-screen');
    const chatHeaderName = document.getElementById('chat-header-name');
    const chatHeaderAvatar = document.getElementById('chat-header-avatar');
    const chatHeaderStatus = document.getElementById('chat-header-status');
    const messageFeed = document.getElementById('message-feed');
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const sendMsgBtn = document.getElementById('send-msg-btn');
    const backToSidebarBtn = document.getElementById('back-to-sidebar-btn');
    
    // Group Modal
    const newGroupBtn = document.getElementById('new-group-btn');
    const createGroupModal = document.getElementById('create-group-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelGroupBtn = document.getElementById('cancel-group-btn');
    const confirmCreateGroupBtn = document.getElementById('confirm-create-group-btn');
    const groupNameInput = document.getElementById('group-name-input');
    const modalFriendsList = document.getElementById('modal-friends-list');

    // --- State ---
    let socket = null;
    let myNickname = '';
    let currentChat = null; // { type: 'friend'|'group', id: string/nickname, name: string }
    let friendsData = [];
    let groupsData = [];
    let chatHistories = {}; // key: nickname or groupId, value: array of message objects

    // --- Helpers ---
    const getInitials = (name) => {
        if (!name) return '?';
        return name.substring(0, 2).toUpperCase();
    };

    const generateAvatarColor = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 70%, 50%)`;
    };

    const scrollToBottom = () => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const formatTime = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const showError = (msg) => {
        loginError.textContent = msg;
        loginError.classList.add('show');
        setTimeout(() => loginError.classList.remove('show'), 3000);
    };

    const setView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
            setTimeout(() => {
                if(!v.classList.contains('active')) v.classList.add('hidden');
            }, 300); // match css transition
        });
        
        const target = document.getElementById(viewId);
        target.classList.remove('hidden');
        // trigger reflow
        void target.offsetWidth; 
        target.classList.add('active');
    };

    // --- Socket & Login Logic ---
    const connectSocket = (nickname) => {
        socket = io();

        socket.on('connect', () => {
            socket.emit('login', nickname, (res) => {
                if (res.success) {
                    myNickname = res.nickname;
                    myNicknameDisplay.textContent = myNickname;
                    myAvatar.textContent = getInitials(myNickname);
                    
                    setView('main-view');
                    loadInitialData();
                    setupSocketListeners();
                } else {
                    showError(res.error || 'Login failed');
                    socket.disconnect();
                }
            });
        });
    };

    loginBtn.addEventListener('click', () => {
        const name = nicknameInput.value.trim();
        if (name) {
            connectSocket(name);
        } else {
            showError('Please enter a nickname');
        }
    });

    nicknameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });

    // --- Data Loading ---
    const loadInitialData = () => {
        socket.emit('get_friends', (res) => {
            if (res.success) {
                friendsData = res.friends;
                renderFriendsList();
            }
        });

        socket.emit('get_groups', (res) => {
            if (res.success) {
                groupsData = res.groups;
                renderGroupsList();
            }
        });
    };

    // --- Socket Listeners ---
    const setupSocketListeners = () => {
        socket.on('friend_added', (friendNickname) => {
            if (!friendsData.includes(friendNickname)) {
                friendsData.push(friendNickname);
                renderFriendsList();
                // Optional: show a toast notification here
            }
        });

        socket.on('private_message', (data) => {
            handleIncomingMessage(data.from, 'friend', data);
        });

        socket.on('group_created', (group) => {
            groupsData.push(group);
            renderGroupsList();
        });

        socket.on('group_message', (data) => {
            handleIncomingMessage(data.groupId, 'group', data);
        });
    };

    // --- Search & Add Friend ---
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    function performSearch() {
        const q = searchInput.value.trim();
        if (!q) return;

        socket.emit('search_friend', q, (res) => {
            if (res.success && res.found) {
                resultNickname.textContent = res.nickname;
                resultAvatar.textContent = getInitials(res.nickname);
                resultAvatar.style.backgroundColor = generateAvatarColor(res.nickname);
                
                if (res.isFriend) {
                    addFriendBtn.disabled = true;
                    addFriendBtn.textContent = 'Friends';
                } else {
                    addFriendBtn.disabled = false;
                    addFriendBtn.textContent = 'Add Friend';
                    addFriendBtn.dataset.target = res.nickname;
                }
                
                searchResultContainer.classList.remove('hidden');
            } else {
                // Not found
                resultNickname.textContent = 'User not found';
                resultAvatar.textContent = '?';
                resultAvatar.style.backgroundColor = '#475569';
                addFriendBtn.disabled = true;
                addFriendBtn.textContent = 'None';
                searchResultContainer.classList.remove('hidden');
            }
        });
    }

    closeSearchBtn.addEventListener('click', () => {
        searchResultContainer.classList.add('hidden');
        searchInput.value = '';
    });

    addFriendBtn.addEventListener('click', () => {
        const target = addFriendBtn.dataset.target;
        if (!target) return;

        socket.emit('add_friend', target, (res) => {
            if (res.success) {
                addFriendBtn.disabled = true;
                addFriendBtn.textContent = 'Added!';
                if (!friendsData.includes(target)) {
                    friendsData.push(target);
                    renderFriendsList();
                }
            } else {
                alert(res.error);
            }
        });
    });

    // --- Navigation (Friends/Groups) ---
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (btn.dataset.tab === 'friends') {
                friendsListContainer.classList.remove('hidden');
                groupsListContainer.classList.add('hidden');
            } else {
                friendsListContainer.classList.add('hidden');
                groupsListContainer.classList.remove('hidden');
            }
        });
    });

    // --- Rendering Lists ---
    const renderFriendsList = () => {
        friendsList.innerHTML = '';
        if (friendsData.length === 0) {
            friendsList.innerHTML = '<li class="list-item" style="pointer-events:none;color:var(--text-secondary);text-align:center;padding:20px;">No friends yet. Search to add some!</li>';
            return;
        }

        friendsData.forEach(friend => {
            const li = document.createElement('li');
            li.className = 'list-item';
            if (currentChat && currentChat.type === 'friend' && currentChat.id === friend) {
                li.classList.add('selected');
            }
            
            li.innerHTML = `
                <div class="avatar gradient-bg" style="background: ${generateAvatarColor(friend)}">${getInitials(friend)}</div>
                <div class="item-details">
                    <div class="item-name">${friend}</div>
                    <div class="item-preview">Tap to chat</div>
                </div>
            `;
            
            li.addEventListener('click', () => openChat({ type: 'friend', id: friend, name: friend }));
            friendsList.appendChild(li);
        });
    };

    const renderGroupsList = () => {
        groupsList.innerHTML = '';
        if (groupsData.length === 0) {
            groupsList.innerHTML = '<li class="list-item" style="pointer-events:none;color:var(--text-secondary);text-align:center;padding:20px;">No groups yet. Create one!</li>';
            return;
        }

        groupsData.forEach(group => {
            const li = document.createElement('li');
            li.className = 'list-item';
            if (currentChat && currentChat.type === 'group' && currentChat.id === group.id) {
                li.classList.add('selected');
            }
            
            li.innerHTML = `
                <div class="avatar" style="background: #334155"><i class="ri-group-fill"></i></div>
                <div class="item-details">
                    <div class="item-name">${group.name}</div>
                    <div class="item-preview">${group.members.length} members</div>
                </div>
            `;
            
            li.addEventListener('click', () => openChat({ type: 'group', id: group.id, name: group.name, members: group.members }));
            groupsList.appendChild(li);
        });
    };

    // --- Group Creation ---
    newGroupBtn.addEventListener('click', () => {
        createGroupModal.classList.remove('hidden');
        groupNameInput.value = '';
        renderModalFriends();
    });

    closeModalBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));
    cancelGroupBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));

    let selectedFriendsForGroup = new Set();
    
    const renderModalFriends = () => {
        modalFriendsList.innerHTML = '';
        selectedFriendsForGroup.clear();

        if (friendsData.length === 0) {
            modalFriendsList.innerHTML = '<p style="padding:10px;text-align:center;color:var(--text-secondary);">Add friends first to create a group.</p>';
            return;
        }

        friendsData.forEach(friend => {
            const div = document.createElement('div');
            div.className = 'selectable-item';
            div.innerHTML = `
                <div class="checkbox-custom"></div>
                <div class="avatar small-avatar" style="background: ${generateAvatarColor(friend)}">${getInitials(friend)}</div>
                <span>${friend}</span>
            `;
            
            div.addEventListener('click', () => {
                div.classList.toggle('selected');
                if (div.classList.contains('selected')) {
                    selectedFriendsForGroup.add(friend);
                } else {
                    selectedFriendsForGroup.delete(friend);
                }
            });
            modalFriendsList.appendChild(div);
        });
    };

    confirmCreateGroupBtn.addEventListener('click', () => {
        const name = groupNameInput.value.trim();
        if (!name) return alert('Please enter a group name');
        if (selectedFriendsForGroup.size === 0) return alert('Select at least one friend');

        socket.emit('create_group', { name, members: Array.from(selectedFriendsForGroup) }, (res) => {
            if (res.success) {
                createGroupModal.classList.add('hidden');
                groupsData.push(res.group);
                renderGroupsList();
                // Switch to groups tab
                navBtns[1].click();
                // Open the new group chat
                openChat({ type: 'group', id: res.group.id, name: res.group.name, members: res.group.members });
            } else {
                alert(res.error);
            }
        });
    });

    // --- Chat Flow ---
    const openChat = (target) => {
        currentChat = target;
        
        // Update UI
        welcomeScreen.classList.remove('active');
        activeChatScreen.classList.remove('hidden');
        
        chatHeaderName.textContent = target.name;
        chatHeaderAvatar.textContent = target.type === 'friend' ? getInitials(target.name) : 'G';
        chatHeaderAvatar.style.backgroundColor = target.type === 'friend' ? generateAvatarColor(target.name) : '#334155';
        
        if (target.type === 'group') {
            chatHeaderAvatar.innerHTML = '<i class="ri-group-fill"></i>';
            chatHeaderStatus.textContent = `${target.members.length} members`;
        } else {
            chatHeaderStatus.textContent = 'Online'; // Mock status
        }

        // Render history
        renderChatHistory(target.id);
        
        // Update sidebar selection
        renderFriendsList();
        renderGroupsList();
        
        // On mobile, hide sidebar
        if (window.innerWidth <= 768) {
            document.body.classList.add('chat-active');
        }
    };

    const renderChatHistory = (id) => {
        messageFeed.innerHTML = '';
        const history = chatHistories[id] || [];
        
        history.forEach(msg => {
            appendMessageToFeed(msg);
        });
        scrollToBottom();
    };

    const appendMessageToFeed = (msg) => {
        const isMe = msg.from === myNickname;
        const div = document.createElement('div');
        div.className = `message ${isMe ? 'sent' : 'received'}`;
        
        div.innerHTML = `
            ${!isMe ? `<span class="message-sender">${msg.from}</span>` : ''}
            <div class="message-bubble">
                ${msg.message}
                <span class="message-time">${formatTime(msg.timestamp)}</span>
            </div>
        `;
        
        messageFeed.appendChild(div);
        scrollToBottom();
    };

    const handleIncomingMessage = (chatId, type, msgData) => {
        // Initialize history array if not exists
        if (!chatHistories[chatId]) {
            chatHistories[chatId] = [];
        }
        
        chatHistories[chatId].push(msgData);

        // If currently viewing this chat, append to feed
        if (currentChat && currentChat.id === chatId) {
            appendMessageToFeed(msgData);
        } else {
            // Optional: Show unread indicator in sidebar
            console.log('New message in background from', chatId);
        }
    };

    // --- Sending Messages ---
    const sendMessage = () => {
        if (!currentChat) return;
        
        const text = messageInput.value.trim();
        if (!text) return;

        const msgData = {
            from: myNickname,
            message: text,
            timestamp: new Date().toISOString()
        };

        if (currentChat.type === 'friend') {
            socket.emit('send_private_message', { to: currentChat.id, message: text }, (res) => {
                if(res.success) {
                    handleIncomingMessage(currentChat.id, 'friend', msgData);
                } else {
                    alert(res.error || 'Failed to send');
                }
            });
        } else if (currentChat.type === 'group') {
            socket.emit('send_group_message', { groupId: currentChat.id, message: text }, (res) => {
                if(res.success) {
                    // Note: Sender does not receive their own group message event from server,
                    // so we append it locally
                    handleIncomingMessage(currentChat.id, 'group', msgData);
                } else {
                    alert(res.error || 'Failed to send');
                }
            });
        }

        messageInput.value = '';
        messageInput.focus();
    };

    sendMsgBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Mobile Back button handler
    backToSidebarBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            document.body.classList.remove('chat-active');
        }
    });
    
    chatHeaderAvatar.addEventListener('click', () => {
        // Removed back functionality from avatar
    });
});
