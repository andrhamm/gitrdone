'use strict';

var crypto = require('crypto');

module.exports.handler = function(event, context, cb) {
  console.log(event);

  var text;

  var state = crypto.createHash('md5').update(event.token + event.user_id).digest("hex");

  console.log(state);

  // TODO: check s3 for stored user access tokens
  if (true) {
    // TODO: make this flow follow the "/command connect" best practices
    var endpoint = event.api_id+".execute-api.us-east-1.amazonaws.com/"+event.api_stage+"/slack-auth";
    text = "<https://"+endpoint+"?state="+state+"|"+endpoint+">";
  } else {
    text = "You did \"" + event.text + "\". Nice job!";
  }

  return cb(null,
    {
      "text": text
    });
};
