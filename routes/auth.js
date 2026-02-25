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
            .select('id, email, mobile, name, is_active, created_at, last_login')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ users: users || [] });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ─── Create User (Admin) ──────────────────────────────────────────────
router.post('/admin/users', requireAdmin, async (req, res) => {
    const { email, mobile, password, name } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }

    if (!email && !mobile) {
        return res.status(400).json({ error: 'Email or mobile number is required' });
    }

    try {
        // Check for existing user
        let query = supabase.from('users').select('id');

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
            created_at: new Date().toISOString()
        };

        if (email) userData.email = email.toLowerCase().trim();
        if (mobile) userData.mobile = mobile.trim();

        const { data: newUser, error } = await supabase
            .from('users')
            .insert(userData)
            .select('id, email, mobile, name, is_active, created_at')
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
    const { email, mobile, password, name, is_active } = req.body;

    try {
        const updateData = {};

        if (email !== undefined) updateData.email = email.toLowerCase().trim();
        if (mobile !== undefined) updateData.mobile = mobile.trim();
        if (name !== undefined) updateData.name = name;
        if (is_active !== undefined) updateData.is_active = is_active;

        if (password) {
            updateData.password_hash = await bcrypt.hash(password, 12);
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id)
            .select('id, email, mobile, name, is_active, created_at, last_login')
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

// ═══════════════════════════════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════════════════════════════

// ─── User Login ────────────────────────────────────────────────────────
router.post('/user/login', async (req, res) => {
    const { identifier, password } = req.body;

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

        const token = generateToken({
            id: user.id,
            email: user.email,
            mobile: user.mobile,
            role: 'user'
        });

        // Update last_login
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
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

    // If it's a user, verify they are still active in the database
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
        } catch (err) {
            return res.status(500).json({ valid: false });
        }
    }

    res.json({ valid: true, role: decoded.role, user: decoded });
});

module.exports = { router, requireUser, requireAdmin };
