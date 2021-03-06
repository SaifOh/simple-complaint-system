var rp = require('request-promise');
var request = require('request');
var express = require('express');
var bodyparser = require('body-parser');
var cookieParser = require('cookie-parser')
var path = require('path');
var md5 = require('md5')
var base64 = require('base-64');


const fs = require('fs');

const jwt = require('jsonwebtoken');
const port = process.env.PORT || 8080;


var log_file = fs.createWriteStream(__dirname + '/debug.log', {
    flags: 'a'
});

const sqlite3 = require("sqlite3").verbose()

//What does a user have?
//uid(generated), username(unique-string), password(string), email(string), type(bool)(Regular/Admin)
let db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.log("Error Connecting to users database");
        console.error(err.message);
    } else {
        db.exec(`create table if not exists "Users"(
            uid integer PRIMARY KEY AUTOINCREMENT,
            username string,
            password string,
            email string,
            type bool
        );`)
        db.exec(`create table if not exists "Complaints"(
            cid integer PRIMARY KEY AUTOINCREMENT,
            email string,
            uid string,
            type bool,
            context string,
            status string
        );`)
    }
    console.log('Connected to Users database.');
});

//What does the complaints db have?
//cid(generated), uid(refers to userid),type(bool)(refers to complaint type 0/1 service/employee) context(string)(what the complaint is),status(string),


//Initialize the server to listen to requests and such

var app = express();
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({
    extended: false
}));
app.use(cookieParser());
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
var cors = require('cors');
const { callbackify } = require('util');
app.use(cors());
app.use(express.static(__dirname + '/frontend'));

app.listen(port, () => {
    console.log('Listening on port ' + port);
});

//returns all users

app.get('/api/users', async (req, res) => {
    console.log(req.query);
    const isA = await isAdmin(req.query.uid);
    if (checkTokenValid(req.query.token) && isA)  {
        db.all('select uid,username,email,type from Users', (err, data) => {
            if (err) {
                console.error(err);
                res.json(err);
            } else {
                res.json(data);
            }
        })
    }
});

//returns specific user information
app.get('/api/users/:uid', async (req, res) => {
    let token = req.query['token'].split(".");
    db.all(`select * from Users where uid = ?`, [req.params.uid], (err, data) => {
        if (err) {
            console.error(err);
            res.json(err);
        } else {
            res.json(data);
        }
    });
});

//What we're expecting in registeration
//body : {username, password, email}

//REQ.Body.special is only for demonstration purposes, you should never store passwords directly in the code like this.

app.post('/api/users', function (req, res) {
    //console.log(req.body);
    if (req.body.type == "register") {
        if (req.body.special == "admin1" && req.body.username != "" && req.body.password != "" && req.body.email != "") {
            db.all(`select * from Users where username = ?`, [req.body.username], (error, row) => {
                if (error) {
                    console.error(error);
                }
                else {
                    if (row.length == 0) {

                        db.run(`insert into "Users" (username,password,email,type) values(?,?,?,?)`, [[req.body.username], [req.body.password], [req.body.email], 1], (err, row) => {
                            if (err) {
                                console.log(err);
                            }
                            else {
                                res.send({ "message": "Successfully Registered." });
                            }
                        });
                    }
                    else {
                        res.send({ "message": "User already exists." })
                    }
                }
            });
        } else if (req.body.username != "" && req.body.password != "" && req.body.email != "") {
            db.all(`select * from Users where username = ?`, [req.body.username], (error, row) => {
                // console.log(row);
                if (error) {
                    console.error(error);
                    //console.log("we here 2");
                }
                else {
                    if (row.length == 0) {
                        ///console.log("we here 3");
                        db.run(`insert into "Users" (username,password,email,type) values(?,?,?,?)`, [[req.body.username], [req.body.password], [req.body.email], 0], (err, row) => {
                            if (err) {
                                console.log(err);
                            }
                            else {
                                res.send({ "message": "Successfully Registered." });
                            }
                        });
                    }
                    else {
                        res.send({ "message": "User already exists." });
                    }
                }
            });
        }
        else {
            res.send({ "message": "Missing Parameters." });
        }
    }
    else if (req.body.type == "login") {
        //console.log("we here 1");
        if (req.body.username == "" || req.body.password == "") {
            //console.log("we here 2");
            res.status(401).json("Missing login information.");
        }
        else {
            db.all(`select password, uid from Users where username = ?`, [req.body.username], (error, row) => {
                if (error) {
                    console.error(error);
                    //console.log("we here 4");
                }
                else {
                    console.log(row[0]['password']);
                    var data = JSON.stringify(row);
                    if (row.length == 0) {
                        res.status(401).json("Invalid Login");
                    }
                    else {
                        console.log(row[0]['password'] + " " + req.body.password);
                        if (req.body.password == row[0]['password']) {
                            res.status(200).json(login(req.body.username, row[0]['uid']));
                        }
                    }
                }
            })
        }
    }
    if (req.body.type == "logout") {
        res.json(logout(req));
    }
});

app.put('/api/users', async (req, res) => {
    const isA = await isAdmin(req.body.uid);
    if (checkTokenValid(req.body.token) && isA) {
        if (changeLevel(req.body.type, req.body.uuid)) {
            res.status(200).json({ "message": "updated user" });
        }
    }
    else {
        res.status(401).json({ "message": "no permissions." });
    }
});
// && isAdmin(req.query.uid)
app.delete('/api/users', async (req, res) => {
    const isA = await isAdmin(req.body.uid);
    if (checkTokenValid(req.body.token) && isA) {
        db.all(`delete from Users where uid = ?`, [req.params.uid], (err, data) => {
            if (err) {
                console.error(err);
                res.json(err);
            } else {
                res.status(200).json({ "message": "deleted user" });
            }
        });
    }
    else {
        res.status(401).json({ "message": "no permissions." });
    }
});

//return specific complaint
app.get('/api/complaint/:cid', async (req, res) => {
    console.log(req.body);
    //match cid with the one we're getting complaints for
    if (checkTokenValid(req.body.token)) {
        db.all(`select * from Complaints where cid = ?`, [req.params.cid], (err, data) => {
            if (err) {
                console.error(err);
                res.status(401).json(err);
            } else {
                if (data.length == 1) {
                    db.all(`select type from Users where uid = ?`, [req.body.uid], (err, row) => {
                        if (err) {
                            console.error(err);
                            res.status(401).json(err);
                        }
                        else {
                            if ((row.length == 1 && row[0]['type'] == 1) || data[0]['uid'] == req.body.uid) {
                                res.status(200).json(data);
                            }
                        }
                    });

                }
                else
                    res.status(404).json("Could not find complaint.");
            }
        })
    }
})


//returns all present complaints
app.get('/api/complaints', async (req, res) => {
    //console.log(req.query);
    //console.log("we here?")
    //is user admin?
    console.log(req.query);
    const isA = await isAdmin(req.query.uid);
    if (checkTokenValid(req.query.token) && isA) {
        db.all(`select * from Users where uid = ?`, [req.query.uid], (err, data) => {
            if (err) {
                console.error(err);
                res.json(err);
            }
            else {
                if (data.length > 0) {
                    //   console.log("we here?1")
                    if (data[0]['type'] == 1) {
                        //       console.log("we here?2")
                        db.all('select * from Complaints', (err, row) => {
                            if (err) {
                                console.error(err);
                                res.json(err);
                            } else {
                                //         console.log("we here?3")
                                res.json(row);
                            }
                        })
                    }
                }
            }
        })
    }
});

//returns user complaints
app.get('/api/complaints/:i', async (req, res) => {
    //console.log(req.query);
    var token = req.query.token;
    var tk1 = token.split(".");
    var uid = base64.decode(tk1[2]);
    //can user get those complaints?
    db.all(`select * from Users where uid = ?`, [req.query.uid], (err, data) => {
        //console.log("we here?0")
        if (err) {

            console.error(err);
            res.json(err);
        }
        else {
            if (data.length == 1) {
                if (data[0]['type'] == 1 || data[0]['uid'] == uid) {
                    db.all('select * from Complaints where uid = ?', uid, (err, data) => {
                        if (err) {
                            console.error(err);
                            res.json(err);
                        } else {
                            res.status(200).json(data);
                        }
                    })
                }
            }
        }
    })


});

//adds complaint to the system
//cid(generated), uid(refers to userid),type(bool)(refers to complaint type 0/1 service/employee) context(string)(what the complaint is),status(string), token

app.post('/api/complaints/', async function (req, res) {
    //console.log(req.body);
    var ctype = "";
    if (req.body.ctype)
        ctype = "Service";
    else
        ctype = "Product";
    if (checkTokenValid(req.body.token)) {
        if (req.body.uid && req.body.type == "new") {
            db.run(`insert into "Complaints" (uid,type,email,context,status) values(?,?,?,?,?)`, [[req.body.uid], ctype,[req.body.email], [req.body.context], "Open"], (err, row) => {
                if (err) {
                    console.log(err);
                }
                else {
                    res.status(201).json("Complaint received.");
                }
            });
        }
        if (req.body.uid && req.body.type == "modify") {
            //is the modifier an admin?
            db.all(`select type from Users where uid = ?`, [req.body.uid], (err, row) => {
                if (err) {
                    console.error(err);
                }
                else {
                    if (row.length == 1 && row[0]['type'] == 1) {

                        db.run(`UPDATE Complaints set STATUS = ? where cid = ?`, [req.body.status], [req.body.cid], (err, row) => {
                            if (err) {
                                console.log(err);
                            }
                            else {
                                res.status(201).json("Complaint status updated.");
                            }
                        });
                    }
                }
            })
        }
    }
    else {
        res.status(401).json("Invalid Token");
    }
});
app.put('/api/complaints/', async function (req, res) {
    //console.log(req.body);
    if (checkTokenValid(req.body.token)) {
        if (req.body.uid && req.body.type == "modify") {
            //is the modifier an admin?
            db.all(`select type from Users where uid = ?`, [req.body.uid], (err, row) => {
                if (err) {
                    console.error(err);
                }
                else {
                    //console.log("we here?")
                    if (row.length == 1 && row[0]['type'] == 1) {
                        if (updateComp(req.body.status, req.body.cid))
                            res.status(200).json("updated");
                    }
                }
            })
        }
    }
});

app.delete('/api/complaints', async (req, res) => {
    if (checkTokenValid(req.body.token)) {
        db.all(`delete from complaints where cid = ?`, [req.params.cid], (err, data) => {
            if (err) {
                console.error(err);
                res.json(err);
            } else {
                res.status(200).json({ "message": "deleted complaint" });
            }
        });
    }
    else {
        res.status(401).json({ "message": "no permissions." });
    }
});
function changeLevel(level, uid) {
    let data = [level, uid];
    console.log(level+" "+uid);
    let sql = `UPDATE Users SET type = ? WHERE uid = ?`
    db.run(sql, data, (err, row) => {
        if (err) {
            console.log(err);
        }
        else {
            
            return true;
        }
    });
    return true;
}
function updateComp(status, cid) {
    let data = [status, cid];
    let sql = `UPDATE Complaints SET status = ? WHERE cid = ?`;
    db.run(sql, data, (err, row) => {
        if (err) {
            console.log(err);
        }
        else {
            //console.log(row)
            return true;
        }
    });
    return true;
}
//
//idea for login, match stuff, return a generated token to be stored as cookie or something
//for logout, just invalidate this token/cookie
//also change it so that u send the received parameters to login() and handle everything there
//
//Was going to use jsonwebtoken library we can sign a token with an expiry date but it requires to re-code some stuff in the API
//Instead, I'm gonna generate my own authentication token

function login(username, uid) {
    //console.log("Username: " + username + " , uid: " + uid);
    let t = Date.now();
    //console.log("Generating Login Token at " + t);
    //var tok = CryptoJS.enc.Utf8.parse(plain);
    var encoded = base64.encode(Date.now()) + "." + base64.encode(username) + "." + base64.encode(uid);
    //const token = jwt.sign({ userId: uid }, 'secret', { expiresIn: '24h' });
    var res = { userId: uid, token: encoded };
    return res;
}

/* function isAdmin(uid) {
    return new Promise(function (resolve, reject) {
        db.all(`select type from Users where uid = ?`, uid, (err, data) => {
            if (err) {
                console.log(err);
                
            } else {
              
                    resolve(data[0]['type']);
             
            }
        });
    })
} */
function isAdmin(uid) {
    //console.log("UID IS"+uid);
    return new Promise(function (resolve, reject) {
        db.all(`select type from Users where uid = ?`, uid,  (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            if(data.length == 1)resolve(+data[0]['type'] === 1)
        });
    })
}

function logout(req) {
    if (req.session.user) {
        req.session.user = null;
        return callbackify(null, { 'success': true, "message": "User logged out" });
    }
}

function checkTokenValid(token) {
    //Buffer.from(tk1[0], 'base64').toString('utf-8')
    var tk1 = token.split(".");
    var uid = base64.decode(tk1[2]);
    if (base64.decode(tk1[0]) < Date.now() && (Date.now() - base64.decode(tk1[0])) < 1000 * 36000) {
        return new Promise(function (resolve, reject) {
            db.all(`select uid from Users where uid = ?`, uid, async (err, data) => {
                if (err) {
                    console.log(err);
                } else {
                    resolve(data.length > 0);
                }
            });
        })
    }
    return false;
}


app.get('/index', function (req, res) {
    res.sendFile(path.join(__dirname + '/frontend/index.html'));
});

app.get('/login', function (req, res) {
    res.sendFile(path.join(__dirname + '/frontend/login.html'));
})

app.get('/register', function (req, res) {
    res.sendFile(path.join(__dirname + '/frontend/register.html'));
})

app.get('/register/admin', function (req, res) {
    res.sendFile(path.join(__dirname + '/frontend/r-admin.html'));
})
app.get('/ucomplaints',async function (req, res) {
    const isA = await isAdmin(req.query.uid);
    const tokenValid = checkTokenValid(req.query.token);
    if(isA && tokenValid){
        res.sendFile(path.join(__dirname + '/frontend/ucomplaints.html'));
    }  
    else{
        res.sendFile(path.join(__dirname + '/frontend/404/index.html'));
    }
})

app.get('/complaints', function (req, res) {
    res.sendFile(path.join(__dirname + '/frontend/complaints.html'));
});
app.get('/admin',async  function (req, res) {
    const isA = await isAdmin(req.query.uid);
    const tokenValid = checkTokenValid(req.query.token);
    if(isA && tokenValid){
        res.sendFile(path.join(__dirname + '/frontend/admin.html'));
    }  
    else{
        res.sendFile(path.join(__dirname + '/frontend/404/index.html'));
    }
});

