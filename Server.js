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
mongoose.connect('mongodb+srv://admin:admin@attendaceapp.be0c3.mongodb.net/Projects', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

cloudinary.config({
  cloud_name: 'diqhluqy8',
  api_key: '928656697324721',
  api_secret: 'WmjWbVOlLeEWteHp3Eh017XeXgI',
});

async function deleteImagesFromCloudinary() {
  try {
    // Fetch all resources (images) from the specified folder
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'attendance_images',
      max_results: 90, 
    });

    if (result.resources.length === 0) {
      console.log('No images found in the folder.');
      return;
    }

    // Extract public IDs of the images
    const publicIds = result.resources.map((resource) => resource.public_id);

    // Delete the images using their public IDs
    await cloudinary.api.delete_resources(publicIds);

    console.log(`${publicIds.length} images deleted successfully.`);
  } catch (error) {
    console.error('Error deleting images from Cloudinary:', error);
  }
}

// Schedule the task to run every Sunday at 12:00 AM
cron.schedule('0 0 * * 0', () => {
  console.log('Running scheduled task to delete images...');
  deleteImagesFromCloudinary();
});

console.log('Scheduler started. Waiting for Sunday 12:00 AM to trigger image deletion.');
const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // Name of the branch
  code: { type: String, required: true, unique: true }, // Code for the branch
});
const Branch = mongoose.model('Branch', branchSchema);
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
const deletedUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  deletedAt: { type: Date, default: Date.now },
});

const DeletedUser = mongoose.model('DeletedUser', deletedUserSchema);
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
  session:{type:String}
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
    // Fetch the branch details from the branches collection
    const branchDetails = await Branch.findOne({ name: branch });

    if (!branchDetails) {
      return res.status(400).json({ message: 'Invalid branch name' });
    }

    const branchCode = branchDetails.code;

    // Find the user to be updated
    const existingUser = await User.findOne({ userId: id });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the branch has changed
    let newUserId = existingUser.userId; // Default to the current userId
    if (existingUser.branch !== branch) {
      // Count the number of users in the new branch
      const branchUserCount = await User.countDocuments({ branch });
      let userCount = (branchUserCount + 1).toString().padStart(3, '0'); // Format as 3-digit number
      newUserId = `S${branchCode}${userCount}`; // Generate new userId

      // Ensure the new userId does not exist in DeletedUser
      while (await DeletedUser.exists({ userId: newUserId })) {
        userCount = (parseInt(userCount, 10) + 1).toString().padStart(3, '0');
        newUserId = `S${branchCode}${userCount}`;
      }
    }

    // Update the user with the new details
    const updatedUser = await User.findOneAndUpdate(
      { userId: id },
      {
        name, phone, designation,
        salary, timeIn, timeOutTime,
        lunchTime, branch,
        userId: newUserId // Update the userId if the branch has changed
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({ status: 'success', message: 'User updated successfully', user: updatedUser });
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
        userId:record.userId,
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

  // Validate input
  console.log(designation)
  if (!name || !phone || !designation || !salary || !branch || !timeIn  || !lunchTime) {
    
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Fetch the branch details from the branches collection
    const branchDetails = await Branch.findOne({ name: branch });

    if (!branchDetails) {
      return res.status(400).json({ message: 'Invalid branch name' });
    }

    const branchCode = branchDetails.code;

    // Count the number of users in the same branch
    const branchUserCount = await User.countDocuments({ branch });
    let userCount = (branchUserCount + 1).toString().padStart(3, '0'); // Format as 3-digit number
    let userId = `S${branchCode}${userCount}`; // Generate userId (e.g., S1001)

    // Check if the generated userId exists in DeletedUser collection
    while (await DeletedUser.exists({ userId })) {
      // Increment user count and regenerate userId
      userCount = (parseInt(userCount, 10) + 1).toString().padStart(3, '0');
      userId = `S${branchCode}${userCount}`;
    }

    // Create a new user
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

    // Save the new user to the database
    await newUser.save();

    res.status(201).json({ message: 'User added successfully!', userId });
  } catch (error) {
    console.error('Error adding user:', error);

    // Handle duplicate key error specifically
    if (error.code === 11000) {
      return res.status(409).json({ message: 'User ID already exists' });
    }

    // Handle other errors
    res.status(500).json({ message: 'Failed to add user', error: error.message });
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
  const { userId, userName, date, time,session } = req.body;

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
      session,
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
  const { userId, userName, date,session,time } = req.body;
  //console.log(`Received request with userId: ${userId}, userName: ${userName}, date: ${date}`);

  if (!userId) {
    return res.status(400).json({ message: 'userId, userName, and date are required' });
  }

  try {
    
    const lateRequest = await LateRequest.findOne({ userId,date,session,time });
    
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
    return res.status(200).json({ timeIn: user.timeIn,timeOut:user.timeOutTime });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching  time', error });
  }
});
// Add Branch Endpoint
app.post('/api/addBranch', async (req, res) => {
  const { name } = req.body;

  // Validate input
  if (!name) {
    return res.status(400).json({ message: 'Branch name is required' });
  }

  try {
    // Check if a branch with the same name already exists
    const existingBranch = await Branch.findOne({ name });

    if (existingBranch) {
      return res.status(409).json({ message: 'Branch name already exists' });
    }

    // Fetch all existing branches to determine the next branch code
    const branches = await Branch.find({}, 'code').sort({ code: -1 }).limit(1);

    // Determine the next branch code
    const nextCode = branches.length > 0 ? (parseInt(branches[0].code, 10) + 1).toString() : '1';

    // Create a new branch with the provided name and auto-incremented code
    const newBranch = new Branch({
      name,
      code: nextCode,
    });

    // Save the new branch to the database
    await newBranch.save();

    res.status(201).json({ message: 'Branch added successfully!', branch: { name, code: nextCode } });
  } catch (error) {
    console.error('Error adding branch:', error);

    // Handle duplicate key error specifically
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Branch name already exists' });
    }

    // Handle other errors
    res.status(500).json({ message: 'Failed to add branch', error: error.message });
  }
});

app.get('/api/branches', async (req, res) => {
  try {
    // Fetch all branches from the database
    const branches = await Branch.find({}, 'name'); // Only retrieve the 'name' field

    // Extract branch names into an array
    const branchNames = branches.map(branch => branch.name);

    // Return the list of branch names
    res.status(200).json({ branches: branchNames });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ message: 'Failed to fetch branches', error: error.message });
  }
});
app.delete('/api/deleteUser/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Find the user by userId
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete the user
    await User.deleteOne({ userId });

    // Add the userId to the DeletedUser collection to prevent reuse
    await DeletedUser.create({ userId });

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find(); // Fetch all users from the database

    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }

    return res.status(200).json(users); // Return the list of users
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
});
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Attendance Management System' });
} ); 
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});