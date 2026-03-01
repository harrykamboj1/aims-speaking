/* ═══════════════════════════════════════════════════════
   Admin Panel — Application Logic
   ═══════════════════════════════════════════════════════ */

const API_BASE = '/api/auth';
let adminToken = localStorage.getItem('admin_token');
let usersData = [];
let deleteTargetId = null;
let devicesUserId = null;
let devicesUserName = '';

// ─── Initialize ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Check if admin is already logged in
    if (adminToken) {
        verifyAdminSession();
    }
});

// ─── Verify Admin Session ──────────────────────────────
async function verifyAdminSession() {
    try {
        const res = await fetch(`${API_BASE}/verify`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();

        if (data.valid && data.role === 'admin') {
            document.getElementById('admin-name').textContent = data.user.email;
            showScreen('dashboard-screen');
            loadUsers();
        } else {
            adminToken = null;
            localStorage.removeItem('admin_token');
        }
    } catch {
        adminToken = null;
        localStorage.removeItem('admin_token');
    }
}

// ─── Screen Navigation ─────────────────────────────────
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ─── Admin Login ───────────────────────────────────────
async function handleAdminLogin(event) {
    event.preventDefault();

    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const btn = document.getElementById('btn-admin-login');
    const errorEl = document.getElementById('login-error');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin-right: 8px;"></div> Signing in...';

    try {
        const res = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Login failed');
        }

        adminToken = data.token;
        localStorage.setItem('admin_token', adminToken);
        document.getElementById('admin-name').textContent = data.admin.email;
        showScreen('dashboard-screen');
        loadUsers();
        showToast('Welcome back!', 'success');
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'flex';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="log-in" style="width: 18px; height: 18px; margin-right: 6px;"></i> Sign In';
        if (window.lucide) lucide.createIcons();
    }
}

// ─── Admin Logout ──────────────────────────────────────
function adminLogout() {
    adminToken = null;
    localStorage.removeItem('admin_token');
    showScreen('login-screen');
    showToast('Logged out successfully', 'info');
}

// ─── Load Users ────────────────────────────────────────
async function loadUsers() {
    const loading = document.getElementById('users-loading');
    const empty = document.getElementById('users-empty');
    const table = document.getElementById('users-table');

    loading.style.display = 'flex';
    empty.style.display = 'none';
    table.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                adminLogout();
                return;
            }
            throw new Error('Failed to fetch users');
        }

        const data = await res.json();
        usersData = data.users;

        // Update stats
        const totalUsers = usersData.length;
        const activeUsers = usersData.filter(u => u.is_active).length;
        const inactiveUsers = totalUsers - activeUsers;

        document.getElementById('stat-total').textContent = totalUsers;
        document.getElementById('stat-active').textContent = activeUsers;
        document.getElementById('stat-inactive').textContent = inactiveUsers;

        loading.style.display = 'none';

        if (usersData.length === 0) {
            empty.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        } else {
            table.style.display = 'table';
            renderUsersTable();
        }
    } catch (err) {
        loading.style.display = 'none';
        showToast('Failed to load users', 'error');
    }
}

// ─── Render Users Table ────────────────────────────────
function renderUsersTable(filteredData) {
    const tbody = document.getElementById('users-tbody');
    const table = document.getElementById('users-table');
    const noResults = document.getElementById('users-no-results');
    const dataToRender = filteredData || usersData;

    tbody.innerHTML = '';

    // Handle no search results
    if (filteredData && filteredData.length === 0) {
        table.style.display = 'none';
        noResults.style.display = 'flex';
        const queryEl = document.getElementById('no-results-query');
        queryEl.textContent = document.getElementById('user-search-input').value.trim();
        if (window.lucide) lucide.createIcons();
        return;
    }

    noResults.style.display = 'none';
    table.style.display = 'table';

    dataToRender.forEach(user => {
        const tr = document.createElement('tr');

        const name = user.name || '—';
        const email = user.email || '—';
        const mobile = user.mobile || '—';
        const status = user.is_active;
        const lastLogin = user.last_login ? formatDate(user.last_login) : 'Never';
        const deviceCount = user.device_count || 0;
        const maxDevices = user.max_devices || 3;

        // Device status color
        let deviceClass = 'devices-ok';
        if (deviceCount >= maxDevices) {
            deviceClass = 'devices-full';
        } else if (deviceCount > 0) {
            deviceClass = 'devices-ok';
        }

        let accessBadges = '';
        if (user.has_french_access !== false) accessBadges += '<span style="background:#eef2ff; color:#4f46e5; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-right: 4px; font-weight: 600;">French</span>';
        if (user.has_ielts_access === true) accessBadges += '<span style="background:#fdf4ff; color:#c026d3; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">IELTS</span>';
        if (!accessBadges) accessBadges = '<span style="color:#94a3b8; font-size: 0.75rem;">None</span>';

        tr.innerHTML = `
      <td class="user-name-cell">${escapeHtml(name)}</td>
      <td>
        <div class="user-contact-cell">
          <span class="email">${escapeHtml(email)}</span>
          ${mobile !== '—' ? `<span class="mobile">${escapeHtml(mobile)}</span>` : ''}
        </div>
      </td>
      <td>${accessBadges}</td>
      <td>
        <span class="status-badge ${status ? 'active' : 'inactive'}">
          <span class="status-dot"></span>
          ${status ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <button class="device-badge ${deviceClass}" onclick="openDevicesModal('${user.id}', '${escapeHtml(user.name || user.email || user.mobile || 'User')}', ${maxDevices})" title="View devices">
          <i data-lucide="smartphone" style="width: 13px; height: 13px;"></i>
          <span>${deviceCount} / ${maxDevices}</span>
        </button>
      </td>
      <td class="date-cell">${lastLogin}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-icon" onclick="openEditUserModal('${user.id}')" title="Edit user">
            <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
          </button>
          <button class="btn-icon danger" onclick="openDeleteModal('${user.id}', '${escapeHtml(user.name || user.email || user.mobile || 'this user')}')" title="Delete user">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </td>
    `;

        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

// ─── User Search ───────────────────────────────────────
function handleUserSearch() {
    const query = document.getElementById('user-search-input').value.trim().toLowerCase();
    const courseFilter = document.getElementById('user-course-filter').value;
    const clearBtn = document.getElementById('search-clear-btn');

    // Show/hide clear button
    clearBtn.style.display = query.length > 0 ? 'flex' : 'none';

    let filtered = usersData;

    // Filter by course
    if (courseFilter === 'french') {
        filtered = filtered.filter(u => u.has_french_access !== false);
    } else if (courseFilter === 'ielts') {
        filtered = filtered.filter(u => u.has_ielts_access === true);
    }

    // Filter by name
    if (query) {
        filtered = filtered.filter(user => {
            const name = (user.name || '').toLowerCase();
            return name.includes(query);
        });
    }

    renderUsersTable(filtered);
}

function clearUserSearch() {
    const input = document.getElementById('user-search-input');
    input.value = '';
    document.getElementById('search-clear-btn').style.display = 'none';
    handleUserSearch();
    input.focus();
}

// ─── Create User Modal ─────────────────────────────────
function openCreateUserModal() {
    document.getElementById('modal-title').innerHTML = '<i data-lucide="user-plus" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: -3px;"></i> Add New User';
    document.getElementById('btn-submit-user').innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px; margin-right: 6px;"></i> Create User';
    document.getElementById('user-id').value = '';
    document.getElementById('user-name').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-mobile').value = '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').required = true;
    document.getElementById('password-hint').textContent = '(required)';
    document.getElementById('active-toggle-group').style.display = 'none';
    document.getElementById('user-max-devices').value = 1;
    document.getElementById('user-french-access').checked = true;
    document.getElementById('user-ielts-access').checked = false;
    document.getElementById('modal-error').style.display = 'none';

    document.getElementById('user-modal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

// ─── Edit User Modal ───────────────────────────────────
function openEditUserModal(userId) {
    const user = usersData.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('modal-title').innerHTML = '<i data-lucide="user-cog" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: -3px;"></i> Edit User';
    document.getElementById('btn-submit-user').innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px; margin-right: 6px;"></i> Save Changes';
    document.getElementById('user-id').value = user.id;
    document.getElementById('user-name').value = user.name || '';
    document.getElementById('user-email').value = user.email || '';
    document.getElementById('user-mobile').value = user.mobile || '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').required = false;
    document.getElementById('password-hint').textContent = '(leave blank to keep current)';
    document.getElementById('active-toggle-group').style.display = 'block';
    document.getElementById('user-active').checked = user.is_active;
    document.getElementById('user-max-devices').value = user.max_devices || 3;
    document.getElementById('user-french-access').checked = user.has_french_access !== false;
    document.getElementById('user-ielts-access').checked = user.has_ielts_access === true;
    document.getElementById('modal-error').style.display = 'none';

    document.getElementById('user-modal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

// ─── Close Modal ───────────────────────────────────────
function closeModal() {
    document.getElementById('user-modal').style.display = 'none';
}

// ─── Handle User Form Submit ───────────────────────────
async function handleUserSubmit(event) {
    event.preventDefault();

    const userId = document.getElementById('user-id').value;
    const isEdit = !!userId;
    const errorEl = document.getElementById('modal-error');
    const btn = document.getElementById('btn-submit-user');

    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const mobile = document.getElementById('user-mobile').value.trim();
    const password = document.getElementById('user-password').value;
    const maxDevices = parseInt(document.getElementById('user-max-devices').value) || 1;
    const hasFrenchAccess = document.getElementById('user-french-access').checked;
    const hasIeltsAccess = document.getElementById('user-ielts-access').checked;

    if (!email && !mobile) {
        errorEl.textContent = 'Please provide an email address or mobile number.';
        errorEl.style.display = 'flex';
        return;
    }

    if (!isEdit && !password) {
        errorEl.textContent = 'Password is required for new users.';
        errorEl.style.display = 'flex';
        return;
    }

    if (password && password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.style.display = 'flex';
        return;
    }

    errorEl.style.display = 'none';
    btn.disabled = true;

    const body = { name, max_devices: maxDevices, has_french_access: hasFrenchAccess, has_ielts_access: hasIeltsAccess };
    if (email) body.email = email;
    if (mobile) body.mobile = mobile;
    if (password) body.password = password;

    if (isEdit) {
        body.is_active = document.getElementById('user-active').checked;
    }

    try {
        const url = isEdit ? `${API_BASE}/admin/users/${userId}` : `${API_BASE}/admin/users`;
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to save user');
        }

        closeModal();
        showToast(isEdit ? 'User updated successfully' : 'User created successfully', 'success');
        loadUsers();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'flex';
    } finally {
        btn.disabled = false;
    }
}

// ─── Delete User ───────────────────────────────────────
function openDeleteModal(userId, userName) {
    deleteTargetId = userId;
    document.getElementById('delete-user-name').textContent = userName;
    document.getElementById('delete-modal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

function closeDeleteModal() {
    deleteTargetId = null;
    document.getElementById('delete-modal').style.display = 'none';
}

async function confirmDeleteUser() {
    if (!deleteTargetId) return;

    const btn = document.getElementById('btn-confirm-delete');
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/admin/users/${deleteTargetId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!res.ok) {
            throw new Error('Failed to delete user');
        }

        closeDeleteModal();
        showToast('User deleted successfully', 'success');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════
// DEVICE MANAGEMENT
// ═══════════════════════════════════════════════════════

// ─── Open Devices Modal ────────────────────────────────
async function openDevicesModal(userId, userName, maxDevices) {
    devicesUserId = userId;
    devicesUserName = userName;

    document.getElementById('devices-modal-title').innerHTML = `
        <i data-lucide="smartphone" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: -3px;"></i>
        Devices — ${escapeHtml(userName)}
    `;
    document.getElementById('devices-limit-value').textContent = maxDevices;
    document.getElementById('devices-loading').style.display = 'flex';
    document.getElementById('devices-empty').style.display = 'none';
    document.getElementById('devices-list').style.display = 'none';
    document.getElementById('devices-modal').style.display = 'flex';

    if (window.lucide) lucide.createIcons();

    await loadDevices(userId);
}

// ─── Close Devices Modal ───────────────────────────────
function closeDevicesModal() {
    devicesUserId = null;
    devicesUserName = '';
    document.getElementById('devices-modal').style.display = 'none';
}

// ─── Load Devices ──────────────────────────────────────
async function loadDevices(userId) {
    try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}/devices`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!res.ok) throw new Error('Failed to load devices');

        const data = await res.json();
        const devices = data.devices || [];

        document.getElementById('devices-loading').style.display = 'none';
        document.getElementById('devices-count-label').textContent = `${devices.length} device${devices.length !== 1 ? 's' : ''}`;

        if (devices.length === 0) {
            document.getElementById('devices-empty').style.display = 'flex';
            document.getElementById('devices-list').style.display = 'none';
            document.getElementById('btn-remove-all-devices').style.display = 'none';
        } else {
            document.getElementById('devices-empty').style.display = 'none';
            document.getElementById('btn-remove-all-devices').style.display = 'flex';
            renderDevicesList(devices, userId);
        }
    } catch (err) {
        document.getElementById('devices-loading').style.display = 'none';
        showToast('Failed to load devices', 'error');
    }
}

// ─── Render Devices List ───────────────────────────────
function renderDevicesList(devices, userId) {
    const list = document.getElementById('devices-list');
    list.innerHTML = '';
    list.style.display = 'flex';

    devices.forEach((device, index) => {
        const card = document.createElement('div');
        card.className = 'device-card';

        const browserIcon = getBrowserIcon(device.browser);
        const osIcon = getOsIcon(device.os);
        const lastActive = device.last_active ? formatRelativeTime(device.last_active) : 'Unknown';
        const createdAt = device.created_at ? formatDate(device.created_at) : 'Unknown';
        const fingerprint = device.fingerprint ? device.fingerprint.substring(0, 12) + '...' : '—';

        card.innerHTML = `
            <div class="device-card-header">
                <div class="device-icon-group">
                    <div class="device-icon">${browserIcon}</div>
                    <div class="device-details">
                        <span class="device-name">${escapeHtml(device.device_name || 'Unknown Device')}</span>
                        <span class="device-meta">${escapeHtml(device.browser || '?')} · ${escapeHtml(device.os || '?')}</span>
                    </div>
                </div>
                <button class="btn-icon danger" onclick="removeDevice('${userId}', '${device.id}', '${escapeHtml(device.device_name || 'this device')}')" title="Remove device">
                    <i data-lucide="x-circle" style="width: 16px; height: 16px;"></i>
                </button>
            </div>
            <div class="device-card-body">
                <div class="device-info-row">
                    <span class="device-info-label">
                        <i data-lucide="clock" style="width: 12px; height: 12px; margin-right: 4px;"></i>
                        Last Active
                    </span>
                    <span class="device-info-value">${lastActive}</span>
                </div>
                <div class="device-info-row">
                    <span class="device-info-label">
                        <i data-lucide="calendar" style="width: 12px; height: 12px; margin-right: 4px;"></i>
                        First Seen
                    </span>
                    <span class="device-info-value">${createdAt}</span>
                </div>
                <div class="device-info-row">
                    <span class="device-info-label">
                        <i data-lucide="globe" style="width: 12px; height: 12px; margin-right: 4px;"></i>
                        IP Address
                    </span>
                    <span class="device-info-value">${escapeHtml(device.ip_address || 'Unknown')}</span>
                </div>
                <div class="device-info-row">
                    <span class="device-info-label">
                        <i data-lucide="fingerprint" style="width: 12px; height: 12px; margin-right: 4px;"></i>
                        Fingerprint
                    </span>
                    <span class="device-info-value device-fingerprint">${escapeHtml(fingerprint)}</span>
                </div>
            </div>
        `;

        list.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

// ─── Remove Single Device ──────────────────────────────
async function removeDevice(userId, deviceId, deviceName) {
    if (!confirm(`Remove "${deviceName}"? The user will be logged out on this device.`)) return;

    try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}/devices/${deviceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!res.ok) throw new Error('Failed to remove device');

        showToast('Device removed successfully', 'success');
        await loadDevices(userId);
        loadUsers(); // Refresh device counts in main table
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Remove All Devices ───────────────────────────────
async function removeAllDevices() {
    if (!devicesUserId) return;
    if (!confirm(`Remove ALL devices for "${devicesUserName}"? They will be logged out everywhere.`)) return;

    try {
        const res = await fetch(`${API_BASE}/admin/users/${devicesUserId}/devices`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!res.ok) throw new Error('Failed to remove devices');

        showToast('All devices removed successfully', 'success');
        await loadDevices(devicesUserId);
        loadUsers(); // Refresh device counts in main table
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Browser / OS Icon helpers ─────────────────────────
function getBrowserIcon(browser) {
    const b = (browser || '').toLowerCase();
    if (b.includes('chrome')) return '🌐';
    if (b.includes('firefox')) return '🦊';
    if (b.includes('safari')) return '🧭';
    if (b.includes('edge')) return '🔷';
    if (b.includes('opera')) return '🔴';
    return '🌐';
}

function getOsIcon(os) {
    const o = (os || '').toLowerCase();
    if (o.includes('windows')) return '🪟';
    if (o.includes('mac') || o.includes('ios')) return '🍎';
    if (o.includes('android')) return '🤖';
    if (o.includes('linux')) return '🐧';
    return '💻';
}

// ─── Toggle Password Visibility ────────────────────────
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.innerHTML = isPassword
        ? '<i data-lucide="eye-off" style="width: 16px; height: 16px;"></i>'
        : '<i data-lucide="eye" style="width: 16px; height: 16px;"></i>';
    if (window.lucide) lucide.createIcons();
}

// ─── Toast Notifications ───────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    toast.innerHTML = `<span>${icons[type] || ''}</span> ${escapeHtml(message)}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ─── Utility ───────────────────────────────────────────
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'Today, ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
