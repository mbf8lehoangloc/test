const  express = require('express');
const  app = express();

app.use(express.urlencoded({extended: true, limit: '1mb'})); 

let path = require("path");
const staticPath = path.join(__dirname, 'public');
app.use('/public', express.static(staticPath));

const bodyParser = require('body-parser');
app.use(bodyParser.json());

let pdf = require("html-pdf");
const fs = require('fs');

// set the view engine to ejs
let ejs = require("ejs");
app.set('view engine', 'ejs');

// use res.render to load up an ejs view file
const moment = require('moment');
// hash User/Password
const bcrypt = require('bcrypt');

const session = require('express-session');
    const sessionConfig = {
        secret: 'secret-key',
        resave: false,
        saveUninitialized: true,
        // cookie: { maxAge: 5 * 60 * 1000 } // Thời gian hết hạn là 3 giây
    };
    app.use(session(sessionConfig));

    var mysql = require('mysql2');
    const dbConfig = {
        host: 'localhost',
        user: 'root',
        password: '123456789',
        database: 'loc'
    };
    
    let connection;
    
    function isConnectionActive(connection) {
      return connection && connection._closed === false;
    }

    function establishConnection() {
      if (isConnectionActive(connection)) {
          console.log("Database connection is already active.");
          return;
      }
        console.log("No Database connection. Create new connection is procresing...");
        connection = mysql.createPool(dbConfig);
        connection.getConnection(function(err) {
            if (err) {
                console.log("Error while connecting with database: ", err);
            } else {
                console.log("Database is connected");
                // setTimeout(closeAndReconnect, 10*1000); // Đợi 10 giây trước khi đóng và mở kết nối mới
            }
        });        
    }
    establishConnection();

    let activeConnections = [];

    // Tạo một hàm để kiểm tra trạng thái của kết nối
    function checkConnectionStatus(connection) {
        return new Promise((resolve, reject) => {
            connection.ping((err) => {
                if (err) {
                    reject(err); // Kết nối không hoạt động
                } else {
                    resolve(); // Kết nối hoạt động
                }
            });
        });
    }
    
    // Tạo một hàm để đếm số lượng kết nối đang hoạt động
    async function countActiveConnections() {
        let activeCount = 0;
        
        for (let connection of activeConnections) {
            try {
                await checkConnectionStatus(connection);
                activeCount++;
            } catch (error) {
                // Kết nối không hoạt động
            }
        }
        return activeCount;
    }
    activeConnections.push(connection);

    // Đếm số lượng kết nối đang hoạt động và không hoạt động
    async function countConnections() {
        let totalConnections = activeConnections.length;
        let activeCount = await countActiveConnections();
        let inactiveCount = totalConnections - activeCount;

        console.log("Tổng số kết nối: " + totalConnections);
        console.log("Kết nối đang hoạt động: " + activeCount);
        console.log("Kết nối không hoạt động: " + inactiveCount);
    }

    countConnections();

    setInterval(establishConnection, 5 * 60 * 60 * 1000);
    setTimeout(countConnections, (5 * 60 * 60 * 1000)-1);
    

const hashPassword = async (password) => {// Hàm để mã hóa mật khẩu
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    console.log('Lỗi mã hóa mật khẩu:', error);
    throw error;
  }
};

// Chuyển đổi các hàm callback thành Promises
const util = require('util');
const query = util.promisify(connection.query).bind(connection);
// const queryPromise = util.promisify(connection.query).bind(connection);


    function executeQuery(query, params) {
          return new Promise((resolve, reject) => {
            connection.query(query, params, function (err, result) {
              if (err) {reject(err);
              } else {
                resolve(result);}
            });
          });
        }

// -----------------------------------API--------------------------------------//
// --------------------------------API Login-----------------------------------//

app.post('/register', async function(req, res) {
  res.sendFile('/register');
  });

app.get('/register',  function(req, res) {
  res.render('part/register', {
    full_name: '',
    user_name: '',
    password: '',
    department_id: '',
    mail: '',
    phone: ''
  });

});

app.post('/save', async function(req, res) {
  const { full_name, user_name, password, department_id, mail, phone } = req.body;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  // Kiểm tra xem tên người dùng đã tồn tại chưa
  connection.query('SELECT * FROM admin_user WHERE user_name = ?', [user_name], async function(error, existingUser) {
    if (error) {
      console.error(error);
      return res.render('error', { error: 'Lỗi khi kiểm tra tên người dùng' });
    }

    if (existingUser.length > 0) {
      const errorMessage = 'Tên người dùng đã tồn tại. Vui lòng chọn tên người dùng khác.';
      return res.render('part/register', { errorMessage: errorMessage, full_name, user_name, password, department_id, mail, phone, date_create });
    }

    try {
      // Hash mật khẩu
      const hashedPassword = await hashPassword(password);

      // Thêm người dùng mới vào cơ sở dữ liệu
      connection.query('INSERT INTO admin_user (full_name, user_name, password, department_id, mail, phone, date_create) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [full_name, user_name, hashedPassword, department_id, mail, phone, date_create], function(error, result) {
          if (error) {
            console.error(error);
            return res.render('error', { error: 'Lỗi khi lưu dữ liệu' });
          }

          console.log("Insert into admin_user is successful!");
          res.redirect('/register'); //Tạo trang thông báo Tạo user thành công, then res.redirect('/register') or trang view danh sách user
        });
    } catch (error) {
      console.error(error);
      res.render('error', { error: 'Lỗi khi băm mật khẩu' });
    }
  });
});

// Thêm một endpoint mới để xử lý đăng nhập và trả về JSON cho React native
app.post('/api/login', async function(req, res) {
  const { user_name, password } = req.body;

  try {
    const rows = await query('SELECT * FROM admin_user WHERE user_name = ?', [user_name]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin đăng nhập.' });
    }

    const user = rows[0];
    
    if (!user || !user.password) {
      return res.status(400).json({ success: false, message: 'Lỗi cấu trúc dữ liệu người dùng.' });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (isPasswordMatch) {
      req.session.user = user;
      const userlogin = req.session.user.user_name;
      console.log("Người dùng: " + userlogin + " đã đăng nhập");
      return res.status(200).json({ success: true, message: 'Đăng nhập thành công' });
    } else {
      return res.status(401).json({ success: false, message: 'Đăng nhập không thành công. Hãy kiểm tra thông tin.' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi xử lý đăng nhập.' });
  }
});

app.post('/login', async function(req, res) {
  const { user_name, password } = req.body;

  try {// Tìm người dùng trong cơ sở dữ liệu
  const rows = await query('SELECT * FROM admin_user WHERE user_name = ?', [user_name]);

  if (rows.length === 0) {
      const errorMessage = 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin đăng nhập.';
      res.render('part/check-user', { errorMessage: errorMessage });
  } else {
      const user = rows[0];

      if (!user || !user.password) {
      const errorMessage = 'Lỗi cấu trúc dữ liệu người dùng.';
      res.render('part/check-user', { errorMessage: errorMessage });
      } else {
      // So sánh mật khẩu đã mã hóa với mật khẩu nhập vào
      const isPasswordMatch = await bcrypt.compare(password, user.password);

      if (isPasswordMatch) {
          // Lưu thông tin người dùng trong session
          req.session.user = user;

          const userlogin = req.session.user.user_name;
          console.log("Người dùng: " + userlogin + " đã đăng nhập");

          // Điều hướng người dùng sau khi đăng nhập thành công
          res.redirect('/home');
      } else {
          const errorMessage = 'Đăng nhập không thành công, hãy kiểm tra thông tin.';
          res.render('part/check-user', { errorMessage: errorMessage });
      }
      }
  }
  } catch (error) {
  console.error(error);
  }
});

app.get('/login', function(req, res) {// Kiểm tra xem người dùng đã đăng nhập hay chưa
  const success = req.query.success;
  const errorMessage = req.query.errorMessage;
  
  if (req.session.user) {        
      return res.render('/welcome')};

  res.render('part/check-user', { success, errorMessage });

});
app.get('/logout', function(req, res) {// Xóa thông tin người dùng khỏi session
  const user = req.session.user.user_name;
  console.log("Người dùng: " + user + " đã đăng xuất");
  req.session.destroy();
  res.redirect('/login');// Điều hướng người dùng sau khi đăng xuất thành công
});

app.get('/welcome', Login, async function(req, res) {
  const obj = { print: null };
  const user = req.session.user;
  const id = req.session.user.user_id;
  const jobId = req.query.jobId;

  const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*,  
                                                  DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                  DATE_FORMAT(a.date_report, '%d/%m/%Y') AS date_report_new
                                                FROM (SELECT @rownum := 0) r, event_group a
                                                WHERE a.status >= 0 
                                                  AND a.user_id_member = ? order by a.date_add_member desc`, [id]);

  if (resultMember && resultMember.length > 0) {
    obj.printMem = resultMember;
  }

  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  
  let found = false;
  
  for (const month of months) {
    const queryFind = `SELECT a.*, b.user_member, b.user_id_member
                            from thang${month} a, event_group b 
                            where a.id = b.event_id 
                              and b.status = 1 
                              and b.event_status = 1
                              and a.status = 1 
                              and b.event_id = ?
                              and b.user_id_member = ?` // Remove quotes around '?'
                              
    const resultFind = await executeQuery(queryFind, [jobId, id]);

    if (resultFind && resultFind.length > 0) {
      obj.printFind = resultFind;
      found = true;
      break;
    }
  }

  if (found) {
    res.render('welcome', { user: user, obj: obj, jobId: jobId });
  } else {
    const errorMessage = 'Không tìm thấy dữ liệu';
    res.render('welcome', { errorMessage: errorMessage, user: user, obj: obj, jobId: jobId });
  }
});

app.post('/find', Login, async(req, res) => {
  const obj = { print: null };
  const user = req.session.user;
  const id = req.session.user.user_id;
  const jobId = req.body.jobId;

  const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*,  
                                                  DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                  DATE_FORMAT(a.date_report, '%d/%m/%Y') AS date_report_new
                                                FROM (SELECT @rownum := 0) r, event_group a
                                                WHERE a.status >= 0 
                                                  AND a.user_id_member = ? order by a.date_add_member desc`, [id]);

  if (resultMember && resultMember.length > 0) {
    obj.printMem = resultMember;
  }

  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  
  let found = false;
  
  for (const month of months) {
    const queryFind = `SELECT a.*, b.user_member, b.user_id_member
                            from thang${month} a, event_group b 
                            where a.id = b.event_id 
                              and b.status = 1 
                              and b.event_status = 1
                              and a.status = 1 
                              and b.event_id = ?
                              and b.user_id_member = ?` // Remove quotes around '?'
                              
    const resultFind = await executeQuery(queryFind, [jobId, id]);

    if (resultFind && resultFind.length > 0) {
      obj.printFind = resultFind;
      found = true;
      break;
    }
  }

  if (found) {
    res.render('welcome', { user: user, obj: obj, jobId: jobId });
  } else {
    const errorMessage = 'Không tìm thấy dữ liệu';
    res.render('welcome', { errorMessage: errorMessage, user: user, obj: obj, jobId: jobId });
  }
});

app.get('/change-password', Login, function(req, res) {// Kiểm tra xem người dùng đã đăng nhập hay chưa
  res.render('part/user-change-password')
});

app.post('/change-password', Login, async function(req, res) {
  const userID_changePass = req.session.user.user_id;
  const { currentPassword, newPassword } = req.body;

  try {
    // Kiểm tra xem user_id tồn tại trong cơ sở dữ liệu hay không
    const [results] = await connection.promise().query('SELECT * FROM admin_user WHERE user_id = ?', [userID_changePass]);

    if (results.length === 0) {
      res.status(404).json({ message: 'User not found' });
    } else {
      // So sánh mật khẩu hiện tại với mật khẩu trong cơ sở dữ liệu
      const user = results[0];
      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        const message = 'Mật khẩu hiện tại không đúng.';
        res.render('part/user-change-password', { message: message });
      } else {
        // Mã hóa mật khẩu mới
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Cập nhật mật khẩu mới vào cơ sở dữ liệu
        await connection.promise().query('UPDATE admin_user SET password = ? WHERE user_id = ?', [hashedPassword, userID_changePass]);

        const message = 'Thay đổi mật khẩu thành công.';
        req.session.destroy(function(err) {
          if (err) {
            console.error(err);
          }
          res.redirect('/login?success=true'); // Chỉ cần truyền đường dẫn "/login" vào hàm redirect
        });
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

function requireLogin(req, res, next) {// Function gắn vào middleware cho các route cần kiểm tra đăng nhập
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.status !== 1) {
    console.log(req.session.user.status);
    return res.render('part/0-access-decline');
  }
  req.user = req.session.user;
  next();
}

async function notExist(req, res, next) {
  const id = req.params.id;
  const user_id_perform = req.session.user.user_id;
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  
  let found = false; // Biến cờ để kiểm tra xem có kết quả hợp lệ trong vòng lặp hay không
  
  for (const month of months) {
    const queryMonth = `select  a.*, b.user_id_member 
                        from thang${month} a, event_group b 
                        where a.id = b.event_id 
                          and b.status = 1 
                          and a.status = 1 
                          and a.id = ?
                          and b.user_id_member in (?)`;
    const resultMonth = await executeQuery(queryMonth, [id, user_id_perform]);

    if (resultMonth && resultMonth.length > 0) {
      found = true;
      break; // Tìm thấy kết quả hợp lệ, thoát khỏi vòng lặp
    } else {
      // console.log(id, user_id_perform, resultMonth.length, month, months);
    }
  }

  if (found) {
    next(); // Tiếp tục xử lý
  } else {
    res.render('part/0-access-decline'); // Trả về thông báo lỗi
  }
}

async function notEdit(req, res, next) {
  const id = req.params.id;
  const user_id_perform = req.session.user.user_id;
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  
  let found2 = false;

  for (const month of months) {
    const queryNotEdit = `select  * from thang${month} 
                          where status = 1 
                            and id = ?
                            and user_id_create = (?)`;
    const NotEdit = await executeQuery(queryNotEdit, [id, user_id_perform]);

    if (NotEdit && NotEdit.length > 0) {
      found2 = true;
      break; // Tìm thấy kết quả hợp lệ, thoát khỏi vòng lặp
    } else {
      // console.log(id, user_id_perform, resultMonth.length, month, months);
    }
  }

  if (found2) {
    next(); // Tiếp tục xử lý
  } else {
    res.render('part/0-access-decline'); // Trả về thông báo lỗi
  }
}

async function notEditWorkGranted(req, res, next) {
  const eg_id = req.params.eg_id;
  const user_id_perform = req.session.user.user_id;
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  
  let found3 = false;

  for (const month of months) {
    const queryNotEdit = `select  a.*, b.event_member_id
                            from thang${month} a, event_group b 
                            where a.id = b.event_id 
                              and b.status = 1 
                              and a.status = 1 
                              and b.event_member_id = ?
                              and a.user_id_create = ?`;
    const NotEdit = await executeQuery(queryNotEdit, [eg_id, user_id_perform]);

    if (NotEdit && NotEdit.length > 0) {
      found3 = true;
      break; // Tìm thấy kết quả hợp lệ, thoát khỏi vòng lặp
    } else {
      // console.log(id, user_id_perform, resultMonth.length, month, months);
    }
  }

  if (found3) {
    next(); // Tiếp tục xử lý
  } else {
    res.render('part/0-access-decline'); // Trả về thông báo lỗi
  }
}

async function notEditWorkreport(req, res, next) {
  const eg_id = req.params.eg_id;
  const user_id_perform = req.session.user.user_id;
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  
  let found3 = false;

  for (const month of months) {
    const queryNotEdit = `select  a.*, b.event_member_id
                            from thang${month} a, event_group b 
                            where a.id = b.event_id 
                              and b.status = 1 
                              and a.status = 1 
                              and b.event_member_id = ?
                              and b.user_id_member = ?`;
    const NotEdit = await executeQuery(queryNotEdit, [eg_id, user_id_perform]);

    if (NotEdit && NotEdit.length > 0) {
      found3 = true;
      break; // Tìm thấy kết quả hợp lệ, thoát khỏi vòng lặp
    } else {
      // console.log(id, user_id_perform, resultMonth.length, month, months);
    }
  }

  if (found3) {
    next(); // Tiếp tục xử lý
  } else {
    res.render('part/0-access-decline'); // Trả về thông báo lỗi
  }
}

async function staticsCompleted(req, res, next) {
  try {
    const id = req.params.id;
    const user_id_login = req.session.user.user_id;

    
    const basic_statics_Uncompleted = await executeQuery(`SELECT COUNT(mission_completed)
                                                          FROM event_group
                                                          WHERE event_id = ? AND mission_completed = 0 and status = 1`, [id]);

    if (basic_statics_Uncompleted && basic_statics_Uncompleted.length > 0) {
      req.basic_statics_Uncompleted = basic_statics_Uncompleted;
    };

    const basic_statics_percent = await executeQuery(`select (select count(mission_completed) count from event_group eg where event_id = ? and mission_completed > 0 and status = 1) / count(mission_completed)
                                                      from event_group 
                                                      where event_id = ? and status = 1;`, [id, id]); 

    if (basic_statics_percent && basic_statics_percent.length > 0) {
          const resultPercent = basic_statics_percent[0];
          const value = parseFloat(Object.values(resultPercent)[0]);
          const percentage = (value * 100).toFixed(0) + '%';
          req.basic_statics_percent = percentage;
          // Cách 2: const eventID = id;
          // const result2 = basic_statics_percent[0][`(select count(mission_completed) count from event_group eg where event_id = '${eventID}' and mission_completed > 0 and status = 1) / count(mission_completed)`];
          // console.log(result2);
        };
    
    const basic_statics_selectApercent = await executeQuery(`SELECT (SELECT COUNT(mission_completed) count FROM event_group eg WHERE event_id = ? AND mission_completed = 2 AND status = 1) / COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND status = 1`, [id, id]);

    if (basic_statics_selectApercent && basic_statics_selectApercent.length > 0) {
      const resultPercentA = basic_statics_selectApercent[0];
      const valueA = parseFloat(Object.values(resultPercentA)[0]);
      const percentageA = (valueA * 100).toFixed(1) + '%';
      req.basic_statics_selectApercent = percentageA;
    };

    const basic_statics_selectA = await executeQuery(`SELECT COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND mission_completed = 2 and status = 1`, [id]);

    if (basic_statics_selectA && basic_statics_selectA.length > 0) {
      req.basic_statics_selectA = basic_statics_selectA;
    };

    const basic_statics_selectBpercent = await executeQuery(`SELECT (SELECT COUNT(mission_completed) count FROM event_group eg WHERE event_id = ? AND mission_completed = 3 AND status = 1) / COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND status = 1`, [id, id]);

    if (basic_statics_selectBpercent && basic_statics_selectBpercent.length > 0) {
      const resultPercentB = basic_statics_selectBpercent[0];
      const valueB = parseFloat(Object.values(resultPercentB)[0]);
      const percentageB = (valueB * 100).toFixed(1) + '%';
      req.basic_statics_selectBpercent = percentageB;
    };

    const basic_statics_selectB = await executeQuery(`SELECT COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND mission_completed = 3 and status = 1`, [id]);

    if (basic_statics_selectB && basic_statics_selectB.length > 0) {
      req.basic_statics_selectB = basic_statics_selectB;
    };

    const basic_statics_selectCpercent = await executeQuery(`SELECT (SELECT COUNT(mission_completed) count FROM event_group eg WHERE event_id = ? AND mission_completed = 4 AND status = 1) / COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND status = 1`, [id, id]);

    if (basic_statics_selectCpercent && basic_statics_selectCpercent.length > 0) {
      const resultPercentC = basic_statics_selectCpercent[0];
      const valueC = parseFloat(Object.values(resultPercentC)[0]);
      const percentageC = (valueC * 100).toFixed(1) + '%';
      req.basic_statics_selectCpercent = percentageC;
    };
    
    const basic_statics_selectC = await executeQuery(`SELECT COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND mission_completed = 4 and status = 1`, [id]);

    if (basic_statics_selectC && basic_statics_selectC.length > 0) {
      req.basic_statics_selectC = basic_statics_selectC;
    };

    const basic_statics_selectDpercent = await executeQuery(`SELECT (SELECT COUNT(mission_completed) count FROM event_group eg WHERE event_id = ? AND mission_completed = 5 AND status = 1) / COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND status = 1`, [id, id]);

    if (basic_statics_selectDpercent && basic_statics_selectDpercent.length > 0) {
      const resultPercentD = basic_statics_selectDpercent[0];
      const valueD = parseFloat(Object.values(resultPercentD)[0]);
      const percentageD = (valueD * 100).toFixed(1) + '%';
      req.basic_statics_selectDpercent = percentageD;
    };
    
    const basic_statics_selectD = await executeQuery(`SELECT COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND mission_completed = 5 and status = 1`, [id]);

    if (basic_statics_selectD && basic_statics_selectD.length > 0) {
      req.basic_statics_selectD = basic_statics_selectD;
    };

    const basic_statics_completed = await executeQuery(`SELECT COUNT(mission_completed)
                                                        FROM event_group
                                                        WHERE event_id = ? AND mission_completed > 0 and status = 1`, [id]);

    if (basic_statics_completed && basic_statics_completed.length > 0) {
      req.basic_statics_completed = basic_statics_completed;
      next();
    } else {
      res.render('part/0-access-decline');
    }

  } catch (error) {
    next(error);
  }
}

// Middleware kiểm tra dữ liệu trùng lặp
const checkDuplicateData = async (req, res, next) => {
  try {
    // Các xử lý khác
    // ...

    // Kiểm tra dữ liệu trùng lặp và gán giá trị cho duplicateDataMessage
    let duplicateDataMessage = null; // Giá trị mặc định

    const id = req.params.id;
    const { user_id } = JSON.parse(req.body['{"user_id": "", "full_name": ""}']);

    // Kiểm tra dữ liệu trùng lặp trong cơ sở dữ liệu
    const query = 'SELECT COUNT(*) AS duplicateCount FROM event_group WHERE event_id = ? AND user_id_member = ? AND status = 1';
    const result = await executeQuery(query, [id, user_id]);

    const duplicateCount = result[0].duplicateCount;
    if (duplicateCount > 0) {
      console.log("Thêm dữ liệu trùng lập tại ID: "+id);
      duplicateDataMessage = 'Dữ liệu trùng lặp!';
      req.session.error = duplicateDataMessage; // Lưu thông báo lỗi vào session
      return res.redirect('/edit/' + id); // Chuyển hướng đến trang /edit/:id
    }

    // Truyền giá trị cho duplicateDataMessage vào req để sử dụng trong API /add:id
    req.duplicateDataMessage = duplicateDataMessage;

    // Dữ liệu không trùng lặp, chuyển tiếp sang middleware hoặc xử lý tiếp theo
    next();
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
};

function Login(req, res, next) {// Function gắn vào middleware cho các route cần kiểm tra đăng nhập
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// ---------------------------------API Home-----------------------------------//
// ----------------------------------RESTful-----------------------------------//

app.get('/home', requireLogin, staticsCompleted, async function(req, res) {
  try {
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_perform = req.session.user.user_id;
    
    for (const month of months) {
      const result = await executeQuery(`select  a.*, b.user_id_member, YEAR(sysdate()) AS current_year
                                          from thang${month} a, event_group b 
                                          where a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            and b.user_id_member in (?)`,[user_id_perform]);
      obj[`printT${month}`] = result;
    }

    const year = await executeQuery(`SELECT YEAR(CURRENT_DATE) AS this_year`);
        if (year && year.length > 0) {
          obj.printyear = year[0].this_year;
        };

    const { print, ...printTs } = obj;

    res.render("./route-home", { obj, print, ...printTs, user_id_perform, user: req.session.user });
  }
  catch (err) {console.error(err);
                res.status(500).send('Internal Server Error');
  }
});

app.get('/home-last-year-:idYear', requireLogin, staticsCompleted, async function(req, res) {
  try {
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_perform = req.session.user.user_id;
    const idYear = req.params.idYear - 1;
    
    for (const month of months) {
      const result = await executeQuery(`select  a.*, b.user_id_member, YEAR(sysdate()) AS current_year
                                          from thang${month} a, event_group b 
                                          where a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = (?)
                                            and b.user_id_member in (?)`,[idYear ,user_id_perform]);
      obj[`printT${month}`] = result;
    }

    obj.printyear = idYear;

    const { print, ...printTs } = obj;

    res.render("./route-home", { obj, print, ...printTs, user_id_perform, user: req.session.user });
  }
  catch (err) {console.error(err);
                res.status(500).send('Internal Server Error');
  }
});

app.get('/home-next-year-:idYear', requireLogin, staticsCompleted, async function(req, res) {
  try {
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_perform = req.session.user.user_id;
    const idYear = parseInt(req.params.idYear) + 1;
    
    for (const month of months) {
      const result = await executeQuery(`select  a.*, b.user_id_member, YEAR(sysdate()) AS current_year
                                          from thang${month} a, event_group b 
                                          where a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = (?)
                                            and b.user_id_member in (?)`,[idYear ,user_id_perform]);
      obj[`printT${month}`] = result;
    }

    obj.printyear = idYear;

    const { print, ...printTs } = obj;

    res.render("./route-home", { obj, print, ...printTs, user_id_perform, user: req.session.user });
  }
  catch (err) {console.error(err);
                res.status(500).send('Internal Server Error');
  }
});


    app.get('/home-show/:id', requireLogin, notExist, staticsCompleted, async function(req, res) {
      try {
        const id = req.params.id;
        const kpi_id = req.params.id;
        const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const obj = { print: null };
        const user_id_perform = req.session.user.user_id;
        const depart_ID = req.session.user.department_id;
        
        const basic_statics_completed = req.basic_statics_completed;
        const basic_statics_Uncompleted = req.basic_statics_Uncompleted;
        const basic_statics_percent = req.basic_statics_percent;

        const basic_statics_selectA = req.basic_statics_selectA;
        const basic_statics_selectApercent = req.basic_statics_selectApercent;
        const basic_statics_selectB = req.basic_statics_selectB;
        const basic_statics_selectBpercent = req.basic_statics_selectBpercent;
        const basic_statics_selectC = req.basic_statics_selectC;
        const basic_statics_selectCpercent = req.basic_statics_selectCpercent;
        const basic_statics_selectD = req.basic_statics_selectD;
        const basic_statics_selectDpercent = req.basic_statics_selectDpercent;

        const deparment = req.deparment;

        // Nội dung sự kiện
        for (const month of months) {
          const queryMonth = ` SELECT * FROM THANG${month} where id =?` ;
          const resultMonth = await executeQuery(queryMonth, [id]);
          obj[`printT${month}`] = resultMonth;
        }
        
        // Nội dung Thành viên tham gia
        const queries = months.map(month => ({
          query: `SELECT  a.*, 
                          DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create,
                          DAY(date_create) AS date_create_number,
                          MONTH(date_create) AS month_create_number,
                          YEAR(date_create) AS year_create_number,
                          DATE_FORMAT(date_create, '%m/%Y') AS month_year_start,
                          DATE_FORMAT(CURRENT_DATE, '%m/%Y') AS month_year_current
                    FROM THANG${month} a WHERE a.id = ?`
        }));

        for (const { query } of queries) {
          const result = await executeQuery(query, [id]);
          if (result && result.length > 0) {
            obj.print = result;
          } 
        }

        const rowspanMember = await executeQuery(`select event_member_id_parent, count(event_member_id_parent) as dem
                                                    from event_group eg 
                                                    where event_id = ? 
                                                    group by (event_member_id_parent)`, [id]);
        if (rowspanMember && rowspanMember.length > 0) {
        obj.printRowSpan = rowspanMember
        }; 

        const rowParentSTT = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, t.event_member_id_parent
                                                  FROM  (SELECT @rownum := 0) r, 
                                                        (SELECT DISTINCT event_member_id_parent 
                                                          FROM event_group 
                                                          WHERE event_id = ?) t;`, [id]);
        if (rowParentSTT && rowParentSTT.length > 0) {
        obj.printrowParentSTT = rowParentSTT
        }; 

        const rowChildSTT = await executeQuery(`SELECT event_member_id_child, event_member_id,
                                                       @rownum := IF(event_member_id_child = 0, 1, @rownum + 1) AS stt,
                                                       event_member_id_parent
                                                  FROM event_group, (SELECT @rownum := 0) r
                                                  WHERE event_id = ?
                                                  ORDER BY event_member_id_parent, event_member_id_child;`, [id]);
        if (rowChildSTT && rowChildSTT.length > 0) {
        obj.printrowChildSTT = rowChildSTT
        }; 

        const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, b.full_name, c.department_code,
                                                        DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                        DATE_FORMAT(a.date_deadline_start, '%d/%m/%Y') AS date_deadline_start,
                                                        DATE_FORMAT(a.date_completed, '%d/%m/%Y') AS date_completed,
                                                        DATE_FORMAT(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY), '%d/%m/%Y') AS date_deadline_end,
                                                        
                                                        DAY(a.date_deadline_start) AS date_participant_start,
                                                        MONTH(a.date_deadline_start) AS month_participant_start,
                                                        DATE_FORMAT(a.deadline_compare, '%m/%Y') AS month_year_participant_end,

                                                        DAY(a.date_completed) AS date_daycompleted,
                                                        MONTH(a.date_completed) AS month_completed,
                                                                                                                
                                                        DAY(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY)) AS date_daydeadline,
                                                        MONTH(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY)) AS month_daydeadline,

                                                        TIMESTAMPDIFF(DAY, CURDATE(), DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS deadline_countdown,
                                                        TIMESTAMPDIFF(DAY, date(a.date_completed),DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS compare
                                                  FROM (SELECT @rownum := 0) r, event_group a, admin_user b, admin_user_department c
                                                  WHERE a.status = 1 AND b.status = 1
                                                    AND b.department_id = c.department_id
                                                    AND a.user_id_member = b.user_id 
                                                    AND a.event_id=? 
                                                  ORDER BY a.event_member_id_parent, a.date_add_member`, [id]);
        if (resultMember && resultMember.length > 0) {
        obj.printMem = resultMember
        };  

        const queryKPI = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*,
                                                    DATE_FORMAT(a.kpi_date_create, '%d/%m/%Y') AS kpi_date_create,
                                                    DATE_FORMAT(a.kpi_result_date, '%d/%m/%Y') AS kpi_result_date
                                                  FROM (SELECT @rownum := 0) r, kpi a
                                                  WHERE a.kpi_status = 1 AND a.kpi_member_status = 1                                                
                                                    AND a.kpi_eg_id=? AND a.kpi_member_id in (?)`, [id, user_id_perform]);
        if (queryKPI && queryKPI.length > 0) {
              obj.printQueryKPI = queryKPI
        };    

        const basic_statics = await executeQuery(`SELECT COUNT(mission_completed)
                                                    FROM event_group eg
                                                    WHERE event_id = ? and status = 1`, [id]);
        if (basic_statics && basic_statics.length > 0) {
              obj.printStatics = basic_statics
            };
        
        const show_icon_edit = await executeQuery(`SELECT user_id_add_member
                                                    FROM event_group eg
                                                    WHERE event_id = ? and status = 1 
                                                                      and user_id_member = ?`, [id, user_id_perform]);
        if (show_icon_edit && show_icon_edit.length > 0) {
              obj.printIconEdit = show_icon_edit
            };
        
        const daySum = await executeQuery(`SELECT DAY(LAST_DAY(CURRENT_DATE)) AS days_in_month`);
        if (daySum && daySum.length > 0) {
          obj.printdaySum = daySum[0].days_in_month;
        };
        const dayCurrent = await executeQuery(`SELECT DAY(CURRENT_DATE) AS current_day`);
        if (dayCurrent && dayCurrent.length > 0) {
          obj.printdayCurrent = dayCurrent[0].current_day;
        };
        const monthCurrent = await executeQuery(`SELECT MONTH(CURRENT_DATE) AS current_month`);
        if (monthCurrent && monthCurrent.length > 0) {
          obj.printmonthCurrent = monthCurrent[0].current_month;
        };
        const yearCurrent = await executeQuery(`SELECT YEAR(CURRENT_DATE) AS current_year`);
        if (yearCurrent && yearCurrent.length > 0) {
          obj.printyearCurrent = yearCurrent[0].current_year;
        };

        const { print, ...printTs } = obj;

        res.render('./route-home-show', { obj, print, ...printTs, id, kpi_id,
                                        basic_statics_completed, basic_statics_Uncompleted, basic_statics_percent, deparment,
                                        basic_statics_selectA, basic_statics_selectB, basic_statics_selectC, basic_statics_selectD,  
                                        basic_statics_selectApercent, basic_statics_selectBpercent, basic_statics_selectCpercent, basic_statics_selectDpercent,
                                        user_id_perform, show_icon_edit,
                                        user: req.session.user });
      } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
      }
    });

    app.get('/home-show2/:id', requireLogin, notExist, staticsCompleted, async function(req, res) {
      try {
        const id = req.params.id;
        const kpi_id = req.params.id;
        const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const obj = { print: null };
        const user_id_perform = req.session.user.user_id;

        const deparment = req.deparment;

        // Nội dung sự kiện
        for (const month of months) {
          const queryMonth = ` SELECT * FROM THANG${month} where id =?` ;
          const resultMonth = await executeQuery(queryMonth, [id]);
          obj[`printT${month}`] = resultMonth;
        }
        
        // Nội dung Thành viên tham gia
        const queries = months.map(month => ({
          query: `SELECT  a.*, 
                          DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create,
                          DAY(date_create) AS date_create_number,
                          MONTH(date_create) AS month_create_number
                    FROM THANG${month} a WHERE a.id = ?`
        }));

        for (const { query } of queries) {
          const result = await executeQuery(query, [id]);
          if (result && result.length > 0) {
            obj.print = result;
          } 
        }

        const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, b.full_name, c.department_code,
                                                        DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                        DATE_FORMAT(a.date_completed, '%d/%m/%Y') AS date_completed,
                                                        DAY(a.date_completed) AS date_daycompleted,
                                                        MONTH(a.date_completed) AS month_completed,
                                                        DATE_FORMAT(a.date_deadline_start, '%d/%m/%Y') AS date_deadline_start,
                                                        DAY(a.date_deadline_start) AS date_participant_start,
                                                        MONTH(a.date_deadline_start) AS month_participant_start,
                                                        DATE_FORMAT(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY), '%d/%m/%Y') AS date_deadline_end,
                                                        TIMESTAMPDIFF(DAY, CURDATE(), DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS deadline_countdown,
                                                        TIMESTAMPDIFF(DAY, date(a.date_completed),DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS compare
                                                  FROM (SELECT @rownum := 0) r, event_group a, admin_user b, admin_user_department c
                                                  WHERE a.status = 1 AND b.status = 1
                                                    AND b.department_id = c.department_id
                                                    AND a.user_id_member = b.user_id 
                                                    AND a.event_id=?`, [id]);
        if (resultMember && resultMember.length > 0) {
              obj.printMem = resultMember
        }; 

        
        const daySum = await executeQuery(`SELECT DAY(LAST_DAY(CURRENT_DATE)) AS days_in_month`);
        if (daySum && daySum.length > 0) {
          obj.printdaySum = daySum[0].days_in_month;
        };
        const dayCurrent = await executeQuery(`SELECT DAY(CURRENT_DATE) AS current_day`);
        if (dayCurrent && dayCurrent.length > 0) {
          obj.printdayCurrent = dayCurrent[0].current_day;
        };
        const monthCurrent = await executeQuery(`SELECT MONTH(CURRENT_DATE) AS current_month`);
        if (monthCurrent && monthCurrent.length > 0) {
          obj.printmonthCurrent = monthCurrent[0].current_month;
        };

        // async function fetchCurrentDay() {
        //   const CurrentDayResult = await executeQuery(`SELECT DATE_FORMAT(CONVERT_TZ(DATE(CURRENT_DATE+1), @@session.time_zone, '+00:00'), '%Y-%m-%dT00:00:00.000Z')`);
          
        //   if (CurrentDayResult && CurrentDayResult.length > 0) {
        //       const result = CurrentDayResult[0]; // Lấy giá trị đầu tiên từ mảng kết quả
        //       const key = Object.keys(result)[0]; // Lấy khóa đầu tiên của đối tượng
        //       if (result && result[key]) {
        //           obj.printCurrentday = result[key];
        //       }
        //   }
        //   console.log(obj.printCurrentday);
        // }
      
        // fetchCurrentDay();

        const Currentday = await executeQuery(`SELECT DATE_FORMAT(CONVERT_TZ(DATE(CURRENT_DATE+1), @@session.time_zone, '+00:00'), '%Y-%m-%dT00:00:00.000Z')`);
        if (Currentday && Currentday.length > 0) {          
          const result = Currentday[0];
          const key = Object.keys(result)[0];
          if (result && result[key]) {

              obj.printCurrentday = result[key]; //c1

              const dateSt = obj.printCurrentday;
              const dateParts = dateSt.match(/\d+/g);
              const objDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], dateParts[3], dateParts[4], dateParts[5]));
              obj.printCurrentday2 = objDate; //c2
          }
        };
        const currentTime = moment();
        const currentDate = new Date();
        
        let z;
        const startDate = moment(currentTime.format('DD-MM-YYYY'), 'DD-MM-YYYY').startOf('month').toDate();
        let dateStrArray = [];
        for (z = 0; z < obj.printdaySum; z++) {
          const targetDate = new Date(startDate.getTime() + z * 86400000);
          const day = targetDate.getDate().toString().padStart(2, '0');
          const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
          const year = targetDate.getFullYear();
          const dateStr = `${day}/${month}/${year}`;
          dateStrArray.push(dateStr); 
        }
        const d1 = new Date(dateStrArray[12].split('/').reverse().join('-')); // Chuyển đổi dateStrArray[1] thành đối tượng Date
        const date1 = d1.getTime();
        const date2 = obj.printCurrentday2.getTime();

        const timeDiff = date1 - date1; // Tính sự chênh lệch thời gian
        const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24)); // Chia ra số ngày
        console.log(currentDate);
        console.log(obj.printCurrentday);
        console.log(obj.printCurrentday2);
        console.log(date1);
        console.log(date2);
        console.log(timeDiff);
        console.log(diffDays);

        if (date2 === date1) {
            console.log("Bằng nhau.");
        } else {
            console.log("Trật lấc");
        };

        const { print, ...printTs } = obj;

        res.render('./route-home-show2', { obj, print, ...printTs, id, kpi_id, deparment,
                                        user_id_perform, dateStrArray,
                                        user: req.session.user });
      } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
      }
    });

    app.post('/select/:id', requireLogin, async (req, res) => {
      const id = req.params.id;
      const { q, Thang } = req.body;
      const obj = { print: null };
    
      // Sử dụng Prepared Statements để tránh lỗi SQL Injection
      const query = `SELECT DAY(LAST_DAY(STR_TO_DATE(CONCAT('01', '/', SUBSTRING_INDEX(?, '/', 1), '/', SUBSTRING_INDEX(?, '/', -1)), '%d/%m/%Y'))) AS days_in_month`;
      
      const SumSelectedDay = await executeQuery(query, [Thang, Thang]);
    
      if (SumSelectedDay && SumSelectedDay.length > 0) {
        obj.printSumSelectedDay = SumSelectedDay[0].days_in_month;
      }
    
      console.log(Thang, id, SumSelectedDay);
      res.redirect(`/select/${id}?SumSelectedDay=${obj.printSumSelectedDay}&Thang=${Thang}`);
    });

    app.get('/select/:id', requireLogin, notExist, staticsCompleted, async function(req, res) {
      try {
        const id = req.params.id;
        const kpi_id = req.params.id;
        const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const obj = { print: null };
        const user_id_perform = req.session.user.user_id;
        const SumSelectedDay = req.query.SumSelectedDay;
        var ThangSelected = req.query.Thang;
        var Thang = req.query.Thang;
        Thang = parseInt(Thang);
        const deparment = req.deparment;
        // console.log(Thang, id, SumSelectedDay);
        // Nội dung sự kiện
        for (const month of months) {
          const queryMonth = ` SELECT * FROM THANG${month} where id =?` ;
          const resultMonth = await executeQuery(queryMonth, [id]);
          obj[`printT${month}`] = resultMonth;
        }
        
        // Nội dung Thành viên tham gia
        const queries = months.map(month => ({
          query: `SELECT  a.*, 
                          DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create,
                          DAY(date_create) AS date_create_number,
                          MONTH(date_create) AS month_create_number,
                          YEAR(date_create) AS year_create_number,
                          DATE_FORMAT(date_create, '%m/%Y') AS month_year_start,
                          DATE_FORMAT(CURRENT_DATE, '%m/%Y') AS month_year_current
                    FROM THANG${month} a WHERE a.id = ?`
        }));

        for (const { query } of queries) {
          const result = await executeQuery(query, [id]);
          if (result && result.length > 0) {
            obj.print = result;
            if (result[0] && typeof result[0].month_create_number !== 'undefined') {
              const monthCreateNumberType = typeof result[0].month_create_number;
              // console.log('Kiểu dữ liệu của result.month_create_number:', monthCreateNumberType);
            }
          } 
        }        

        const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, b.full_name, c.department_code,
                                                        DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                        DATE_FORMAT(a.date_deadline_start, '%d/%m/%Y') AS date_deadline_start,
                                                        DATE_FORMAT(a.date_completed, '%d/%m/%Y') AS date_completed,
                                                        DATE_FORMAT(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY), '%d/%m/%Y') AS date_deadline_end,
                                                        
                                                        DAY(a.date_deadline_start) AS date_participant_start,
                                                        MONTH(a.date_deadline_start) AS month_participant_start,

                                                        DAY(a.date_completed) AS date_daycompleted,
                                                        MONTH(a.date_completed) AS month_completed,
                                                                                                                
                                                        DAY(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY)) AS date_daydeadline,
                                                        MONTH(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY)) AS month_daydeadline,

                                                        TIMESTAMPDIFF(DAY, CURDATE(), DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS deadline_countdown,
                                                        TIMESTAMPDIFF(DAY, date(a.date_completed),DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS compare
                                                  FROM (SELECT @rownum := 0) r, event_group a, admin_user b, admin_user_department c
                                                  WHERE a.status = 1 AND b.status = 1
                                                    AND b.department_id = c.department_id
                                                    AND a.user_id_member = b.user_id 
                                                    AND a.event_id=? 
                                                  ORDER BY a.event_member_id_parent, a.date_add_member`, [id]);
        if (resultMember && resultMember.length > 0) {
        obj.printMem = resultMember
        };  

        const rowspanMember = await executeQuery(`select event_member_id_parent, count(event_member_id_parent) as dem
                                                    from event_group eg 
                                                    where event_id = ? 
                                                    group by (event_member_id_parent)`, [id]);
        if (rowspanMember && rowspanMember.length > 0) {
        obj.printRowSpan = rowspanMember
        }; 

        const rowParentSTT = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, t.event_member_id_parent
                                                  FROM  (SELECT @rownum := 0) r, 
                                                        (SELECT DISTINCT event_member_id_parent 
                                                          FROM event_group 
                                                          WHERE event_id = ?) t;`, [id]);
        if (rowParentSTT && rowParentSTT.length > 0) {
        obj.printrowParentSTT = rowParentSTT
        }; 

        const rowChildSTT = await executeQuery(`SELECT event_member_id_child, event_member_id,
                                                       @rownum := IF(event_member_id_child = 0, 1, @rownum + 1) AS stt,
                                                       event_member_id_parent
                                                  FROM event_group, (SELECT @rownum := 0) r
                                                  WHERE event_id = ?
                                                  ORDER BY event_member_id_parent, event_member_id_child;`, [id]);
        if (rowChildSTT && rowChildSTT.length > 0) {
        obj.printrowChildSTT = rowChildSTT
        }; 
        
        const daySum = await executeQuery(`SELECT DAY(LAST_DAY(CURRENT_DATE)) AS days_in_month`);
        if (daySum && daySum.length > 0) {
          obj.printdaySum = daySum[0].days_in_month;
        };
        const dayCurrent = await executeQuery(`SELECT DAY(CURRENT_DATE) AS current_day`);
        if (dayCurrent && dayCurrent.length > 0) {
          obj.printdayCurrent = dayCurrent[0].current_day;
        };
        const monthCurrent = await executeQuery(`SELECT MONTH(CURRENT_DATE) AS current_month`);
        if (monthCurrent && monthCurrent.length > 0) {
          obj.printmonthCurrent = monthCurrent[0].current_month;
        };

        const Currentday = await executeQuery(`SELECT DATE_FORMAT(CONVERT_TZ(DATE(CURRENT_DATE+1), @@session.time_zone, '+00:00'), '%Y-%m-%dT00:00:00.000Z')`);
        if (Currentday && Currentday.length > 0) {          
          const result = Currentday[0];
          const key = Object.keys(result)[0];
          if (result && result[key]) {

              obj.printCurrentday = result[key]; //c1

              const dateSt = obj.printCurrentday;
              const dateParts = dateSt.match(/\d+/g);
              const objDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], dateParts[3], dateParts[4], dateParts[5]));
              obj.printCurrentday2 = objDate; //c2
          }
        };
        const currentTime = moment();
        const currentDate = new Date();
        
        let z;
        const startDate = moment(currentTime.format('DD-MM-YYYY'), 'DD-MM-YYYY').startOf('month').toDate();
        let dateStrArray = [];
        for (z = 0; z < obj.printdaySum; z++) {
          const targetDate = new Date(startDate.getTime() + z * 86400000);
          const day = targetDate.getDate().toString().padStart(2, '0');
          const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
          const year = targetDate.getFullYear();
          const dateStr = `${day}/${month}/${year}`;
          dateStrArray.push(dateStr); 
        }
        const d1 = new Date(dateStrArray[12].split('/').reverse().join('-')); // Chuyển đổi dateStrArray[1] thành đối tượng Date
        const date1 = d1.getTime();
        const date2 = obj.printCurrentday2.getTime();

        const timeDiff = date1 - date1; // Tính sự chênh lệch thời gian
        const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24)); // Chia ra số ngày
        // console.log(currentDate);
        // console.log(obj.printCurrentday);
        // console.log(obj.printCurrentday2);
        // console.log(date1);
        // console.log(date2);
        // console.log(timeDiff);
        // console.log(diffDays);
        // console.log("Kiểu dữ liệu của Thang là: ",typeof Thang);

        // if (date2 === date1) {
        //     console.log("Bằng nhau.");
        // } else {
        //     console.log("Trật lấc");
        // };

        const { print, ...printTs } = obj;

        res.render('./route-home-show2', { obj, print, ...printTs, id, kpi_id, deparment, Thang, ThangSelected, SumSelectedDay,
                                        user_id_perform, dateStrArray,
                                        user: req.session.user });
      } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
      }
    });

    app.get('/home-show-detail/:id', requireLogin, notExist, staticsCompleted, async function(req, res) {
      try {
        const id = req.params.id;
        const kpi_id = req.params.id;
        const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const obj = { print: null };
        const user_id_perform = req.session.user.user_id;
        const depart_ID = req.session.user.department_id;
        
        const basic_statics_completed = req.basic_statics_completed;
        const basic_statics_Uncompleted = req.basic_statics_Uncompleted;
        const basic_statics_percent = req.basic_statics_percent;
    
        const basic_statics_selectA = req.basic_statics_selectA;
        const basic_statics_selectApercent = req.basic_statics_selectApercent;
        const basic_statics_selectB = req.basic_statics_selectB;
        const basic_statics_selectBpercent = req.basic_statics_selectBpercent;
        const basic_statics_selectC = req.basic_statics_selectC;
        const basic_statics_selectCpercent = req.basic_statics_selectCpercent;
        const basic_statics_selectD = req.basic_statics_selectD;
        const basic_statics_selectDpercent = req.basic_statics_selectDpercent;
    
        const deparment = req.deparment;
    
        // Nội dung sự kiện
        for (const month of months) {
          const queryMonth = ` SELECT * FROM THANG${month} where id =?` ;
          const resultMonth = await executeQuery(queryMonth, [id]);
          obj[`printT${month}`] = resultMonth;
        }
        
        // Nội dung Thành viên tham gia
        const queries = months.map(month => ({
          query: `SELECT a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create
                    FROM THANG${month} a WHERE a.id = ?`
        }));
    
        for (const { query } of queries) {
          const result = await executeQuery(query, [id]);
          if (result && result.length > 0) {
            obj.print = result;
          } //else {console.log("Some thing wrong at /home-show/:id" +id)}
        }
    
        const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, b.full_name, c.department_code,
                                                        DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                        DATE_FORMAT(a.date_completed, '%d/%m/%Y') AS date_completed,
                                                        DATE_FORMAT(a.date_deadline_start, '%d/%m/%Y') AS date_deadline_start,
                                                        DATE_FORMAT(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY), '%d/%m/%Y') AS date_deadline_end,
                                                        TIMESTAMPDIFF(DAY, CURDATE(), DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS deadline_countdown,
                                                        TIMESTAMPDIFF(DAY, date(a.date_completed),DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS compare
                                                  FROM (SELECT @rownum := 0) r, event_group a, admin_user b, admin_user_department c
                                                  WHERE a.status = 1 AND b.status = 1
                                                    AND b.department_id = c.department_id
                                                    AND a.user_id_member = b.user_id 
                                                    AND a.event_id=?`, [id]);
        if (resultMember && resultMember.length > 0) {
              obj.printMem = resultMember
        };
    
        const queryKPI = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*,
                                                    DATE_FORMAT(a.kpi_date_create, '%d/%m/%Y') AS kpi_date_create,
                                                    DATE_FORMAT(a.kpi_result_date, '%d/%m/%Y') AS kpi_result_date
                                                  FROM (SELECT @rownum := 0) r, kpi a
                                                  WHERE a.kpi_status = 1 AND a.kpi_member_status = 1                                                
                                                    AND a.kpi_eg_id=? AND a.kpi_member_id in (?)`, [id, user_id_perform]);
        if (queryKPI && queryKPI.length > 0) {
              obj.printQueryKPI = queryKPI
        };    
    
        const basic_statics = await executeQuery(`SELECT COUNT(mission_completed)
                                                    FROM event_group eg
                                                    WHERE event_id = ? and status = 1`, [id]);
        if (basic_statics && basic_statics.length > 0) {
              obj.printStatics = basic_statics
            };
        
        const show_icon_edit = await executeQuery(`SELECT user_id_add_member
                                                    FROM event_group eg
                                                    WHERE event_id = ? and status = 1 
                                                                       and user_id_member = ?`, [id, user_id_perform]);
        if (show_icon_edit && show_icon_edit.length > 0) {
              obj.printIconEdit = show_icon_edit
            };
        
        

        const { print, ...printTs } = obj;
    
        res.render('./route-home-show-detail', { obj, print, ...printTs, id, kpi_id,
                                        basic_statics_completed, basic_statics_Uncompleted, basic_statics_percent, deparment,
                                        basic_statics_selectA, basic_statics_selectB, basic_statics_selectC, basic_statics_selectD,  
                                        basic_statics_selectApercent, basic_statics_selectBpercent, basic_statics_selectCpercent, basic_statics_selectDpercent,
                                        user_id_perform, show_icon_edit, daySum, 
                                        user: req.session.user });
      } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
      }
    });

    app.get('/add-more-work/:child', async function(req, res) {
      try {
        const child = req.params.child;
        console.log(child);

        const backPage = `select event_id from event_group where event_member_id = ?`;
        const resultID = await executeQuery(backPage, [child]);
        const id = resultID[0].event_id;
        console.log(id);

        const insertTable = `insert into event_group (event_id, event_status, event_name, 
                                                      event_member_id, 
                                                      event_style, user_member, user_id_member, user_add_member, user_id_add_member, 
                                                      date_add_member, 
                                                      department_id, department_name, status, 
                                                      event_member_id_child,
                                                      event_member_id_parent)
                                              select  event_id, event_status, event_name, 
                                                      (select max(event_member_id)+1 from event_group), 
                                                      event_style, user_member, user_id_member, user_add_member, user_id_add_member, 
                                                      sysdate(),
                                                      department_id, department_name, status, 
                                                      (1),
                                                      event_member_id
                                              from    event_group
                                              where   event_member_id = ?`;
        const resultinsertTable = await executeQuery(insertTable, [child]);
        console.log("Add work " + id + " is Successful!");

        const updateTable = `UPDATE event_group eg
                                JOIN (
                                      SELECT user_id_member, MIN(event_member_id) AS min_event_member_id
                                      FROM event_group
                                      WHERE event_id = ?
                                      GROUP BY user_id_member
                                    ) temp_table
                                ON eg.user_id_member = temp_table.user_id_member
                                SET eg.event_member_id_parent = temp_table.min_event_member_id
                                WHERE eg.event_id = ?`;
        const resultupdateTable = await executeQuery(updateTable, [id, id]);                      

        res.redirect('/home-show/' + id);
        
      } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
      }
    });

app.get('/edit/:id', requireLogin, notExist, notEdit, staticsCompleted, async (req, res) => {
  try {
    const id = req.params.id;
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const obj = { print: null };
    const user_id_perform = req.session.user.user_id;
    const depart_ID = req.session.user.department_id;
    
    const basic_statics_completed = req.basic_statics_completed;
    const basic_statics_Uncompleted = req.basic_statics_Uncompleted;
    const basic_statics_percent = req.basic_statics_percent;

    const basic_statics_selectA = req.basic_statics_selectA;
    const basic_statics_selectApercent = req.basic_statics_selectApercent;

    const basic_statics_selectB = req.basic_statics_selectB;
    const basic_statics_selectBpercent = req.basic_statics_selectBpercent;

    const basic_statics_selectC = req.basic_statics_selectC;
    const basic_statics_selectCpercent = req.basic_statics_selectCpercent;

    const basic_statics_selectD = req.basic_statics_selectD;
    const basic_statics_selectDpercent = req.basic_statics_selectDpercent;
    
    const deparment = req.deparment;
    // console.log(basic_statics_completed[0]['COUNT(mission_completed)']);

    // Nội dung sự kiện <Header>/ 2024 và <Div> Main-right/ Nội dung Sự kiện:
    for (const month of months) {
            const queryMonth = `select  a.*, b.user_id_member 
                                from thang${month} a, event_group b 
                                where a.id = b.event_id 
                                  and b.status = 1 
                                  and a.status = 1 
                                  and b.event_member_id_child = 0
                                  and a.id = ?
                                  and b.user_id_member in (?)`;
            const resultMonth = await executeQuery(queryMonth, [id, user_id_perform]);
            obj[`printT${month}`] = resultMonth;
    }
    
    //<Div> Main-left/ Chỉnh sữa nội dung: 
    // ---> Thanh <select>/ Thêm thành viên: ID - Full_name  
    const emp_fullname = `SELECT * FROM admin_user where department_id = ?`;
    const fullNamesResult = await executeQuery(emp_fullname, [depart_ID]);
    const fullNames = fullNamesResult.map(result => result.full_name);
    const memUserID = fullNamesResult.map(result => result.user_id);
    // ---> Thanh <select>/ Thêm thành viên: ID - Full_name  
    const emp_fullname2 = `SELECT * FROM admin_user where department_id != ?`;
    const selectDifirentDepart = await executeQuery(emp_fullname2, [depart_ID]);
    const selectDD_Fulname = selectDifirentDepart.map(result => result.full_name);
    const selectDD_ID = selectDifirentDepart.map(result => result.user_id);
    
    //Nội dung Thành viên tham gia <Div> Main-right/ Danh sách Thành viên tham gia:
    const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, b.full_name, c.department_code,
                                                    DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                    DATE_FORMAT(a.date_completed, '%d/%m/%Y') AS date_completed,
                                                    DATE_FORMAT(a.date_deadline_start, '%d/%m/%Y') AS date_deadline_start,
                                                    DATE_FORMAT(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY), '%d/%m/%Y') AS date_deadline_end,
                                                    TIMESTAMPDIFF(DAY, CURDATE(), DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS deadline_countdown,
                                                    TIMESTAMPDIFF(DAY, date(a.date_completed),DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS compare
                                              FROM (SELECT @rownum := 0) r, event_group a, admin_user b, admin_user_department c
                                              WHERE a.status = 1 AND b.status = 1
                                                AND b.department_id = c.department_id
                                                AND a.user_id_member = b.user_id 
                                                AND a.event_id = ?`, [id]);
    if (resultMember && resultMember.length > 0) {
          obj.printMem = resultMember
        };

    const basic_statics = await executeQuery(`SELECT COUNT(mission_completed)
                                                FROM event_group eg
                                                WHERE event_id = ? and status = 1`, [id]);
    if (basic_statics && basic_statics.length > 0) {
          obj.printStatics = basic_statics
        };
    
    const show_icon_edit = await executeQuery(`SELECT user_id_add_member
                                                FROM event_group eg
                                                WHERE event_id = ? and status = 1 
                                                                   and user_id_member = ?`, [id, user_id_perform]);
    if (show_icon_edit && show_icon_edit.length > 0) {
          obj.printIconEdit = show_icon_edit
        };
    
        // console.log(basic_statics[0]['COUNT(mission_completed)']);

    //<Div> Main-left/ Chỉnh sữa nội dung: 
    // ---> <Input>/ Tên sự kiện && Nội dung chi tiết
    const queries = months.map(month => ({
      query: `select  a.id,	a.name,	a.detail,	a.status,	a.user_id_create,
                      DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create, 
                      b.user_id_member 
              from thang${month} a, event_group b 
              where a.id = b.event_id 
                and b.status = 1 
                and a.status = 1 
                and a.id = ?
                and b.user_id_member in (?)`,
      variable: `dataT${month}`
    }));
    for (const { query, variable } of queries) {
            const result = await executeQuery(query, [id, user_id_perform]);
            if (result && result.length > 0) {
              obj.print = result;
              obj[variable] = {
                id: result[0].id,
                name: result[0].name,
                detail: result[0].detail
              };
            } else {
              obj[variable] = null
            };
    }
    const { print, ...printTs } = obj;

    const duplicateDataMessage = req.query.duplicateDataMessage || null;
    
    res.render('./route-edit', { obj, print, ...printTs, id, deparment,
                                    basic_statics_completed, basic_statics_Uncompleted, basic_statics_percent, 
                                    basic_statics_selectA, basic_statics_selectB, basic_statics_selectC, basic_statics_selectD, 
                                    basic_statics_selectApercent, basic_statics_selectBpercent, basic_statics_selectCpercent, basic_statics_selectDpercent,
                                    fullNames, memUserID, selectDD_Fulname, selectDD_ID,
                                    user_id_perform, show_icon_edit, duplicateDataMessage, req, 
                                    user: req.session.user });
  } catch (err) {
    console.error(err);
     // Kiểm tra xem lỗi có phải là "Cannot read properties of null"
      if (err instanceof TypeError && err.message.includes('Cannot read properties of null')) {
        res.status(400).send('Invalid data: Cannot read properties of null');
      } else {
        res.status(500).send('Internal Server Error');
      }
    }
});

app.post('/update-event-all/(:id)', requireLogin, async(req, res) => {
  const id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_update = mysqlTimestamp;

  const user_id_perform = req.session.user.user_id;

  const { work_granted, deadline } = req.body;

  const updateEventAll = `UPDATE event_group SET work_granted = ?, deadline = ?, user_id_grant = ?, date_granted = ?, date_deadline_start = ? WHERE event_id = ? and mission_completed = 0`;
  connection.query(updateEventAll, [work_granted, deadline, user_id_perform, date_update, date_update, id], (err, result) => {
    if (err) {
      console.error('Error updateEventAll record: ', err);
      res.status(500).send('Error updateEventAll record');
      return;
    }
    console.log("updateEventAll is Successful!");
    res.redirect('/edit/' + id);
  });
})

app.post('/update-event-style/(:id)', requireLogin, async(req, res) => {
  const id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');

  let date_update = mysqlTimestamp;
  let table;
  if      (id < 2000) {table = 'THANG01';} 
  else if (id < 3000) {table = 'THANG02';} 
  else if (id < 4000) {table = 'THANG03';} 
  else if (id < 5000) {table = 'THANG04';} 
  else if (id < 6000) {table = 'THANG05';} 
  else if (id < 7000) {table = 'THANG06';}
  else if (id < 8000) {table = 'THANG07';}
  else if (id < 9000) {table = 'THANG08';} 
  else if (id < 10000) {table = 'THANG09';}
  else if (id < 11000) {table = 'THANG10';}
  else if (id < 12000) {table = 'THANG11';} 
  else                 {table = 'THANG12';}

  const updateEventStyle = `UPDATE ${table} SET event_style = 1, date_update = ? WHERE id =?`;
  const process = await executeQuery(`UPDATE event_group SET event_style = 1 WHERE event_id = ?`, [id]);

   connection.query(updateEventStyle, [date_update, id], (err, result) => {
    if (err) {
      console.error('Error updateEventStyle record: ', err);
      res.status(500).send('Error updateEventStyle record');
      return;
    }
    console.log("updateEventStyle is Successful!");
    res.redirect('/edit/' + id);
  });

})

app.post('/update/(:id)', requireLogin, (req, res) => {
  const id = req.params.id;
  const { name, detail } = req.body;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  // console.log(mysqlTimestamp) ;
  let date_update = mysqlTimestamp;
  let table;

  if      (id < 2000) {table = 'THANG01';} 
  else if (id < 3000) {table = 'THANG02';} 
  else if (id < 4000) {table = 'THANG03';} 
  else if (id < 5000) {table = 'THANG04';} 
  else if (id < 6000) {table = 'THANG05';} 
  else if (id < 7000) {table = 'THANG06';}
  else if (id < 8000) {table = 'THANG07';}
  else if (id < 9000) {table = 'THANG08';} 
  else if (id < 10000) {table = 'THANG09';}
  else if (id < 11000) {table = 'THANG10';}
  else if (id < 12000) {table = 'THANG11';} 
  else                 {table = 'THANG12';}

  const query = `UPDATE ${table} SET name = ?, detail = ?, date_update = ? WHERE id = ?`;

  connection.query(query, [name, detail, date_update, id], (err, result) => {
    if (err) {
      console.error('Error updating record: ', err);
      res.status(500).send('Error updating record');
      return;
    }
    console.log("Edit is Successful!");
    res.redirect('/edit/' +id);
  });
});

app.post('/add/:id', requireLogin, checkDuplicateData, async (req, res) => {
  try {
    const id = req.params.id;
    const duplicateDataMessage = req.duplicateDataMessage;
    // Thanh select
    const { user_id, full_name } = JSON.parse(req.body['{"user_id": "", "full_name": ""}']);
    const decodedFullName = decodeURIComponent(full_name);
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_create = mysqlTimestamp;
  
    // Sử dụng thông tin user_session từ user đăng nhập
    const user_id_perform = req.session.user.user_id;
    const user_perform = req.session.user.user_name;

    let table;
    if      (id < 2000) {table = 'THANG01';} 
    else if (id < 3000) {table = 'THANG02';} 
    else if (id < 4000) {table = 'THANG03';} 
    else if (id < 5000) {table = 'THANG04';} 
    else if (id < 6000) {table = 'THANG05';} 
    else if (id < 7000) {table = 'THANG06';}
    else if (id < 8000) {table = 'THANG07';}
    else if (id < 9000) {table = 'THANG08';} 
    else if (id < 10000) {table = 'THANG09';}
    else if (id < 11000) {table = 'THANG10';}
    else if (id < 12000) {table = 'THANG11';} 
    else                 {table = 'THANG12';}

    const process = await executeQuery(`SELECT * FROM ${table} WHERE id = ? AND event_style = 1`, [id]);

    if (process && process.length > 0) {
        const query = `INSERT INTO event_group (event_id, user_id_member, user_member, date_add_member, user_add_member, user_id_add_member, event_style) 
                              VALUES (?, ?, ?, ?, ?, ?, 1)`;
        const result = await executeQuery(query, [id, user_id, decodedFullName, date_create, user_perform, user_id_perform]);
    }
    else {
        const query = `INSERT INTO event_group (event_id, user_id_member, user_member, date_add_member, user_add_member, user_id_add_member) 
                              VALUES (?, ?, ?, ?, ?, ?)`;
        const result = await executeQuery(query, [id, user_id, decodedFullName, date_create, user_perform, user_id_perform]);
    };
    
  
    console.log(`Insert Member into Event ID: ${id}, user_id: ${user_id}, full_name: ${decodedFullName} is Successful!`);
    res.redirect('/edit/'+id+'?duplicateDataMessage='+encodeURIComponent(duplicateDataMessage));
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/del-member/:eg_id', requireLogin, async (req, res) => {
  try {
    var eg_id = req.params.eg_id;
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const event_id = resultID[0].event_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_delete = mysqlTimestamp;
  
    // Sử dụng thông tin user_session từ user đăng nhập
    const user_id_perform = req.session.user.user_id;
    const user_perform = req.session.user.user_name;

    const query = 'UPDATE event_group SET status = 0, date_remove = ?, user_remove = ?, user_id_remove = ? WHERE event_member_id =?';
    const result = await executeQuery(query, [date_delete, user_perform, user_id_perform, eg_id]);
  
    console.log(`Delete Member from Event ID: ${eg_id} is Successful!`);
    res.redirect('/edit/'+event_id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/edit-work-granted/:eg_id', requireLogin, staticsCompleted, notEditWorkGranted, async (req, res) => {
  try {
    const eg_id = req.params.eg_id;
    const user_id_perform = req.session.user.user_id;
    const basic_statics_completed = req.basic_statics_completed;
    const basic_statics_Uncompleted = req.basic_statics_Uncompleted;
    const basic_statics_percent = req.basic_statics_percent;

    const basic_statics_selectA = req.basic_statics_selectA;
    const basic_statics_selectApercent = req.basic_statics_selectApercent;
    const basic_statics_selectB = req.basic_statics_selectB;
    const basic_statics_selectBpercent = req.basic_statics_selectBpercent;
    const basic_statics_selectC = req.basic_statics_selectC;
    const basic_statics_selectCpercent = req.basic_statics_selectCpercent;
    const basic_statics_selectD = req.basic_statics_selectD;
    const basic_statics_selectDpercent = req.basic_statics_selectDpercent;

    const deparment = req.deparment;

    // Lấy phần tử đầu tiên của event_id = id <table - thangXX>
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const id = resultID[0].event_id;

    // Nội dung sự kiện - Phần Header
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const obj = { print: null };
    for (const month of months) {
      const queryMonth = `SELECT * FROM THANG${month} WHERE id = ?`;
      const resultMonth = await executeQuery(queryMonth, [id]);
      obj[`printT${month}`] = resultMonth;
    }

    //<Div> Main-left/ Chỉnh sữa nội dung: 
    // ---> Thanh <select>/ Thêm thành viên: ID - Full_name  
    const emp_fullname = `SELECT * FROM admin_user`;
    const fullNamesResult = await executeQuery(emp_fullname);
    const fullNames = fullNamesResult.map(result => result.full_name);
    const memUserID = fullNamesResult.map(result => result.user_id);
    
    //Nội dung Thành viên tham gia <Div> Main-right/ Danh sách Thành viên tham gia:
    const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, b.full_name, c.department_code,
                                                    DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                    DATE_FORMAT(a.date_completed, '%d/%m/%Y') AS date_completed,
                                                    DATE_FORMAT(a.date_deadline_start, '%d/%m/%Y') AS date_deadline_start,
                                                    DATE_FORMAT(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY), '%d/%m/%Y') AS date_deadline_end,
                                                    TIMESTAMPDIFF(DAY, CURDATE(), DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS deadline_countdown,
                                                    TIMESTAMPDIFF(DAY, date(a.date_completed),DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS compare
                                              FROM (SELECT @rownum := 0) r, event_group a, admin_user b, admin_user_department c
                                              WHERE a.status = 1 AND b.status = 1
                                                AND b.department_id = c.department_id
                                                AND a.user_id_member = b.user_id 
                                                AND a.event_id=?`, [id]);
    if (resultMember && resultMember.length > 0) {
          obj.printMem = resultMember
        };

    const basic_statics = await executeQuery(`SELECT COUNT(mission_completed)
                                                FROM event_group eg
                                                WHERE event_id = ? and status = 1`, [id]);
    if (basic_statics && basic_statics.length > 0) {
          obj.printStatics = basic_statics
        };

    const show_icon_edit = await executeQuery(`SELECT user_id_add_member
                                                FROM event_group eg
                                                WHERE event_id = ? and status = 1 
                                                                   and user_id_member = ?`, [id, user_id_perform]);
    if (show_icon_edit && show_icon_edit.length > 0) {
          obj.printIconEdit = show_icon_edit
        };
    
    const updateMEM = 'SELECT event_member_id FROM event_group WHERE event_member_id = ?';
    const resultUpdateMEM = await executeQuery(updateMEM, [eg_id]);
    const result =  resultUpdateMEM[0].event_group_id;

    
    //event_user_grant, event_user_perform
    const queries = months.map(month => ({
      query: `select  a.*, a.user_id_create,
                      DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create, 
                      b.*
              from thang${month} a, event_group b 
              where a.id = b.event_id 
                and b.status = 1 
                and a.status = 1 
                AND event_member_id = ?`,
      variable: `dataT${month}`
    }));
    
    for (const { query, variable } of queries) {
      const result = await executeQuery(query, [eg_id]);
      if (result && result.length > 0) {
        obj.print = result;
        obj[variable] = {
          eg_id: result[0].eg_id,
          user_member: result[0].user_member,
          work_granted: result[0].work_granted,
          deadline: result[0].deadline
        };
      } else {
        obj[variable] = null;}
    }
    const { print, ...printTs } = obj;

    res.render('./route-edit-work-granted', { obj, print, ...printTs, eg_id: eg_id, id, basic_statics_completed, basic_statics_Uncompleted, basic_statics_percent, deparment,
                                              basic_statics_selectA, basic_statics_selectB, basic_statics_selectC, basic_statics_selectD,     
                                              basic_statics_selectApercent, basic_statics_selectBpercent, basic_statics_selectCpercent, basic_statics_selectDpercent,                                    
                                              fullNames, memUserID, 
                                              user_id_perform, show_icon_edit,
                                              user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/update-work-granted/(:eg_id)', requireLogin, async (req, res) => {
  var eg_id = req.params.eg_id;
  const { work_granted, deadline } = req.body;

  const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
  const resultID = await executeQuery(queryID, [eg_id]);
  const id = resultID[0].event_id;

  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  
  let date_update = mysqlTimestamp;

  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  const query = `UPDATE event_group SET work_granted = ?, date_update_granted = ?, user_grant = ?, user_id_grant = ?
                                  WHERE event_member_id = ?`;

  connection.query(query, [work_granted, date_update, user_perform, user_id_perform, eg_id], (err, result) => {
    if (err) {
      console.error('Error updating record: ', err);
      res.status(500).send('Error updating record');
      return;
    }
    console.log("Edit work-grant to member is Successful!: " +eg_id);
    res.redirect('/home-show/'+id);
  });
});

app.post('/update-work-deadline-granted/(:eg_id)', requireLogin, async (req, res) => {
  var eg_id = req.params.eg_id;
  const { deadline } = req.body;

  const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
  const resultID = await executeQuery(queryID, [eg_id]);
  const id = resultID[0].event_id;

  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  
  let date_update = mysqlTimestamp;

  const query = `UPDATE event_group SET deadline = ?, date_deadline_start = ?, 
                                        deadline_compare = DATE_ADD(date_deadline_start, INTERVAL ? DAY)
                                  WHERE event_member_id = ?`;

  connection.query(query, [deadline, date_update, deadline, eg_id], (err, result) => {
    if (err) {
      console.error('Error updating record: ', err);
      res.status(500).send('Error updating record');
      return;
    }
    console.log("Edit deadline-grantd to member is Successful!: " +eg_id);
    res.redirect('/home-show/'+id);
  });
});

app.get('/edit-work-report/:eg_id', requireLogin, staticsCompleted, notEditWorkreport,  async (req, res) => {
  try {
    const eg_id = req.params.eg_id;
    const user_id_perform = req.session.user.user_id;
    const basic_statics_completed = req.basic_statics_completed;
    const basic_statics_Uncompleted = req.basic_statics_Uncompleted;
    const basic_statics_percent = req.basic_statics_percent;

    const basic_statics_selectA = req.basic_statics_selectA;
    const basic_statics_selectApercent = req.basic_statics_selectApercent;
    const basic_statics_selectB = req.basic_statics_selectB;
    const basic_statics_selectBpercent = req.basic_statics_selectBpercent;
    const basic_statics_selectC = req.basic_statics_selectC;
    const basic_statics_selectCpercent = req.basic_statics_selectCpercent;
    const basic_statics_selectD = req.basic_statics_selectD;
    const basic_statics_selectDpercent = req.basic_statics_selectDpercent;

    const deparment = req.deparment;

    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const id = resultID[0].event_id;

    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const obj = { print: null };

    for (const month of months) {
      const queryMonth = `SELECT * FROM THANG${month} WHERE id = ?`;
      const resultMonth = await executeQuery(queryMonth, [id]);
      obj[`printT${month}`] = resultMonth;
    }

    const emp_fullname = `SELECT * FROM admin_user`;
    const fullNamesResult = await executeQuery(emp_fullname);
    const fullNames = fullNamesResult.map(result => result.full_name);
    const memUserID = fullNamesResult.map(result => result.user_id);
    

    const resultMember = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, b.full_name, c.department_code,
                                                    DATE_FORMAT(a.date_add_member, '%d/%m/%Y') AS date_add_member_new, 
                                                    DATE_FORMAT(a.date_completed, '%d/%m/%Y') AS date_completed,
                                                    DATE_FORMAT(a.date_deadline_start, '%d/%m/%Y') AS date_deadline_start,
                                                    DATE_FORMAT(DATE_ADD(a.date_deadline_start, INTERVAL (a.deadline) DAY), '%d/%m/%Y') AS date_deadline_end,
                                                    TIMESTAMPDIFF(DAY, CURDATE(), DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS deadline_countdown,
                                                    TIMESTAMPDIFF(DAY, date(a.date_completed),DATE_ADD(date(a.date_deadline_start), INTERVAL a.deadline DAY)) AS compare
                                              FROM (SELECT @rownum := 0) r, event_group a, admin_user b, admin_user_department c
                                              WHERE a.status = 1 AND b.status = 1
                                                AND b.department_id = c.department_id
                                                AND a.user_id_member = b.user_id 
                                                AND a.event_id=?`, [id]);
    if (resultMember && resultMember.length > 0) {
          obj.printMem = resultMember
        };

    const basic_statics = await executeQuery(`SELECT COUNT(mission_completed)
                                                FROM event_group eg
                                                WHERE event_id = ? and status = 1`, [id]);
    if (basic_statics && basic_statics.length > 0) {
          obj.printStatics = basic_statics
        };
    
    const show_icon_edit = await executeQuery(`SELECT user_id_add_member
                                                FROM event_group eg
                                                WHERE event_id = ? and status = 1 
                                                                   and user_id_member = ?`, [id, user_id_perform]);
    if (show_icon_edit && show_icon_edit.length > 0) {
          obj.printIconEdit = show_icon_edit
        };

    const updateMEM = 'SELECT event_member_id FROM event_group WHERE event_member_id = ?';
    const resultUpdateMEM = await executeQuery(updateMEM, [eg_id]);
    const result =  resultUpdateMEM[0].event_group_id;

    //
    const queries = months.map(month => ({
      query: `SELECT a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create, 
                     b.* 
              FROM thang${month} a, event_group b
              WHERE a.id = b.event_id
                AND a.status = 1 
                AND b.status = 1
                AND event_member_id = ?`,
      variable: `dataT${month}`
      
    }));

    for (const { query, variable } of queries) {
      const result = await executeQuery(query, [eg_id]);
      if (result && result.length > 0) {
        obj.print = result;
        obj[variable] = {
          eg_id: result[0].eg_id,
          work_report: result[0].work_report,
          user_member: result[0].user_member,
        };
      } else {
        obj[variable] = null;}
    }

    const { print, ...printTs } = obj;
    res.render('./route-edit-work-report', { obj, print, ...printTs, eg_id: eg_id, id, basic_statics_completed, basic_statics_Uncompleted, basic_statics_percent, deparment,
                                              basic_statics_selectA, basic_statics_selectB, basic_statics_selectC, basic_statics_selectD,    
                                              basic_statics_selectApercent, basic_statics_selectBpercent, basic_statics_selectCpercent, basic_statics_selectDpercent,                                      
                                              fullNames, memUserID, 
                                              user_id_perform, show_icon_edit,
                                              user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/update-work-report/(:eg_id)', requireLogin, async (req, res) => {
  var eg_id = req.params.eg_id;
  const { work_report } = req.body;

  const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
  const resultID = await executeQuery(queryID, [eg_id]);
  const id = resultID[0].event_id;

  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  // console.log(mysqlTimestamp) ;
  let date_update = mysqlTimestamp;

  const user_id_perform = req.session.user.user_id;
  const user_perform  = req.session.user.user_name;

  const query = `UPDATE event_group SET work_report = ?, date_report = ?,  
                                        user_report = ?, user_id_report = ? 
                                  WHERE event_member_id = ?`;

  connection.query(query, [ work_report, date_update, user_perform, user_id_perform, eg_id], (err, result) => {
    if (err) {
      console.error('Error updating record: ', err);
      res.status(500).send('Error updating record');
      return;
    }
    console.log("Edit Work Report to member is Successful!: " +eg_id);
    res.redirect('/home-show/'+id);
  });
});

app.get('/work-report-completed/:eg_id', requireLogin, async (req, res) => {
  try {
    var eg_id = req.params.eg_id;
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const event_id = resultID[0].event_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_completed = mysqlTimestamp;
  
    const user_id_completed = req.session.user.user_id;
    const user_completed = req.session.user.user_name;

    const query = 'UPDATE event_group SET mission_completed = 1, date_completed = ?, user_completed = ?, user_id_completed = ? WHERE event_member_id =?';
    const result = await executeQuery(query, [date_completed, user_completed, user_id_completed, eg_id]);
  
    console.log(`Work report completed from Event ID: ${eg_id} is Successful!`);
    res.redirect('/home-show/'+event_id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/work-report-completed-a/:eg_id', requireLogin, async (req, res) => {
  try {
    var eg_id = req.params.eg_id;
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const event_id = resultID[0].event_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_completed = mysqlTimestamp;
  
    const user_id_completed = req.session.user.user_id;
    const user_completed = req.session.user.user_name;

    const query = 'UPDATE event_group SET mission_completed = 2, date_completed = ?, user_completed = ?, user_id_completed = ? WHERE event_member_id =?';
    const result = await executeQuery(query, [date_completed, user_completed, user_id_completed, eg_id]);
  
    console.log(`Work report completed from Event ID: ${eg_id} choose A is Successful!`);
    res.redirect('/home-show/'+event_id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/work-report-completed-b/:eg_id', requireLogin, async (req, res) => {
  try {
    var eg_id = req.params.eg_id;
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const event_id = resultID[0].event_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_completed = mysqlTimestamp;
  
    const user_id_completed = req.session.user.user_id;
    const user_completed = req.session.user.user_name;

    const query = 'UPDATE event_group SET mission_completed = 3, date_completed = ?, user_completed = ?, user_id_completed = ? WHERE event_member_id =?';
    const result = await executeQuery(query, [date_completed, user_completed, user_id_completed, eg_id]);
  
    console.log(`Work report completed from Event ID: ${eg_id} choose B is Successful!`);
    res.redirect('/home-show/'+event_id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/work-report-completed-c/:eg_id', requireLogin, async (req, res) => {
  try {
    var eg_id = req.params.eg_id;
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const event_id = resultID[0].event_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_completed = mysqlTimestamp;
  
    const user_id_completed = req.session.user.user_id;
    const user_completed = req.session.user.user_name;

    const query = 'UPDATE event_group SET mission_completed = 4, date_completed = ?, user_completed = ?, user_id_completed = ? WHERE event_member_id =?';
    const result = await executeQuery(query, [date_completed, user_completed, user_id_completed, eg_id]);
  
    console.log(`Work report completed from Event ID: ${eg_id} choose C is Successful!`);
    res.redirect('/home-show/'+event_id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/work-report-completed-d/:eg_id', requireLogin, async (req, res) => {
  try {
    var eg_id = req.params.eg_id;
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const event_id = resultID[0].event_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_completed = mysqlTimestamp;
  
    const user_id_completed = req.session.user.user_id;
    const user_completed = req.session.user.user_name;

    const query = 'UPDATE event_group SET mission_completed = 5, date_completed = ?, user_completed = ?, user_id_completed = ? WHERE event_member_id =?';
    const result = await executeQuery(query, [date_completed, user_completed, user_id_completed, eg_id]);
  
    console.log(`Work report completed from Event ID: ${eg_id} choose D is Successful!`);
    res.redirect('/home-show/'+event_id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/work-report-modify/:eg_id', requireLogin, async (req, res) => {
  try {
    var eg_id = req.params.eg_id;
    const queryID = 'SELECT event_id FROM event_group WHERE event_member_id = ?';
    const resultID = await executeQuery(queryID, [eg_id]);
    const event_id = resultID[0].event_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    const date_modify = mysqlTimestamp;
  
    const user_id_modify = req.session.user.user_id;
    const user_modify = req.session.user.user_name;

    const query = 'UPDATE event_group SET mission_completed = 0, date_granted = ?, user_update_grant = ?, user_id_update_grant = ? WHERE event_member_id =?';
    const result = await executeQuery(query, [date_modify, user_modify, user_id_modify, eg_id]);
  
    console.log(`Work report Uncompleted from Event ID: ${eg_id} is Successful!`);
    res.redirect('/home-show/'+event_id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/add-kpi/', requireLogin, async function(req, res){
  const id = req.query.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;
  
  const user_id = req.session.user.user_id;
  const user = req.session.user.user_name;

  connection.query(`insert into kpi (kpi_eg_id, kpi_id_child, kpi_date_create, kpi_member_id, kpi_member, kpi_member_date_add, kpi_member_status) values(?, (SELECT MAX(b.KPI_ID)+1 FROM KPI b), ?, ?, ?, ?, 1) `,
                                        [id, date_create, user_id, user, date_create], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into KPI is Successful!");
      res.redirect('/home-show/' + id);
    }
  }); 
})

  app.get('/add-kpi-child/', requireLogin, async function(req, res){
    const kpi_id = req.query.kpi_id;
    const currentTime = moment();
    const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
    let date_create = mysqlTimestamp;
    
    const user_id = req.session.user.user_id;
    const user = req.session.user.user_name;

    connection.query(`insert into kpi (kpi_id_child, kpi_date_create, kpi_member_id, kpi_member, kpi_member_date_add, kpi_member_status) 
                                values(?, ?, ?, ?, ?, 1) `,
                                          [kpi_id, date_create, user_id, user, date_create], function(err){
      if(!!err) {console.log("error", +err);}
      else{
        console.log("Insert into child KPI " + kpi_id + " is Successful!");
        res.redirect('/edit-kpi/' + kpi_id);
      }
    }); 
  })

app.get('/delete-kpi/:kpi_id', requireLogin, async function(req, res){
  const kpi_id = req.params.kpi_id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;
  
  const user_id = req.session.user.user_id;
  const user = req.session.user.user_name;

  const queryKPI_eg_id = 'SELECT kpi_eg_id FROM kpi WHERE kpi_id = ?';
  const result_queryKPI_eg_id = await executeQuery(queryKPI_eg_id, [kpi_id]);
  const KPI_eg_id = result_queryKPI_eg_id[0].kpi_eg_id;

  connection.query(`UPDATE kpi 
                        SET kpi_status = 0, kpi_member_date_remove = ?, kpi_member_id_remove = ?, kpi_member_remove = ? 
                        WHERE kpi_id_child = ?`, [date_create, user_id, user, kpi_id], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Delete KPI " + kpi_id + " is Successful!");
      res.redirect('/home-show/' + KPI_eg_id);
    }
  }); 
})

app.get('/edit-kpi/:kpi_id_child', requireLogin, async function(req, res) {
  try {
    const kpi_id_child = req.params.kpi_id_child;
    
    const obj = { print: null };
    const user_id_perform = req.session.user.user_id;
    
    const queryKPI = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*,
                                                DATE_FORMAT(a.kpi_date_create, '%H:%m:%s %d/%m/%Y') AS kpi_date_create,
                                                DATE_FORMAT(a.kpi_result_date, '%H:%m:%s %d/%m/%Y') AS kpi_result_date
                                              FROM (SELECT @rownum := 0) r, kpi a
                                              WHERE a.kpi_status = 1 AND a.kpi_member_status = 1                                                
                                                AND (a.kpi_id_child=? or a.kpi_id = ?) AND a.kpi_member_id in (?)`, [kpi_id_child, kpi_id_child, user_id_perform]);
    if (queryKPI && queryKPI.length > 0) {
          obj.print = queryKPI};    
    
    const { print } = obj;

    const queryKPI_eg_id = 'SELECT kpi_eg_id FROM kpi WHERE kpi_id = ? AND kpi_id = (SELECT MIN(b.kpi_id) FROM kpi b WHERE b.kpi_id_child = ?)';
    const result_queryKPI_eg_id = await executeQuery(queryKPI_eg_id, [kpi_id_child, kpi_id_child]);
    const KPI_eg_id = result_queryKPI_eg_id[0].kpi_eg_id;

    const kpi_id = queryKPI.kpi_id;
    
    res.render('./route-edit-kpi', { obj, print, kpi_id_child, user_id_perform, user: req.session.user, KPI_eg_id, kpi_id });
  } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
    }
});

app.post('/update-kpi', requireLogin, async(req, res) => {
    const { kpi_id, kpi_name, kpi_plan, kpi_result} = req.body;    
    const currentTime = moment();
    const date_update = currentTime.format('YYYY-MM-DD HH:mm:ss');    

    const queryKPI_id_child = 'SELECT kpi_id_child FROM kpi WHERE kpi_id = ?';
    const result_queryKPI_id_child = await executeQuery(queryKPI_id_child, [kpi_id]);
    const KPI_id_child = result_queryKPI_id_child[0].kpi_id_child;
    
    const queryUpdate = `UPDATE kpi SET kpi_name = ?, kpi_plan = ?, kpi_result = ?, kpi_result_date = ? WHERE kpi_id = ?`;

    connection.query(queryUpdate, [kpi_name, kpi_plan, kpi_result, date_update, kpi_id], (err, result) => {
      if (err) {
        console.error('Error updating record: ', err);
        res.status(500).send('Error updating record');
        return;
      }
      console.log("Edit KPI " + kpi_id + " is Successful!");
      res.redirect('/edit-kpi/' + KPI_id_child);
    });
  });


// ------------------------------- API THANG ---------------------------------//
// Table: THANG01 //
//----------------//
app.get('/add-thang01', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into THANG01 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into Thang01 is Successful!");
      res.redirect('/add-thang01-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang01-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang01', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into Thang01 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang01/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update THANG01 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang01', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 01';
    const id = req.params.id;
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang01 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const show_icon_edit = await executeQuery(`SELECT user_id_add_member
                                                FROM event_group eg
                                                WHERE event_id < 2000 and status = 1 
                                                                   and user_id_member = ?`, [user_id_operation]);
    if (show_icon_edit && show_icon_edit.length > 0) {
          obj.printIconEdit = show_icon_edit;
        };

    const { print, ...printTs } = obj;

    
    res.render('./route-show-thangXX', { obj, print, ...printTs, id, Thang,
                                        user_id_operation, show_icon_edit,
                                        user: req.session.user });
                                       
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});




// Table: THANG02 //
//----------------//
app.get('/add-thang02', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into THANG02 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into Thang02 is Successful!");
      res.redirect('/add-thang02-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang02-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang02', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into Thang02 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang02/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update THANG02 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang02', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 02';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang02 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const show_icon_edit = await executeQuery(`SELECT user_id_add_member
                                                FROM event_group eg
                                                WHERE event_id >= 2000 and event_id < 3000
                                                                       and status = 1 
                                                                       and user_id_member = ?`, [user_id_operation]);
    if (show_icon_edit && show_icon_edit.length > 0) {
          obj.printIconEdit = show_icon_edit
        };

    const { print, ...printTs } = obj;

    
    res.render('./route-show-thangXX', { obj, print, ...printTs, Thang,
                                        user_id_operation, show_icon_edit,
                                        user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG03 //
//----------------//
app.get('/add-thang03', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into THANG03 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into Thang03 is Successful!");
      res.redirect('/add-thang03-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang03-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang03', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into Thang03 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang03/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update THANG03 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang03', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 03';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang03 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG04 //
//----------------//
app.get('/add-thang04', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into THANG04 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into Thang04 is Successful!");
      res.redirect('/add-thang04-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang04-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang04', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into Thang04 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang04/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update THANG04 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang04', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 04';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang04 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG05 //
//----------------//
app.get('/add-thang05', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang05 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang05 is Successful!");
      res.redirect('/add-thang05-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang05-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang05', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang05 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang05/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang05 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang05', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 05';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang05 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG06 //
//----------------//
app.get('/add-thang06', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang06 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang06 is Successful!");
      res.redirect('/add-thang06-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang06-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang06', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang06 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang06/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang06 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang06', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 06';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang06 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG07 //
//----------------//
app.get('/add-thang07', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang07 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang07 is Successful!");
      res.redirect('/add-thang07-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang07-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang07', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang07 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang07/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang07 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang07', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 07';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang07 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG08 //
//----------------//
app.get('/add-thang08', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang08 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang08 is Successful!");
      res.redirect('/add-thang08-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang08-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang08', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang08 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang08/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang08 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang08', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 08';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang08 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG09 //
//----------------//
app.get('/add-thang09', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang09 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang09 is Successful!");
      res.redirect('/add-thang09-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang09-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang09', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang09 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang09/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang09 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang09', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 09';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang09 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG10 //
//----------------//
app.get('/add-thang10', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang10 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang10 is Successful!");
      res.redirect('/add-thang10-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang10-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang10', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang10 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang10/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang10 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang10', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 10';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang10 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG11 //
//----------------//
app.get('/add-thang11', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang11 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang11 is Successful!");
      res.redirect('/add-thang11-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang11-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang11', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang11 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang11/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang11 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang11', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 11';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang11 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Table: THANG12 //
//----------------//
app.get('/add-thang12', requireLogin, function(req, res){
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_create = mysqlTimestamp;

  
  const user_id_perform = req.session.user.user_id;
  const user_perform = req.session.user.user_name;

  connection.query(`insert into thang12 (date_create, user_create, user_id_create) values(?, ?, ?) `,
                                        [date_create, user_perform, user_id_perform], function(err){
    if(!!err) {console.log("error", +err);}
    else{
      console.log("Insert into thang12 is Successful!");
      res.redirect('/add-thang12-member-original');
      //res.json({"data":"Data Inserted Successfully!"});
    }
  }); 
})

app.get('/add-thang12-member-original', requireLogin, function(req, res) {
  connection.query('SELECT MAX(id) AS max_id FROM thang12', function(err, rows) {
    if (err) {
      console.log('Error:', err);
      return;
    }

    const event_id_member = rows[0].max_id;
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const event_user_id_perform = req.session.user.user_id;
    const event_user_perform = req.session.user.user_name;
    

    const query = `INSERT INTO event_group (event_id, 
                                            user_id_member, user_member, date_add_member, role) 
                                            VALUES (?, ?, ?, ?, 1)`;

    connection.query(query, [event_id_member, event_user_id_perform, event_user_perform, currentTime], function(err) {
      if (err) {
        console.log('Error:', err);
        return;
      }

      console.log('Insert into thang12 is successful!');
      res.redirect('/home');
    });
  });
});

app.get('/del-thang12/(:id)', requireLogin, function(req, res){
  var id = req.params.id;
  const currentTime = moment();
  const mysqlTimestamp = currentTime.format('YYYY-MM-DD HH:mm:ss');
  let date_delete = mysqlTimestamp;
  const user_id_delete = req.session.user.user_id;
  const user_delete = req.session.user.user_name;
  
      connection.query(`update thang12 a join EVENT_GROUP b 
                          on a.id = b.event_id
                          set a.status = 0, b.event_status = 0, a.date_delete = ?, b.date_remove = ?, b.user_remove = ?, b.user_id_remove = ?
                          where a.id =? `, [date_delete, date_delete, user_delete, user_id_delete, id], function(err){
        if(!!err){
          console.log("error", +err);
          res.redirect('/home')}
        else{
          console.log("Delete id "+ id +" is Successful!");
          return res.redirect('/home')}
      });
})

app.get('/show-thang12', requireLogin, async function(req, res) {
  try {
    const Thang = 'Tháng 12';
    const obj = { print: null };
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const user_id_operation = req.session.user.user_id;
    
      const results = await executeQuery(`SELECT @rownum := @rownum + 1 AS stt, a.*, DATE_FORMAT(a.date_create, '%d/%m/%Y') AS date_create_new, b.user_id_member 
                                          FROM (SELECT @rownum := 0) r, thang12 a, event_group b 
                                          WHERE a.id = b.event_id 
                                            and a.status = 1
                                            and b.status = 1 
                                            and b.event_member_id_child = 0
                                            and year(a.date_create) = year(sysdate())
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj.print = results;
    
    
    for (const month of months) {
      const resultT = await executeQuery(`SELECT a.*, b.user_id_member 
                                          FROM thang${month} a, event_group b 
                                          WHERE a.id = b.event_id 
                                            AND b.status = 1 AND b.event_member_id_child = 0
                                            AND a.status = 1 
                                            AND b.user_id_member in (?)`, [user_id_operation]);
      obj[`printT${month}`] = resultT;
    }

    const print = [];

    res.render("./route-show-thangXX", { Thang, obj: obj, print: print, user_id_operation: user_id_operation, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(8080);
console.log('Server is listening in http://localhost:8080/home');
