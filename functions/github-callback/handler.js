'use strict';

console.log("github-callback starting");

var _ = require('underscore'),
    qs = require('querystring'),
    unirest = require('unirest'),
    crypto = require('crypto'),
    AWS = require('aws-sdk'),
    encryptor = require('simple-encryptor')({
      key: process.env.ENCRYPTION_KEY,
      hmac: true,
      debug: true
    });

// TODO: figure out why this is needed... sdk should pull from env automatically
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

var defaultHeaders = {
  'Accept': 'application/json',
  'User-Agent': 'andrhamm/gitrdone'
};

module.exports.handler = function(event, context, cb) {
  console.log("github-callback handler");
  console.log(event);

  // TODO: support custom domain
  var host = "https://"+event.api_id+".execute-api.us-east-1.amazonaws.com/"+event.api_stage;

  var encodedGithubState = event.github_state;

  var githubState = new Buffer(encodedGithubState, 'base64').toString('ascii');

  var slackData = encryptor.decrypt(githubState);

  var slackUserId = slackData.slack_user_id,
      slackAccessTokenHash = slackData.slack_access_token_hash;

  // get slack access token with code from the request
  var Request = unirest.post("https://github.com/login/oauth/access_token");

  Request.headers(defaultHeaders).query({
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    code: event.github_code,
    state: event.github_state,
    redirect_uri: host + "/github-callback"
  }).end(function (response) {
    console.log("github access token response body:");
    console.log(response.body);

    var ProfileRequest = unirest.get("https://api.github.com/user");
    ProfileRequest.query({
      access_token: response.body.access_token
    }).headers(defaultHeaders).end(function (profileResponse) {
      console.log("github profile response body:");
      console.log(profileResponse.body);

      var s3bucket = new AWS.S3({
        params: {
          Bucket: process.env.S3_BUCKET_NAME_GITRDONE
        }
      });

      var s3KeyName = "github/"+slackUserId;
      var s3Body = {};
      _.extend(s3Body, response.body, profileResponse.body);
      var params = {Key: s3KeyName, Body: JSON.stringify(s3Body)};
      s3bucket.upload(params, function(err, data) {
        console.log("s3 upload finished");
        console.log(data);
        if (err) {
          console.log("Error uploading data: ", err);
        } else {
          console.log("Successfully uploaded data to "+process.env.S3_BUCKET_NAME_GITRDONE+"/"+s3KeyName);
        }

        return cb(null, {
          message: 'github-callback done'
        });
      });
    });
  });
};
