/* ═══════════════════════════════════════════════════════
   Admin Panel — Application Logic
   ═══════════════════════════════════════════════════════ */

const API_BASE = '/api/auth';
let adminToken = localStorage.getItem('admin_token');
let usersData = [];
let deleteTargetId = null;

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
function renderUsersTable() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';

    usersData.forEach(user => {
        const tr = document.createElement('tr');

        const name = user.name || '—';
        const email = user.email || '—';
        const mobile = user.mobile || '—';
        const status = user.is_active;
        const created = user.created_at ? formatDate(user.created_at) : '—';
        const lastLogin = user.last_login ? formatDate(user.last_login) : 'Never';

        tr.innerHTML = `
      <td class="user-name-cell">${escapeHtml(name)}</td>
      <td>
        <div class="user-contact-cell">
          <span class="email">${escapeHtml(email)}</span>
          ${mobile !== '—' ? `<span class="mobile">${escapeHtml(mobile)}</span>` : ''}
        </div>
      </td>
      <td>
        <span class="status-badge ${status ? 'active' : 'inactive'}">
          <span class="status-dot"></span>
          ${status ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="date-cell">${created}</td>
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

    const body = { name };
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
