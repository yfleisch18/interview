const express = require('express'),
    path = require('path'),
    bodyParser = require('body-parser'),
    fileUpload = require('express-fileupload'),
    socket_io = require('socket.io'),
    basicAuth = require('./basicAuth'),
    AWS = require('aws-sdk'),
    uuidV1 = require('uuid/v1'),
    app = express(),
    albumBucketName = '',
    bucketRegion = 'us-east-1',
    IdentityPoolId = '';

let posts,
    post,
    io,
    s3,
    dynamodb,
    params,
    pictures,
    users = [],
    message;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({
    extended: false
}));
app.locals.title = 'The World of Information';
AWS.config.update({
    region: bucketRegion,
    credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: IdentityPoolId
    })
});
// the image bucket
s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    params: { Bucket: albumBucketName }
});
// the password and posts db
dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
// get passwords
params = {
    "TableName": "password",
    "AttributesToGet": ['name', 'password']
};
dynamodb.scan(params, function (err, data) {
    if (err) {
        next("We're having trouble accessing the data.");
    }
    else {
        data.Items.forEach(function (info) {
            var name = info.name.S;
            var password = info.password.S;
            var obj = {};
            obj[name] = password;
            users.push(obj);
        });
    }
});
// validate user password input
app.use(basicAuth({
    realm: app.locals.title,
    accounts: users
}));
// home page
app.get('/', (req, res, next) => {
    params = {
        "TableName": "posts",
        "AttributesToGet": ['_id', 'name', 'title', 'content', 'date']
    };
    dynamodb.scan(params, function (err, data) {
        if (err) { console.log(err, err.stack); } // an error occurred
        res.render('layout', {
            subtitle: 'Welcome to the blog',
            posts: data.Items,
            links: [{ url: '/newPost', text: 'New Post' }, { url: '/savePic', text: 'Save Picture Here' }, { url: '/newPassword', text: 'Create a New User' }],
            scripts: ['/scripts/jquery-3.2.0.min.js', '/socket.io/socket.io.js', '/scripts/posts.js'],
            partials: {
                content: 'posts'
            }
        });
    });
});
// href link to save images
app.get('/savePic', (req, res) => {
    res.render('layout', {
        subtitle: 'Save Your Picture Here',
        links: [{ url: '/', text: 'Home' }, { url: '/viewPic', text: 'View Pictures' }],
        partials: {
            content: 'savePic'
        }
    });
});
app.use(fileUpload());
app.post('/savePic', (req, res, next) => {
    addPhoto('myphotos', req.files.fileToUpload);
    res.redirect('/');
});
app.get('/viewPic', (req, res, next) => {
    var albumPhotosKey = encodeURIComponent('myphotos') + '/';
    s3.listObjects({ Prefix: albumPhotosKey }, function (err, data) {
        if (err) {
            return alert('There was an error viewing your album: ' + err.message);
        }
        // `this` references the AWS.Response instance that represents the response
        var href = this.request.httpRequest.endpoint.href;
        var bucketUrl = href + albumBucketName + '/';
        pictures = [];
        var photos = data.Contents.map(function (photo) {
            var photoKey = photo.Key;
            if (photoKey.includes('.')) {
                pictures.push({ photoKey: photoKey, photoUrl: bucketUrl + encodeURIComponent(photoKey) });
            }
        });
        res.render('layout', {
            subtitle: 'An array of your selected pictures!',
            links: [{ url: '/', text: 'Home' }, { url: '/savePic', text: 'Save New Picture' }],
            pictures: pictures,
            partials: {
                content: 'viewPic'
            }
        });
        if (!photos.length) {
            console.log('you have no photos');
        }
    });
});
// href link to make a new password
app.get('/newPassword', (req, res, next) => {
    res.render('layout', {
        subtitle: 'Save Your Picture Here',
        links: [{ url: '/', text: 'Home' }, { url: '/viewPic', text: 'View Pictures' }],
        partials: {
            content: 'newPassword'
        }
    });
});
app.post('/newPassword', (req, res, next) => {
    var tagged;
    console.log(req.body.name);
    if (req.body.name === null || req.body.password === null) {
        res.redirect('/');
    }
    users.forEach(e => {
        console.log(Object.keys(e).toString(), req.body.name)
        if (Object.keys(e).toString() === req.body.name) {
            tagged = true;
        }
    })
    if (!tagged) {
        makePassword(req.body.name, req.body.password);
        message = 'Your new user ' + req.body.name + ' is now ready to be used.';
    } else {
        message = "The password name is already used, please choose another one";
    }
    res.render('layout', {
        subtitle: 'Save Your Picture Here',
        message: message,
        links: [{ url: '/', text: 'Home' }, { url: '/viewPic', text: 'View Pictures' }],
        partials: {
            content: 'newPassword'
        }
    });
});
// full post click for comments
app.get('/fullPost', (req, res, next) => {
    var params = {
        AttributesToGet: [
            '_id', 'name', 'title', 'content', 'date'
        ],
        TableName: 'posts',
        Key: {
            "_id": {
                "S": req.query.postId
            }
        }
    };
    dynamodb.getItem(params, function (err, thePost) {
        if (err) {
            console.log(err); // an error occurred
        }
        else {
            if (thePost.Item.comments) {
                var comments = [],
                    comment,
                    commentsInfo;

                thePost.Item.comments.L.forEach(comment => {
                    commentsInfo = comment.S.split('~');
                    comment = {
                        content: commentsInfo[2],
                        name: commentsInfo[1],
                        date: commentsInfo[0]
                    };
                    comments.push(comment);
                });
            }
            res.render('layout', {
                post: thePost.Item,
                links: [{ url: '/', text: 'Home' }, { url: '/newPost', text: 'New Post' }],
                scripts: ['/scripts/jquery-3.2.0.min.js', '/socket.io/socket.io.js', '/scripts/posts.js'],
                partials: {
                    content: 'fullPost'
                }
            });
        }
    });
});
// show comments button uses this and gives option to add new comments
app.get('/comments', (req, res, next) => {
    var params = {
        AttributesToGet: [
            "comments"
        ],
        TableName: 'posts',
        Key: {
            "_id": {
                "S": req.query.postId
            }
        }
    }
    dynamodb.getItem(params, function (err, thePost) {
        if (err) {
            console.log(err); // an error occurred
        }
        else {
            if (thePost.Item.comments) {
                var comments = [],
                    comment,
                    commentsInfo;

                thePost.Item.comments.L.forEach(comment => {
                    commentsInfo = comment.S.split('~');
                    comment = {
                        content: commentsInfo[2],
                        name: commentsInfo[1],
                        date: commentsInfo[0]
                    };
                    comments.push(comment);
                });
                res.render('comments', {
                    comments: comments.sort()
                });
            }
            else {
                res.render('comments', {
                    comments: ''
                });
            }
        }
    });
});
// href link to add new post
app.get('/newPost', (req, res) => {
    res.render('layout', {
        subtitle: 'Write a new blog post',
        links: [{ url: '/', text: 'home' }, { url: 'https://www.google.com', text: 'google' }],
        partials: {
            content: 'newPost'
        }
    });
});
app.post('/newPost', (req, res, next) => {
    var uniqueId = uuidV1(); // -> '6c84fb90-12c4-11e1-840d-7b25c5ee775a'
    var freshDate = new Date().toDateString() + ' ' + new Date().toLocaleTimeString();
    params = {
        Item: {
            "_id": {
                S: uniqueId
            },
            "name": {
                S: res.locals.user
            },
            "title": {
                S: req.body.title
            },
            "content": {
                S: req.body.content
            },
            "date": {
                S: freshDate
            }
        },
        ReturnConsumedCapacity: "TOTAL",
        TableName: "posts"
    };
    dynamodb.putItem(params, function (err, data) {
        if (err) { next(err); }
        else {
            console.log('successfully put new post');
            res.redirect('/');
        }
    });
});
// comments button in fullPost which allows for new comments
app.post('/addComment', (req, res, next) => {
    var comment = req.body.content.replace(/  +/g, ' ');
    dateNow = new Date().toDateString() + ' ' + new Date().toLocaleTimeString(),
        commentData = dateNow + '~' + res.locals.user + '~' + comment;
    params = {
        TableName: 'posts',
        Key: {
            _id: {
                S: req.body._id
            }
        },
        UpdateExpression: "SET #attrName = list_append(if_not_exists(#attrName, :attrValue), :attrValue)",
        ExpressionAttributeNames: {
            "#attrName": "comments"
        },
        ExpressionAttributeValues: {
            ":attrValue": {
                L: [
                    {
                        'S': commentData
                    }]
            }
        }
    };
    dynamodb.updateItem(params, function (err, data) {
        if (err) { console.log(err, err.stack); } // an error occurred
        else {
            var htmlComment = {
                content: comment,
                name: res.locals.user,
                date: dateNow
            };
            res.render('comments', { comments: [htmlComment] }, (err, html) => {
                io.sockets.emit('comment', { post: req.body._id, comment: html });
            });
        }
    });
});
// error message
app.use((err, req, res, next) => {
    res.status(500);
    res.end('OOPS. Server error: ' + err);
});
function addPhoto(albumName, fileInfo) {
    var file = fileInfo;
    if (!file) {
        console.log('no file');
    }
    var fileName = file.name,
        albumPhotosKey = encodeURIComponent(albumName) + '//',
        photoKey = albumPhotosKey + fileName;
    s3.upload({
        Key: photoKey,
        Body: file.data,
        ACL: 'public-read'
    }, function (err) {
        if (err) {
            return console.log('error uploading photo' + err);
        }
    });
}
function viewAlbum(albumName) {
    var albumPhotosKey = encodeURIComponent(albumName) + '/';
    s3.listObjects({ Prefix: albumPhotosKey }, function (err, data) {
        if (err) {
            return alert('There was an error viewing your album: ' + err.message);
        }
        // `this` references the AWS.Response instance that represents the response
        var href = this.request.httpRequest.endpoint.href;
        var bucketUrl = href + albumBucketName + '/';
        pictures = [];
        var photos = data.Contents.map(function (photo) {
            var photoKey = photo.Key;
            if (photoKey.includes('.')) {
                pictures.push({ photoKey: photoKey, photoUrl: bucketUrl + encodeURIComponent(photoKey) });
            }
        });
        if (!photos.length) {
            console.log('you have no photos');
        }
    });
}
function makePassword(name, password) {
    params = {
        Item: {
            "name": {
                S: name
            },
            "password": {
                S: password
            }
        },
        ReturnConsumedCapacity: "TOTAL",
        TableName: "password"
    };
    dynamodb.putItem(params, function (err, data) {
        if (err) {
            console.log('no password was placed. Sorry');
        }
        else {
            console.log('successfully placed password');
        }
    });
}
io = socket_io.listen(app.listen(80));