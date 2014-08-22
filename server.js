var express         = require('express');
var path            = require('path');
var passport        = require('passport');
var config          = require('./libs/config');
var log             = require('./libs/log')(module);
var oauth2          = require('./libs/oauth2');
var ArticleModel    = require('./libs/mongoose').ArticleModel;
var UserModel    = require('./libs/mongoose').UserModel;
var EventModel = require('./libs/mongoose').EventModel;

var app = express();

app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(passport.initialize());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, "public")));

require('./libs/auth');

app.use(function(req, res, next){
    res.status(404);
    log.debug('Not found URL: %s',req.url);
    res.send({ error: 'Not found' });
    return;
});

app.use(function(err, req, res, next){
    res.status(err.status || 500);
    log.error('Internal error(%d): %s',res.statusCode,err.message);
    res.send({ error: err.message });
    return;
});

app.get('/api', passport.authenticate('bearer', { session: false }), function (req, res) {
    res.send('API is running');
});

app.post('/oauth/token', oauth2.token);

app.get('/api/users', function(req, res) {
    return UserModel.find(function (err, users) {
        if (!err) {
            var userInfoArray = [];
            var len = users.length
            for (var i=0; i < len; i++) {
                var user = users[i];
                userInfoArray.push({
                    username:user.username,
                    userId:user._id,
                    name: user.name,
                    userProfile: user.userProfile
                });
            }
            res.send(userInfoArray);
        } else {
            res.statusCode = 500;
            log.error('Internal error(%d): %s',res.statusCode,err.message);
            return res.send({ error: 'Server error' });
        }
    });
});

//Sign up and create user
app.post('/api/users', function(req, res) {
    //Create a user call
    var user = new UserModel({
        username: req.body.username,
        password: req.body.password
    })

    user.save(function (err) {
        if (!err) {
            log.info("user created");
            return res.send({ status: 'OK', user:user });
        } else {
            console.log(err);
            if(err.name == 'ValidationError') {
                res.statusCode = 400;
                res.send({ error: 'Validation error' });
            } else {
                res.statusCode = 500;
                res.send({ error: 'Server error' });
            }
            log.error('Internal error(%d): %s',res.statusCode,err.message);
        }
    });
});

//Update current user
app.put('/api/users', passport.authenticate('bearer', { session: false }),
function(req, res) {
    // req.authInfo is set using the `info` argument supplied by
    // `BearerStrategy`.  It is typically used to indicate scope of the token,
    // and used in access control checks.  For illustrative purposes, this
    // example simply returns the scope in the response.

    return UserModel.findById(req.user.userId, function (err, user) {
        if(!user) {
            res.statusCode = 404;
            return res.send({ error: 'Not found' });
        }

        //if missing required params fail the call
        if(isEmptyObject(req.body) || !req.body.hasOwnProperty('firstName') || !req.body.hasOwnProperty('lastName')) {
            res.statusCode = 400;
            return res.send("Missing params");
        }

        //update user name
        user.name = {
            firstName: req.body.firstName,
            lastName: req.body.lastName
        }

        return user.save(function (err) {
            if (!err) {
                log.info("user updated");
                return res.send({ status: 'OK', user:user });
            } else {
                if(err.name == 'ValidationError') {
                    res.statusCode = 400;
                    res.send({ error: 'Validation error' });
                } else {
                    res.statusCode = 500;
                    res.send({ error: 'Server error' });
                }
                log.error('Internal error(%d): %s',res.statusCode,err.message);
            }
        });
    });

    //res.json({ user_id: req.user.userId, username: req.user.username, scope: req.authInfo.scope, name: req.user.name})
}
);

app.get('/api/users/:id', passport.authenticate('bearer', { session: false }), function(req, res) {
    return UserModel.findById(req.params.id, function (err, user) {
        if(!user) {
            res.statusCode = 404;
            return res.send({ error: 'Not found' });
        }
        if (!err) {
            return res.send({ status: 'OK', username:user.username, userId:user._id, name: user.name });
        } else {
            res.statusCode = 500;
            log.error('Internal error(%d): %s',res.statusCode,err.message);
            return res.send({ error: 'Server error' });
        }
    });
});

//get current logged in user info
app.get('/api/users/userInfo',
passport.authenticate('bearer', { session: false }),
function(req, res) {
    // req.authInfo is set using the `info` argument supplied by
    // `BearerStrategy`.  It is typically used to indicate scope of the token,
    // and used in access control checks.  For illustrative purposes, this
    // example simply returns the scope in the response.
    res.json({ user_id: req.user.userId, username: req.user.username, name: req.user.name,  scope: req.authInfo.scope })
}
);

//Event API calls
app.get('/api/events', function(req, res) {
    return EventModel.find(function (err, events) {
        if (!err) {
            return res.send(events);
        } else {
            res.statusCode = 500;
            log.error('Internal error(%d): %s',res.statusCode,err.message);
            return res.send({ error: 'Server error' });
        }
    });
});

app.post('/api/events', passport.authenticate('bearer', { session: false }), function(req, res) {

    var event = new EventModel({
        creator: req.user.userId, //set event creator to current user
        invitedUsers: req.body.invitedUsers,
        name: req.body.name
    })

    event.save(function (err) {
        if (!err) {
            log.info("Event created");
            return res.send({ status: 'OK', event:event });
        } else {
            console.log(err);
            if(err.name == 'ValidationError') {
                res.statusCode = 400;
                res.send({ error: 'Validation error' });
            } else {
                res.statusCode = 500;
                res.send({ error: 'Server error' });
            }
            log.error('Internal error(%d): %s',res.statusCode,err.message);
        }
    });
});

app.get('/ErrorExample', function(req, res, next){
    next(new Error('Random error!'));
});

app.listen(config.get('port'), function(){
    log.info('Express server listening on port ' + config.get('port'));
});

function isEmptyObject(obj) {
    return !Object.keys(obj).length;
}

// app.get('/api/articles', passport.authenticate('bearer', { session: false }), function(req, res) {
//     return ArticleModel.find(function (err, articles) {
//         if (!err) {
//             return res.send(articles);
//         } else {
//             res.statusCode = 500;
//             log.error('Internal error(%d): %s',res.statusCode,err.message);
//             return res.send({ error: 'Server error' });
//         }
//     });
// });
//
// app.post('/api/articles', passport.authenticate('bearer', { session: false }), function(req, res) {
//     var article = new ArticleModel({
//         title: req.body.title,
//         author: req.body.author,
//         description: req.body.description,
//         images: req.body.images
//     });
//
//     article.save(function (err) {
//         if (!err) {
//             log.info("article created");
//             return res.send({ status: 'OK', article:article });
//         } else {
//             console.log(err);
//             if(err.name == 'ValidationError') {
//                 res.statusCode = 400;
//                 res.send({ error: 'Validation error' });
//             } else {
//                 res.statusCode = 500;
//                 res.send({ error: 'Server error' });
//             }
//             log.error('Internal error(%d): %s',res.statusCode,err.message);
//         }
//     });
// });
//
// app.get('/api/articles/:id', passport.authenticate('bearer', { session: false }), function(req, res) {
//     return ArticleModel.findById(req.params.id, function (err, article) {
//         if(!article) {
//             res.statusCode = 404;
//             return res.send({ error: 'Not found' });
//         }
//         if (!err) {
//             return res.send({ status: 'OK', article:article });
//         } else {
//             res.statusCode = 500;
//             log.error('Internal error(%d): %s',res.statusCode,err.message);
//             return res.send({ error: 'Server error' });
//         }
//     });
// });
//
// app.put('/api/articles/:id', passport.authenticate('bearer', { session: false }), function (req, res){
//     return ArticleModel.findById(req.params.id, function (err, article) {
//         if(!article) {
//             res.statusCode = 404;
//             return res.send({ error: 'Not found' });
//         }
//
//         article.title = req.body.title;
//         article.description = req.body.description;
//         article.author = req.body.author;
//         article.images = req.body.images;
//         return article.save(function (err) {
//             if (!err) {
//                 log.info("article updated");
//                 return res.send({ status: 'OK', article:article });
//             } else {
//                 if(err.name == 'ValidationError') {
//                     res.statusCode = 400;
//                     res.send({ error: 'Validation error' });
//                 } else {
//                     res.statusCode = 500;
//                     res.send({ error: 'Server error' });
//                 }
//                 log.error('Internal error(%d): %s',res.statusCode,err.message);
//             }
//         });
//     });
// });
//
// app.delete('/api/articles/:id', passport.authenticate('bearer', { session: false }), function (req, res){
//     return ArticleModel.findById(req.params.id, function (err, article) {
//         if(!article) {
//             res.statusCode = 404;
//             return res.send({ error: 'Not found' });
//         }
//         return article.remove(function (err) {
//             if (!err) {
//                 log.info("article removed");
//                 return res.send({ status: 'OK' });
//             } else {
//                 res.statusCode = 500;
//                 log.error('Internal error(%d): %s',res.statusCode,err.message);
//                 return res.send({ error: 'Server error' });
//             }
//         });
//     });
// });