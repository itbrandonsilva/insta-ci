var nodemailer = require('nodemailer');
var jade = require('jade');

var ex = module.exports;

ex.config = function (config) {

    if ( ! config ) return {
        send: function (options, cb) { if (cb) cb() },
    };

    //transport = nodemailer.createTransport("SMTP", config.mailer.settings);
    var transport = nodemailer.createTransport("SMTP", config.settings);
    console.log("Mailer configured.");

    /* Options

        {
            error: [Error Object],
            appName: String
        }

    */

    return {
        send: function (options) {
            var view; options.error ? view = config.views.error : view = config.views.success;
            jade.renderFile(view, {error: options.error ? options.error.message : null}, function (err, html) {
                if (err) return console.log(err);

                var subject = "Build " + (options.error ? "failed: " : "successful: ") + options.appName;
        
                config.recipients.forEach(function (recipient) {
                    transport.sendMail({
                        from: "Brandon Silva <build@brandonsilva.net>",
                        to: recipient,
                        subject: subject,
                        text: "Text version unavailable.",
                        html: html,
                    }, function (err) {
                        if (err) return console.log(err);
                        console.log( (options.error ? "Error" : "Success") + " email sent to " + recipient + "." );
                    });
                });
            });
        },
    }
};
