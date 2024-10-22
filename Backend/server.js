require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors({
    origin: 'http://localhost:3000', // Replace with your frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));
app.use(express.json());

const PORT = process.env.PORT || 5000;

// MongoDB connection using environment variable
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://asadullah84888:vickv.495@cluster0.ud5qw.mongodb.net/attendance';
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB connected to attendance database'))
    .catch((err) => console.log('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },  // Admin role can be added
});

const User = mongoose.model('User', userSchema);

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true }, // Add name field
    employeeId: { type: String, required: true }, // Add employeeId field
    date: { type: Date, default: Date.now }, // Date when attendance is marked
});



const Attendance = mongoose.model('Attendance', attendanceSchema);

// JWT Secret from environment variable
const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';

// Routes

// Sign-up Route
app.post('/signup', async (req, res) => {
    const { employeeId, name, password } = req.body;

    try {
        // Check if user already exists
        let user = await User.findOne({ employeeId });
        if (user) return res.status(400).json({ msg: 'User already exists' });

        // Determine if the user is an admin based on a specific employeeId
        const role = (employeeId === 'admin1') ? 'admin' : 'user'; // Replace 'adminEmployeeId' with your admin ID

        // Create a new user
        user = new User({ employeeId, name, password, role });

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        // Generate a JWT
        const payload = { user: { id: user.id, role } }; // Include role in the payload
        jwt.sign(payload, jwtSecret, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, msg: 'Account created successfully!' });
        });
    } catch (err) {
        console.error('Sign-up error:', err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { employeeId, password } = req.body;

    try {
        // Check if user exists
        const user = await User.findOne({ employeeId });
        if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

        // Generate a JWT, include the user's role
        const payload = { user: { id: user.id, role: user.role } }; // Include role in the payload
        jwt.sign(payload, jwtSecret, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, msg: 'Login successful!', role: user.role }); // Return role along with token
        });
    } catch (err) {
        console.error('Login error:', err); // Log the error for debugging
        res.status(500).json({ msg: 'Server error' });
    }
});

app.post('/mark-attendance', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        console.error('User ID is missing in the request');
        return res.status(400).json({ msg: 'User ID is required' });
    }

    try {
        // Find the user by their employeeId or other identifier
        const user = await User.findOne({ employeeId: userId });

        if (!user) {
            console.error(`User not found: ${userId}`);
            return res.status(404).json({ msg: 'User not found' });
        }

        // Check if attendance for today has already been marked
        const today = new Date();
        const existingAttendance = await Attendance.findOne({
            userId: user._id,
            date: {
                $gte: new Date(today.setHours(0, 0, 0, 0)),
                $lt: new Date(today.setHours(23, 59, 59, 999)),
            },
        });

        if (existingAttendance) {
            return res.status(400).json({ msg: 'Attendance already marked for today' });
        }

        // Mark attendance
        const attendance = new Attendance({
            userId: user._id,
            name: user.name, // Ensure the name is stored
            employeeId: user.employeeId // Add employeeId to the attendance record
        });

        await attendance.save();
        res.json({ msg: 'Attendance marked successfully!' });
    } catch (err) {
        console.error('Error marking attendance:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// Get User Data Route
app.get('/users', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, jwtSecret);
        const currentUser = await User.findById(decoded.user.id);

        if (!currentUser) return res.status(404).json({ msg: 'User not found' });

        let users;
        if (currentUser.role === 'admin') {
            users = await User.find(); // Admin can view all users
        } else {
            users = await User.find({ _id: currentUser._id }); // Non-admin user sees only themselves
        }

        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// Attendance History Route
// Attendance History Route by Employee ID
app.get('/attendances/:employeeId', async (req, res) => {
    const { employeeId } = req.params;

    try {
        console.log("Received request for attendance history of employee:", employeeId);

        // Fetch attendance records for the given employeeId
        const attendanceRecords = await Attendance.find({ employeeId: employeeId });

        console.log("Fetched attendance records:", attendanceRecords);

        if (attendanceRecords.length === 0) {
            console.log("No attendance records found for employee:", employeeId);
            return res.status(404).json({ msg: 'No attendance records found for this employee' });
        }

        // Log the number of records found
        console.log(`Found ${attendanceRecords.length} attendance record(s) for employee:`, employeeId);

        res.json({ records: attendanceRecords });
    } catch (error) {
        console.error("Error fetching attendance history:", error);
        res.status(500).json({ message: 'Error fetching attendance history' });
    }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
