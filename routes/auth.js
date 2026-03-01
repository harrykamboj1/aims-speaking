const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '4h';

// ─── Helper: Generate JWT ──────────────────────────────────────────────
function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// ─── Helper: Verify JWT ────────────────────────────────────────────────
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.log(error)
        return null;
    }
}

// ─── Middleware: Require Admin Auth ─────────────────────────────────────
function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
}

// ─── Middleware: Require User Auth ──────────────────────────────────────
async function requireUser(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'user') {
        return res.status(403).json({ error: 'User access required' });
    }

    try {
        // Query the database to ensure the user hasn't been deactivated
        const { data: user } = await supabase
            .from('users')
            .select('is_active')
            .eq('id', decoded.id)
            .single();

        if (!user || !user.is_active) {
            return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
        }

        // Verify the device is still registered (not removed by admin)
        if (decoded.device_id) {
            const { data: device } = await supabase
                .from('user_devices')
                .select('id')
                .eq('id', decoded.device_id)
                .eq('user_id', decoded.id)
                .single();

            if (!device) {
                return res.status(401).json({ error: 'This device has been removed. Please log in again.' });
            }

            // Update last_active timestamp (fire and forget)
            supabase
                .from('user_devices')
                .update({ last_active: new Date().toISOString() })
                .eq('id', decoded.device_id)
                .then(() => { });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Server error verifying user status' });
    }

    req.user = decoded;
    next();
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════

// ─── Admin Login ───────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (error) {
            console.error('Supabase DB Error:', error);
            return res.status(500).json({ error: `Database error: ${error.message || 'Could not connect to Supabase'}. Note: If you are in India using Excitel/Jio, your ISP might be blocking Supabase.` });
        }

        if (!admin) {
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        const validPassword = await bcrypt.compare(password, admin.password_hash);
        if (!validPassword) {
            console.error('Admin Login: Incorrect password');
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        const token = generateToken({
            id: admin.id,
            email: admin.email,
            role: 'admin'
        });

        // Update last_login
        await supabase
            .from('admins')
            .update({ last_login: new Date().toISOString() })
            .eq('id', admin.id);

        res.json({
            token,
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name
            }
        });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// ─── Get All Users (Admin) ─────────────────────────────────────────────
router.get('/admin/users', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, mobile, name, is_active, created_at, last_login, max_devices')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch device counts for all users
        const userIds = (users || []).map(u => u.id);
        let deviceCounts = {};

        if (userIds.length > 0) {
            const { data: devices } = await supabase
                .from('user_devices')
                .select('user_id');

            if (devices) {
                devices.forEach(d => {
                    deviceCounts[d.user_id] = (deviceCounts[d.user_id] || 0) + 1;
                });
            }
        }

        const usersWithDevices = (users || []).map(u => ({
            ...u,
            device_count: deviceCounts[u.id] || 0,
            max_devices: u.max_devices || 3
        }));

        res.json({ users: usersWithDevices });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ─── Create User (Admin) ──────────────────────────────────────────────
router.post('/admin/users', requireAdmin, async (req, res) => {
    const { email, mobile, password, name, max_devices } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }

    if (!email && !mobile) {
        return res.status(400).json({ error: 'Email or mobile number is required' });
    }

    try {
        // Check for existing user
        if (email) {
            const { data: existingEmail } = await supabase
                .from('users')
                .select('id')
                .eq('email', email.toLowerCase().trim())
                .single();

            if (existingEmail) {
                return res.status(409).json({ error: 'User with this email already exists' });
            }
        }

        if (mobile) {
            const { data: existingMobile } = await supabase
                .from('users')
                .select('id')
                .eq('mobile', mobile.trim())
                .single();

            if (existingMobile) {
                return res.status(409).json({ error: 'User with this mobile number already exists' });
            }
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const userData = {
            password_hash: passwordHash,
            name: name || null,
            is_active: true,
            max_devices: max_devices || 3,
            created_at: new Date().toISOString()
        };

        if (email) userData.email = email.toLowerCase().trim();
        if (mobile) userData.mobile = mobile.trim();

        const { data: newUser, error } = await supabase
            .from('users')
            .insert(userData)
            .select('id, email, mobile, name, is_active, created_at, max_devices')
            .single();

        if (error) throw error;

        res.status(201).json({ user: newUser });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// ─── Update User (Admin) ──────────────────────────────────────────────
router.put('/admin/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { email, mobile, password, name, is_active, max_devices } = req.body;

    try {
        const updateData = {};

        if (email !== undefined) updateData.email = email.toLowerCase().trim();
        if (mobile !== undefined) updateData.mobile = mobile.trim();
        if (name !== undefined) updateData.name = name;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (max_devices !== undefined) updateData.max_devices = parseInt(max_devices) || 3;

        if (password) {
            updateData.password_hash = await bcrypt.hash(password, 12);
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id)
            .select('id, email, mobile, name, is_active, created_at, last_login, max_devices')
            .single();

        if (error) throw error;

        res.json({ user: updatedUser });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ─── Delete User (Admin) ──────────────────────────────────────────────
router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ─── Get User Devices (Admin) ─────────────────────────────────────────
router.get('/admin/users/:id/devices', requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { data: devices, error } = await supabase
            .from('user_devices')
            .select('*')
            .eq('user_id', id)
            .order('last_active', { ascending: false });

        if (error) throw error;

        res.json({ devices: devices || [] });
    } catch (err) {
        console.error('Get devices error:', err);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// ─── Remove User Device (Admin) ───────────────────────────────────────
router.delete('/admin/users/:userId/devices/:deviceId', requireAdmin, async (req, res) => {
    const { userId, deviceId } = req.params;

    try {
        const { error } = await supabase
            .from('user_devices')
            .delete()
            .eq('id', deviceId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ message: 'Device removed successfully' });
    } catch (err) {
        console.error('Remove device error:', err);
        res.status(500).json({ error: 'Failed to remove device' });
    }
});

// ─── Remove All User Devices (Admin) ──────────────────────────────────
router.delete('/admin/users/:id/devices', requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase
            .from('user_devices')
            .delete()
            .eq('user_id', id);

        if (error) throw error;

        res.json({ message: 'All devices removed successfully' });
    } catch (err) {
        console.error('Remove all devices error:', err);
        res.status(500).json({ error: 'Failed to remove devices' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════════════════════════════

// ─── User Login ────────────────────────────────────────────────────────
router.post('/user/login', async (req, res) => {
    const { identifier, password, device_fingerprint, device_info } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Email/mobile and password are required' });
    }

    try {
        const trimmedIdentifier = identifier.trim().toLowerCase();

        // Try email first, then mobile
        let user = null;

        const { data: emailUser } = await supabase
            .from('users')
            .select('*')
            .eq('email', trimmedIdentifier)
            .single();

        if (emailUser) {
            user = emailUser;
        } else {
            const { data: mobileUser } = await supabase
                .from('users')
                .select('*')
                .eq('mobile', identifier.trim())
                .single();

            if (mobileUser) {
                user = mobileUser;
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials. Please check your email/mobile and password.' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials. Please check your email/mobile and password.' });
        }

        const maxDevices = user.max_devices || 3;
        const fingerprint = device_fingerprint || 'unknown';
        const info = device_info || {};

        // Check if this device is already registered
        const { data: existingDevice } = await supabase
            .from('user_devices')
            .select('id')
            .eq('user_id', user.id)
            .eq('fingerprint', fingerprint)
            .single();

        let deviceId;

        if (existingDevice) {
            // Device already registered — update last_active
            deviceId = existingDevice.id;
            await supabase
                .from('user_devices')
                .update({
                    last_active: new Date().toISOString(),
                    device_name: info.device_name || null,
                    browser: info.browser || null,
                    os: info.os || null,
                    ip_address: req.ip || req.headers['x-forwarded-for'] || null
                })
                .eq('id', deviceId);
        } else {
            // New device — check device limit
            const { data: currentDevices } = await supabase
                .from('user_devices')
                .select('id, last_active')
                .eq('user_id', user.id)
                .order('last_active', { ascending: true });

            const deviceCount = currentDevices ? currentDevices.length : 0;

            if (deviceCount >= maxDevices) {
                // Build a user-friendly message
                return res.status(403).json({
                    error: `Device limit reached. You can only use ${maxDevices} device${maxDevices > 1 ? 's' : ''}. Please contact the administrator to remove an old device or increase your limit.`,
                    code: 'DEVICE_LIMIT_REACHED',
                    device_count: deviceCount,
                    max_devices: maxDevices
                });
            }

            // Register the new device
            const { data: newDevice, error: deviceError } = await supabase
                .from('user_devices')
                .insert({
                    user_id: user.id,
                    fingerprint: fingerprint,
                    device_name: info.device_name || null,
                    browser: info.browser || null,
                    os: info.os || null,
                    ip_address: req.ip || req.headers['x-forwarded-for'] || null,
                    last_active: new Date().toISOString()
                })
                .select('id')
                .single();

            if (deviceError) {
                console.error('Device registration error:', deviceError);
                // If it's a unique constraint violation, the device was registered in a race condition
                if (deviceError.code === '23505') {
                    const { data: raceDevice } = await supabase
                        .from('user_devices')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('fingerprint', fingerprint)
                        .single();
                    deviceId = raceDevice?.id;
                } else {
                    throw deviceError;
                }
            } else {
                deviceId = newDevice.id;
            }
        }

        const loginTime = new Date().toISOString();

        const token = generateToken({
            id: user.id,
            email: user.email,
            mobile: user.mobile,
            role: 'user',
            device_id: deviceId,
            session_id: loginTime
        });

        // Update last_login
        await supabase
            .from('users')
            .update({ last_login: loginTime })
            .eq('id', user.id);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                mobile: user.mobile,
                name: user.name
            }
        });
    } catch (err) {
        console.error('User login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// ─── Verify Token ──────────────────────────────────────────────────────
router.get('/verify', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ valid: false });

    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ valid: false });

    // If it's a user, verify they are still active and device is valid
    if (decoded.role === 'user') {
        try {
            const { data: user } = await supabase
                .from('users')
                .select('is_active')
                .eq('id', decoded.id)
                .single();
            if (!user || !user.is_active) {
                return res.status(401).json({ valid: false, reason: 'account_inactive' });
            }

            // Verify device is still registered
            if (decoded.device_id) {
                const { data: device } = await supabase
                    .from('user_devices')
                    .select('id')
                    .eq('id', decoded.device_id)
                    .eq('user_id', decoded.id)
                    .single();

                if (!device) {
                    return res.status(401).json({ valid: false, reason: 'device_removed' });
                }
            }
        } catch (err) {
            return res.status(500).json({ valid: false });
        }
    }

    res.json({ valid: true, role: decoded.role, user: decoded });
});

module.exports = { router, requireUser, requireAdmin };
