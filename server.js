var express         = require('express');
var path            = require('path');
var passport        = require('passport');
var config          = require('./libs/config');
var log             = require('./libs/log')(module);
var oauth2          = require('./libs/oauth2');
var ArticleModel    = require('./libs/mongoose').ArticleModel;
var UserModel    = require('./libs/mongoose').UserModel;
var EventModel = require('./libs/mongoose').EventModel;

var Parse = require('parse').Parse;

var app = express();

app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(passport.initialize());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, "public")));

require('./libs/auth');

Parse.initialize("h2MLeRkYqlmO9e2jE2y1BMysPiPRUuy07Ur8La6A", "97GaGmE01ohzfvapqbLdpNK1AtWTNUpDekPItwCv");

var query = new Parse.Query(Parse.User);
query.find({
    success: function(users){
        for(var i = 0; i < users.length; i++){
            console.log(users[i].get('username'));
        }
    }
});

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

/* ----------------------------- USER API CALLS BEGIN ------------------------------ */

// login / get auth oken and refresh token
app.post('/oauth/token', oauth2.token);

// get all lastminute users
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
                    userProfile: user.userProfile,
                    email: user.email,
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

// signup/create new lastminute user
app.post('/api/users', function(req, res) {
    //Create a user call
    var user = new UserModel({
        username: req.body.username,
        password: req.body.password,
        name: {
            firstName: req.body.firstName,
            lastName: req.body.lastName
        },
        email: req.body.email
    })

    // persist new lastminute user to database
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

// Update current user information
app.put('/api/userInfo', passport.authenticate('bearer', { session: false }),
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
        if(isEmptyObject(req.body)) {
            res.statusCode = 400;
            return res.send("Missing params");
        }

        // update user name
        user.name = {
            firstName: req.body.firstName,
            lastName: req.body.lastName
        } || user.name;
        user.friendsList = req.body.friendsList || user.friendsList;
        user.userProfile = {
            fbId: req.body.fbId,
            twitterId: req.body.twitterId,
            parseId: req.body.parseId
        } || user.userProfile;
        user.email = req.body.email || user.email;
        user.phone = req.body.phone || user.phone;

        return user.save(function (err) {
            if (!err) {
                log.info("user updated");
                res.json({ user_id: req.user.userId, username: req.user.username, name: req.user.name, userProfile: req.user.userProfile, email: req.user.email, phone: req.user.phone, friendsList: req.user.friendsList})
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

// get info of particular user
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


// Get current user info i.e. user who is logged in
app.get('/api/userInfo', passport.authenticate('bearer', { session: false }),
    function(req, res) {
        // req.authInfo is set using the `info` argument supplied by
        // `BearerStrategy`.  It is typically used to indicate scope of the token,
        // and used in access control checks.  For illustrative purposes, this
        // example simply returns the scope in the response.
        res.json({ user_id: req.user.userId, username: req.user.username, name: req.user.name, userProfile: req.user.userProfile, email: req.user.email, friendsList: req.user.friendsList})
    }
);

// get current user's friends
app.get('/api/userInfo/friends', passport.authenticate('bearer', { session: false }),
    function(req, res) {

        return UserModel.find({_id: {$in: req.user.friendsList}}, function (err, users) {
            if (!err) {
                var userInfoArray = [];
                var len = users.length
                for (var i=0; i < len; i++) {
                    var user = users[i];
                    userInfoArray.push({
                        username:user.username,
                        userId:user._id,
                        name: user.name,
                        userProfile: user.userProfile,
                        email: user.email,
                        phone: user.phone
                    });
                }
                res.send(userInfoArray);
            } else {
                res.statusCode = 500;
                log.error('Internal error(%d): %s',res.statusCode,err.message);
                return res.send({ error: 'Server error' });
            }
        });
        // req.authInfo is set using the `info` argument supplied by
        // `BearerStrategy`.  It is typically used to indicate scope of the token,
        // and used in access control checks.  For illustrative purposes, this
        // example simply returns the scope in the response.
    }
);

// delete a particular friend of the current user
app.post('/api/userInfo/friends/remove', passport.authenticate('bearer', { session: false }), function(req, res) {

    if (!req.body.id) {
        return res.send({ error: "friend ID missing"});
    }

    return UserModel.update({_id: req.user._id}, {$pull :{friendsList : req.body.id} }, function (err, user, raw) {
        if (!err) {
            log.info("Removed friend with id: "+req.body.id);
            log.info(raw);
            res.statusCode = 200
            res.json({status: "success"});
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

//  add a friend given their user id
//  only requests friend if use
app.post('/api/userInfo/friends/request', passport.authenticate('bearer', { session: false}), function(req, res) {

    var friendRequestSent = false;
    var friendRequestReceived = false;

    if (!req.body.id) {
        return res.send({error: "friend Id missing"});
    }

    // Update user's pending friends list.
    UserModel.findById(req.user.userId, function (err, user) {
        log.info("test");
        if(!user) {
            res.statusCode = 404;
            return res.send({ error: 'Not found' });
        }

        if (user.friendsList.indexOf(req.body.id) != -1) {
            return res.send({error: req.body.id + ' is already a friend'});
        }

        // update user name
        if (user.pendingFriends.indexOf(req.body.id) == -1) {
            // Friend Id has not been added to pending friends list and is not a friend
            user.pendingFriends.push(req.body.id);

            // Save requested friend's ID to pendingFriends list
            user.save(function (err) {
                if (!err) {
                    friendRequestSent = true;
                    log.info("friend:" + req.body.id + " added to current user pending list");

                    // Update friend id's pending friend request list.
                    UserModel.findById(req.body.id, function (err, friend) {
                        log.info("hello");
                        if(!friend) {
                            res.statusCode = 404;
                            return res.send({ error: 'Not found' });
                        }

                        if (friend.friendsList.indexOf(req.user.userId) != -1) {
                            return res.send( { error: req.user.userId + ' was found in friendsList already !'})
                        }

                        // update friend name
                        if (friend.pendingFriendRequests.indexOf(req.user.userId) == -1) {
                            // Friend Id has not been added to pending friends list
                            friend.pendingFriendRequests.push(req.user.userId);

                            friend.save(function (err) {
                                if (!err) {
                                    friendRequestReceived = true;
                                    log.info("friend:" + req.body.id + " added to current user request list");

                                    if (friendRequestSent && friendRequestReceived) {
                                        return res.json({response: "friend request submitted and received!", user:user, friend:friend});
                                    } else {
                                        return res.json({error: "oops, friend request was unable to send! please try again"});
                                    }

                                    //res.json({ user_id: req.user.userId, username: req.user.username, name: req.user.name, userProfile: req.user.userProfile, email: req.user.email, phone: req.user.phone, friendsList: req.user.friendsList})
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
                        } else {
                            res.send({ error: 'given Id was already in pending friend requests'})
                        }

                        // Send a parse push notification to notify friend is being requested
                        // PARSE GOES HERE

                    });

                    //res.json({ user_id: req.user.userId, username: req.user.username, name: req.user.name, userProfile: req.user.userProfile, email: req.user.email, phone: req.user.phone, friendsList: req.user.friendsList})
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
        } else {
            return res.send({error: 'given id is already a pending or current friend'});
        }

        
    });

});

//  accept a friend request given their user id
// use POST while giving a userID to accept. Only adds if given ID is a pending friend request Id
app.post('/api/userInfo/friends/accept', passport.authenticate('bearer', { session: false}), function(req, res) {

    var friendRequestAccepted = false;
    var friendRequestNotified = false;

    if (!req.body.id) {
        return res.send({error: "friend Id missing"});
    }

    // Update user's pending friends list.
    UserModel.findById(req.user.userId, function (err, user) {
        log.info("test");
        if(!user) {
            res.statusCode = 404;
            return res.send({ error: 'Not found' });
        }

        if (user.friendsList.indexOf(req.body.id) != -1) {
            return res.send({error: req.body.id + ' is already a friend'});
        }

        log.info(JSON.stringify(user.pendingFriendRequests));

        // update user name
        if (user.pendingFriendRequests.indexOf(req.body.id) > -1) {
            // Friend Id has not been added to pending friends list
            log.info("now accepting friend request from" + req.body.id);
            user.pendingFriendRequests.splice(user.pendingFriendRequests.indexOf(req.body.id), 1);
            user.friendsList.push(req.body.id);

            user.save(function (err) {
                if (!err) {
                    friendRequestAccepted = true;
                    log.info("friend:" + req.body.id + " added to current user friend list");

                    // Update friend id's friend list with current user
                    UserModel.findById(req.body.id, function (err, friend) {
                        log.info("hello");
                        if(!friend) {
                            res.statusCode = 404;
                            return res.send({ error: 'Not found' });
                        }

                        if (friend.friendsList.indexOf(req.user.userId) != -1) {
                            return res.send( { error: req.user.userId + ' was found in friendsList already !'})
                        }

                        // update friend name
                        if (friend.pendingFriends.indexOf(req.user.userId) > -1) {
                            // Friend Id has not been added to pending friends list
                            friend.pendingFriends.splice(user.pendingFriends.indexOf(req.user.userId), 1);
                            friend.friendsList.push(req.user.userId);
                        }

                        // Send a parse push notification to notify friend is being added
                        // PARSE CODE HERE

                        friend.save(function (err) {
                            if (!err) {
                                friendRequestNotified = true;
                                log.info("friend:" + req.user.userId + " added to current user friend list");

                                if (friendRequestAccepted && friendRequestNotified) {
                                    return res.json({response: "friend request accepted and notified!", user:user, friend:friend});
                                } else {
                                    return res.json({error: "oops, friend request was unable to send! please try again"});
                                }

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

                    //res.json({ user_id: req.user.userId, username: req.user.username, name: req.user.name, userProfile: req.user.userProfile, email: req.user.email, phone: req.user.phone, friendsList: req.user.friendsList})
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
        } else {
            res.send({ error: 'given id is not a pennding friend request'});
        }

    });

});

/* ----------------------------- USER API CALLS END -------------------------------- */

/* ---------------------------- EVENT API CALLS BEGIN ------------------------------ */

// get all events
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


/*
 * Create event
   Params: invitedUsers = [ {
                userId,
                status = one of string [Attending, Maybe, No]
              } ],
              name: String (event name),
              location: String,
              date: Date,
              adminUsers: [userId]
          ]
 */

 // create new event
app.post('/api/events', passport.authenticate('bearer', { session: false }), function(req, res) {

    var event = new EventModel({
        creator: req.user.userId, //set event creator to current user
        invitedUsers: req.body.invitedUsers,
        name: req.body.name,
        location: req.body.location,
        date: Date.parse(req.body.date),
        adminUsers: req.body.adminUsers
    });

    console.log(event);

    // persist newly created event to database
    event.save(function (err) {
        if (!err) {
            // var userQuery = new Parse.Query(Parse.User);
            // userQuery.equalTo("user", "julian");

            var pushQuery = new Parse.Query(Parse.Installation);
            // pushQuery.matchesQuery('user', userQuery);

            // Loop through invited users and add them to the parse query
            // TODO: update the user's eventInvites list
            if (event.invitedUsers) {
                for (var i=0; i < event.invitedUsers.length; i++) {
                    pushQuery.equalTo("user",  UserModel.findById(event.invitedUsers[i].userId, function(err, user) {
                        if (!err) {
                            log.info("user found: " + user);
                            return user;
                        }
                    }).username);
                }
            }

            // adding event to all admin users (TODO: CHANGE TO invitedUsers instead of adminUsers)
            // this is for testing
            if(event.adminUsers){
                for(var i = 0; i < event.adminUsers.length; i++){
                    UserModel.findByIdAndUpdate(event.adminUsers[i], {$push : {eventInvites : event}},
                    {safe: true, upsert: true}, function(err, user){
                        if(!err){
                            log.info("eventInvites updated for user: " + user.username);
                        }
                    });
                }
            }

            // userQuery.find({
            //     success: function(user) {
            //         pushQuery.equalTo
            //     },
            //     error: function(err) {
            //         console.log(error.code)
            //     }
            // })

            // send push notification through parse to all users invited to the event
            Parse.Push.send({
                where: pushQuery,
                data: {
                    alert: "You've been invited to " + event.name + "!"
                }
            }, {
                success: function() {
                    // success
                    log.info("Push notifications successfully sent")
                },
                error: function(err) {
                    // error
                    log.info("Error: push notifications could not be sent")
                }
            })

            /*INSERT CODE TO ADD EVENT TO EVERY INVITED USER*/

            log.info("Event: " + event.name + " successfully created");
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

// update information for a particular event (found by id)
app.put('/api/events/:id', passport.authenticate('bearer', { session: false }), function(req, res) {

    return EventModel.findById(req.params.id, function (err, event) {
        if(!event) {
            res.statusCode = 404;
            return res.send({ error: 'Not found' });
        }

        if (!err) {

            // check if user making the request is an event admin: only admins can update the event
            if (event.creator != req.user.userId && event.adminUsers.indexOf(req.user.userId) == -1) {
                return res.send({error: 'User '+req.user.username+' is not an admin. Cannot modify event.'})
            }

            event.invitedUsers = req.body.invitedUsers;
            event.name = req.body.name;
            event.location = req.body.location;
            event.date = req.body.date;
            event.adminUsers = req.body.adminUsers;

            return event.save(function (err) {
                if (!err) {
                    log.info("event: " + event.name + " successfully updated");

                    return res.send({ status: 'OK', event:event });
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

        } else {
            res.statusCode = 500;
            log.error('Internal error(%d): %s',res.statusCode,err.message);
            return res.send({ error: 'Server error' });
        }
    });
});

// delete specific event
app.delete('/api/events/:id', passport.authenticate('bearer', { session: false }), function (req, res){
    return EventModel.findById(req.params.id, function (err, event) {
        if(!event) {
            res.statusCode = 404;
            return res.send({ error: 'Not found' });
        }

        // check if user making the request is an event admin: only admins can update the event
        if (event.creator != req.user.userId && event.adminUsers.indexOf(req.user.userId) == -1) {
            return res.send({error: 'User ' + req.user.username + ' is not an admin. Cannot delete event.'})
        }

        // remove event from database
        // NOTE: Don't actually delete, only remove references to event?
        return event.remove(function (err) {
            if (!err) {
                log.info("event removed");
                return res.send({ status: 'OK' });
            } else {
                res.statusCode = 500;
                log.error('Internal error(%d): %s',res.statusCode,err.message);
                return res.send({ error: 'Server error' });
            }
        });
    });
});

/* ----------------------------- EVENT API CALLS END -------------------------------- */

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
