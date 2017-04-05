'use strict';

function basicAuth(options) {
    function fail(res) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm=' + options.realm);
        res.end();
    }

    return function (req, res, next) {
        const auth = req.headers.authorization;
        if (!auth) {
            fail(res);
        }
        let tmp = auth.split(' ');
        const buffer = new Buffer(tmp[1], 'base64');
        tmp = buffer.toString();
        let credentials = tmp.split(':');
        options.accounts.some(function (password, i) {
            var passwordKey = Object.keys(password);
            if (password[passwordKey] === credentials[1]) {
                res.locals.user = passwordKey.toString();
                return password[passwordKey] === credentials[1];
            }
        });
        if (res.locals.user) {
            next();
        } else {
            fail(res);
        }
    };
}

module.exports = basicAuth;