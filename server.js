// server.js
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const Razorpay = require('razorpay');

const app = express();
const port = 3000;
const razorpay = new Razorpay({
    key_id: 'rzp_test_T7qu1l1wzFOO0J',
    key_secret: 'SI5UymdGSS19ktViMhzFZ19i'
});

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'secret', // Change this to a random secret key
    resave: false,
    saveUninitialized: false
}));

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Vaibhav@123',
    database: 'expense_pass'
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to MySQL database');
});

// User Authentication Middleware
function authenticateToken(req, res, next) {
    const token = req.session.token;
    if (!token) return res.sendStatus(401);

    jwt.verify(token, 'your-secret-key', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Get User Name Route
app.get('/getUserName', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.query('SELECT name FROM users WHERE id = ?', [userId], (err, results) => {
        if (err) {
            res.status(500).send('Failed to fetch user name');
            throw err;
        }
        if (results.length > 0) {
            const userName = results[0].name;
            res.status(200).json({ name: userName });
        } else {
            res.status(404).send('User not found');
        }
    });
});

// Signup Route
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword], (err, result) => {
        if (err) {
            res.status(500).send('Failed to sign up');
            throw err;
        }
        res.status(200).send('User signed up successfully');
    });
});

// Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            res.status(500).send('Failed to log in');
            throw err;
        }

        if (results.length > 0) {
            const user = results[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                // Check if the user is premium
                const isPremium = user.is_premium === 1;
                const token = jwt.sign({ id: user.id }, 'your-secret-key'); // Change this secret key
                req.session.token = token;
                // Set premium status in the session
                req.session.isPremium = isPremium;
                res.status(200).send('Login successful');
            } else {
                res.status(401).send('Incorrect email or password');
            }
        } else {
            res.status(401).send('Incorrect email or password');
        }
    });
});


// Logout Route
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).send('Failed to logout');
            throw err;
        }
        res.status(200).send('Logged out successfully');
    });
});

// Add Expense Route
app.post('/addExpense', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { amount, description, category } = req.body;

    db.query('INSERT INTO expenses (user_id, amount, description, category) VALUES (?, ?, ?, ?)', [userId, amount, description, category], (err, result) => {
        if (err) {
            res.status(500).send('Failed to add expense');
            throw err;
        }
        res.status(200).send('Expense added successfully');
    });
});

// Delete Expense Route
app.delete('/deleteExpense/:id', authenticateToken, (req, res) => {
    const expenseId = req.params.id;
    const userId = req.user.id;

    db.query('DELETE FROM expenses WHERE id = ? AND user_id = ?', [expenseId, userId], (err, result) => {
        if (err) {
            res.status(500).send('Failed to delete expense');
            throw err;
        }
        if (result.affectedRows === 0) {
            res.status(403).send('You are not authorized to delete this expense');
        } else {
            res.status(200).send('Expense deleted successfully');
        }
    });
});

// Get Expenses Route
app.get('/getExpenses', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.query('SELECT * FROM expenses WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            res.status(500).send('Failed to fetch expenses');
            throw err;
        }
        res.status(200).json(results);
    });
});

// Create Order Route
app.post('/createOrder', authenticateToken, async (req, res) => {
    const amount = 50000; // Amount in smallest currency unit (e.g., paise for INR)
    const currency = 'INR';
    const receipt = 'order_rcptid_' + Math.floor(Math.random() * 1000); // Generate a random receipt ID

    const options = {
        amount: amount,
        currency: currency,
        receipt: receipt
    };

    try {
        const order = await razorpay.orders.create(options);
        res.status(200).json(order);
    } catch (error) {
        console.error('Failed to create order:', error);
        res.status(500).send('Failed to create order');
    }
});

// Update Order Status Route (on successful payment)
app.post('/updateOrderStatus', authenticateToken, async (req, res) => {
    const orderId = req.body.orderId;
    const userId = req.user.id;

    try {
        // Handle successful payment logic here
        // Set user's premium status in the database
        db.query('UPDATE users SET is_premium = 1 WHERE id = ?', [userId], (err, result) => {
            if (err) {
                console.error('Failed to update user premium status:', err);
                res.status(500).send('Failed to update user premium status');
            } else {
                res.status(200).send('Order status updated successfully');
            }
        });
    } catch (error) {
        console.error('Failed to update order status:', error);
        res.status(500).send('Failed to update order status');
    }
});

// Update Order Status Route (on failed payment)
app.post('/updateOrderStatusFailed', authenticateToken, async (req, res) => {
    const orderId = req.body.orderId;
    const userId = req.user.id;

    try {
        // Handle failed payment logic here
        res.status(200).send('Order status updated successfully');
    } catch (error) {
        console.error('Failed to update order status:', error);
        res.status(500).send('Failed to update order status');
    }
});

// Get Leaderboard Route
app.get('/leaderboard', (req, res) => {
    // Check if the user is premium
    if (req.session.isPremium) {
        // User is premium, allow access to leaderboard
        db.query('SELECT user_id, SUM(amount) AS totalExpense FROM expenses GROUP BY user_id ORDER BY totalExpense DESC LIMIT 10', (err, results) => {
            if (err) {
                console.error('Error fetching leaderboard:', err);
                res.status(500).send('Failed to fetch leaderboard');
            } else {
                res.status(200).json(results);
            }
        });
    } else {
        // User is not premium, deny access to leaderboard
        res.status(403).send('Premium feature, access denied');
    }
});



// Get Summed Up Expenses Route
app.get('/summedUpExpenses', checkPremium, (req, res) => {
    db.query('SELECT user_id, SUM(amount) AS totalExpense FROM expenses GROUP BY user_id ORDER BY totalExpense DESC', (err, results) => {
        if (err) {
            console.error('Error fetching summed up expenses:', err);
            res.status(500).send('Failed to fetch summed up expenses');
        } else {
            res.status(200).json(results);
        }
    });
});



// Middleware to check if user is premium
function checkPremium(req, res, next) {
    const userId = req.user.id;

    db.query('SELECT is_premium FROM users WHERE id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Error checking premium status:', err);
            res.status(500).send('Failed to check premium status');
        } else {
            const isPremium = results[0].is_premium;
            if (isPremium) {
                // Set a flag in the session to indicate premium status
                req.session.isPremium = true;
                next();
            } else {
                res.status(403).send('Premium feature, access denied');
            }
        }
    });
}


// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});