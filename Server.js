const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const cron = require('node-cron');
const app = express();
const PORT = 5000;
const JWT_SECRET = 'SunCuller';

// Middleware                               
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection
mongoose.connect('mongodb+srv://admin:admin@cluster0.hecyn.mongodb.net/Attendance', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

cloudinary.config({
  cloud_name: 'diwalzljm',
  api_key: '657848662828942',
  api_secret: '5-3h0Bq57FT6sWJIZLjas6pP2Ws',
});

// Schemas and Models
const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  designation: String,
  salary: Number,
  branch: String,
  userId: { type: String, unique: true },
  timeIn: String,
  timeOutTime: String,
  lunchTime: Number,
});
const User = mongoose.model('User', userSchema);
const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  }
});
// Create the model from the schema
const Device = mongoose.model('Device', deviceSchema);
const adminSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: String,
  date: Date,
  session: String,
  reason: String,
  status: { type: String, default: 'pending' },
});

const Admin = mongoose.model('Admin', adminSchema);

const attendanceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  date: { type: String, required: true },
  timeIn: { type: String, required: false },
  attendance: { type: String, default: 'present' },
  session: String,
  path:{type: String},
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

const lateRequestSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  status: { type: String, default: 'pending' },
});

const LateRequest = mongoose.model('LateRequest', lateRequestSchema);

// Admin Authentication
const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = 'Sun@#2444';

// Login Endpoint
app.post('/api/login', async (req, res) => {
  const { username, password} = req.body;  
  try {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
      return res.json({ message: 'Welcome Admin', token });
    }

    const user = await User.findOne({ userId: username, phone: password });
    if (user) {
      const token = jwt.sign({ username: user.userId }, JWT_SECRET, { expiresIn: '1h' });
      
      return res.json({
        message: `Welcome ${user.name}`,
        token,
        userId: user.userId,
        name: user.name,
      });
    }

    return res.status(401).json({ message: 'Invalid username or password' });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'An error occurred during login' });
  }
});

app.post('/api/leaveRequest', async (req, res) => {
  const { name, date, session, reason, userId } = req.body;

  try {
    const newLeaveRequest = new Admin({
      userId,
      name,
      date,
      session,
      reason,
    });

    await newLeaveRequest.save();
    res.status(201).json({ message: 'Leave request submitted successfully!' });
  } catch (error) {
    console.error('Error adding leave request:', error);
    res.status(500).json({ message: 'Failed to submit leave request' });
  }
});

// Get attendance data with salary
app.get('/api/attendance/:userId', async (req, res) => {
  try {
      const { userId } = req.params;

      // Fetch attendance records for the given userId
      const attendanceRecords = await Attendance.find({ userId }, 'date attendance session');

      if (!attendanceRecords.length) {
          return res.status(404).json({ message: "No attendance records found for this user." });
      }

      // Fetch user data, including salary
      const user = await User.findOne({ userId: userId });

      if (!user) {
          return res.status(404).json({ message: "User not found." });
      }

      // Respond with attendance records and user salary
      res.status(200).json({
          attendanceRecords: attendanceRecords,
          salary: user.salary // Always return user's salary
      });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error", details: error.message });
  }
});

app.put('/api/leaveRequest/:userId', async (req, res) => {
  const { userId } = req.params;
  const { status,date,session } = req.body;
  try {
    const updatedLeaveRequests = await Admin.updateOne(
      { userId,date,session},
      { $set: { status } },
    );

    if (updatedLeaveRequests.modifiedCount === 0) {
      return res.status(404).json({ message: 'No leave requests found to update' });
    }

    if (status.toLowerCase() === 'approved') {
      const leaveRequests = await Admin.find({ userId });

      for (let leaveRequest of leaveRequests) {
        const attendanceData = {
          userId: leaveRequest.userId,
          userName: leaveRequest.name,
          date: leaveRequest.date,
          session: leaveRequest.session,
          attendance: 'absent',
        };

        const attendance = new Attendance(attendanceData);
        await attendance.save();
      }
    }

    res.status(200).json({ message: `Leave request(s) ${status.toLowerCase()}ed successfully!` });
  } catch (error) {
    console.error('Error updating leave request:', error);
    res.status(500).json({ message: 'Failed to update leave request' });
  }
});

app.put('/api/usersUpdate/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name, phone, designation, salary,
    timeIn, timeOutTime, lunchTime, branch
  } = req.body;

  // Validate required fields
  if (!name || !phone || !designation || !salary || !timeIn || !timeOutTime || !lunchTime || !branch) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    
    const updatedUser = await User.findOneAndUpdate(
      { userId: id },
      {
        name, phone, designation,
        salary, timeIn, timeOutTime,
        lunchTime, branch
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ status:'success' , message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});
// Daily Report Endpoint
app.get('/api/dailyreport', async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ message: 'Date is required' });
  }

  try {
    const attendanceRecords = await Attendance.find({ date });

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: 'No attendance records found for this date' });
    }

    const report = await Promise.all(attendanceRecords.map(async (record) => {
      const user = await User.findOne({ userId: record.userId });
      return {
        
        userName: record.userName,
        session: record.session,
        status: record.attendance,
        branch: user.branch,
        path:record.path,
      };
    }));

    res.status(200).json(report);
  } catch (error) {
    console.error('Error fetching daily report:', error);
    res.status(500).json({ message: 'Failed to fetch daily report', error: error.message });
  }
});
// Add User Endpoint
app.post('/api/addUser', async (req, res) => {
  const { name, phone, designation, salary, branch, timeIn, timeOutTime, lunchTime } = req.body;

  try {
    const branchCodes = {
      Uthukuli: '1',
      'Uthukuli Rs': '2',
      'Amman Nagar': '3',
      Koolipalayam: '4',
      Vijayamangalam: '5',
    };

    const branchCode = branchCodes[branch];
    if (!branchCode) {
      return res.status(400).json({ message: 'Invalid branch name' });
    }

    const branchUserCount = await User.countDocuments({ branch });
    const userCount = (branchUserCount + 1).toString().padStart(3, '0');
    const userId = `S${branchCode}${userCount}`;

    const newUser = new User({
      name,
      phone,
      designation,
      salary,
      branch,
      userId,
      timeIn,
      timeOutTime,
      lunchTime,
    });

    await newUser.save();

    res.status(201).json({ message: 'User added successfully!', userId });
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ message: 'Failed to add user' });
  }
});

app.get('/api/leaveData', async (req, res) => {
  try {
    const leaveRequests = await Admin.find();
    if (leaveRequests.length === 0) {
      return res.status(404).json({ message: 'No leave requests found' });
    }
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ message: 'Failed to fetch leave requests' });
  }
});

// Get all users' Name and Branch Endpoint
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find();
    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }
    return res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Punch In Endpoint
app.post('/api/punchIn', async (req, res) => {
  const { image, time, userId, userName, session } = req.body;

  if (!image || !time || !userId || !userName || !session) {
    return res.status(400).json({ message: 'Image, Time, userId, or userName is missing' });
  }

  try {
    const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${image}`, {
      folder: 'attendance_images',
      public_id: `${userId}_${time}`,
      overwrite: true,
    });

    const date = new Date().toISOString().split('T')[0];

    const newAttendance = new Attendance({
      userId,
      userName,
      date,
      timeIn: time,
      attendance: 'present',
      session,
      path:userId+"_"+time,
    });

    await newAttendance.save();

    res.status(200).json({
      message: 'Punch In successful',
      imageUrl: result.secure_url,
    });
  } catch (error) {
    console.error('Error during Punch In:', error);
    res.status(500).json({ message: 'Failed to save Punch In', error });
  }
});

app.get('/api/lunchTime/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ lunchTime: user.lunchTime });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching lunch time', error });
  }
});

app.post('/api/backToWork/:userId', async (req, res) => {
  const { userId } = req.params;
  const { userName, timeIn ,image} = req.body;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const date = new Date().toISOString().split('T')[0];

    const afternoonSessionAttendance = new Attendance({
      userId,
      userName,
      date,
      timeIn,
      attendance: 'present',
      session: 'Afternoon',
      path:userId+"_"+timeIn,
    });

    await afternoonSessionAttendance.save();
    const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${image}`, {
      folder: 'attendance_images',
      public_id: `${userId}_${timeIn}`,
      overwrite: true,
    });

    return res.status(200).json({ message: 'Back to work marked successfully' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ message: 'Error marking back to work', error: error.message });
  }
});

// Send Admin Request Endpoint
app.post('/api/sendAdminRequest', async (req, res) => {
  const { userId, userName, date, time } = req.body;

  if (!userId || !userName || !date || !time) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newLateRequest = new LateRequest({
      userId,
      userName,
      date,
      time,
      status: 'pending',
    });

    await newLateRequest.save();
    res.status(201).json({ message: 'Request sent to admin successfully!' });
  } catch (error) {
    console.error('Error sending admin request:', error);
    res.status(500).json({ message: 'Failed to send admin request' });
  }
});
app.get('/api/lateRequests', async (req, res) => {
  try {
    const lateRequests = await LateRequest.find();
    
    if (lateRequests.length === 0) {
      return res.status(404).json({ message: 'No late requests found' });
    }

    res.status(200).json(lateRequests);
  } catch (error) {
    console.error('Error fetching late requests:', error);
    res.status(500).json({ message: 'Failed to fetch late requests', error: error.message });
  }
});
app.put('/api/lateRequests/:requestId', async (req, res) => {
  const { requestId } = req.params;
  const { status, date,userName ,time} = req.body;
    console.log(time)
  try {
    // Find the LateRequest by userId (requestId in params) and update its status and date
    const updatedRequest = await LateRequest.findOneAndUpdate(
      {userId: requestId,date,time }, // Search by userId
      { status},
      { new: true, runValidators: true, upsert: true } // Ensure new data is returned, validation is run, and create if not exists
    );

    // If the request is not found
    if (!updatedRequest) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // If the status is 'approved', add an attendance entry
    if (status === 'approved') {
      const attendanceData = new Attendance({
        userName:userName,
        userId: requestId,
        session: 'Afternoon',
        attendance: 'present',
        date: date,
      });

      // Save the attendance record
      await attendanceData.save();
    }

    // Send the updated request data back
    res.status(200).json({
      message: 'Request status updated successfully',
      request: updatedRequest,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating request' });
  }
});

 

app.post('/device', async (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ message: 'Device ID is required' });
  }

  try {
    // Check if the deviceId already exists
    const existingDevice = await Device.findOne({ deviceId });

    if (existingDevice) {
      // Update the existing device
      
      existingDevice.deviceId = deviceId;
      await existingDevice.save();
      res.status(200).json({ message: 'Device updated' });
    } else {
      // Add new device
      const newDevice = new Device({ deviceId });
      await newDevice.save();
      res.status(200).json({ message: 'Device registered' });
    }
  } catch (error) {
    console.error('Error saving device:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/getLateRequestStatus', async (req, res) => {
  const { userId, userName, date } = req.body;
  //console.log(`Received request with userId: ${userId}, userName: ${userName}, date: ${date}`);

  if (!userId) {
    return res.status(400).json({ message: 'userId, userName, and date are required' });
  }

  try {
    const lateRequest = await LateRequest.findOne({ userId,date });
    if (!lateRequest) {
      //console.log('Late request not found');
      return res.status(404).json({ message: 'Late request not found' });
    }

    res.status(200).json({ status: lateRequest.status });
  } catch (error) {
    console.error('Error fetching late request status:', error);
    res.status(500).json({ message: 'Failed to fetch late request status' });
  }
});
app.get('/api/timeIn/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ timeIn: user.timeIn });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching  time', error });
  }
});

app.put('/api/MorninglateRequests/:requestId', async (req, res) => {
  const { requestId } = req.params;
  const { status, date,userName ,time} = req.body;
    console.log(time)
  try {
    // Find the LateRequest by userId (requestId in params) and update its status and date
    const updatedRequest = await LateRequest.findOneAndUpdate(
      {userId: requestId,date,time }, // Search by userId
      { status},
      { new: true, runValidators: true, upsert: true } // Ensure new data is returned, validation is run, and create if not exists
    );

    // If the request is not found
    if (!updatedRequest) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // If the status is 'approved', add an attendance entry
    if (status === 'approved') {
      const attendanceData = new Attendance({
        userName:userName,
        userId: requestId,
        session: 'Morning',
        attendance: 'present',
        date: date,
      });

      // Save the attendance record
      await attendanceData.save();
    }

    // Send the updated request data back
    res.status(200).json({
      message: 'Request status updated successfully',
      request: updatedRequest,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating request' });
  }
});



// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});