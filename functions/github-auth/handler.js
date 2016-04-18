'use strict';

console.log("github-auth starting");

var qs = require('querystring'),
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

module.exports.handler = function(event, context, cb) {
  console.log("github-auth handler");
  console.log(event);

  // TODO: support custom domain
  var host = "https://"+event.api_id+".execute-api.us-east-1.amazonaws.com/"+event.api_stage;

  // get slack access token with code from the request
  var Request = unirest.get("https://slack.com/api/oauth.access");

  Request.auth({
    user: process.env.SLACK_CLIENT_ID,
    pass: process.env.SLACK_CLIENT_SECRET
  }).query({
    "code": event.slack_code,
    "redirect_uri": host + "/github-auth"
  }).end(function (response) {
    console.log("slack access token response body:");
    console.log(response.body);

    // TODO: validate state is the hashed slack id
    var computedState = crypto.createHash('md5').update(process.env.SLACK_VERIFICATION_TOKEN + response.body.user_id).digest("hex");
    console.log("computed state = " + computedState);

    // TODO: get slack user profile
    // var Request = unirest.get("https://slack.com/api/auth.test");

    // TODO: write slack access token & to s3
    var s3bucket = new AWS.S3({
      params: {
        Bucket: process.env.S3_BUCKET_NAME_GITRDONE
      }
    });

    s3bucket.createBucket(function(err) {
      console.log("s3 bucket created");
      if (err) {
        console.log("s3 bucket create error");
        console.log(err);
      }

      // TODO: encrypt this S3 data
      var s3KeyName = "slack/"+response.body.user_id;
      var params = {Key: s3KeyName, Body: JSON.stringify(response.body)};
      s3bucket.upload(params, function(err, data) {
        console.log("s3 upload finished");
        console.log(data);
        if (err) {
          console.log("Error uploading data: ", err);
        } else {
          console.log("Successfully uploaded data to "+process.env.S3_BUCKET_NAME_GITRDONE+"/"+s3KeyName);
        }

        // TODO: use s3 obj key as state for GH auth
        var githubState = encryptor.encrypt({
          "slack_user_id": response.body.user_id,
          "slack_access_token_hash": crypto.createHash('md5').update(response.body.access_token).digest("hex")
        });

        var encodedGithubState = new Buffer(githubState).toString('base64');

        console.log("encrypted+encoded slack data for github state: " + encodedGithubState);

        var params = {
          "client_id": process.env.GITHUB_CLIENT_ID,
          "scope": "user:email,gist",
          "redirect_uri": host + "/github-callback",
          "state": encodedGithubState
        };

        var redirectTo = "https://github.com/login/oauth/authorize?" + qs.stringify(params);

        console.log("redirecting client to " + redirectTo);

        return context.done(null, {
          "location": redirectTo
        });
      });
    });
  });
};
